import { create } from 'zustand'
import type {
  SpeedSample,
  SpeedTestResponse,
  TestReport,
  MonitorTask,
  PerformanceReport,
} from '../../shared/types'
import type { MultiRoundResult, SpeedTestConfig } from '@/utils/speedTest'
import { collectPerformanceData, generatePerformanceReport, type PerformanceData } from '@/utils/performance'

interface SpeedTestState {
  phase: 'idle' | 'latency' | 'download' | 'upload' | 'packet-loss' | 'complete'
  isRunning: boolean
  currentSpeed: number
  samples: SpeedSample[]
  result: SpeedTestResponse | null
  latencyResult: { min: number; avg: number; max: number; jitter: number } | null
  downloadSpeed: number
  uploadSpeed: number
  packetLoss: number
  score: number
  rounds: number
  currentRound: number
  roundResults: MultiRoundResult[]
  stability: { download: number; upload: number; latency: number }
  testConfig: SpeedTestConfig
  startTest: () => void
  setPhase: (phase: SpeedTestState['phase']) => void
  setCurrentSpeed: (speed: number) => void
  addSample: (sample: SpeedSample) => void
  setResult: (result: SpeedTestResponse) => void
  setLatencyResult: (r: { min: number; avg: number; max: number; jitter: number }) => void
  setDownloadSpeed: (s: number) => void
  setUploadSpeed: (s: number) => void
  setPacketLoss: (p: number) => void
  setScore: (s: number) => void
  setCurrentRound: (round: number) => void
  addRoundResult: (result: MultiRoundResult) => void
  setStability: (stability: { download: number; upload: number; latency: number }) => void
  setTestConfig: (config: SpeedTestConfig) => void
  reset: () => void
}

export const useSpeedTestStore = create<SpeedTestState>((set) => ({
  phase: 'idle',
  isRunning: false,
  currentSpeed: 0,
  samples: [],
  result: null,
  latencyResult: null,
  downloadSpeed: 0,
  uploadSpeed: 0,
  packetLoss: 0,
  score: 0,
  rounds: 1,
  currentRound: 0,
  roundResults: [],
  stability: { download: 0, upload: 0, latency: 0 },
  testConfig: { rounds: 1 },
  startTest: () => set({
    phase: 'latency',
    isRunning: true,
    samples: [],
    result: null,
    currentSpeed: 0,
    latencyResult: null,
    downloadSpeed: 0,
    uploadSpeed: 0,
    packetLoss: 0,
    score: 0,
    currentRound: 0,
    roundResults: [],
    stability: { download: 0, upload: 0, latency: 0 },
  }),
  setPhase: (phase) => set({ phase }),
  setCurrentSpeed: (speed) => set({ currentSpeed: speed }),
  addSample: (sample) => set((state) => ({ samples: [...state.samples, sample] })),
  setResult: (result) => set({ result, isRunning: false, phase: 'complete' }),
  setLatencyResult: (r) => set({ latencyResult: r }),
  setDownloadSpeed: (s) => set({ downloadSpeed: s }),
  setUploadSpeed: (s) => set({ uploadSpeed: s }),
  setPacketLoss: (p) => set({ packetLoss: p }),
  setScore: (s) => set({ score: s }),
  setCurrentRound: (round) => set({ currentRound: round }),
  addRoundResult: (result) => set((state) => ({ roundResults: [...state.roundResults, result] })),
  setStability: (stability) => set({ stability }),
  setTestConfig: (config) => set({ testConfig: config, rounds: config.rounds || 1 }),
  reset: () => set({
    phase: 'idle',
    isRunning: false,
    currentSpeed: 0,
    samples: [],
    result: null,
    latencyResult: null,
    downloadSpeed: 0,
    uploadSpeed: 0,
    packetLoss: 0,
    score: 0,
    currentRound: 0,
    roundResults: [],
    stability: { download: 0, upload: 0, latency: 0 },
  }),
}))

interface ReportsState {
  reports: TestReport[]
  loading: boolean
  selectedIds: string[]
  setReports: (reports: TestReport[]) => void
  setLoading: (loading: boolean) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  fetchReports: () => Promise<void>
  deleteReport: (id: string) => Promise<void>
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  reports: [],
  loading: false,
  selectedIds: [],
  setReports: (reports) => set({ reports }),
  setLoading: (loading) => set({ loading }),
  toggleSelect: (id) => set((state) => ({
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds.filter((i) => i !== id)
      : [...state.selectedIds, id],
  })),
  clearSelection: () => set({ selectedIds: [] }),
  fetchReports: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      set({ reports: data.reports || data, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  deleteReport: async (id) => {
    await fetch(`/api/reports/${id}`, { method: 'DELETE' })
    set((state) => ({
      reports: state.reports.filter((r) => r.id !== id),
      selectedIds: state.selectedIds.filter((i) => i !== id),
    }))
  },
}))

interface MonitorState {
  tasks: MonitorTask[]
  loading: boolean
  setTasks: (tasks: MonitorTask[]) => void
  setLoading: (loading: boolean) => void
  updateTask: (id: string, updates: Partial<MonitorTask>) => void
  removeTask: (id: string) => void
  fetchTasks: () => Promise<void>
  createTask: (config: { name: string; duration: number; interval: number; targets: string[]; testTypes: Array<'latency' | 'download' | 'upload'> }) => Promise<MonitorTask | null>
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  tasks: [],
  loading: false,
  setTasks: (tasks) => set({ tasks }),
  setLoading: (loading) => set({ loading }),
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  removeTask: (id) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== id),
  })),
  fetchTasks: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/monitor/tasks')
      const data = await res.json()
      set({ tasks: data.tasks || data, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  createTask: async (config) => {
    try {
      const res = await fetch('/api/monitor/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const task = await res.json()
      set((state) => ({ tasks: [task, ...state.tasks] }))
      return task
    } catch {
      return null
    }
  },
  pauseTask: async (id) => {
    await fetch(`/api/monitor/tasks/${id}/pause`, { method: 'PUT' })
    get().updateTask(id, { status: 'paused' })
  },
  resumeTask: async (id) => {
    await fetch(`/api/monitor/tasks/${id}/resume`, { method: 'PUT' })
    get().updateTask(id, { status: 'running' })
  },
  deleteTask: async (id) => {
    await fetch(`/api/monitor/tasks/${id}`, { method: 'DELETE' })
    get().removeTask(id)
  },
}))

interface PerformanceState {
  report: PerformanceData | null
  loading: boolean
  analysisResult: ReturnType<typeof generatePerformanceReport> | null
  setReport: (report: PerformanceData | null) => void
  setLoading: (loading: boolean) => void
  setAnalysisResult: (result: ReturnType<typeof generatePerformanceReport> | null) => void
  analyze: () => Promise<void>
}

export const usePerformanceStore = create<PerformanceState>((set) => ({
  report: null,
  loading: false,
  analysisResult: null,
  setReport: (report) => set({ report }),
  setLoading: (loading) => set({ loading }),
  setAnalysisResult: (result) => set({ analysisResult: result }),
  analyze: async () => {
    set({ loading: true })
    try {
      const perfData = collectPerformanceData()
      const analysis = generatePerformanceReport(perfData)

      await fetch('/api/performance/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: perfData.url,
          webVitals: perfData.webVitals,
          resources: perfData.resources,
          scripts: perfData.scripts,
          longTasks: perfData.longTasks,
          navigationTiming: perfData.navigationTiming,
          networkRequests: perfData.networkRequests,
          memory: perfData.memory,
          score: analysis.score,
        }),
      })

      set({ report: perfData, analysisResult: analysis, loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))

