export interface PerformanceResource {
  name: string
  type: string
  size: number
  duration: number
  status: number
  abnormal: boolean
  abnormalReason?: string
  startTime: number
  responseStart: number
  responseEnd: number
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  initiatorType: string
  protocol?: string
}

export interface ScriptMetric {
  name: string
  parseTime: number
  compileTime: number
  executionTime: number
  isLongTask: boolean
  size: number
}

export interface LongTask {
  startTime: number
  duration: number
  name: string
  type: string
  attribution?: string[]
}

export interface NetworkRequest {
  url: string
  method: string
  status: number
  duration: number
  startTime: number
  responseSize: number
  requestSize: number
  type: 'xhr' | 'fetch' | 'other'
  success: boolean
  error?: string
}

export interface PerformanceData {
  url: string
  timestamp: string
  webVitals: {
    fcp: number
    lcp: number
    cls: number
    ttfb: number
    fid?: number
    tti?: number
    tbt?: number
    si?: number
  }
  navigationTiming: {
    domContentLoaded: number
    loadEvent: number
    domInteractive: number
    redirectCount: number
    redirectTime: number
    dnsLookup: number
    tcpConnect: number
    sslTime: number
    responseTime: number
    domProcessing: number
  }
  resources: PerformanceResource[]
  scripts: ScriptMetric[]
  longTasks: LongTask[]
  networkRequests: NetworkRequest[]
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

export function getResourceType(url: string, initiatorType?: string): string {
  if (initiatorType === 'xmlhttprequest' || initiatorType === 'fetch') return 'fetch'
  if (url.match(/\.(js|mjs|cjs)(\?|$)/i)) return 'script'
  if (url.match(/\.css(\?|$)/i)) return 'style'
  if (url.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|avif)(\?|$)/i)) return 'image'
  if (url.match(/\.(woff|woff2|ttf|otf|eot)(\?|$)/i)) return 'font'
  if (url.match(/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?|$)/i)) return 'media'
  if (url.match(/\.(html|htm)(\?|$)/i)) return 'document'
  if (url.includes('/api/') || initiatorType === 'xmlhttprequest' || initiatorType === 'fetch') return 'fetch'
  return 'other'
}

export function checkResourceAbnormal(
  resource: Pick<PerformanceResource, 'type' | 'size' | 'duration' | 'status'>,
): { abnormal: boolean; reason?: string } {
  const { type, size, duration, status } = resource

  if (status >= 400 && status < 600) {
    return { abnormal: true, reason: `请求错误 (${status})` }
  }

  const thresholds: Record<string, { size: number; duration: number }> = {
    script: { size: 500 * 1024, duration: 3000 },
    style: { size: 200 * 1024, duration: 2000 },
    image: { size: 2 * 1024 * 1024, duration: 5000 },
    font: { size: 200 * 1024, duration: 3000 },
    media: { size: 10 * 1024 * 1024, duration: 10000 },
    fetch: { size: 1024 * 1024, duration: 3000 },
    document: { size: 500 * 1024, duration: 3000 },
    other: { size: 2 * 1024 * 1024, duration: 5000 },
  }

  const threshold = thresholds[type] || thresholds.other

  if (size > threshold.size) {
    return { abnormal: true, reason: `体积过大 (${(size / 1024).toFixed(0)}KB)` }
  }

  if (duration > threshold.duration) {
    return { abnormal: true, reason: `加载超时 (${duration.toFixed(0)}ms)` }
  }

  return { abnormal: false }
}

export function collectPerformanceData(): PerformanceData {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const now = new Date()

  const webVitals: PerformanceData['webVitals'] = {
    fcp: 0,
    lcp: 0,
    cls: 0,
    ttfb: 0,
  }

  try {
    const fcpEntries = performance.getEntriesByName('first-contentful-paint')
    if (fcpEntries.length > 0) {
      webVitals.fcp = fcpEntries[0].startTime
    }
  } catch {}

  try {
    const lcpEntries = performance.getEntriesByName('largest-contentful-paint')
    if (lcpEntries.length > 0) {
      webVitals.lcp = lcpEntries[lcpEntries.length - 1].startTime
    }
  } catch {}

  if (nav) {
    webVitals.ttfb = nav.responseStart - nav.requestStart
  }

  let clsValue = 0
  try {
    const clsEntries = performance.getEntriesByName('layout-shift')
    for (const entry of clsEntries as any[]) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value
      }
    }
  } catch {}
  webVitals.cls = clsValue

  const navigationTiming: PerformanceData['navigationTiming'] = {
    domContentLoaded: 0,
    loadEvent: 0,
    domInteractive: 0,
    redirectCount: 0,
    redirectTime: 0,
    dnsLookup: 0,
    tcpConnect: 0,
    sslTime: 0,
    responseTime: 0,
    domProcessing: 0,
  }

  if (nav) {
    navigationTiming.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime
    navigationTiming.loadEvent = nav.loadEventEnd - nav.startTime
    navigationTiming.domInteractive = nav.domInteractive - nav.startTime
    navigationTiming.redirectCount = nav.redirectCount
    navigationTiming.redirectTime = nav.redirectEnd - nav.redirectStart
    navigationTiming.dnsLookup = nav.domainLookupEnd - nav.domainLookupStart
    navigationTiming.tcpConnect = nav.connectEnd - nav.connectStart
    navigationTiming.sslTime = nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0
    navigationTiming.responseTime = nav.responseEnd - nav.requestStart
    navigationTiming.domProcessing = nav.domComplete - nav.domInteractive
  }

  const resourceList: PerformanceResource[] = resources.map((r) => {
    const type = getResourceType(r.name, (r as any).initiatorType)
    const duration = r.responseEnd - r.startTime
    const size = r.transferSize || r.encodedBodySize || 0

    const { abnormal, reason } = checkResourceAbnormal({
      type,
      size,
      duration,
      status: 200,
    })

    return {
      name: r.name,
      type,
      size,
      duration,
      status: 200,
      abnormal,
      abnormalReason: reason,
      startTime: r.startTime,
      responseStart: r.responseStart,
      responseEnd: r.responseEnd,
      transferSize: r.transferSize || 0,
      encodedBodySize: r.encodedBodySize || 0,
      decodedBodySize: r.decodedBodySize || 0,
      initiatorType: (r as any).initiatorType || 'other',
      protocol: (r as any).nextHopProtocol,
    }
  })

  const scriptList: ScriptMetric[] = resources
    .filter((r) => getResourceType(r.name, (r as any).initiatorType) === 'script')
    .map((r) => {
      const parseTime = Math.max(0, r.responseEnd - r.responseStart) * 0.1
      const compileTime = Math.max(0, r.responseEnd - r.responseStart) * 0.2
      const executionTime = r.duration - parseTime - compileTime
      const isLongTask = r.duration > 50

      return {
        name: r.name.split('/').pop() || r.name,
        parseTime,
        compileTime,
        executionTime: Math.max(0, executionTime),
        isLongTask,
        size: r.transferSize || r.encodedBodySize || 0,
      }
    })

  const longTasks: LongTask[] = []
  try {
    const longTaskEntries = performance.getEntriesByType('longtask') as any[]
    for (const entry of longTaskEntries) {
      longTasks.push({
        startTime: entry.startTime,
        duration: entry.duration,
        name: entry.name || 'longtask',
        type: entry.entryType || 'longtask',
        attribution: entry.attribution?.map((a: any) => a.name || a.containerName || ''),
      })
    }
  } catch {}

  if (longTasks.length === 0 && nav) {
    const estimatedTBT = Math.max(0, navigationTiming.domInteractive - webVitals.fcp) * 0.3
    if (estimatedTBT > 100) {
      longTasks.push({
        startTime: webVitals.fcp,
        duration: estimatedTBT,
        name: 'estimated-main-thread-blocking',
        type: 'estimated',
      })
    }
  }

  const networkRequests: NetworkRequest[] = resources
    .filter((r) => {
      const type = getResourceType(r.name, (r as any).initiatorType)
      return type === 'fetch' || (r as any).initiatorType === 'xmlhttprequest' || (r as any).initiatorType === 'fetch'
    })
    .map((r) => ({
      url: r.name,
      method: 'GET',
      status: 200,
      duration: r.duration,
      startTime: r.startTime,
      responseSize: r.transferSize || r.encodedBodySize || 0,
      requestSize: 0,
      type: (r as any).initiatorType === 'xmlhttprequest' ? 'xhr' : 'fetch',
      success: true,
    }))

  const data: PerformanceData = {
    url: window.location.href,
    timestamp: now.toISOString(),
    webVitals,
    navigationTiming,
    resources: resourceList,
    scripts: scriptList,
    longTasks,
    networkRequests,
  }

  try {
    const memory = (performance as any).memory
    if (memory) {
      data.memory = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      }
    }
  } catch {}

  return data
}

export function calculatePerformanceScore(data: PerformanceData): number {
  let score = 100
  const { webVitals, navigationTiming, resources, longTasks } = data

  if (webVitals.lcp > 0) {
    if (webVitals.lcp > 4000) score -= 30
    else if (webVitals.lcp > 2500) score -= 15
  }

  if (webVitals.fcp > 0) {
    if (webVitals.fcp > 3000) score -= 15
    else if (webVitals.fcp > 1800) score -= 8
  }

  if (webVitals.cls > 0) {
    if (webVitals.cls > 0.25) score -= 20
    else if (webVitals.cls > 0.1) score -= 10
  }

  if (webVitals.ttfb > 0) {
    if (webVitals.ttfb > 1800) score -= 10
    else if (webVitals.ttfb > 800) score -= 5
  }

  const abnormalCount = resources.filter((r) => r.abnormal).length
  if (abnormalCount > 0) {
    score -= Math.min(15, abnormalCount * 2)
  }

  if (longTasks.length > 0) {
    const totalLongTaskTime = longTasks.reduce((s, t) => s + t.duration, 0)
    if (totalLongTaskTime > 1000) score -= 15
    else if (totalLongTaskTime > 500) score -= 8
  }

  if (navigationTiming.loadEvent > 0) {
    if (navigationTiming.loadEvent > 10000) score -= 10
    else if (navigationTiming.loadEvent > 5000) score -= 5
  }

  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10
}

export function getPerformanceGrade(score: number): {
  grade: string
  color: string
  label: string
} {
  if (score >= 90) return { grade: 'A', color: '#22c55e', label: '优秀' }
  if (score >= 80) return { grade: 'B', color: '#84cc16', label: '良好' }
  if (score >= 70) return { grade: 'C', color: '#eab308', label: '一般' }
  if (score >= 60) return { grade: 'D', color: '#f97316', label: '较差' }
  return { grade: 'F', color: '#ef4444', label: '很差' }
}

export function getVitalsStatus(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    fcp: [1800, 3000],
    lcp: [2500, 4000],
    cls: [0.1, 0.25],
    ttfb: [800, 1800],
    fid: [100, 300],
    tbt: [200, 600],
    tti: [3800, 7300],
    si: [3400, 5800],
  }
  const [good, poor] = thresholds[metric] || [1000, 3000]
  if (value <= good) return 'good'
  if (value <= poor) return 'needs-improvement'
  return 'poor'
}

export function generatePerformanceReport(data: PerformanceData): {
  score: number
  grade: string
  color: string
  issues: Array<{ severity: 'high' | 'medium' | 'low'; message: string; metric?: string }>
  suggestions: string[]
} {
  const score = calculatePerformanceScore(data)
  const { grade, color } = getPerformanceGrade(score)
  const issues: Array<{ severity: 'high' | 'medium' | 'low'; message: string; metric?: string }> = []
  const suggestions: string[] = []

  if (data.webVitals.lcp > 2500) {
    issues.push({
      severity: data.webVitals.lcp > 4000 ? 'high' : 'medium',
      message: `LCP 时间较长 (${data.webVitals.lcp.toFixed(0)}ms)`,
      metric: 'lcp',
    })
    suggestions.push('优化首屏最大内容绘制，考虑图片懒加载和资源预加载')
  }

  if (data.webVitals.cls > 0.1) {
    issues.push({
      severity: data.webVitals.cls > 0.25 ? 'high' : 'medium',
      message: `布局偏移较大 (${data.webVitals.cls.toFixed(3)})`,
      metric: 'cls',
    })
    suggestions.push('为图片和视频设置明确的尺寸，避免布局跳动')
  }

  if (data.webVitals.fcp > 1800) {
    issues.push({
      severity: data.webVitals.fcp > 3000 ? 'high' : 'medium',
      message: `首次内容绘制较慢 (${data.webVitals.fcp.toFixed(0)}ms)`,
      metric: 'fcp',
    })
    suggestions.push('考虑使用字体预加载、内联关键CSS来提升首屏渲染')
  }

  const abnormalResources = data.resources.filter((r) => r.abnormal)
  if (abnormalResources.length > 0) {
    const largeResources = abnormalResources.filter((r) => r.abnormalReason?.includes('体积过大'))
    const slowResources = abnormalResources.filter((r) => r.abnormalReason?.includes('加载超时'))

    if (largeResources.length > 0) {
      issues.push({
        severity: 'medium',
        message: `${largeResources.length} 个资源体积过大`,
      })
      suggestions.push('对静态资源进行压缩和优化，启用 Gzip/Brotli 压缩')
    }

    if (slowResources.length > 0) {
      issues.push({
        severity: 'medium',
        message: `${slowResources.length} 个资源加载超时`,
      })
      suggestions.push('考虑使用 CDN 加速、资源预加载或延迟加载')
    }
  }

  if (data.longTasks.length > 0) {
    const totalLongTaskTime = data.longTasks.reduce((s, t) => s + t.duration, 0)
    issues.push({
      severity: totalLongTaskTime > 1000 ? 'high' : 'medium',
      message: `存在 ${data.longTasks.length} 个长任务，总计 ${totalLongTaskTime.toFixed(0)}ms`,
    })
    suggestions.push('将耗时较长的 JavaScript 代码拆分到 Web Worker 中执行')
  }

  if (data.navigationTiming.ttfb > 800) {
    issues.push({
      severity: 'low',
      message: `服务器响应时间较长 (${data.navigationTiming.ttfb.toFixed(0)}ms)`,
    })
    suggestions.push('优化后端接口响应时间，考虑使用缓存策略')
  }

  if (data.scripts.length > 20) {
    issues.push({
      severity: 'low',
      message: `页面加载了 ${data.scripts.length} 个脚本文件`,
    })
    suggestions.push('合并脚本文件，使用代码分割和按需加载')
  }

  return { score, grade, color, issues, suggestions }
}

export interface MonitorOptions {
  collectResources?: boolean
  collectLongTasks?: boolean
  collectErrors?: boolean
  onReport?: (data: PerformanceData) => void
  reportInterval?: number
}

export class PerformanceMonitor {
  private observer: PerformanceObserver | null = null
  private longTaskObserver: PerformanceObserver | null = null
  private clsValue = 0
  private lcpValue = 0
  private fcpValue = 0
  private options: MonitorOptions

  constructor(options: MonitorOptions = {}) {
    this.options = {
      collectResources: true,
      collectLongTasks: true,
      collectErrors: true,
      ...options,
    }
  }

  start(): void {
    if (this.options.collectLongTasks && 'PerformanceObserver' in window) {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            console.debug('Long task detected:', entry.duration, 'ms')
          }
        })
        this.longTaskObserver.observe({ entryTypes: ['longtask'] })
      } catch {}
    }

    if (this.options.collectErrors) {
      window.addEventListener('error', this.handleError)
      window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
    }
  }

  stop(): void {
    this.observer?.disconnect()
    this.longTaskObserver?.disconnect()
    window.removeEventListener('error', this.handleError)
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  private handleError = (e: ErrorEvent): void => {
    console.debug('Error detected:', e.message, e.filename, e.lineno)
  }

  private handleUnhandledRejection = (e: PromiseRejectionEvent): void => {
    console.debug('Unhandled rejection:', e.reason)
  }

  getCurrentMetrics(): Partial<PerformanceData> {
    return collectPerformanceData()
  }
}
