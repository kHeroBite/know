import { useEffect, useCallback, useRef } from 'react'
import { notification } from 'antd'

export function useNotification(userId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    if (!userId) return
    const ws = new WebSocket(`ws://${window.location.host}/api/notifications/ws?user_id=${userId}`)
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
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
      // 5초 후 재연결
      setTimeout(connect, 5000)
    }
    ws.onerror = () => {
      ws.close()
    }
    wsRef.current = ws
  }, [userId])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])
}
