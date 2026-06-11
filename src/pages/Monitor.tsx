import { useState, useEffect, useRef, useCallback } from 'react'
import { useMonitorStore } from '@/store'
import { useWebSocket } from '@/hooks/useWebSocket'
import { drawLineChart } from '@/utils/charts'
import { formatSpeed, formatLatency } from '@/utils/format'
import type { MonitorTask, WsMessage } from '../../shared/types'
import {
  Plus,
  Pause,
  Play,
  Trash2,
  Clock,
  Wifi,
  Activity,
  Settings,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

type TestType = 'latency' | 'download' | 'upload'

interface FormData {
  name: string
  duration: number
  interval: number
  targets: string
  testTypes: TestType[]
}

const initialFormData: FormData = {
  name: '',
  duration: 30,
  interval: 10,
  targets: '',
  testTypes: ['latency'],
}

const STATUS_CONFIG: Record<MonitorTask['status'], { color: string; label: string; Icon: typeof Activity }> = {
  running: { color: 'bg-success', label: '运行中', Icon: Activity },
  paused: { color: 'bg-warning', label: '已暂停', Icon: Pause },
  completed: { color: 'bg-accent', label: '已完成', Icon: CheckCircle2 },
  failed: { color: 'bg-danger', label: '失败', Icon: AlertCircle },
}

export default function Monitor() {
  const { tasks, fetchTasks, createTask, pauseTask, resumeTask, deleteTask, updateTask } = useMonitorStore()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [visibilityWarning, setVisibilityWarning] = useState(false)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'monitor_update') {
        const { taskId, progress, result } = msg.data
        updateTask(taskId, {
          progress,
          results: [...(useMonitorStore.getState().tasks.find((t) => t.id === taskId)?.results || []), result],
        })
      }
      if (msg.type === 'monitor_complete') {
        const { taskId } = msg.data
        updateTask(taskId, { status: 'completed', progress: 100 })
      }
    },
    [updateTask],
  )

  useWebSocket(handleWsMessage)

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    const workerCode = `
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data.type === 'start') {
          intervalId = setInterval(() => {
            self.postMessage({ type: 'heartbeat', timestamp: Date.now() });
          }, e.data.interval * 1000);
        }
        if (e.data.type === 'stop') {
          clearInterval(intervalId);
        }
      };
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    workerRef.current = worker
    worker.postMessage({ type: 'start', interval: 30 })
    worker.onmessage = (e) => {
      if (e.data.type === 'heartbeat') {
        const runningTasks = useMonitorStore.getState().tasks.filter((t) => t.status === 'running')
        if (runningTasks.length > 0) {
          fetchTasks()
        }
      }
    }
    return () => {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      URL.revokeObjectURL(URL.createObjectURL(blob))
    }
  }, [fetchTasks])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const hasRunning = useMonitorStore.getState().tasks.some((t) => t.status === 'running')
        if (hasRunning) {
          setVisibilityWarning(true)
        }
      } else {
        setVisibilityWarning(false)
        fetchTasks()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchTasks])

  useEffect(() => {
    const handleUnload = () => {
      const runningTasks = useMonitorStore.getState().tasks.filter((t) => t.status === 'running')
      if (runningTasks.length > 0) {
        navigator.sendBeacon('/api/monitor/heartbeat', JSON.stringify({ taskIds: runningTasks.map((t) => t.id) }))
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)

  useEffect(() => {
    if (!selectedTask || !chartRef.current || selectedTask.status !== 'running') return
    const results = selectedTask.results || []
    if (results.length === 0) return

    const canvas = chartRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    const testTypes = selectedTask.config.testTypes
    const datasets: Array<{ data: Array<{ x: number; y: number }>; color: string; fill: string; label: string }> = []

    if (testTypes.includes('latency')) {
      datasets.push({
        data: results.filter((r) => r.latency != null).map((r) => ({ x: r.timestamp, y: r.latency! })),
        color: '#00f5d4',
        fill: 'rgba(0,245,212,0.1)',
        label: '延迟',
      })
    }
    if (testTypes.includes('download')) {
      datasets.push({
        data: results.filter((r) => r.downloadSpeed != null).map((r) => ({ x: r.timestamp, y: r.downloadSpeed! })),
        color: '#3b82f6',
        fill: 'rgba(59,130,246,0.1)',
        label: '下载',
      })
    }
    if (testTypes.includes('upload')) {
      datasets.push({
        data: results.filter((r) => r.uploadSpeed != null).map((r) => ({ x: r.timestamp, y: r.uploadSpeed! })),
        color: '#f59e0b',
        fill: 'rgba(245,158,11,0.1)',
        label: '上传',
      })
    }

    ctx.clearRect(0, 0, width, height)

    datasets.forEach((ds) => {
      if (ds.data.length > 0) {
        drawLineChart(ctx, ds.data, {
          width,
          height,
          lineColor: ds.color,
          fillColor: ds.fill,
          yLabel: ds.label,
        })
      }
    })

    const legendY = height - 10
    let legendX = 20
    ctx.font = '11px Noto Sans SC, sans-serif'
    datasets.forEach((ds) => {
      ctx.fillStyle = ds.color
      ctx.fillRect(legendX, legendY - 6, 10, 10)
      legendX += 14
      ctx.fillStyle = '#9ca3af'
      ctx.textAlign = 'left'
      ctx.fillText(ds.label, legendX, legendY + 2)
      legendX += ctx.measureText(ds.label).width + 20
    })
  }, [selectedTask])

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.targets.trim() || formData.testTypes.length === 0) return
    await createTask({
      name: formData.name.trim(),
      duration: formData.duration * 60,
      interval: formData.interval,
      targets: formData.targets.split('\n').filter(Boolean),
      testTypes: formData.testTypes,
    })
    setFormData(initialFormData)
    setShowForm(false)
  }

  const toggleTestType = (type: TestType) => {
    setFormData((prev) => ({
      ...prev,
      testTypes: prev.testTypes.includes(type)
        ? prev.testTypes.filter((t) => t !== type)
        : [...prev.testTypes, type],
    }))
  }

  const handleTogglePause = async (task: MonitorTask) => {
    if (task.status === 'running') {
      await pauseTask(task.id)
    } else if (task.status === 'paused') {
      await resumeTask(task.id)
    }
  }

  const handleDelete = async (id: string) => {
    if (deleteConfirmId === id) {
      await deleteTask(id)
      setDeleteConfirmId(null)
      if (selectedTaskId === id) setSelectedTaskId(null)
    } else {
      setDeleteConfirmId(id)
      setTimeout(() => setDeleteConfirmId(null), 3000)
    }
  }

  const formatTime = (iso?: string) => {
    if (!iso) return '--'
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="relative h-full flex flex-col">
      {visibilityWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-warning/90 text-bg text-center py-2 text-sm font-medium">
          <AlertCircle size={14} className="inline mr-1 -mt-0.5" />
          页面在后台运行中，监测任务可能受到影响，请保持页面可见
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Wifi size={22} className="text-accent" />
          <h2 className="text-lg font-semibold">长时监测</h2>
          <span className="text-xs text-muted bg-card px-2 py-0.5 rounded">
            {tasks.filter((t) => t.status === 'running').length} 运行中
          </span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus size={16} />
          创建任务
        </button>
      </div>

      <div
        className={`fixed top-0 right-0 h-full w-96 z-40 transition-transform duration-300 ease-in-out ${
          showForm ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full card-glass flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-accent" />
              <h3 className="font-semibold">创建监测任务</h3>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="text-muted hover:text-white transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">任务名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="输入任务名称"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">监测时长 (分钟)</label>
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData((p) => ({ ...p, duration: Number(e.target.value) || 1 }))}
                  min={1}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">检测间隔 (秒)</label>
                <input
                  type="number"
                  value={formData.interval}
                  onChange={(e) => setFormData((p) => ({ ...p, interval: Number(e.target.value) || 1 }))}
                  min={1}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted mb-1.5">目标地址 (每行一个)</label>
              <textarea
                value={formData.targets}
                onChange={(e) => setFormData((p) => ({ ...p, targets: e.target.value }))}
                placeholder={'https://example.com\nhttps://api.example.com'}
                rows={4}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted/50 focus:outline-none focus:border-accent/50 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1.5">检测类型</label>
              <div className="flex gap-2">
                {(['latency', 'download', 'upload'] as TestType[]).map((type) => {
                  const labels: Record<TestType, string> = { latency: '延迟', download: '下载', upload: '上传' }
                  return (
                    <button
                      key={type}
                      onClick={() => toggleTestType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                        formData.testTypes.includes(type)
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-bg border-border text-muted hover:border-muted'
                      }`}
                    >
                      {labels[type]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-border">
            <button
              onClick={handleSubmit}
              disabled={!formData.name.trim() || !formData.targets.trim() || formData.testTypes.length === 0}
              className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              开始监测
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Clock size={48} className="mb-4 opacity-30" />
            <p className="text-sm">暂无监测任务，点击右上角创建</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const statusCfg = STATUS_CONFIG[task.status]
              const isSelected = selectedTaskId === task.id
              const results = task.results || []

              return (
                <div key={task.id} className="animate-fade-in-up">
                  <div
                    className={`card-glass rounded-xl transition-all cursor-pointer ${
                      isSelected ? 'ring-1 ring-accent/30' : 'hover:bg-card-hover'
                    }`}
                    onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${statusCfg.color} ${task.status === 'running' ? 'animate-pulse' : ''}`} />
                          <h4 className="font-medium text-sm">{task.name}</h4>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            task.status === 'running' ? 'bg-success/15 text-success' :
                            task.status === 'paused' ? 'bg-warning/15 text-warning' :
                            task.status === 'completed' ? 'bg-accent/15 text-accent' :
                            'bg-danger/15 text-danger'
                          }`}>
                            {statusCfg.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {(task.status === 'running' || task.status === 'paused') && (
                            <button
                              onClick={() => handleTogglePause(task)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                task.status === 'running'
                                  ? 'text-warning hover:bg-warning/10'
                                  : 'text-success hover:bg-success/10'
                              }`}
                              title={task.status === 'running' ? '暂停' : '继续'}
                            >
                              {task.status === 'running' ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(task.id)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              deleteConfirmId === task.id
                                ? 'bg-danger/20 text-danger'
                                : 'text-muted hover:bg-danger/10 hover:text-danger'
                            }`}
                            title={deleteConfirmId === task.id ? '确认删除' : '删除'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted mb-3">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(task.startedAt || task.createdAt)}
                          {task.completedAt && ` → ${formatTime(task.completedAt)}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Settings size={12} />
                          {(task.config.duration / 60).toFixed(0)}分钟 / {task.config.interval}秒间隔
                        </span>
                        <span className="flex items-center gap-1">
                          <Wifi size={12} />
                          {task.config.targets.length}个目标
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              task.status === 'completed' ? 'bg-accent' :
                              task.status === 'failed' ? 'bg-danger' :
                              'bg-accent'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted w-10 text-right">
                          {task.progress.toFixed(0)}%
                        </span>
                      </div>

                      {results.length > 0 && task.status === 'running' && (
                        <div className="flex gap-4 mt-3 text-xs">
                          {task.config.testTypes.includes('latency') && results[results.length - 1].latency != null && (
                            <span className="text-accent">
                              延迟: {formatLatency(results[results.length - 1].latency!).value} {formatLatency(results[results.length - 1].latency!).unit}
                            </span>
                          )}
                          {task.config.testTypes.includes('download') && results[results.length - 1].downloadSpeed != null && (
                            <span className="text-blue-400">
                              下载: {formatSpeed(results[results.length - 1].downloadSpeed!).value} {formatSpeed(results[results.length - 1].downloadSpeed!).unit}
                            </span>
                          )}
                          {task.config.testTypes.includes('upload') && results[results.length - 1].uploadSpeed != null && (
                            <span className="text-amber-400">
                              上传: {formatSpeed(results[results.length - 1].uploadSpeed!).value} {formatSpeed(results[results.length - 1].uploadSpeed!).unit}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <div className="border-t border-border">
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Activity size={14} className="text-accent" />
                            <span className="text-xs text-muted">实时趋势</span>
                          </div>
                          {task.status === 'running' && results.length > 0 ? (
                            <canvas
                              ref={chartRef}
                              className="w-full rounded-lg"
                              style={{ height: 300 }}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted text-sm">
                              {task.status !== 'running'
                                ? '任务未在运行中'
                                : '等待数据...'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
