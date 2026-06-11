import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  Zap,
  HardDrive,
  FileCode,
  Globe,
  Lightbulb,
} from 'lucide-react'
import { usePerformanceStore } from '@/store'
import { formatBytes, formatDuration } from '@/utils/format'
import { drawBarChart } from '@/utils/charts'
import { getPerformanceGrade, getVitalsStatus } from '@/utils/performance'
import type { PerformanceResource, NetworkRequest } from '@/utils/performance'

type SortKey = 'name' | 'type' | 'size' | 'duration' | 'status'
type TabType = 'resources' | 'requests' | 'scripts' | 'timing'

export default function Performance() {
  const { report, loading, analysisResult, analyze } = usePerformanceStore()
  const chartRef = useRef<HTMLCanvasElement>(null)
  const timingChartRef = useRef<HTMLCanvasElement>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('duration')
  const [sortAsc, setSortAsc] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('resources')
  const [showSuggestions, setSuggestionsOpen] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('perf') === '1') {
      params.delete('perf')
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname
      window.history.replaceState({}, '', newUrl)
      analyze()
    }
  }, [analyze])

  useEffect(() => {
    if (!chartRef.current || !report) return
    const container = chartRef.current?.parentElement
    if (!container) return
    const width = container.clientWidth
    chartRef.current.width = width
    chartRef.current.height = 300
    const ctx = chartRef.current.getContext('2d')
    if (!ctx) return

    const scriptData = report.scripts.slice(0, 10).map((s) => ({
      label: s.name.length > 20 ? '...' + s.name.slice(-20) : s.name,
      values: [s.parseTime, s.compileTime, s.executionTime],
      colors: ['#00f5d4', '#eab308', '#ff6b35'],
    }))
    drawBarChart(ctx, scriptData, ['解析', '编译', '执行'], width, 300)
  }, [report, activeTab])

  useEffect(() => {
    if (!timingChartRef.current || !report || activeTab !== 'timing') return

    const canvas = timingChartRef.current
    const container = canvas.parentElement
    if (!container) return

    const width = container.clientWidth
    const height = 250
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const nav = report.navigationTiming
    const phases = [
      { name: '重定向', value: nav.redirectTime, color: '#8b5cf6' },
      { name: 'DNS查询', value: nav.dnsLookup, color: '#06b6d4' },
      { name: 'TCP连接', value: nav.tcpConnect, color: '#84cc16' },
      { name: 'SSL握手', value: nav.sslTime, color: '#ec4899' },
      { name: '响应时间', value: nav.responseTime - nav.sslTime - nav.tcpConnect - nav.dnsLookup, color: '#f59e0b' },
      { name: 'DOM处理', value: nav.domProcessing, color: '#00f5d4' },
      { name: '加载完成', value: nav.loadEvent - nav.domContentLoaded, color: '#ef4444' },
    ].filter((p) => p.value > 0)

    const total = phases.reduce((s, p) => s + p.value, 0) || 1
    let x = 40
    const barHeight = 40

    ctx.clearRect(0, 0, width, height)

    phases.forEach((phase) => {
      const barWidth = (phase.value / total) * (width - 80)
      ctx.fillStyle = phase.color
      ctx.fillRect(x, 80, barWidth, barHeight)

      ctx.fillStyle = '#9ca3af'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(phase.name, x + barWidth / 2, 75)

      ctx.fillStyle = '#e5e7eb'
      ctx.fillText(`${phase.value.toFixed(0)}ms`, x + barWidth / 2, 135)

      x += barWidth
    })
  }, [report, activeTab])

  const handleAnalyze = () => {
    performance.clearResourceTimings()
    const url = new URL(window.location.href)
    url.searchParams.set('perf', '1')
    window.location.href = url.toString()
  }

  const statusColor = (status: 'good' | 'needs-improvement' | 'poor') => {
    if (status === 'good') return '#22c55e'
    if (status === 'needs-improvement') return '#eab308'
    return '#ef4444'
  }

  const filteredResources = report
    ? report.resources
        .filter((r) => {
          if (typeFilter !== 'all' && r.type !== typeFilter) return false
          if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        .sort((a, b) => {
          const dir = sortAsc ? 1 : -1
          if (sortKey === 'name' || sortKey === 'type')
            return dir * a[sortKey].localeCompare(b[sortKey])
          return dir * ((a[sortKey] as number) - (b[sortKey] as number))
        })
    : []

  const filteredRequests = report
    ? report.networkRequests.filter((r) => {
        if (search === '') return true
        return r.url.toLowerCase().includes(search.toLowerCase())
      })
    : []

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((prev) => !prev)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null
    return sortAsc ? (
      <ChevronUp size={12} className="inline ml-1" />
    ) : (
      <ChevronDown size={12} className="inline ml-1" />
    )
  }

  const isPerfReload = new URLSearchParams(window.location.search).get('perf') === '1'

  if (!report && !loading && !isPerfReload) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[600px]">
        <Activity size={48} className="text-accent mb-4" />
        <p className="text-lg text-muted">点击一键检测按钮开始分析页面性能</p>
        <button
          onClick={handleAnalyze}
          className="btn-primary mt-6 flex items-center gap-2"
        >
          <Zap size={16} />
          开始检测
        </button>
      </div>
    )
  }

  const vitals = [
    {
      key: 'fcp' as const,
      label: 'FCP',
      fullName: '首次内容绘制',
      value: report?.webVitals.fcp ?? 0,
      threshold: '≤1800ms 良好 / ≤3000ms 需改进',
    },
    {
      key: 'lcp' as const,
      label: 'LCP',
      fullName: '最大内容绘制',
      value: report?.webVitals.lcp ?? 0,
      threshold: '≤2500ms 良好 / ≤4000ms 需改进',
    },
    {
      key: 'cls' as const,
      label: 'CLS',
      fullName: '累积布局偏移',
      value: report?.webVitals.cls ?? 0,
      threshold: '≤0.1 良好 / ≤0.25 需改进',
    },
    {
      key: 'ttfb' as const,
      label: 'TTFB',
      fullName: '首字节时间',
      value: report?.webVitals.ttfb ?? 0,
      threshold: '≤800ms 良好 / ≤1800ms 需改进',
    },
  ]

  const resourceTypeStats = report
    ? report.resources.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    : {}

  const resourceSizeStats = report
    ? report.resources.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + r.size
        return acc
      }, {} as Record<string, number>)
    : {}

  const grade = analysisResult
    ? getPerformanceGrade(analysisResult.score)
    : { grade: '-', color: '#9ca3af', label: '--' }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">性能检测</h2>
          {report && (
            <p className="text-xs text-muted mt-1">
              检测页面: {report.url.length > 60 ? '...' + report.url.slice(-60) : report.url}
            </p>
          )}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          一键检测
        </button>
      </div>

      {loading || (!report && isPerfReload) ? (
        <>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-glass rounded-lg p-5 animate-pulse">
                <div className="h-4 bg-border rounded w-16 mb-3" />
                <div className="h-8 bg-border rounded w-24 mb-2" />
                <div className="h-3 bg-border rounded w-32" />
              </div>
            ))}
          </div>
          <div className="card-glass rounded-lg p-5 animate-pulse">
            <div className="h-6 bg-border rounded w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 bg-border rounded" />
              ))}
            </div>
          </div>
        </>
      ) : report ? (
        <>
          <div className="grid grid-cols-5 gap-4">
            <div className="card-glass rounded-xl p-5 flex flex-col items-center justify-center">
              <div
                className="font-mono text-5xl font-bold mb-2"
                style={{ color: grade.color }}
              >
                {grade.grade}
              </div>
              <div className="text-sm font-medium" style={{ color: grade.color }}>
                {grade.label}
              </div>
              <div className="text-xs text-muted mt-1">
                综合评分 {analysisResult?.score ?? '--'}
              </div>
            </div>
            {vitals.map((v) => {
              const status = getVitalsStatus(v.key, v.value)
              return (
                <div key={v.key} className="card-glass rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-muted">{v.label}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: statusColor(status) }}
                    />
                  </div>
                  <div className="text-2xl font-bold font-mono">
                    {v.key === 'cls' ? v.value.toFixed(3) : formatDuration(v.value)}
                  </div>
                  <div className="text-xs text-muted mt-1">{v.fullName}</div>
                </div>
              )
            })}
          </div>

          {analysisResult && analysisResult.issues.length > 0 && (
            <div className="card-glass rounded-xl p-5">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setSuggestionsOpen(!showSuggestions)}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-warning" />
                  <h3 className="text-sm font-semibold">
                    发现 {analysisResult.issues.length} 个性能问题
                  </h3>
                </div>
                {showSuggestions ? (
                  <ChevronUp size={18} className="text-muted" />
                ) : (
                  <ChevronDown size={18} className="text-muted" />
                )}
              </div>

              {showSuggestions && (
                <div className="mt-4 space-y-3">
                  {analysisResult.issues.map((issue, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg bg-bg/50"
                    >
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          issue.severity === 'high'
                            ? 'bg-danger'
                            : issue.severity === 'medium'
                            ? 'bg-warning'
                            : 'bg-accent'
                        }`}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{issue.message}</div>
                        {analysisResult.suggestions[i] && (
                          <div className="text-xs text-muted mt-1 flex items-center gap-1">
                            <Lightbulb size={12} className="text-warning/70" />
                            {analysisResult.suggestions[i]}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            <div className="card-glass rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileCode size={16} className="text-accent" />
                <span className="text-xs text-muted">资源总数</span>
              </div>
              <div className="text-xl font-bold font-mono">{report.resources.length}</div>
            </div>
            <div className="card-glass rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={16} className="text-blue-400" />
                <span className="text-xs text-muted">总大小</span>
              </div>
              <div className="text-xl font-bold font-mono">
                {formatBytes(
                  report.resources.reduce((s, r) => s + r.size, 0)
                )}
              </div>
            </div>
            <div className="card-glass rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe size={16} className="text-purple-400" />
                <span className="text-xs text-muted">接口请求</span>
              </div>
              <div className="text-xl font-bold font-mono">
                {report.networkRequests.length}
              </div>
            </div>
            <div className="card-glass rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-warning" />
                <span className="text-xs text-muted">异常资源</span>
              </div>
              <div className="text-xl font-bold font-mono">
                {report.resources.filter((r) => r.abnormal).length}
              </div>
            </div>
          </div>

          {report.memory && (
            <div className="card-glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <HardDrive size={18} className="text-accent" />
                <h3 className="text-sm font-semibold">内存使用</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted mb-1">已使用 JS 堆</div>
                  <div className="text-lg font-mono font-bold">
                    {formatBytes(report.memory.usedJSHeapSize)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted mb-1">总 JS 堆</div>
                  <div className="text-lg font-mono font-bold">
                    {formatBytes(report.memory.totalJSHeapSize)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted mb-1">堆大小限制</div>
                  <div className="text-lg font-mono font-bold">
                    {formatBytes(report.memory.jsHeapSizeLimit)}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="h-2 bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{
                      width: `${(report.memory.usedJSHeapSize / report.memory.jsHeapSizeLimit) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="card-glass rounded-xl overflow-hidden">
            <div className="flex border-b border-border">
              {[
                { key: 'resources', label: '资源加载', icon: FileCode },
                { key: 'requests', label: '接口请求', icon: Globe },
                { key: 'scripts', label: '脚本分析', icon: Activity },
                { key: 'timing', label: '加载时序', icon: Clock },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as TabType)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === key
                      ? 'text-accent border-b-2 border-accent bg-accent/5'
                      : 'text-muted hover:text-gray-300'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === 'resources' && (
                <div>
                  <div className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                      <input
                        type="text"
                        placeholder="搜索资源..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-bg border border-border rounded-md pl-9 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent"
                      />
                    </div>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent"
                    >
                      <option value="all">全部类型</option>
                      <option value="script">Script</option>
                      <option value="style">Style</option>
                      <option value="image">Image</option>
                      <option value="font">Font</option>
                      <option value="fetch">Fetch</option>
                      <option value="media">Media</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(resourceTypeStats).map(([type, count]) => (
                      <div
                        key={type}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg text-xs"
                      >
                        <span className="text-muted">{type}</span>
                        <span className="font-mono text-accent">{count}</span>
                        <span className="text-muted">·</span>
                        <span className="font-mono text-blue-400">
                          {formatBytes(resourceSizeStats[type] || 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border text-muted">
                          <th
                            className="text-left py-2 px-3 cursor-pointer select-none"
                            onClick={() => handleSort('name')}
                          >
                            名称 <SortIcon column="name" />
                          </th>
                          <th
                            className="text-left py-2 px-3 cursor-pointer select-none w-20"
                            onClick={() => handleSort('type')}
                          >
                            类型 <SortIcon column="type" />
                          </th>
                          <th
                            className="text-right py-2 px-3 cursor-pointer select-none w-24"
                            onClick={() => handleSort('size')}
                          >
                            大小 <SortIcon column="size" />
                          </th>
                          <th
                            className="text-right py-2 px-3 cursor-pointer select-none w-24"
                            onClick={() => handleSort('duration')}
                          >
                            耗时 <SortIcon column="duration" />
                          </th>
                          <th className="text-center py-2 px-3 w-16">状态</th>
                          <th className="text-center py-2 px-3 w-20">异常</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResources.map((r, i) => (
                          <tr
                            key={i}
                            className={`border-b border-border/50 hover:bg-card-hover transition-colors ${
                              r.abnormal ? 'bg-danger/10' : ''
                            }`}
                          >
                            <td
                              className="py-2 px-3 font-mono text-xs max-w-[300px] truncate"
                              title={r.name}
                            >
                              {r.name}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded text-xs bg-border/60 text-muted">
                                {r.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {formatBytes(r.size)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {formatDuration(r.duration)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {r.abnormal && r.abnormalReason?.includes('错误') ? (
                                <AlertTriangle size={14} className="text-danger inline" />
                              ) : (
                                <CheckCircle size={14} className="text-success inline" />
                              )}
                            </td>
                            <td className="py-2 px-3 text-center text-xs">
                              {r.abnormal && r.abnormalReason ? (
                                <span className="text-danger">{r.abnormalReason}</span>
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

              {activeTab === 'requests' && (
                <div>
                  {report.networkRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted">
                      <Globe size={32} className="mb-2 opacity-30" />
                      <p className="text-sm">暂无接口请求数据</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card z-10">
                          <tr className="border-b border-border text-muted">
                            <th className="text-left py-2 px-3">URL</th>
                            <th className="text-left py-2 px-3 w-20">方法</th>
                            <th className="text-right py-2 px-3 w-20">状态</th>
                            <th className="text-right py-2 px-3 w-24">耗时</th>
                            <th className="text-right py-2 px-3 w-24">响应大小</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRequests.map((r, i) => (
                            <tr
                              key={i}
                              className="border-b border-border/50 hover:bg-card-hover transition-colors"
                            >
                              <td
                                className="py-2 px-3 font-mono text-xs max-w-[400px] truncate"
                                title={r.url}
                              >
                                {r.url}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-mono ${
                                    r.method === 'GET'
                                      ? 'bg-green-500/10 text-green-400'
                                      : 'bg-blue-500/10 text-blue-400'
                                  }`}
                                >
                                  {r.method}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span
                                  className={
                                    r.success ? 'text-success' : 'text-danger'
                                  }
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono">
                                {formatDuration(r.duration)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">
                                {formatBytes(r.responseSize)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'scripts' && (
                <div>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">脚本执行耗时分析</h4>
                    <p className="text-xs text-muted">
                      共 {report.scripts.length} 个脚本，
                      {report.scripts.filter((s) => s.isLongTask).length} 个长任务
                    </p>
                  </div>
                  <canvas ref={chartRef} height={300} className="w-full" />
                </div>
              )}

              {activeTab === 'timing' && (
                <div>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">页面加载时间轴</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted">DOM ContentLoaded:</span>
                        <span className="font-mono">
                          {formatDuration(report.navigationTiming.domContentLoaded)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Load 完全加载:</span>
                        <span className="font-mono">
                          {formatDuration(report.navigationTiming.loadEvent)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <canvas ref={timingChartRef} height={250} className="w-full" />
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
