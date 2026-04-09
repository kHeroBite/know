import { create } from 'zustand'
import 클라이언트 from '../api/client'

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

  // WebSocket으로 수신한 외부 상태 적용 (다른 클라이언트 브로드캐스트)
  applyRemoteTask: (task: GlobalTask | null) => void

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

/** 서버에 전역작업 상태 동기화 (fire-and-forget) */
async function syncToServer(task: GlobalTask | null) {
  try {
    if (!task) {
      await 클라이언트.put('/api/notifications/global-task', {})
    } else {
      await 클라이언트.put('/api/notifications/global-task', {
        id: task.id,
        type: task.type,
        label: task.label,
        percent: task.percent,
        status: task.status,
      })
    }
  } catch {
    // 동기화 실패는 무시 (작업 자체에 영향 없음)
  }
}

export const useGlobalTaskStore = create<GlobalTaskStore>((set, get) => ({
  currentTask: null,
  isBlocked: false,
  _timers: {},

  startTask: (task) => {
    const newTask: GlobalTask = { ...task, status: 'running' }
    set({ currentTask: newTask, isBlocked: true })
    syncToServer(newTask)
  },

  updateProgress: (id, percent) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    const updated = { ...cur, percent }
    set({ currentTask: updated })
    // 진행률은 너무 자주 동기화하지 않음 (10% 단위로만)
    if (percent % 10 === 0 || percent >= 100) syncToServer(updated)
  },

  finishTask: (id, status) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    get().stopPolling(id)
    const finished = { ...cur, status }
    set({ currentTask: finished, isBlocked: false })
    syncToServer(finished)
    // 완료 후 2초 뒤 자동 제거 + 서버 초기화
    setTimeout(() => {
      const latest = get().currentTask
      if (latest?.id === id) {
        set({ currentTask: null })
        syncToServer(null)
      }
    }, 2000)
  },

  clearTask: (id) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    get().stopPolling(id)
    set({ currentTask: null, isBlocked: false })
    syncToServer(null)
  },

  // WebSocket 수신 — 다른 클라이언트의 작업 상태를 반영 (폴링은 시작하지 않음)
  applyRemoteTask: (task) => {
    if (!task) {
      set({ currentTask: null, isBlocked: false })
    } else {
      set({
        currentTask: { ...task, status: task.status as GlobalTask['status'] },
        isBlocked: task.status === 'running',
      })
    }
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
