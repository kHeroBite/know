import { create } from 'zustand'

export interface StageStatus {
  name: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval'
}

const 초기단계: StageStatus[] = [
  { name: 'refine',    label: '정제',     status: 'pending' },
  { name: 'morpheme',  label: '형태소분석', status: 'pending' },
  { name: 'assign',    label: '작업분배', status: 'pending' },
  { name: 'register',  label: '사전등록', status: 'pending' },
  { name: 'build',     label: '빌드',     status: 'pending' },
  { name: 'deploy',    label: '배포',     status: 'pending' },
]

interface PipelineStore {
  currentPipelineId: number | null
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  stages: StageStatus[]
  logs: string[]
  setCurrentPipeline: (id: number) => void
  updateStage: (stage: string, status: StageStatus['status']) => void
  appendLog: (log: string) => void
  reset: () => void
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  currentPipelineId: null,
  status: 'idle',
  stages: 초기단계,
  logs: [],

  setCurrentPipeline: (id) =>
    set({ currentPipelineId: id, status: 'running', logs: [], stages: 초기단계 }),

  updateStage: (stage, status) =>
    set((s) => ({
      stages: s.stages.map((st) => st.name === stage ? { ...st, status } : st),
      status: status === 'failed' ? 'failed'
        : s.stages.every(st => st.name === stage ? status === 'completed' : st.status === 'completed')
          ? 'completed' : s.status,
    })),

  appendLog: (log) =>
    set((s) => ({ logs: [...s.logs.slice(-499), log] })),

  reset: () =>
    set({ currentPipelineId: null, status: 'idle', stages: 초기단계, logs: [] }),
}))
