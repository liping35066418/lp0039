import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../database.js'
import type { PerformanceResource, ScriptMetric } from '../../shared/types.js'

const router = Router()

interface PerformanceRequestBody {
  url: string
  webVitals: {
    fcp: number
    lcp: number
    cls: number
    ttfb?: number
    fid?: number
  }
  resources: PerformanceResource[]
  scripts: ScriptMetric[]
  longTasks: Array<{
    startTime: number
    duration: number
    name: string
  }>
}

router.post('/analyze', (req: Request, res: Response) => {
  const { url, webVitals, resources, scripts, longTasks } = req.body as PerformanceRequestBody
  if (!url || !webVitals) {
    res.status(400).json({ error: 'Missing required fields: url, webVitals' })
    return
  }

  const id = uuidv4()
  const now = new Date().toISOString()

  const score = calculatePerformanceScore(webVitals)
  const summary = JSON.stringify({ url, webVitals, longTaskCount: longTasks?.length || 0 })
  const details = JSON.stringify({ longTasks: longTasks || [] })

  db.prepare(
    'INSERT INTO test_report (id, type, createdAt, score, status, summary, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, 'performance', now, score, 'completed', summary, details)

  if (Array.isArray(resources)) {
    const insertResource = db.prepare(
      'INSERT INTO performance_resource (reportId, name, resourceType, size, duration, status, abnormal, abnormalReason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const r of resources) {
      insertResource.run(
        id,
        r.name || '',
        r.type || '',
        r.size || 0,
        r.duration || 0,
        r.status || 200,
        r.abnormal ? 1 : 0,
        r.abnormalReason || null
      )
    }
  }

  if (Array.isArray(scripts)) {
    const insertScript = db.prepare(
      'INSERT INTO script_metric (reportId, name, parseTime, compileTime, executionTime, isLongTask) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const s of scripts) {
      insertScript.run(
        id,
        s.name || '',
        s.parseTime || 0,
        s.compileTime || 0,
        s.executionTime || 0,
        s.isLongTask ? 1 : 0
      )
    }
  }

  res.status(201).json({ id, score, status: 'completed' })
})

function calculatePerformanceScore(webVitals: PerformanceRequestBody['webVitals']): number {
  let score = 100
  if (webVitals.lcp > 2500) score -= Math.min(30, (webVitals.lcp - 2500) / 100)
  if (webVitals.fcp > 1800) score -= Math.min(20, (webVitals.fcp - 1800) / 100)
  if (webVitals.cls > 0.1) score -= Math.min(25, (webVitals.cls - 0.1) * 100)
  if (webVitals.ttfb && webVitals.ttfb > 800) score -= Math.min(15, (webVitals.ttfb - 800) / 50)
  if (webVitals.fid && webVitals.fid > 100) score -= Math.min(10, (webVitals.fid - 100) / 10)
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10
}

export default router
