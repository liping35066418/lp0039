import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { WebSocketServer } from 'ws'
import db from '../database.js'
import type { MonitorTask, MonitorTaskCreate, WsMessage } from '../../shared/types.js'

const router = Router()
const activeTimers = new Map<string, ReturnType<typeof setInterval>>()

interface TaskRow {
  id: string
  name: string
  duration: number
  interval: number
  status: string
  progress: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  config: string
}

router.post('/tasks', (req: Request, res: Response) => {
  const { name, duration, interval: taskInterval, targets, testTypes } = req.body as MonitorTaskCreate
  if (!name || !duration || !taskInterval) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  const config = JSON.stringify({ targets: targets || [], testTypes: testTypes || ['latency'] })

  db.prepare(
    'INSERT INTO monitor_task (id, name, duration, interval, status, progress, createdAt, startedAt, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, duration, taskInterval, 'running', 0, now, now, config)

  const wss: WebSocketServer | undefined = req.app.locals.wss
  startMonitorTask(id, duration, taskInterval, wss)

  const task = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(id) as TaskRow
  res.status(201).json(formatTask(task))
})

router.get('/tasks', (_req: Request, res: Response) => {
  const tasks = db.prepare('SELECT * FROM monitor_task ORDER BY createdAt DESC').all() as TaskRow[]
  res.json({ data: tasks.map(formatTask) })
})

router.get('/tasks/:id', (req: Request, res: Response) => {
  const task = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(req.params.id) as TaskRow | undefined
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const results = db.prepare('SELECT * FROM monitor_result WHERE taskId = ? ORDER BY timestamp').all(req.params.id)
  res.json({ ...formatTask(task), results })
})

router.put('/tasks/:id/pause', (req: Request, res: Response) => {
  const task = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(req.params.id) as TaskRow | undefined
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  if (task.status !== 'running') {
    res.status(400).json({ error: 'Task is not running' })
    return
  }

  const timer = activeTimers.get(req.params.id)
  if (timer) {
    clearInterval(timer)
    activeTimers.delete(req.params.id)
  }

  db.prepare('UPDATE monitor_task SET status = ? WHERE id = ?').run('paused', req.params.id)
  const updated = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(req.params.id) as TaskRow
  res.json(formatTask(updated))
})

router.put('/tasks/:id/resume', (req: Request, res: Response) => {
  const task = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(req.params.id) as TaskRow | undefined
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  if (task.status !== 'paused') {
    res.status(400).json({ error: 'Task is not paused' })
    return
  }

  const wss: WebSocketServer | undefined = req.app.locals.wss
  const remaining = Math.ceil(task.duration * (1 - task.progress / 100))
  startMonitorTask(req.params.id, remaining, task.interval, wss)

  db.prepare('UPDATE monitor_task SET status = ? WHERE id = ?').run('running', req.params.id)
  const updated = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(req.params.id) as TaskRow
  res.json(formatTask(updated))
})

router.delete('/tasks/:id', (req: Request, res: Response) => {
  const task = db.prepare('SELECT * FROM monitor_task WHERE id = ?').get(req.params.id) as TaskRow | undefined
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const timer = activeTimers.get(req.params.id)
  if (timer) {
    clearInterval(timer)
    activeTimers.delete(req.params.id)
  }

  db.transaction(() => {
    db.prepare('DELETE FROM monitor_result WHERE taskId = ?').run(req.params.id)
    db.prepare('DELETE FROM monitor_task WHERE id = ?').run(req.params.id)
  })()

  res.json({ success: true })
})

function startMonitorTask(taskId: string, duration: number, intervalSec: number, wss?: WebSocketServer): void {
  const totalChecks = Math.max(1, Math.floor(duration / intervalSec))
  let currentCheck = 0

  const insertResult = db.prepare(
    'INSERT INTO monitor_result (taskId, latency, downloadSpeed, uploadSpeed, packetLoss, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const timer = setInterval(() => {
    currentCheck++
    const progress = Math.min((currentCheck / totalChecks) * 100, 100)

    const latency = 5 + Math.random() * 50
    const downloadSpeed = 30 + Math.random() * 100
    const uploadSpeed = 10 + Math.random() * 50
    const packetLoss = Math.random() * 3
    const now = new Date().toISOString()

    insertResult.run(taskId, latency, downloadSpeed, uploadSpeed, packetLoss, now)
    db.prepare('UPDATE monitor_task SET progress = ? WHERE id = ?').run(progress, taskId)

    if (wss) {
      broadcast(wss, {
        type: 'monitor_update',
        data: {
          taskId,
          progress,
          result: { timestamp: Date.now(), latency, downloadSpeed, uploadSpeed }
        }
      })
    }

    if (currentCheck >= totalChecks) {
      clearInterval(timer)
      activeTimers.delete(taskId)
      const completedAt = new Date().toISOString()
      db.prepare('UPDATE monitor_task SET status = ?, progress = ?, completedAt = ? WHERE id = ?')
        .run('completed', 100, completedAt, taskId)

      const reportId = uuidv4()
      db.prepare(
        'INSERT INTO test_report (id, type, createdAt, score, status, summary) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(reportId, 'monitor', completedAt, 70 + Math.random() * 25, 'completed', JSON.stringify({ taskId }))

      if (wss) {
        broadcast(wss, {
          type: 'monitor_complete',
          data: { taskId, reportId }
        })
      }
    }
  }, intervalSec * 1000)

  activeTimers.set(taskId, timer)
}

function broadcast(wss: WebSocketServer, message: WsMessage): void {
  const data = JSON.stringify(message)
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data)
    }
  })
}

function formatTask(row: TaskRow): Omit<MonitorTask, 'config'> & { config: MonitorTask['config'] } {
  return {
    ...row,
    config: JSON.parse(row.config || '{}')
  }
}

export default router
