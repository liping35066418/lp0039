import { useState, useEffect, useRef, useCallback } from 'react'
import { useReportsStore } from '@/store'
import { drawRadarChart, drawLineChart } from '@/utils/charts'
import { getScoreColor, getScoreLabel, formatSpeed, formatLatency, formatBytes, formatDuration } from '@/utils/format'
import {
  Search,
  Filter,
  Download,
  Trash2,
  GitCompare,
  X,
  FileJson,
  FileSpreadsheet,
  FileText,
  Eye,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  Clock,
  Activity,
} from 'lucide-react'
import type { TestReport } from '../../shared/types'

const PAGE_SIZE = 20
const RADAR_LABELS = ['下载速度', '上传速度', '延迟', '丢包率', '综合评分']
const CHART_COLORS = ['#00f5d4', '#eab308', '#ff6b35', '#a78bfa']

interface ReportDetail extends TestReport {
  samples?: Array<{ type: string; value: number; timestamp: string }>
  resources?: Array<{ name: string; type: string; size: number; duration: number; abnormal: boolean; abnormalReason?: string }>
  scripts?: Array<{ name: string; parseTime: number; compileTime: number; executionTime: number }>
}

interface ComparisonDiff {
  value: number
  change: number
  changePercent: number
  direction: 'up' | 'down' | 'same'
}

function mapReportToRadarValues(report: TestReport): number[] {
  const s = report.summary as Record<string, number>
  return [
    Math.min((s.downloadSpeed ?? 0) / 104857600, 1) * 100,
    Math.min((s.uploadSpeed ?? 0) / 52428800, 1) * 100,
    Math.max(0, 100 - (s.latency ?? 0) / 10),
    Math.max(0, 100 - (s.packetLoss ?? 0) * 10),
    report.score,
  ]
}

async function exportReport(id: string, format: 'json' | 'csv' | 'html') {
  const res = await fetch(`/api/reports/${id}/export?format=${format}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `report-${id}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

async function fetchReportDetail(id: string): Promise<ReportDetail> {
  const res = await fetch(`/api/reports/${id}`)
  return res.json()
}

async function compareReports(selectedIds: string[]): Promise<{ data: ReportDetail[]; comparisons: Array<{ reportId: string; diffs: Record<string, ComparisonDiff> }> }> {
  const res = await fetch('/api/reports/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportIds: selectedIds }),
  })
  return res.json()
}

const TYPE_MAP: Record<TestReport['type'], string> = {
  speed: '测速',
  performance: '性能',
  monitor: '监测',
}

const METRIC_LABELS: Record<string, string> = {
  downloadSpeed: '下载速度',
  uploadSpeed: '上传速度',
  latency: '平均延迟',
  latencyMin: '最低延迟',
  latencyMax: '最高延迟',
  jitter: '抖动',
  packetLoss: '丢包率',
  score: '综合评分',
  fcp: 'FCP',
  lcp: 'LCP',
  cls: 'CLS',
  ttfb: 'TTFB',
  resourceCount: '资源数量',
  totalSize: '总大小',
}

export default function Reports() {
  const { reports, selectedIds, fetchReports, deleteReport, toggleSelect, clearSelection } =
    useReportsStore()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'speed' | 'performance' | 'monitor'>('all')
  const [page, setPage] = useState(1)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [exportOpenId, setExportOpenId] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareData, setCompareData] = useState<{
    data: ReportDetail[]
    comparisons: Array<{ reportId: string; diffs: Record<string, ComparisonDiff> }>
  } | null>(null)
  const [detailReport, setDetailReport] = useState<ReportDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const radarCanvasRef = useRef<HTMLCanvasElement>(null)
  const lineCanvasRef = useRef<HTMLCanvasElement>(null)
  const detailChartRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const filtered = reports.filter((r) => {
    const matchSearch =
      search === '' ||
      r.id.includes(search) ||
      TYPE_MAP[r.type].includes(search) ||
      r.status.includes(search)
    const matchType = typeFilter === 'all' || r.type === typeFilter
    return matchSearch && matchType
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter])

  const selectedReports = reports.filter((r) => selectedIds.includes(r.id))

  const drawRadar = useCallback(() => {
    const canvas = radarCanvasRef.current
    if (!canvas || selectedIds.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const datasets = selectedReports.map((r, i) => ({
      label: new Date(r.createdAt).toLocaleDateString(),
      values: mapReportToRadarValues(r),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    drawRadarChart(ctx, datasets, RADAR_LABELS, 320, 320)
  }, [selectedIds, selectedReports])

  useEffect(() => {
    if (selectedIds.length >= 2 && radarCanvasRef.current) {
      drawRadar()
    }
  }, [selectedIds, drawRadar])

  const drawDetailChart = useCallback(() => {
    const canvas = detailChartRef.current
    if (!canvas || !detailReport || !detailReport.samples || detailReport.samples.length === 0) return

    const container = canvas.parentElement
    if (!container) return

    const width = container.clientWidth
    canvas.width = width
    canvas.height = 200
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const downloadSamples = detailReport.samples.filter((s) => s.type === 'download')
    const uploadSamples = detailReport.samples.filter((s) => s.type === 'upload')

    const datasets = []
    if (downloadSamples.length > 0) {
      datasets.push({
        label: '下载速度',
        values: downloadSamples.map((s) => s.value),
        color: '#00f5d4',
      })
    }
    if (uploadSamples.length > 0) {
      datasets.push({
        label: '上传速度',
        values: uploadSamples.map((s) => s.value),
        color: '#eab308',
      })
    }

    if (datasets.length > 0) {
      drawLineChart(ctx, datasets, width, 200)
    }
  }, [detailReport])

  useEffect(() => {
    if (detailReport) {
      drawDetailChart()
    }
  }, [detailReport, drawDetailChart])

  const handleCompare = async () => {
    if (selectedIds.length < 2 || selectedIds.length > 4) return
    setComparing(true)
    try {
      const data = await compareReports(selectedIds)
      setCompareData(data)
    } finally {
      setComparing(false)
    }
  }

  const handleViewDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const detail = await fetchReportDetail(id)
      setDetailReport(detail)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteReport(id)
    setDeleteConfirmId(null)
  }

  const statusConfig: Record<
    TestReport['status'],
    { bg: string; text: string; label: string }
  > = {
    completed: { bg: 'bg-success/20', text: 'text-success', label: '已完成' },
    failed: { bg: 'bg-danger/20', text: 'text-danger', label: '失败' },
    running: { bg: 'bg-warning/20', text: 'text-warning', label: '运行中' },
  }

  const formatMetricValue = (key: string, value: number): string => {
    if (['downloadSpeed', 'uploadSpeed'].includes(key)) return formatSpeed(value)
    if (['latency', 'latencyMin', 'latencyMax', 'jitter', 'fcp', 'lcp', 'ttfb'].includes(key))
      return formatLatency(value)
    if (key === 'packetLoss') return `${value.toFixed(2)}%`
    if (key === 'cls') return value.toFixed(3)
    if (key === 'totalSize') return formatBytes(value)
    if (key === 'score') return value.toString()
    if (typeof value === 'number') return value.toFixed(2)
    return String(value)
  }

  const getDiffIcon = (direction: 'up' | 'down' | 'same') => {
    if (direction === 'up') return <ArrowUp size={12} className="text-success" />
    if (direction === 'down') return <ArrowDown size={12} className="text-danger" />
    return <Minus size={12} className="text-muted" />
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">历史报告</h2>

      <div className="card-glass rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="搜索报告..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="text-muted" size={16} />
          {(['all', 'speed', 'performance', 'monitor'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                typeFilter === t
                  ? 'bg-accent/20 text-accent'
                  : 'bg-bg text-muted hover:text-gray-300 border border-border'
              }`}
            >
              {t === 'all' ? '全部' : TYPE_MAP[t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCompare}
            disabled={selectedIds.length < 2 || selectedIds.length > 4 || comparing}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GitCompare size={14} />
            对比 ({selectedIds.length})
          </button>
          {selectedIds.length > 0 && (
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-gray-300 border border-border transition-all"
            >
              <X size={12} />
              清除选择
            </button>
          )}
        </div>
      </div>

      {selectedIds.length >= 2 && (
        <div className="card-glass rounded-xl p-6 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted">报告对比</h3>
            {compareData && (
              <button
                onClick={() => setCompareData(null)}
                className="text-xs text-muted hover:text-gray-300"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <canvas ref={radarCanvasRef} width={320} height={320} />
              <div className="flex items-center justify-center gap-4 mt-2">
                {selectedReports.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-muted">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {compareData && compareData.data.length > 0 && (
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted">
                        指标
                      </th>
                      {compareData.data.map((r) => (
                        <th key={r.id} className="text-right py-2 px-3 text-xs font-medium text-muted">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys((compareData.data[0].summary || {}) as Record<string, number>).map(
                      (key) => (
                        <tr key={key} className="border-b border-border/50">
                          <td className="py-2 px-3 text-gray-300">
                            {METRIC_LABELS[key] || key}
                          </td>
                          {compareData.data.map((r, idx) => {
                            const val = (r.summary as Record<string, number>)[key] ?? 0
                            const comp = compareData.comparisons.find((c) => c.reportId === r.id)
                            const diff = comp?.diffs[key]
                            return (
                              <td key={r.id} className="py-2 px-3 text-right">
                                <div className="font-mono">
                                  {formatMetricValue(key, val)}
                                </div>
                                {idx > 0 && diff && diff.direction !== 'same' && (
                                  <div
                                    className={`text-xs flex items-center justify-end gap-1 ${
                                      diff.direction === 'up' ? 'text-success' : 'text-danger'
                                    }`}
                                  >
                                    {getDiffIcon(diff.direction)}
                                    {diff.changePercent > 0 ? '+' : ''}
                                    {diff.changePercent.toFixed(1)}%
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-12 flex flex-col items-center justify-center text-muted">
          <FileText size={48} className="mb-4 opacity-30" />
          <p className="text-lg">暂无测试报告</p>
        </div>
      ) : (
        <div className="card-glass rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted w-10" />
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">评分</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted">操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((report) => {
                const sc = statusConfig[report.status]
                const summary = report.summary as Record<string, number>
                return (
                  <tr
                    key={report.id}
                    className="border-b border-border/50 hover:bg-card-hover transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(report.id)}
                        onChange={() => toggleSelect(report.id)}
                        disabled={!selectedIds.includes(report.id) && selectedIds.length >= 4}
                        className="rounded border-border bg-bg accent-accent"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {new Date(report.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {TYPE_MAP[report.type]}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: getScoreColor(report.score) }}
                        />
                        <span className="text-sm font-mono text-gray-200">{report.score}</span>
                        <span className="text-xs text-muted">{getScoreLabel(report.score)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}
                      >
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewDetail(report.id)}
                          className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-all"
                          title="查看详情"
                        >
                          <Eye size={14} />
                        </button>

                        <div className="relative">
                          <button
                            onClick={() =>
                              setExportOpenId(exportOpenId === report.id ? null : report.id)
                            }
                            className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-all"
                            title="导出"
                          >
                            <Download size={14} />
                          </button>
                          {exportOpenId === report.id && (
                            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-10 py-1 min-w-[130px]">
                              <button
                                onClick={() => {
                                  exportReport(report.id, 'json')
                                  setExportOpenId(null)
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-card-hover w-full text-left transition-colors"
                              >
                                <FileJson size={12} />
                                导出 JSON
                              </button>
                              <button
                                onClick={() => {
                                  exportReport(report.id, 'csv')
                                  setExportOpenId(null)
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-card-hover w-full text-left transition-colors"
                              >
                                <FileSpreadsheet size={12} />
                                导出 CSV
                              </button>
                              <button
                                onClick={() => {
                                  exportReport(report.id, 'html')
                                  setExportOpenId(null)
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-card-hover w-full text-left transition-colors"
                              >
                                <FileText size={12} />
                                导出 HTML
                              </button>
                            </div>
                          )}
                        </div>

                        {deleteConfirmId === report.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(report.id)}
                              className="px-2 py-1 rounded text-xs bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
                            >
                              确认
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 rounded text-xs text-muted hover:text-gray-300 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(report.id)}
                            className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            上一页
          </button>
          <span className="text-sm text-muted">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            下一页
          </button>
        </div>
      )}

      {detailReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="text-lg font-bold">报告详情</h3>
                <p className="text-xs text-muted mt-0.5">{detailReport.id}</p>
              </div>
              <button
                onClick={() => setDetailReport(null)}
                className="p-1.5 rounded-lg text-muted hover:text-gray-300 hover:bg-bg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(85vh-80px)] space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="card-glass rounded-lg p-4 text-center">
                  <div
                    className="text-3xl font-bold font-mono"
                    style={{ color: getScoreColor(detailReport.score) }}
                  >
                    {detailReport.score}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {getScoreLabel(detailReport.score)}
                  </div>
                </div>
                <div className="card-glass rounded-lg p-4">
                  <div className="text-xs text-muted mb-1">类型</div>
                  <div className="text-sm font-medium">
                    {TYPE_MAP[detailReport.type]}
                  </div>
                </div>
                <div className="card-glass rounded-lg p-4">
                  <div className="text-xs text-muted mb-1">创建时间</div>
                  <div className="text-sm font-medium">
                    {new Date(detailReport.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="card-glass rounded-lg p-4">
                  <div className="text-xs text-muted mb-1">状态</div>
                  <div className="text-sm font-medium">
                    {statusConfig[detailReport.status].label}
                  </div>
                </div>
              </div>

              {detailReport.samples && detailReport.samples.length > 0 && (
                <div className="card-glass rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={16} className="text-accent" />
                    <h4 className="text-sm font-medium">速度曲线</h4>
                  </div>
                  <canvas ref={detailChartRef} height={200} className="w-full" />
                </div>
              )}

              <div className="card-glass rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 size={16} className="text-accent" />
                  <h4 className="text-sm font-medium">测试概要</h4>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(detailReport.summary as Record<string, number>).map(
                    ([key, value]) => (
                      <div key={key} className="p-3 bg-bg/50 rounded-lg">
                        <div className="text-xs text-muted mb-1">
                          {METRIC_LABELS[key] || key}
                        </div>
                        <div className="text-sm font-mono font-bold">
                          {formatMetricValue(key, value)}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              {detailReport.resources && detailReport.resources.length > 0 && (
                <div className="card-glass rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-accent" />
                    <h4 className="text-sm font-medium">
                      资源列表 ({detailReport.resources.length})
                    </h4>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border text-muted">
                          <th className="text-left py-2 px-2">名称</th>
                          <th className="text-left py-2 px-2 w-16">类型</th>
                          <th className="text-right py-2 px-2 w-20">大小</th>
                          <th className="text-right py-2 px-2 w-20">耗时</th>
                          <th className="text-center py-2 px-2 w-16">异常</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailReport.resources.slice(0, 20).map((r, i) => (
                          <tr
                            key={i}
                            className={`border-b border-border/50 ${
                              r.abnormal ? 'bg-danger/5' : ''
                            }`}
                          >
                            <td className="py-2 px-2 font-mono truncate max-w-[200px]">
                              {r.name}
                            </td>
                            <td className="py-2 px-2">{r.type}</td>
                            <td className="py-2 px-2 text-right font-mono">
                              {formatBytes(r.size)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {formatDuration(r.duration)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {r.abnormal ? (
                                <span className="text-danger text-[10px]">
                                  {r.abnormalReason || '异常'}
                                </span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
