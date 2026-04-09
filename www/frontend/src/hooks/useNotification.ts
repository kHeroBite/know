import { useEffect, useCallback, useRef } from 'react'
import { notification } from 'antd'
import { useGlobalTaskStore } from '../stores/globalTaskStore'
import 클라이언트 from '../api/client'

export function useNotification(userId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const closedIntentionally = useRef(false)

  const connect = useCallback(() => {
    if (!userId) return
    closedIntentionally.current = false
    const ws = new WebSocket(`ws://${window.location.host}/api/notifications/ws?user_id=${userId}`)

    ws.onopen = async () => {
      // F4: 연결 수립 시 서버의 현재 전역작업 상태를 즉시 fetch
      try {
        const res = await 클라이언트.get('/api/notifications/global-task')
        useGlobalTaskStore.getState().applyRemoteTask(res.data?.task ?? null)
      } catch {
        // fetch 실패는 무시 — WS 메시지로 후속 동기화
      }
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // 전역작업 브로드캐스트 처리 (다중 계정 동기화)
        if (data.type === 'global_task') {
          useGlobalTaskStore.getState().applyRemoteTask(data.task ?? null)
          return
        }
        notification.info({
          message: data.title || '알림',
          description: data.message,
          placement: 'topRight',
          duration: 4,
        })
      } catch {
        // JSON 파싱 실패 무시
      }
    }

    ws.onclose = () => {
      // F3: 의도적 close 시 재연결하지 않음
      if (closedIntentionally.current) return
      setTimeout(connect, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }

    wsRef.current = ws
  }, [userId])

  useEffect(() => {
    // F5: userId 변경 시 기존 WS를 의도적으로 close 후 새 연결
    if (wsRef.current) {
      closedIntentionally.current = true
      wsRef.current.close()
      wsRef.current = null
    }
    connect()
    return () => {
      closedIntentionally.current = true
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])
}
