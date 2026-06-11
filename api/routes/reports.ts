import { Router, Request, Response } from 'express'
import db from '../database.js'
import type { TestReport } from '../../shared/types.js'

const router = Router()

interface ReportRow {
  id: string
  type: string
  createdAt: string
  score: number
  status: string
  summary: string
  details: string
}

interface ResourceRow {
  id: number
  reportId: string
  name: string
  resourceType: string
  size: number
  duration: number
  status: number
  abnormal: number
  abnormalReason: string | null
}

interface ScriptRow {
  id: number
  reportId: string
  name: string
  parseTime: number
  compileTime: number
  executionTime: number
  isLongTask: number
}

router.get('/', (req: Request, res: Response) => {
  const { type, page = '1', limit = '20' } = req.query
  const pageNum = parseInt(page as string) || 1
  const limitNum = parseInt(limit as string) || 20
  const offset = (pageNum - 1) * limitNum

  let whereClause = ''
  const params: unknown[] = []
  if (type) {
    whereClause = 'WHERE type = ?'
    params.push(type)
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM test_report ${whereClause}`).get(...params) as { count: number }).count
  const reports = db.prepare(`SELECT * FROM test_report ${whereClause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset) as ReportRow[]

  res.json({
    data: reports.map(formatReport),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
  })
})

router.get('/:id', (req: Request, res: Response) => {
  const report = db.prepare('SELECT * FROM test_report WHERE id = ?').get(req.params.id) as ReportRow | undefined
  if (!report) {
    res.status(404).json({ error: 'Report not found' })
    return
  }

  const samples = db.prepare('SELECT * FROM speed_sample WHERE reportId = ?').all(req.params.id)
  const resources = db.prepare('SELECT * FROM performance_resource WHERE reportId = ?').all(req.params.id) as ResourceRow[]
  const scripts = db.prepare('SELECT * FROM script_metric WHERE reportId = ?').all(req.params.id) as ScriptRow[]

  res.json({
    ...formatReport(report),
    samples,
    resources: resources.map(formatResource),
    scripts: scripts.map(formatScript)
  })
})

router.post('/compare', (req: Request, res: Response) => {
  const { ids, reportIds } = req.body as { ids?: string[]; reportIds?: string[] }
  const targetIds = ids || reportIds || []
  if (!targetIds || !Array.isArray(targetIds) || targetIds.length < 2) {
    res.status(400).json({ error: 'At least 2 report IDs required' })
    return
  }

  const placeholders = targetIds.map(() => '?').join(',')
  const reports = db.prepare(`SELECT * FROM test_report WHERE id IN (${placeholders}) ORDER BY createdAt ASC`).all(...targetIds) as ReportRow[]

  if (reports.length < 2) {
    res.status(404).json({ error: 'One or more reports not found' })
    return
  }

  const results = reports.map((report) => {
    const samples = db.prepare('SELECT * FROM speed_sample WHERE reportId = ? ORDER BY timestamp ASC').all(report.id)
    const resources = db.prepare('SELECT * FROM performance_resource WHERE reportId = ?').all(report.id) as ResourceRow[]
    const scripts = db.prepare('SELECT * FROM script_metric WHERE reportId = ?').all(report.id) as ScriptRow[]
    return {
      ...formatReport(report),
      samples,
      resources: resources.map(formatResource),
      scripts: scripts.map(formatScript),
    }
  })

  const comparisons = calculateComparisons(results)

  res.json({ data: results, comparisons })
})

function calculateComparisons(reports: Array<Record<string, unknown>>) {
  if (reports.length < 2) return []

  const base = reports[0]
  const baseSummary = base.summary as Record<string, number>

  return reports.slice(1).map((report, idx) => {
    const summary = report.summary as Record<string, number>
    const diffs: Record<string, { value: number; change: number; changePercent: number; direction: 'up' | 'down' | 'same' }> = {}

    Object.keys(baseSummary).forEach((key) => {
      const baseVal = baseSummary[key] || 0
      const currVal = summary[key] || 0
      const change = currVal - baseVal
      const changePercent = baseVal === 0 ? (currVal === 0 ? 0 : 100) : (change / baseVal) * 100

      const isBetterHigher = ['downloadSpeed', 'uploadSpeed', 'score'].includes(key)
      let direction: 'up' | 'down' | 'same' = 'same'
      if (change > 0) direction = isBetterHigher ? 'up' : 'down'
      else if (change < 0) direction = isBetterHigher ? 'down' : 'up'

      diffs[key] = {
        value: currVal,
        change,
        changePercent: Math.round(changePercent * 10) / 10,
        direction,
      }
    })

    return {
      index: idx + 1,
      reportId: report.id,
      diffs,
    }
  })
}

router.get('/:id/export', (req: Request, res: Response) => {
  const report = db.prepare('SELECT * FROM test_report WHERE id = ?').get(req.params.id) as ReportRow | undefined
  if (!report) {
    res.status(404).json({ error: 'Report not found' })
    return
  }

  const format = (req.query.format as string) || 'json'
  const samples = db.prepare('SELECT * FROM speed_sample WHERE reportId = ? ORDER BY timestamp ASC').all(req.params.id)
  const resources = db.prepare('SELECT * FROM performance_resource WHERE reportId = ?').all(req.params.id) as ResourceRow[]
  const scripts = db.prepare('SELECT * FROM script_metric WHERE reportId = ?').all(req.params.id) as ScriptRow[]

  const fullReport = {
    ...formatReport(report),
    samples,
    resources: resources.map(formatResource),
    scripts: scripts.map(formatScript),
  }

  if (format === 'html') {
    const html = generateHtmlReport(fullReport)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=report-${req.params.id}.html`)
    res.send(html)
  } else if (format === 'csv') {
    let csvContent = ''
    if (samples.length > 0) {
      const headers = ['timestamp', 'type', 'value']
      const rows = samples.map((s: Record<string, unknown>) =>
        headers.map((h) => {
          const val = s[h]
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
        }).join(',')
      )
      csvContent = [headers.join(','), ...rows].join('\n')
    } else {
      const summary = fullReport.summary as Record<string, unknown>
      const headers = Object.keys(summary)
      const values = headers.map((h) => {
        const val = summary[h]
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      })
      csvContent = [headers.join(','), values.join(',')].join('\n')
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=report-${req.params.id}.csv`)
    res.send('\uFEFF' + csvContent)
  } else {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=report-${req.params.id}.json`)
    res.json(fullReport)
  }
})

function generateHtmlReport(report: Record<string, unknown>) {
  const summary = report.summary as Record<string, number>
  const typeLabels: Record<string, string> = {
    speed: '网络测速',
    performance: '性能检测',
    monitor: '长时监测',
  }
  const scoreColor = (score: number) => {
    if (score >= 90) return '#22c55e'
    if (score >= 70) return '#eab308'
    if (score >= 50) return '#ff6b35'
    return '#ef4444'
  }

  const summaryRows = Object.entries(summary)
    .map(
      ([key, val]) => `
    <tr>
      <td style="padding:10px 15px;border-bottom:1px solid #eee;">${key}</td>
      <td style="padding:10px 15px;border-bottom:1px solid #eee;font-family:monospace;">${val}</td>
    </tr>
  `
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>测试报告 - ${report.id}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; background: #f5f7fa; color: #333; }
  .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
  .header { padding: 30px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
  .header h1 { margin: 0 0 10px 0; font-size: 24px; }
  .header .meta { opacity: 0.9; font-size: 14px; }
  .score-section { text-align: center; padding: 30px; background: #f9fafb; border-bottom: 1px solid #eee; }
  .score { font-size: 64px; font-weight: bold; font-family: monospace; }
  .score-label { font-size: 14px; color: #666; margin-top: 5px; }
  .section { padding: 30px 40px; }
  .section h2 { margin: 0 0 20px 0; font-size: 18px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 15px; background: #f9fafb; border-bottom: 2px solid #eee; font-weight: 600; font-size: 13px; color: #666; }
  .footer { padding: 20px 40px; background: #f9fafb; text-align: center; font-size: 12px; color: #999; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${typeLabels[report.type as string] || '测试'}报告</h1>
      <div class="meta">
        报告ID: ${report.id}<br>
        生成时间: ${new Date(report.createdAt as string).toLocaleString('zh-CN')}
      </div>
    </div>
    <div class="score-section">
      <div class="score" style="color: ${scoreColor(report.score as number)}">${report.score}</div>
      <div class="score-label">综合评分</div>
    </div>
    <div class="section">
      <h2>测试概览</h2>
      <table>
        <thead>
          <tr><th>指标</th><th>数值</th></tr>
        </thead>
        <tbody>
          ${summaryRows}
        </tbody>
      </table>
    </div>
    <div class="footer">
      由 Speed Radar 性能检测工具生成 · ${new Date().toLocaleString('zh-CN')}
    </div>
  </div>
</body>
</html>`
}

router.delete('/:id', (req: Request, res: Response) => {
  const report = db.prepare('SELECT * FROM test_report WHERE id = ?').get(req.params.id) as ReportRow | undefined
  if (!report) {
    res.status(404).json({ error: 'Report not found' })
    return
  }

  db.transaction(() => {
    db.prepare('DELETE FROM speed_sample WHERE reportId = ?').run(req.params.id)
    db.prepare('DELETE FROM performance_resource WHERE reportId = ?').run(req.params.id)
    db.prepare('DELETE FROM script_metric WHERE reportId = ?').run(req.params.id)
    db.prepare('DELETE FROM test_report WHERE id = ?').run(req.params.id)
  })()

  res.json({ success: true })
})

function formatReport(row: ReportRow): Omit<TestReport, 'summary' | 'details'> & { summary: Record<string, unknown>; details: Record<string, unknown> } {
  return {
    ...row,
    summary: JSON.parse(row.summary || '{}'),
    details: JSON.parse(row.details || '{}')
  }
}

function formatResource(row: ResourceRow) {
  return {
    ...row,
    abnormal: !!row.abnormal
  }
}

function formatScript(row: ScriptRow) {
  return {
    ...row,
    isLongTask: !!row.isLongTask
  }
}

export default router
