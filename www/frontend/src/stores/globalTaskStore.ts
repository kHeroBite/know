import { create } from 'zustand'

export interface GlobalTask {
  id: string
  type: string     // '도메인 추가', '도메인 삭제', '워크스페이스 연결' 등
  label: string    // "HMALL 추가 중"
  percent: number
  status: 'running' | 'done' | 'error'
}

type PollingFn = () => Promise<{ percent: number; done: boolean; error: boolean; message?: string }>

interface GlobalTaskStore {
  currentTask: GlobalTask | null
  isBlocked: boolean

  startTask: (task: Omit<GlobalTask, 'status'>) => void
  updateProgress: (id: string, percent: number) => void
  finishTask: (id: string, status: 'done' | 'error') => void
  clearTask: (id: string) => void

  // 폴링을 store 내부에서 관리 (페이지 이동과 무관하게 유지)
  startPolling: (
    id: string,
    pollingFn: PollingFn,
    intervalMs?: number,
    onDone?: () => void,
    onError?: (msg?: string) => void,
  ) => void
  stopPolling: (id: string) => void

  _timers: Record<string, ReturnType<typeof setInterval>>
}

export const useGlobalTaskStore = create<GlobalTaskStore>((set, get) => ({
  currentTask: null,
  isBlocked: false,
  _timers: {},

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
    get().stopPolling(id)
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
    get().stopPolling(id)
    set({ currentTask: null, isBlocked: false })
  },

  startPolling: (id, pollingFn, intervalMs = 1500, onDone, onError) => {
    const timers = get()._timers
    if (timers[id]) return // 이미 폴링 중

    const timer = setInterval(async () => {
      try {
        const result = await pollingFn()
        if (result.error) {
          get().finishTask(id, 'error')
          onError?.(result.message)
          return
        }
        get().updateProgress(id, result.percent)
        if (result.done) {
          get().finishTask(id, 'done')
          onDone?.()
        }
      } catch {
        get().finishTask(id, 'error')
        onError?.()
      }
    }, intervalMs)

    set(s => ({ _timers: { ...s._timers, [id]: timer } }))
  },

  stopPolling: (id) => {
    const timers = get()._timers
    if (timers[id]) {
      clearInterval(timers[id])
      const next = { ...timers }
      delete next[id]
      set({ _timers: next })
    }
  },
}))
