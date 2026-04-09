/**
 * domainOpsSlice.ts — 도메인 고수준 작업 슬라이스
 *
 * 단일소스 원칙: 컴포넌트는 이 파일의 고수준 메서드만 호출.
 * API 호출, startTask, 폴링, 완료처리 모두 여기서 일원화.
 */
import type { StoreApi } from 'zustand'
import { workspaceAPI } from '../api/workspace'
import type { GlobalTaskStore, TaskCallbacks } from './globalTaskStore'

type SetState = StoreApi<GlobalTaskStore>['setState']
type GetState = () => GlobalTaskStore

export interface DomainAddParams {
  base_source: string
  base_name: string
  copy_dict_from?: string | null
  mysql_dict_from?: string | null
  display_name?: string | null
}

export interface DomainOpsSlice {
  /** 도메인 추가 (비동기 복사 + 폴링) */
  executeDomainAdd: (
    name: string,
    params: DomainAddParams,
    callbacks?: TaskCallbacks,
  ) => Promise<void>

  /** 도메인 삭제 (즉시 처리) */
  executeDomainDelete: (name: string, callbacks?: TaskCallbacks) => Promise<void>

  /** 페이지 복귀 시 진행 중인 도메인 작업 복원 */
  restoreDomainPolling: (domainList: { id: string }[]) => Promise<void>

  /** WS에서 running domain-add task 수신 시 폴링 복원 (새로고침/다중 탭 동기화) */
  restoreDomainTaskPollingById: (taskId: string, domainName: string) => Promise<void>
}

export function createDomainOpsSlice(
  _set: SetState,
  get: GetState,
): DomainOpsSlice {
  return {
    executeDomainAdd: async (name, params, callbacks) => {
      const taskId = `domain-add-${name}-${Date.now()}`
      const started = get()._startTask({
        id: taskId,
        type: '도메인 추가',
        label: `${name} 추가 중`,
        percent: 0,
        status: 'running',
      })
      if (!started) {
        callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
        return
      }

      try {
        await workspaceAPI.도메인추가(
          name,
          params.base_source,
          params.base_name,
          params.copy_dict_from,
          params.mysql_dict_from,
          params.display_name,
        )
      } catch (e: any) {
        get()._finishTask(taskId, 'error')
        const detail = e?.response?.data?.detail || '도메인 추가 실패'
        callbacks?.onError?.(detail)
        return
      }

      get()._startPolling(
        taskId,
        async () => {
          const res = await workspaceAPI.도메인추가진행률(name)
          const st = res.data?.status
          if (!st || st === 'idle') return { percent: 100, done: true, error: false }
          if (st === 'dict_copying') return { percent: 92, done: false, error: false }
          if (st === 'done') {
            return { percent: 100, done: true, error: false }
          }
          if (st === 'error') {
            return { percent: 0, done: false, error: true, message: res.data?.message }
          }
          const percent: number = res.data?.percent ?? 0
          return { percent, done: false, error: false }
        },
        1500,
        () => {
          callbacks?.onDone?.()
        },
        (msg) => {
          callbacks?.onError?.(msg)
        },
        600000,
      )
    },

    executeDomainDelete: async (name, callbacks) => {
      const taskId = `domain-del-${name}-${Date.now()}`
      const started = get()._startTask({
        id: taskId,
        type: '도메인 삭제',
        label: `${name} 삭제 중`,
        percent: 50,
        status: 'running',
      })
      if (!started) {
        callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
        return
      }

      try {
        await workspaceAPI.도메인삭제(name)
        get()._finishTask(taskId, 'done')
        callbacks?.onDone?.()
      } catch (e: any) {
        get()._finishTask(taskId, 'error')
        const detail = e?.response?.data?.detail || '도메인 삭제 실패'
        callbacks?.onError?.(detail)
      }
    },

    restoreDomainTaskPollingById: async (taskId, domainName) => {
      // 이미 이 task에 대한 폴링이 진행 중이면 스킵
      if (get()._timers[taskId]) return
      try {
        const res = await workspaceAPI.도메인추가진행률(domainName)
        const st = res.data?.status
        // 서버가 이미 완료/오류 상태면 task 클리어
        if (!st || st === 'idle' || st === 'done') {
          get()._finishTask(taskId, 'done')
          return
        }
        if (st === 'error') {
          get()._finishTask(taskId, 'error')
          return
        }
        // 아직 running — 폴링 시작
        get()._startPolling(
          taskId,
          async () => {
            const r = await workspaceAPI.도메인추가진행률(domainName)
            const s = r.data?.status
            if (!s || s === 'idle') return { percent: 100, done: true, error: false }
            if (s === 'dict_copying') return { percent: 92, done: false, error: false }
            if (s === 'done') return { percent: 100, done: true, error: false }
            if (s === 'error') return { percent: 0, done: false, error: true, message: r.data?.message }
            return { percent: r.data?.percent ?? 0, done: false, error: false }
          },
          1500,
          undefined,
          undefined,
          600000,
        )
      } catch {
        // 복원 실패 시 안전하게 task 클리어
        get()._finishTask(taskId, 'error')
      }
    },

    restoreDomainPolling: async (domainList) => {
      const storeState = get()
      const storeTimers = storeState._timers
      const storeTask = storeState.currentTask

      for (const dm of domainList) {
        // 이미 store에서 폴링 중 — 스킵
        const existingTaskId = Object.keys(storeTimers).find(tid => tid.startsWith(`domain-add-${dm.id}`))
        if (existingTaskId) continue

        // store currentTask가 이 도메인 관련이면 스킵
        if (storeTask && storeTask.id.includes(dm.id)) continue

        try {
          const res = await workspaceAPI.도메인추가진행률(dm.id)
          const st = res.data?.status
          if (st && st !== 'idle' && st !== 'done') {
            const pct = res.data?.percent ?? 0
            const taskId = `domain-add-${dm.id}-${Date.now()}`
            const started = get()._startTask({
              id: taskId,
              type: '도메인 추가',
              label: `${dm.id} 추가 중`,
              percent: pct,
              status: 'running',
            })
            if (started) {
              // 폴링 재시작 (callbacks 없음 — 페이지 복귀)
              get()._startPolling(
                taskId,
                async () => {
                  const r = await workspaceAPI.도메인추가진행률(dm.id)
                  const s = r.data?.status
                  if (!s || s === 'idle') return { percent: 100, done: true, error: false }
                  if (s === 'dict_copying') return { percent: 92, done: false, error: false }
                  if (s === 'done') return { percent: 100, done: true, error: false }
                  if (s === 'error') return { percent: 0, done: false, error: true, message: r.data?.message }
                  return { percent: r.data?.percent ?? 0, done: false, error: false }
                },
                1500,
                undefined,
                undefined,
                600000,
              )
            }
          }
        } catch { /* ignore */ }
      }
    },
  }
}
