/**
 * workspaceOpsSlice.ts — 워크스페이스 고수준 작업 슬라이스
 *
 * 단일소스 원칙: 컴포넌트는 이 파일의 고수준 메서드만 호출.
 * API 호출, startTask, 폴링, 완료처리 모두 여기서 일원화.
 */
import type { StoreApi } from 'zustand'
import { workspaceAPI } from '../api/workspace'
import type { GlobalTaskStore, TaskCallbacks } from './globalTaskStore'

type SetState = StoreApi<GlobalTaskStore>['setState']
type GetState = () => GlobalTaskStore

export interface WorkspaceOpsSlice {
  /** 워크스페이스에 도메인 연결 (IDLE→CONNECTING→USED) */
  executeConnect: (
    wsName: string,
    domain: string,
    jianaVersion: string,
    callbacks?: TaskCallbacks,
  ) => Promise<void>

  /** 연결 진행 중 취소 */
  executeCancel: (wsName: string, callbacks?: TaskCallbacks) => Promise<void>

  /** 워크스페이스 연결 해제 (USED→IDLE) */
  executeRelease: (wsName: string, callbacks?: TaskCallbacks) => Promise<void>

  /** 워크스페이스 재초기화 (해제 후 동일 도메인 재연결) */
  executeReinit: (
    wsName: string,
    domain: string,
    jianaVersion: string | undefined,
    callbacks?: TaskCallbacks,
  ) => Promise<void>

  executeCreate: (wsName: string, color: string | null, callbacks?: {
    onDone?: () => void | Promise<void>
    onError?: (err: string) => void | Promise<void>
  }) => Promise<void>
  restoreWorkspacePolling: (wsList: any[]) => Promise<void>
}

export function createWorkspaceOpsSlice(
  _set: SetState,
  get: GetState,
): WorkspaceOpsSlice {
  return {
    executeConnect: async (wsName, domain, jianaVersion, callbacks) => {
      const taskId = `ws-connect-${wsName}-${Date.now()}`
      const started = get()._startTask({
        id: taskId,
        type: '워크스페이스 연결',
        label: `${wsName} 연결 중`,
        percent: 0,
        status: 'running',
      })
      if (!started) {
        callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
        return
      }

      try {
        await workspaceAPI.도메인연결(wsName, domain, jianaVersion)
      } catch (e: any) {
        get()._finishTask(taskId, 'error')
        const detail = e?.response?.data?.detail || '연결 실패'
        callbacks?.onError?.(detail)
        return
      }

      get()._startPolling(
        taskId,
        async () => {
          const res = await workspaceAPI.진행률조회(wsName)
          const st = res.data?.status
          if (st === 'done') {
            return { percent: 100, done: true, error: false }
          }
          if (st === 'error') {
            return { percent: 0, done: false, error: true, message: res.data?.message }
          }
          if (st === 'cancelled') {
            // 취소 신호 — done으로 처리 (finishTask가 cancelled 전이)
            return { percent: 0, done: true, error: false }
          }
          if (st === 'idle' || !st) {
            return { percent: 100, done: true, error: false }
          }
          const percent: number = res.data?.percent ?? 0
          return { percent, done: false, error: false }
        },
        2000,
        () => {
          callbacks?.onDone?.()
        },
        (msg) => {
          callbacks?.onError?.(msg)
        },
        600000,
      )
    },

    executeCancel: async (wsName, callbacks) => {
      const current = get().currentTask
      const pattern = new RegExp(`^ws-(?:connect|reinit)-${wsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`)
      if (!current || !pattern.test(current.id) || current.status !== 'running') {
        callbacks?.onError?.('취소할 작업이 없습니다')
        return
      }

      // 폴링 즉시 중단 (서버 응답 대기 전)
      get()._stopPolling(current.id)

      // 서버 취소 API 호출
      try {
        await workspaceAPI.연결취소(wsName)
      } catch (e) {
        // 서버 취소 실패해도 클라이언트 상태는 정리
        console.error('[workspaceOpsSlice] 서버 취소 API 실패:', e)
      }

      // store 상태 전이: running → cancelled
      get()._finishTask(current.id, 'cancelled')
      callbacks?.onCancel?.()
    },

    executeRelease: async (wsName, callbacks) => {
      const taskId = `ws-release-${wsName}-${Date.now()}`
      const started = get()._startTask({
        id: taskId,
        type: '워크스페이스 연결해제',
        label: `${wsName} 연결해제 중`,
        percent: 50,
        status: 'running',
      })
      if (!started) {
        callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
        return
      }

      try {
        await workspaceAPI.워크스페이스해제(wsName)
        get()._finishTask(taskId, 'done')
        callbacks?.onDone?.()
      } catch (e: any) {
        get()._finishTask(taskId, 'error')
        const detail = e?.response?.data?.detail || '연결해제 실패'
        callbacks?.onError?.(detail)
      }
    },

    executeCreate: async (wsName, color, callbacks) => {
    const taskId = `ws-create-${wsName}-${Date.now()}`
    const started = get()._startTask({
      id: taskId,
      type: '워크스페이스 생성',
      label: `${wsName} 생성 중`,
      percent: 50,
      status: 'running',
    })
    if (!started) {
      callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
      return
    }
    try {
      await workspaceAPI.워크스페이스생성(wsName, color)
      get()._finishTask(taskId, 'done')
      callbacks?.onDone?.()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '생성 실패'
      workspaceAPI.워크스페이스삭제(wsName).catch(() => {})
      get()._finishTask(taskId, 'error')
      callbacks?.onError?.(detail)
    }
  },
  restoreWorkspacePolling: async (wsList) => {
    const { currentTask } = get()
    for (const ws of wsList) {
      if (ws.status !== 'CONNECTING') continue
      if (currentTask?.id.includes(`-${ws.name}-`) && currentTask.status === 'running') continue
      try {
        const prog = await workspaceAPI.진행률조회(ws.name)
        const progData = prog?.data
        if (progData && progData.status === 'running') {
          const taskId = `ws-connect-${ws.name}-${Date.now()}`
          const wsNameCopy = ws.name
          get()._startTask({
            id: taskId,
            type: '워크스페이스 연결',
            label: `${wsNameCopy} 연결 중`,
            percent: progData.percent ?? 0,
            status: 'running',
          })
          get()._startPolling(
            taskId,
            async () => {
              const res = await workspaceAPI.진행률조회(wsNameCopy)
              const st = res.data?.status
              if (st === 'done') return { percent: 100, done: true, error: false }
              if (st === 'error') return { percent: 0, done: false, error: true, message: res.data?.message }
              if (st === 'cancelled') return { percent: 0, done: true, error: false }
              if (st === 'idle' || !st) return { percent: 100, done: true, error: false }
              const percent: number = res.data?.percent ?? 0
              return { percent, done: false, error: false }
            },
            2000,
            undefined,
            undefined,
            600000,
          )
        }
      } catch {
        // 복원 실패 무시
      }
    }
  },

    executeReinit: async (wsName, domain, jianaVersion, callbacks) => {
      const taskId = `ws-reinit-${wsName}-${Date.now()}`
      const started = get()._startTask({
        id: taskId,
        type: '워크스페이스 초기화',
        label: `${wsName} 초기화 중`,
        percent: 0,
        status: 'running',
      })
      if (!started) {
        callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
        return
      }

      try {
        // 1단계: 연결해제 (직접 API 호출 — 별도 task 아님)
        await workspaceAPI.워크스페이스해제(wsName)
        // 2단계: 같은 도메인으로 재연결
        await workspaceAPI.도메인연결(wsName, domain, jianaVersion)
      } catch (e: any) {
        get()._finishTask(taskId, 'error')
        const detail = e?.response?.data?.detail || '초기화 실패'
        callbacks?.onError?.(detail)
        return
      }

      get()._startPolling(
        taskId,
        async () => {
          const res = await workspaceAPI.진행률조회(wsName)
          const st = res.data?.status
          if (st === 'done') return { percent: 100, done: true, error: false }
          if (st === 'error') return { percent: 0, done: false, error: true, message: res.data?.message }
          if (st === 'cancelled') return { percent: 0, done: true, error: false }
          if (st === 'idle' || !st) return { percent: 100, done: true, error: false }
          const percent: number = res.data?.percent ?? 0
          return { percent, done: false, error: false }
        },
        2000,
        () => {
          callbacks?.onDone?.()
        },
        (msg) => {
          callbacks?.onError?.(msg)
        },
        600000,
      )
    },
  }
}
