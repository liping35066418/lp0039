export function formatSpeed(bytesPerSec: number): { value: string; unit: string } {
  if (bytesPerSec >= 1024 * 1024 * 1024) return { value: (bytesPerSec / 1024 / 1024 / 1024).toFixed(2), unit: 'GB/s' }
  if (bytesPerSec >= 1024 * 1024) return { value: (bytesPerSec / 1024 / 1024).toFixed(2), unit: 'MB/s' }
  if (bytesPerSec >= 1024) return { value: (bytesPerSec / 1024).toFixed(2), unit: 'KB/s' }
  return { value: bytesPerSec.toFixed(0), unit: 'B/s' }
}

export function formatLatency(ms: number): { value: string; unit: string } {
  if (ms >= 1000) return { value: (ms / 1000).toFixed(2), unit: 's' }
  return { value: ms.toFixed(1), unit: 'ms' }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return bytes + ' B'
}

export function formatDuration(ms: number): string {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + ' min'
  if (ms >= 1000) return (ms / 1000).toFixed(1) + ' s'
  return ms.toFixed(0) + ' ms'
}

export function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#eab308'
  if (score >= 40) return '#ff6b35'
  return '#ef4444'
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return '优秀'
  if (score >= 60) return '良好'
  if (score >= 40) return '一般'
  return '较差'
}

export function getVitalsStatus(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    fcp: [1800, 3000],
    lcp: [2500, 4000],
    cls: [0.1, 0.25],
    ttfb: [800, 1800],
    fid: [100, 300],
  }
  const [good, poor] = thresholds[metric] || [1000, 3000]
  if (value <= good) return 'good'
  if (value <= poor) return 'needs-improvement'
  return 'poor'
}
