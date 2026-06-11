export interface SpeedSample {
  timestamp: number
  value: number
  type: 'download' | 'upload' | 'latency' | 'packet-loss'
}

export interface LatencyResult {
  min: number
  avg: number
  max: number
  jitter: number
  samples: number[]
}

export interface SpeedTestConfig {
  downloadSize?: number
  uploadSize?: number
  latencyCount?: number
  packetLossCount?: number
  sampleInterval?: number
  rounds?: number
  timeout?: number
}

export interface MultiRoundResult {
  round: number
  downloadSpeed?: number
  uploadSpeed?: number
  latency?: LatencyResult
  packetLoss?: number
  timestamp: number
}

const DEFAULT_CONFIG: Required<SpeedTestConfig> = {
  downloadSize: 10 * 1024 * 1024,
  uploadSize: 5 * 1024 * 1024,
  latencyCount: 10,
  packetLossCount: 20,
  sampleInterval: 200,
  rounds: 1,
  timeout: 30000,
}

export function removeOutliers(values: number[], threshold: number = 2): number[] {
  if (values.length < 3) return values
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  const lower = q1 - threshold * iqr
  const upper = q3 + threshold * iqr
  return values.filter((v) => v >= lower && v <= upper)
}

export function calculateStability(samples: number[]): number {
  if (samples.length < 2) return 100
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length
  if (mean === 0) return 100
  const variance = samples.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / samples.length
  const stdDev = Math.sqrt(variance)
  const cv = stdDev / mean
  return Math.max(0, Math.min(100, 100 - cv * 100))
}

export function smoothData(data: number[], windowSize: number = 3): number[] {
  if (data.length < windowSize) return data
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(data.length, i + Math.floor(windowSize / 2) + 1)
    const window = data.slice(start, end)
    result.push(window.reduce((s, v) => s + v, 0) / window.length)
  }
  return result
}

export async function runLatencyTest(
  signal: AbortSignal,
  count: number = 10,
  onProgress?: (current: number, total: number) => void,
): Promise<LatencyResult> {
  const rtts: number[] = []
  const timeoutMs = 5000

  for (let i = 0; i < count; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    onProgress?.(i + 1, count)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    signal.addEventListener('abort', () => controller.abort())

    try {
      const start = performance.now()
      await fetch('/api/speed/ping', { signal: controller.signal, cache: 'no-store' })
      const end = performance.now()
      rtts.push(end - start)
    } catch {
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', () => controller.abort())
    }

    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  if (rtts.length === 0) {
    return { min: 0, avg: 0, max: 0, jitter: 0, samples: [] }
  }

  const filtered = removeOutliers(rtts)
  const min = Math.min(...filtered)
  const max = Math.max(...filtered)
  const avg = filtered.reduce((s, v) => s + v, 0) / filtered.length

  const diffs = filtered.slice(1).map((v, i) => Math.abs(v - filtered[i]))
  const jitter = diffs.length > 0 ? diffs.reduce((s, v) => s + v, 0) / diffs.length : 0

  return { min, avg, max, jitter, samples: rtts }
}

export async function runDownloadTest(
  signal: AbortSignal,
  size: number = 10 * 1024 * 1024,
  sampleInterval: number = 200,
  onSample?: (speed: number, bytesReceived: number) => void,
): Promise<number> {
  const response = await fetch(`/api/speed/download?size=${size}`, { signal, cache: 'no-store' })
  if (!response.body) throw new Error('ReadableStream not supported')

  const reader = response.body.getReader()
  let receivedBytes = 0
  const startTime = performance.now()
  let lastSampleTime = startTime
  let lastSampleBytes = 0
  const speeds: number[] = []

  while (true) {
    if (signal.aborted) {
      reader.cancel()
      throw new DOMException('Aborted', 'AbortError')
    }

    const { done, value } = await reader.read()
    if (done) break

    receivedBytes += value.length
    const now = performance.now()

    if (now - lastSampleTime >= sampleInterval) {
      const elapsed = (now - lastSampleTime) / 1000
      const chunkBytes = receivedBytes - lastSampleBytes
      const instantSpeed = chunkBytes / elapsed

      speeds.push(instantSpeed)
      onSample?.(instantSpeed, receivedBytes)

      lastSampleTime = now
      lastSampleBytes = receivedBytes
    }
  }

  const totalTime = (performance.now() - startTime) / 1000
  const finalSpeed = receivedBytes / totalTime

  if (speeds.length > 5) {
    const filtered = removeOutliers(speeds)
    return filtered.reduce((s, v) => s + v, 0) / filtered.length
  }

  return finalSpeed
}

export async function runUploadTest(
  signal: AbortSignal,
  size: number = 5 * 1024 * 1024,
  sampleInterval: number = 200,
  onSample?: (speed: number, bytesSent: number) => void,
): Promise<number> {
  const data = new Uint8Array(size)
  crypto.getRandomValues(data)

  const startTime = performance.now()
  let lastSampleTime = startTime
  let bytesSent = 0
  const speeds: number[] = []

  const chunkSize = 256 * 1024
  let offset = 0

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/speed/upload', true)
  xhr.setRequestHeader('Content-Type', 'application/octet-stream')

  return new Promise<number>((resolve, reject) => {
    const abortHandler = () => {
      xhr.abort()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', abortHandler)

    xhr.upload.onprogress = (e) => {
      if (signal.aborted) return
      bytesSent = e.loaded
      const now = performance.now()

      if (now - lastSampleTime >= sampleInterval && e.loaded > 0) {
        const elapsed = (now - startTime) / 1000
        const speed = e.loaded / elapsed
        speeds.push(speed)
        onSample?.(speed, e.loaded)
        lastSampleTime = now
      }
    }

    xhr.onload = () => {
      signal.removeEventListener('abort', abortHandler)
      const totalTime = (performance.now() - startTime) / 1000
      const finalSpeed = size / totalTime

      if (speeds.length > 3) {
        const filtered = removeOutliers(speeds)
        resolve(filtered.reduce((s, v) => s + v, 0) / filtered.length)
      } else {
        resolve(finalSpeed)
      }
    }

    xhr.onerror = () => {
      signal.removeEventListener('abort', abortHandler)
      reject(new Error('Upload failed'))
    }

    xhr.onabort = () => {
      signal.removeEventListener('abort', abortHandler)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const sendChunk = () => {
      if (offset >= size || signal.aborted) {
        return
      }
      const end = Math.min(offset + chunkSize, size)
      const chunk = data.slice(offset, end)
      xhr.send(chunk as unknown as BodyInit)
    }

    xhr.send(data as unknown as BodyInit)
  })
}

export async function runPacketLossTest(
  signal: AbortSignal,
  count: number = 20,
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  let lost = 0

  for (let i = 0; i < count; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    onProgress?.(i + 1, count)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)
      signal.addEventListener('abort', () => controller.abort())

      try {
        const res = await fetch(`/api/speed/packet-loss?seq=${i}&t=${Date.now()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!res.ok) {
          lost++
        }
      } catch {
        lost++
      } finally {
        clearTimeout(timeoutId)
        signal.removeEventListener('abort', () => controller.abort())
      }
    } catch {
      lost++
    }

    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  return (lost / count) * 100
}

export async function runMultiRoundTest(
  signal: AbortSignal,
  config: SpeedTestConfig,
  onRoundComplete?: (result: MultiRoundResult) => void,
  onPhaseChange?: (phase: string) => void,
): Promise<MultiRoundResult[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  const results: MultiRoundResult[] = []

  for (let round = 0; round < fullConfig.rounds; round++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const roundResult: MultiRoundResult = {
      round: round + 1,
      timestamp: Date.now(),
    }

    onPhaseChange?.('latency')
    roundResult.latency = await runLatencyTest(signal, fullConfig.latencyCount)

    onPhaseChange?.('download')
    roundResult.downloadSpeed = await runDownloadTest(
      signal,
      fullConfig.downloadSize,
      fullConfig.sampleInterval,
    )

    onPhaseChange?.('upload')
    roundResult.uploadSpeed = await runUploadTest(
      signal,
      fullConfig.uploadSize,
      fullConfig.sampleInterval,
    )

    onPhaseChange?.('packet-loss')
    roundResult.packetLoss = await runPacketLossTest(signal, fullConfig.packetLossCount)

    results.push(roundResult)
    onRoundComplete?.(roundResult)

    if (round < fullConfig.rounds - 1) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return results
}

export function calculateOverallScore(results: MultiRoundResult[]): number {
  if (results.length === 0) return 0

  const avgDownload = results.reduce((s, r) => s + (r.downloadSpeed || 0), 0) / results.length
  const avgUpload = results.reduce((s, r) => s + (r.uploadSpeed || 0), 0) / results.length
  const avgLatency = results.reduce((s, r) => s + (r.latency?.avg || 0), 0) / results.length
  const avgPacketLoss = results.reduce((s, r) => s + (r.packetLoss || 0), 0) / results.length

  let score = 0

  if (avgDownload > 0) {
    score += Math.min(30, (avgDownload / (100 * 1024 * 1024)) * 30)
  }

  if (avgUpload > 0) {
    score += Math.min(25, (avgUpload / (50 * 1024 * 1024)) * 25)
  }

  if (avgLatency > 0) {
    const latScore = Math.max(0, 30 - avgLatency / 5)
    score += Math.min(30, latScore)
  }

  score += Math.min(15, Math.max(0, 15 - avgPacketLoss * 2))

  return Math.round(Math.min(100, Math.max(0, score)))
}

export function aggregateMultiRoundResults(results: MultiRoundResult[]) {
  if (results.length === 0) return null

  const downloadSpeeds = results.filter((r) => r.downloadSpeed != null).map((r) => r.downloadSpeed!)
  const uploadSpeeds = results.filter((r) => r.uploadSpeed != null).map((r) => r.uploadSpeed!)
  const latencies = results.filter((r) => r.latency?.avg != null).map((r) => r.latency!.avg)
  const packetLosses = results.filter((r) => r.packetLoss != null).map((r) => r.packetLoss!)

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)

  return {
    rounds: results.length,
    downloadSpeed: {
      avg: avg(downloadSpeeds),
      min: downloadSpeeds.length > 0 ? Math.min(...downloadSpeeds) : 0,
      max: downloadSpeeds.length > 0 ? Math.max(...downloadSpeeds) : 0,
      stability: calculateStability(downloadSpeeds),
    },
    uploadSpeed: {
      avg: avg(uploadSpeeds),
      min: uploadSpeeds.length > 0 ? Math.min(...uploadSpeeds) : 0,
      max: uploadSpeeds.length > 0 ? Math.max(...uploadSpeeds) : 0,
      stability: calculateStability(uploadSpeeds),
    },
    latency: {
      avg: avg(latencies),
      min: latencies.length > 0 ? Math.min(...latencies) : 0,
      max: latencies.length > 0 ? Math.max(...latencies) : 0,
      stability: calculateStability(latencies),
    },
    packetLoss: {
      avg: avg(packetLosses),
      min: packetLosses.length > 0 ? Math.min(...packetLosses) : 0,
      max: packetLosses.length > 0 ? Math.max(...packetLosses) : 0,
    },
    score: calculateOverallScore(results),
  }
}
