import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { WebSocketServer } from 'ws'
import db from '../database.js'
import type { SpeedSample, SpeedTestResponse, WsMessage } from '../../shared/types.js'

const router = Router()

router.get('/download', (req: Request, res: Response) => {
  const size = parseInt(req.query.size as string) || 10 * 1024 * 1024
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Length', size)
  res.setHeader('Cache-Control', 'no-store')

  let sent = 0
  const chunkSize = 64 * 1024

  const sendChunk = () => {
    if (sent >= size) {
      res.end()
      return
    }
    const remaining = size - sent
    const currentChunkSize = Math.min(chunkSize, remaining)
    const chunk = randomBytes(currentChunkSize)
    sent += currentChunkSize
    res.write(chunk)
    if (sent < size) {
      setImmediate(sendChunk)
    } else {
      res.end()
    }
  }

  sendChunk()
})

router.post('/upload', (req: Request, res: Response) => {
  let received = 0
  req.on('data', (chunk: Buffer) => {
    received += chunk.length
  })
  req.on('end', () => {
    res.json({ received, timestamp: Date.now() })
  })
  req.on('error', () => {
    res.status(500).json({ error: 'Upload failed' })
  })
})

router.get('/ping', (_req: Request, res: Response) => {
  res.json({ timestamp: Date.now(), serverTime: Date.now() })
})

let packetSequence = 0
router.get('/packet-loss', (_req: Request, res: Response) => {
  packetSequence += 1
  res.json({ sequence: packetSequence, timestamp: Date.now() })
})

router.post('/test', (req: Request, res: Response) => {
  const { type = 'download' } = req.body || {}
  const testId = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    'INSERT INTO test_report (id, type, createdAt, score, status) VALUES (?, ?, ?, 0, ?)'
  ).run(testId, type, now, 'running')

  const insertSample = db.prepare(
    'INSERT INTO speed_sample (reportId, type, value, timestamp) VALUES (?, ?, ?, ?)'
  )

  const wss: WebSocketServer | undefined = req.app.locals.wss

  res.json({ testId, status: 'running' })

  const sampleCount = 20
  const intervalMs = 250
  let current = 0

  const timer = setInterval(() => {
    current++
    if (current > sampleCount) {
      clearInterval(timer)
      const finalScore = calculateScore(type)
      db.prepare('UPDATE test_report SET score = ?, status = ? WHERE id = ?')
        .run(finalScore, 'completed', testId)

      if (wss) {
        broadcast(wss, {
          type: 'speed_complete',
          data: {
            testId,
            type,
            startTime: Date.now() - sampleCount * intervalMs,
            endTime: Date.now(),
            results: buildResults(type),
            score: finalScore,
            samples: []
          } as SpeedTestResponse
        })
      }
      return
    }

    const value = generateSampleValue(type)
    const sampleTimestamp = new Date().toISOString()
    insertSample.run(testId, type, value, sampleTimestamp)

    if (wss) {
      broadcast(wss, {
        type: 'speed_sample',
        data: { timestamp: Date.now(), value, type } as SpeedSample
      })
    }

    const progress = current / sampleCount
    db.prepare('UPDATE test_report SET summary = ? WHERE id = ?')
      .run(JSON.stringify({ progress, currentSample: current }), testId)
  }, intervalMs)
})

function generateSampleValue(type: string): number {
  const base: Record<string, number> = {
    download: 50 + Math.random() * 100,
    upload: 20 + Math.random() * 50,
    latency: 5 + Math.random() * 40,
    'packet-loss': Math.random() * 2
  }
  return base[type] || Math.random() * 100
}

function calculateScore(type: string): number {
  const scores: Record<string, number> = {
    download: 60 + Math.random() * 40,
    upload: 50 + Math.random() * 40,
    latency: 40 + Math.random() * 50,
    'packet-loss': 70 + Math.random() * 30
  }
  return Math.round((scores[type] || 50) * 10) / 10
}

function buildResults(type: string): SpeedTestResponse['results'] {
  if (type === 'latency') {
    return {
      latency: {
        min: 5 + Math.random() * 10,
        avg: 15 + Math.random() * 20,
        max: 30 + Math.random() * 30,
        jitter: 2 + Math.random() * 8
      }
    }
  }
  if (type === 'packet-loss') {
    return { packetLoss: Math.random() * 2 }
  }
  if (type === 'upload') {
    return { uploadSpeed: 20 + Math.random() * 50 }
  }
  return { downloadSpeed: 50 + Math.random() * 100 }
}

function broadcast(wss: WebSocketServer, message: WsMessage): void {
  const data = JSON.stringify(message)
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data)
    }
  })
}

export default router
