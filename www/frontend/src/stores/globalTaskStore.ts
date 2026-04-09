import { create } from 'zustand'
import 클라이언트 from '../api/client'
import { createWorkspaceOpsSlice, type WorkspaceOpsSlice } from './workspaceOpsSlice'
import { createDomainOpsSlice, type DomainOpsSlice } from './domainOpsSlice'

// ===== 타입 =====

export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled' | 'timeout'

export interface GlobalTask {
  id: string
  type: string     // '도메인 추가', '도메인 삭제', '워크스페이스 연결' 등
  label: string    // "HMALL 추가 중"
  percent: number
  status: TaskStatus
  updatedAt: number  // Date.now() — WS 재수신 방어용
}

// 콜백 패턴 — antd message 등 UI 피드백은 컴포넌트에서 주입
export interface TaskCallbacks {
  onDone?: () => void
  onError?: (error?: string) => void
  onCancel?: () => void
  onTimeout?: () => void
}

type PollingFn = () => Promise<{ percent: number; done: boolean; error: boolean; message?: string }>

// 저수준 기반 타입
interface GlobalTaskBase {
  // 상태
  currentTask: GlobalTask | null
  isBlocked: boolean
  _timers: Record<string, ReturnType<typeof setInterval>>
  _completedIds: Set<string>

  // 저수준 메서드 (_prefix: 슬라이스에서만 직접 호출)
  _startTask: (task: Omit<GlobalTask, 'updatedAt'>) => boolean
  _updateProgress: (id: string, percent: number) => void
  _finishTask: (id: string, status: 'done' | 'error' | 'cancelled' | 'timeout') => void
  _clearTask: (id: string) => void
  _startPolling: (
    id: string,
    fn: PollingFn,
    intervalMs: number,
    onDone?: () => void,
    onError?: (msg?: string) => void,
    timeoutMs?: number,
  ) => void
  _stopPolling: (id: string) => void

  // WS 단일 진입점
  applyRemoteTask: (task: GlobalTask | null) => void

  // 레거시 호환 (Workspace.tsx 임시 — Phase 3 이후 제거)
  /** @deprecated executeConnect 사용 */
  startTask: (task: Omit<GlobalTask, 'status' | 'updatedAt'>) => void
  /** @deprecated executeConnect 사용 */
  updateProgress: (id: string, percent: number) => void
  /** @deprecated executeConnect 사용 */
  finishTask: (id: string, status: 'done' | 'error') => void
  /** @deprecated executeConnect 사용 */
  clearTask: (id: string) => void
  /** @deprecated executeConnect 사용 */
  startPolling: (
    id: string,
    pollingFn: PollingFn,
    intervalMs?: number,
    onDone?: () => void,
    onError?: (msg?: string) => void,
  ) => void
  /** @deprecated executeConnect 사용 */
  stopPolling: (id: string) => void
}

export type GlobalTaskStore = GlobalTaskBase & WorkspaceOpsSlice & DomainOpsSlice

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
  // ===== 기반 상태 =====
  currentTask: null,
  isBlocked: false,
  _timers: {},
  _completedIds: new Set<string>(),

  // ===== 저수준 메서드 =====

  _startTask: (task) => {
    const current = get().currentTask
    // 전이 가드: running 중이면 중복 시작 거부
    if (current && current.status === 'running') {
      console.warn(`[globalTaskStore] 전이 거부: running → running (taskId: ${task.id}, current: ${current.id})`)
      return false
    }
    const newTask: GlobalTask = { ...task, updatedAt: Date.now() }
    set({ currentTask: newTask, isBlocked: true })
    syncToServer(newTask)
    return true
  },

  _updateProgress: (id, percent) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id || cur.status !== 'running') return
    const updated = { ...cur, percent, updatedAt: Date.now() }
    set({ currentTask: updated })
    // 진행률은 너무 자주 동기화하지 않음 (10% 단위로만)
    if (percent % 10 === 0 || percent >= 100) syncToServer(updated)
  },

  _finishTask: (id, status) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    if (cur.status !== 'running') {
      console.warn(`[globalTaskStore] 전이 거부: ${cur.status} → ${status} (taskId: ${id})`)
      return
    }
    get()._stopPolling(id)
    get()._completedIds.add(id)
    const finished: GlobalTask = { ...cur, status, updatedAt: Date.now() }
    set({ currentTask: finished })  // isBlocked는 2초 지연 후 해제 (race condition 방지)
    syncToServer(finished)
    setTimeout(() => {
      const latest = get().currentTask
      if (latest?.id === id) set({ currentTask: null, isBlocked: false })
      syncToServer(null)  // 2초 지연 후 서버 null (다른 탭이 isBlocked를 조기 해제하는 race condition 방지)
      // TTL: 5분 후 completedIds에서 제거
      setTimeout(() => {
        get()._completedIds.delete(id)
      }, 300000)
    }, 2000)
  },

  _clearTask: (id) => {
    const cur = get().currentTask
    if (!cur || cur.id !== id) return
    get()._stopPolling(id)
    set({ currentTask: null, isBlocked: false })
    syncToServer(null)
  },

  _startPolling: (id, fn, intervalMs = 1500, onDone, onError, timeoutMs = 600000) => {
    const timers = get()._timers
    if (timers[id]) return  // 이미 폴링 중
    const startTime = Date.now()

    const timer = setInterval(async () => {
      if (get().currentTask?.id !== id) return
      // 타임아웃 체크 (기본 10분)
      if (Date.now() - startTime > timeoutMs) {
        get()._stopPolling(id)
        get()._finishTask(id, 'timeout')
        onError?.('작업 시간 초과')
        return
      }

      try {
        const result = await fn()
        if (result.error) {
          get()._finishTask(id, 'error')
          onError?.(result.message)
          return
        }
        get()._updateProgress(id, result.percent)
        if (result.done) {
          get()._finishTask(id, 'done')
          onDone?.()
        }
      } catch {
        // 네트워크 에러 — 즉시 중단하지 않고 다음 폴링에서 재시도
      }
    }, intervalMs)

    set(s => ({ _timers: { ...s._timers, [id]: timer } }))
  },

  _stopPolling: (id) => {
    const timers = get()._timers
    if (timers[id]) {
      clearInterval(timers[id])
      const next = { ...timers }
      delete next[id]
      set({ _timers: next })
    }
  },

  // ===== WS 단일 진입점 =====

  applyRemoteTask: (task) => {
    const state = get()

    // 1. null 수신 — task 종료 신호
    if (!task) {
      if (state.currentTask) {
        state._stopPolling(state.currentTask.id)
        set({ currentTask: null, isBlocked: false })
      }
      return
    }

    // 2. 완료된 task 재수신 방어 (WS 재연결 시 서버가 done task 재전송하는 경우)
    if (state._completedIds.has(task.id)) return

    // 3. updatedAt 비교 — 오래된 상태 무시 (로컬이 더 최신이면 무시)
    if (
      state.currentTask?.id === task.id &&
      state.currentTask.updatedAt > (task.updatedAt ?? 0)
    ) {
      return
    }

    // 4. done/error/cancelled 수신 — 폴링 중단 + 2초 후 클리어
    if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
      state._stopPolling(task.id)
      state._completedIds.add(task.id)
      const finalTask: GlobalTask = { ...task, updatedAt: Date.now() }
      set({ currentTask: finalTask })  // isBlocked는 2초 지연 후 해제 (_finishTask와 일관성)
      setTimeout(() => {
        const cur = get().currentTask
        if (cur?.id === task.id) set({ currentTask: null, isBlocked: false })
        // TTL: 5분 후 completedIds에서 제거
        setTimeout(() => get()._completedIds.delete(task.id), 300000)
      }, 2000)
      return
    }

    // 5. running 수신 — 상태 갱신 (폴링이 있으면 유지, 없으면 WS만으로 상태 반영)
    // 클라이언트가 폴링 중인 task는 덮어쓰지 않음 (applyRemoteTask 덮어쓰기 버그 방지)
    const isPolling = !!state._timers[task.id]
    if (isPolling) return
    set({
      currentTask: { ...task, updatedAt: Date.now() },
      isBlocked: true,
    })
  },

  // ===== 레거시 호환 (Phase 3 이후 제거 예정) =====

  startTask: (task) => {
    get()._startTask({ ...task, status: 'running' })
  },

  updateProgress: (id, percent) => {
    get()._updateProgress(id, percent)
  },

  finishTask: (id, status) => {
    get()._finishTask(id, status)
  },

  clearTask: (id) => {
    get()._clearTask(id)
  },

  startPolling: (id, pollingFn, intervalMs = 1500, onDone, onError) => {
    get()._startPolling(id, pollingFn, intervalMs, onDone, onError, 600000)
  },

  stopPolling: (id) => {
    get()._stopPolling(id)
  },

  // ===== slice 합성 =====
  ...createWorkspaceOpsSlice(set, get),
  ...createDomainOpsSlice(set, get),
}))
