import { useEffect, useRef, useCallback, useState } from 'react'
import { ArrowDown, ArrowUp, Timer, Wifi, Play, Square, Settings, RefreshCw, TrendingUp, Activity } from 'lucide-react'
import { drawGauge, drawLineChart } from '@/utils/charts'
import { useSpeedTestStore } from '@/store'
import { useWebSocket } from '@/hooks/useWebSocket'
import { formatSpeed, formatLatency, getScoreColor, getScoreLabel } from '@/utils/format'
import {
  runLatencyTest,
  runDownloadTest,
  runUploadTest,
  runPacketLossTest,
  runMultiRoundTest,
  aggregateMultiRoundResults,
  type MultiRoundResult,
  type SpeedTestConfig,
} from '@/utils/speedTest'
import type { SpeedSample, WsMessage } from '../../shared/types'

const PHASE_LABELS: Record<string, string> = {
  idle: '就绪',
  latency: '延迟测试',
  download: '下载测速',
  upload: '上传测速',
  'packet-loss': '丢包测试',
  complete: '测试完成',
}

const ROUND_OPTIONS = [1, 3, 5, 10]

function AnimatedDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
    </span>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = getScoreColor(score)

  return (
    <div className="flex flex-col items-center relative">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="font-sans text-xs text-muted mt-1">
          {score > 0 ? getScoreLabel(score) : '--'}
        </span>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  value,
  unit,
  label,
  stagger,
  subValue,
}: {
  icon: React.ElementType
  value: string
  unit: string
  label: string
  stagger: string
  subValue?: string
}) {
  return (
    <div
      className={`card-glass rounded-xl p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,245,212,0.15)] animate-fade-in-up ${stagger}`}
    >
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-xl font-bold text-gray-100 truncate">{value}</span>
          <span className="font-mono text-xs text-muted">{unit}</span>
        </div>
        <span className="font-sans text-xs text-muted">{label}</span>
        {subValue && (
          <span className="font-mono text-xs text-accent/80 block mt-0.5">{subValue}</span>
        )}
      </div>
    </div>
  )
}

function StabilityBadge({ value }: { value: number }) {
  let color = 'text-success'
  let bg = 'bg-success/15'
  let label = '稳定'

  if (value < 60) {
    color = 'text-danger'
    bg = 'bg-danger/15'
    label = '波动大'
  } else if (value < 80) {
    color = 'text-warning'
    bg = 'bg-warning/15'
    label = '一般'
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${bg} ${color} font-medium`}>
      稳定性 {value.toFixed(0)}% - {label}
    </span>
  )
}

export default function SpeedTest() {
  const gaugeRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chartWidthRef = useRef(0)
  const [showSettings, setShowSettings] = useState(false)

  const {
    phase,
    isRunning,
    currentSpeed,
    samples,
    downloadSpeed,
    uploadSpeed,
    latencyResult,
    packetLoss,
    score,
    rounds,
    currentRound,
    roundResults,
    stability,
    testConfig,
    startTest,
    setPhase,
    setCurrentSpeed,
    addSample,
    setLatencyResult,
    setDownloadSpeed,
    setUploadSpeed,
    setPacketLoss,
    setScore,
    setCurrentRound,
    addRoundResult,
    setStability,
    setTestConfig,
    reset,
  } = useSpeedTestStore()

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'speed_sample') {
        addSample(msg.data as SpeedSample)
      } else if (msg.type === 'speed_complete') {
        const data = msg.data
        if (data.results?.downloadSpeed) setDownloadSpeed(data.results.downloadSpeed)
        if (data.results?.uploadSpeed) setUploadSpeed(data.results.uploadSpeed)
        if (data.results?.latency) setLatencyResult(data.results.latency)
        if (data.results?.packetLoss !== undefined) setPacketLoss(data.results.packetLoss)
        if (data.score) setScore(data.score)
      }
    },
    [addSample, setDownloadSpeed, setUploadSpeed, setLatencyResult, setPacketLoss, setScore],
  )

  useWebSocket(handleWsMessage)

  useEffect(() => {
    const canvas = gaugeRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = 280 * dpr
    canvas.height = 280 * dpr
    ctx.scale(dpr, dpr)
    drawGauge(ctx, currentSpeed, 500 * 1024 * 1024, PHASE_LABELS[phase] || '', 'bps', 280, 280)
  }, [currentSpeed, phase])

  useEffect(() => {
    const canvas = chartRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = canvas.parentElement
    if (container) {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.floor(rect.width)
      chartWidthRef.current = w
      canvas.width = w * dpr
      canvas.height = 250 * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = '250px'
      ctx.scale(dpr, dpr)
    }

    const chartData = samples.map((s, i) => ({ x: i, y: s.value }))
    drawLineChart(ctx, chartData, {
      width: chartWidthRef.current || 600,
      height: 250,
      lineColor: '#00f5d4',
      fillColor: 'rgba(0,245,212,0.1)',
      yLabel: '速度 (B/s)',
    })
  }, [samples])

  const handleRoundComplete = (result: MultiRoundResult) => {
    addRoundResult(result)
    setCurrentRound(result.round)

    if (result.downloadSpeed) setDownloadSpeed(result.downloadSpeed)
    if (result.uploadSpeed) setUploadSpeed(result.uploadSpeed)
    if (result.latency) setLatencyResult(result.latency)
    if (result.packetLoss !== undefined) setPacketLoss(result.packetLoss)

    const allResults = [...useSpeedTestStore.getState().roundResults, result]
    const aggregated = aggregateMultiRoundResults(allResults)
    if (aggregated) {
      setScore(aggregated.score)
      setStability({
        download: aggregated.downloadSpeed.stability,
        upload: aggregated.uploadSpeed.stability,
        latency: aggregated.latency.stability,
      })
    }
  }

  const handleStart = async () => {
    if (isRunning) {
      abortRef.current?.abort()
      reset()
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    startTest()

    try {
      const config: SpeedTestConfig = {
        ...testConfig,
        rounds: testConfig.rounds || 1,
      }

      if (config.rounds && config.rounds > 1) {
        await runMultiRoundTest(
          controller.signal,
          config,
          handleRoundComplete,
          (newPhase) => setPhase(newPhase as typeof phase),
        )
      } else {
        setPhase('latency')
        const latResult = await runLatencyTest(controller.signal, 10)
        setLatencyResult(latResult)

        setPhase('download')
        setCurrentSpeed(0)
        const dlSpeed = await runDownloadTest(
          controller.signal,
          10 * 1024 * 1024,
          200,
          (speed, bytes) => {
            setCurrentSpeed(speed)
            addSample({ timestamp: Date.now(), value: speed, type: 'download' })
          },
        )
        setDownloadSpeed(dlSpeed)

        setPhase('upload')
        setCurrentSpeed(0)
        const ulSpeed = await runUploadTest(
          controller.signal,
          5 * 1024 * 1024,
          200,
          (speed, bytes) => {
            setCurrentSpeed(speed)
            addSample({ timestamp: Date.now(), value: speed, type: 'upload' })
          },
        )
        setUploadSpeed(ulSpeed)

        setPhase('packet-loss')
        const pl = await runPacketLossTest(controller.signal, 20)
        setPacketLoss(pl)

        const state = useSpeedTestStore.getState()
        let s = 0
        if (state.downloadSpeed > 0) s += Math.min(30, (state.downloadSpeed / (100 * 1024 * 1024)) * 30)
        if (state.uploadSpeed > 0) s += Math.min(25, (state.uploadSpeed / (50 * 1024 * 1024)) * 25)
        if (state.latencyResult) {
          const latScore = Math.max(0, 30 - state.latencyResult.avg / 5)
          s += Math.min(30, latScore)
        }
        s += Math.min(15, Math.max(0, 15 - state.packetLoss * 2))
        const finalScore = Math.round(Math.min(100, Math.max(0, s)))
        setScore(finalScore)
      }

      const state = useSpeedTestStore.getState()
      await fetch('/api/speed/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'speed',
          downloadSpeed: state.downloadSpeed,
          uploadSpeed: state.uploadSpeed,
          latency: state.latencyResult,
          packetLoss: state.packetLoss,
          score: state.score,
          samples: state.samples,
          rounds: state.rounds,
          roundResults: state.roundResults,
          stability: state.stability,
        }),
      })
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') {
        console.error('Speed test error:', err)
      }
    } finally {
      const state = useSpeedTestStore.getState()
      if (state.isRunning) {
        setPhase('complete')
        useSpeedTestStore.setState({ isRunning: false })
      }
    }
  }

  const dlFormatted = formatSpeed(downloadSpeed)
  const ulFormatted = formatSpeed(uploadSpeed)
  const latFormatted = latencyResult ? formatLatency(latencyResult.avg) : { value: '--', unit: '' }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-mono text-gradient-accent">网速测试</h2>
          <p className="text-sm text-muted mt-1">
            {phase !== 'idle' && phase !== 'complete' ? (
              <>
                {PHASE_LABELS[phase]}
                {rounds > 1 && isRunning && ` (第 ${currentRound}/${rounds} 轮)`}
                <AnimatedDots />
              </>
            ) : (
              PHASE_LABELS[phase]
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-muted hover:text-white hover:bg-card-hover transition-all"
            title="测试设置"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={handleStart}
            className={`btn-primary flex items-center gap-2 px-8 py-3 text-base ${
              isRunning ? 'animate-pulse-glow' : ''
            }`}
          >
            {isRunning ? (
              <>
                <Square size={18} />
                停止
              </>
            ) : (
              <>
                <Play size={18} />
                开始测速
              </>
            )}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="card-glass rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-accent" />
            <span className="text-sm font-medium">测试设置</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-muted mb-2">测试轮数</label>
              <div className="flex gap-2">
                {ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setTestConfig({ ...testConfig, rounds: n })}
                    disabled={isRunning}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      (testConfig.rounds || 1) === n
                        ? 'bg-accent/20 text-accent border border-accent/40'
                        : 'bg-bg border border-border text-muted hover:border-muted/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {n}轮
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">下载数据量</label>
              <select
                value={testConfig.downloadSize ? testConfig.downloadSize / 1024 / 1024 : 10}
                onChange={(e) =>
                  setTestConfig({ ...testConfig, downloadSize: Number(e.target.value) * 1024 * 1024 })
                }
                disabled={isRunning}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 disabled:opacity-50"
              >
                <option value={5}>5 MB</option>
                <option value={10}>10 MB</option>
                <option value={25}>25 MB</option>
                <option value={50}>50 MB</option>
                <option value={100}>100 MB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">上传数据量</label>
              <select
                value={testConfig.uploadSize ? testConfig.uploadSize / 1024 / 1024 : 5}
                onChange={(e) =>
                  setTestConfig({ ...testConfig, uploadSize: Number(e.target.value) * 1024 * 1024 })
                }
                disabled={isRunning}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 disabled:opacity-50"
              >
                <option value={1}>1 MB</option>
                <option value={5}>5 MB</option>
                <option value={10}>10 MB</option>
                <option value={25}>25 MB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">延迟测试次数</label>
              <select
                value={testConfig.latencyCount || 10}
                onChange={(e) =>
                  setTestConfig({ ...testConfig, latencyCount: Number(e.target.value) })
                }
                disabled={isRunning}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 disabled:opacity-50"
              >
                <option value={5}>5 次</option>
                <option value={10}>10 次</option>
                <option value={20}>20 次</option>
                <option value={30}>30 次</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex flex-col items-center">
          <canvas ref={gaugeRef} style={{ width: 280, height: 280 }} />
          {rounds > 1 && roundResults.length > 0 && (
            <div className="mt-2 text-xs text-muted">
              已完成 {roundResults.length}/{rounds} 轮
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="card-glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">实时网速</span>
              {phase === 'complete' && samples.length > 0 && (
                <span className="text-xs text-muted">
                  共 {samples.length} 个采样点
                </span>
              )}
            </div>
            <div className="relative w-full" style={{ height: 250 }}>
              <canvas ref={chartRef} className="w-full" style={{ height: 250 }} />
              {samples.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                  等待测速数据...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          icon={ArrowDown}
          value={dlFormatted.value}
          unit={dlFormatted.unit}
          label="下载速度"
          stagger="stagger-1"
          subValue={rounds > 1 && stability.download > 0 ? `稳定性 ${stability.download.toFixed(0)}%` : undefined}
        />
        <MetricCard
          icon={ArrowUp}
          value={ulFormatted.value}
          unit={ulFormatted.unit}
          label="上传速度"
          stagger="stagger-2"
          subValue={rounds > 1 && stability.upload > 0 ? `稳定性 ${stability.upload.toFixed(0)}%` : undefined}
        />
        <MetricCard
          icon={Timer}
          value={latFormatted.value}
          unit={latFormatted.unit}
          label="平均延迟"
          stagger="stagger-3"
          subValue={latencyResult ? `抖动 ${latencyResult.jitter.toFixed(1)}ms` : undefined}
        />
        <MetricCard
          icon={Wifi}
          value={packetLoss > 0 || phase === 'complete' ? packetLoss.toFixed(1) : '--'}
          unit="%"
          label="丢包率"
          stagger="stagger-4"
        />
      </div>

      {latencyResult && (
        <div className="card-glass rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-accent" />
            <h3 className="text-sm font-semibold">延迟详情</h3>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-success">
                {latencyResult.min.toFixed(1)}
              </div>
              <div className="text-xs text-muted">最低延迟 (ms)</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-accent">
                {latencyResult.avg.toFixed(1)}
              </div>
              <div className="text-xs text-muted">平均延迟 (ms)</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-warning">
                {latencyResult.max.toFixed(1)}
              </div>
              <div className="text-xs text-muted">最高延迟 (ms)</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-purple-400">
                {latencyResult.jitter.toFixed(1)}
              </div>
              <div className="text-xs text-muted">抖动 (ms)</div>
            </div>
          </div>
        </div>
      )}

      {roundResults.length > 1 && (
        <div className="card-glass rounded-xl p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-accent" />
            <h3 className="text-sm font-semibold">多轮测试结果</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left py-2 px-3">轮次</th>
                  <th className="text-right py-2 px-3">下载</th>
                  <th className="text-right py-2 px-3">上传</th>
                  <th className="text-right py-2 px-3">延迟</th>
                  <th className="text-right py-2 px-3">丢包率</th>
                </tr>
              </thead>
              <tbody>
                {roundResults.map((r) => {
                  const dl = r.downloadSpeed ? formatSpeed(r.downloadSpeed)
                  const ul = r.uploadSpeed ? formatSpeed(r.uploadSpeed)
                  const lat = r.latency ? formatLatency(r.latency.avg)
                  return (
                    <tr key={r.round} className="border-b border-border/50">
                      <td className="py-2 px-3 font-mono">第 {r.round} 轮</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {dl ? `${dl.value} ${dl.unit}` : '--'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {ul ? `${ul.value} ${ul.unit}` : '--'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {lat ? `${lat.value} ${lat.unit}` : '--'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {r.packetLoss !== undefined ? `${r.packetLoss.toFixed(1)}%` : '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <div className="card-glass rounded-xl p-6 flex flex-col items-center relative">
          <ScoreRing score={score} />
          <span className="font-sans text-sm text-muted mt-4">综合评分</span>
          {phase === 'complete' && (
            <button
              onClick={handleStart}
              className="mt-4 flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
            >
              <RefreshCw size={14} />
              重新测试
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
