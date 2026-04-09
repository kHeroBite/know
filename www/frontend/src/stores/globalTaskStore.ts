import { create } from 'zustand'

export interface GlobalTask {
  id: string
  type: string     // '도메인 추가', '도메인 삭제', '워크스페이스 연결' 등
  label: string    // "HMALL 추가 중"
  percent: number
  status: 'running' | 'done' | 'error'
}

interface GlobalTaskStore {
  currentTask: GlobalTask | null
  isBlocked: boolean
  startTask: (task: Omit<GlobalTask, 'status'>) => void
  updateProgress: (id: string, percent: number) => void
  finishTask: (id: string, status: 'done' | 'error') => void
  clearTask: (id: string) => void
}

export const useGlobalTaskStore = create<GlobalTaskStore>((set, get) => ({
  currentTask: null,
  isBlocked: false,

  startTask: (task) => {
    set({
      currentTask: { ...task, status: 'running' },
      isBlocked: true,
    })
  },

  updateProgress: (id, percent) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    set({ currentTask: { ...cur, percent } })
  },

  finishTask: (id, status) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    set({ currentTask: { ...cur, status }, isBlocked: false })
    // 완료 후 2초 뒤 자동 제거
    setTimeout(() => {
      const latest = get().currentTask
      if (latest?.id === id) set({ currentTask: null })
    }, 2000)
  },

  clearTask: (id) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    set({ currentTask: null, isBlocked: false })
  },
}))
