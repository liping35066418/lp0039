export interface SpeedTestRequest {
  type: 'download' | 'upload' | 'latency' | 'packet-loss'
  duration?: number
  packetSize?: number
  targetCount?: number
}

export interface SpeedTestResponse {
  testId: string
  type: string
  startTime: number
  endTime: number
  results: {
    downloadSpeed?: number
    uploadSpeed?: number
    latency?: {
      min: number
      avg: number
      max: number
      jitter: number
    }
    packetLoss?: number
  }
  score: number
  samples: Array<{ time: number; value: number }>
}

export interface SpeedSample {
  timestamp: number
  value: number
  type: 'download' | 'upload' | 'latency' | 'packet-loss'
}

export interface TestReport {
  id: string
  type: 'speed' | 'performance' | 'monitor'
  createdAt: string
  score: number
  summary: Record<string, unknown>
  details: Record<string, unknown>
  status: 'completed' | 'failed' | 'running'
}

export interface PerformanceResource {
  name: string
  type: string
  size: number
  duration: number
  status: number
  abnormal: boolean
  abnormalReason?: string
}

export interface ScriptMetric {
  name: string
  parseTime: number
  compileTime: number
  executionTime: number
  isLongTask: boolean
}

export interface PerformanceReport {
  id: string
  url: string
  timestamp: string
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

export interface MonitorTask {
  id: string
  name: string
  config: {
    duration: number
    interval: number
    targets: string[]
    testTypes: Array<'latency' | 'download' | 'upload'>
  }
  status: 'running' | 'paused' | 'completed' | 'failed'
  progress: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  results?: Array<{
    timestamp: number
    latency?: number
    downloadSpeed?: number
    uploadSpeed?: number
  }>
}

export interface MonitorTaskCreate {
  name: string
  duration: number
  interval: number
  targets: string[]
  testTypes: Array<'latency' | 'download' | 'upload'>
}

export type WsMessage =
  | { type: 'speed_sample'; data: SpeedSample }
  | { type: 'speed_complete'; data: SpeedTestResponse }
  | { type: 'monitor_update'; data: { taskId: string; progress: number; result: MonitorTask['results'] extends Array<infer R> ? R : never } }
  | { type: 'monitor_complete'; data: { taskId: string; reportId: string } }
