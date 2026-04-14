/**
 * buildOpsSlice.ts — 사전 빌드 전역작업 슬라이스
 *
 * 단일소스 원칙: 컴포넌트는 이 파일의 고수준 메서드만 호출.
 * API 호출, _startTask, 폴링, 완료처리 모두 여기서 일원화.
 */
import type { StoreApi } from 'zustand'
import { 빌드API } from '../api/pipeline'
import type { GlobalTaskStore, TaskCallbacks } from './globalTaskStore'

type SetState = StoreApi<GlobalTaskStore>['setState']
type GetState = () => GlobalTaskStore

export interface BuildOpsSlice {
  /** 사전 빌드 실행 (비동기 + 폴링) */
  executeBuild: (
    domain: string,
    workspace: string | null | undefined,
    callbacks?: TaskCallbacks & { onDone?: () => void },
  ) => Promise<void>

  /** 빌드 취소 */
  cancelBuild: (domain: string) => Promise<void>
}

export function createBuildOpsSlice(
  _set: SetState,
  get: GetState,
): BuildOpsSlice {
  return {
    executeBuild: async (domain, workspace, callbacks) => {
      const taskId = `build-${domain}-${Date.now()}`
      const started = get()._startTask({
        id: taskId,
        type: '사전 빌드',
        label: `${domain} 빌드 중`,
        percent: 0,
        status: 'running',
      })
      if (!started) {
        callbacks?.onError?.('이미 다른 작업이 진행 중입니다')
        return
      }

      try {
        await 빌드API.빌드시작(domain, workspace || undefined)
      } catch (e: any) {
        get()._finishTask(taskId, 'error')
        const detail = e?.response?.data?.detail || '빌드 요청 실패'
        callbacks?.onError?.(detail)
        return
      }

      // 일회성 플래그 — 어떤 경로로 onDone이 호출되든 단 1회만 실행
      let doneFired = false

      get()._startPolling(
        taskId,
        async () => {
          const res = await 빌드API.상태조회(domain)
          const status = res.data?.status
          if (status === 'completed' || status === 'success') {
            return { percent: 100, done: true, error: false }
          }
          if (status === 'failed') {
            return { percent: 0, done: false, error: true, message: '빌드 실패' }
          }
          // running 상태 — 백엔드 percent 활용 (없으면 50 fallback)
          const backendPercent = res.data?.percent ?? 50
          return { percent: backendPercent, done: false, error: false }
        },
        5000,      // 5초 간격
        () => {
          if (doneFired) return
          doneFired = true
          callbacks?.onDone?.()
        },
        (msg) => {
          callbacks?.onError?.(msg)
        },
        600000,    // 10분 타임아웃
      )
    },

    cancelBuild: async (domain) => {
      const cur = get().currentTask
      const taskId = cur?.id.startsWith(`build-${domain}-`) ? cur.id : null

      if (taskId) get()._stopPolling(taskId)

      try {
        await 빌드API.빌드취소(domain)
      } catch {
        // 취소 실패 무시
      }

      if (taskId) get()._finishTask(taskId, 'cancelled')
    },
  }
}
