import { useEffect, useRef } from 'react'

export function useHeartbeat(
  workspace: string | null,
  userInfo: { user_id: string } | null,
  domain: string | null,
  interval = 10000
) {
  // 마지막 heartbeat 시각 (초기값 = 마운트 시각)
  const lastHeartbeatRef = useRef<number>(Date.now())
  const autoLogoutMinutesRef = useRef<number | null>(null)

  // 자동 로그아웃 체크 — 마지막 heartbeat 기준, 항상 동작
  useEffect(() => {
    const id = setInterval(() => {
      const minutes = autoLogoutMinutesRef.current
      if (minutes && minutes > 0) {
        const idleMs = Date.now() - lastHeartbeatRef.current
        if (idleMs > minutes * 60 * 1000) {
          // logout 이벤트 전송 후 리다이렉트
          const token = localStorage.getItem('access_token')
          if (token && userInfo) {
            fetch('/api/session-event', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ event: 'logout', user_id: userInfo.user_id }),
              keepalive: true,
            }).catch(() => {})
          }
          window.location.href = '/login'
        }
      }
    }, 10000)

    return () => clearInterval(id)
  }, [userInfo])

  // heartbeat 전송 — workspace/domain 선택 시에만 동작
  useEffect(() => {
    if (!workspace || !userInfo || !domain) return

    const getToken = () => localStorage.getItem('access_token') || ''

    const sendBeaconExit = () => {
      // beforeunload: 응답 불필요, sendBeacon 유지
      const data = JSON.stringify({
        event: 'force_exit',
        user_id: userInfo.user_id,
        domain,
        menu: window.location.pathname,
      })
      navigator.sendBeacon(
        `/api/workspaces/${encodeURIComponent(workspace)}/session-event`,
        new Blob([data], { type: 'application/json' })
      )
    }

    const sendHeartbeat = async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${encodeURIComponent(workspace)}/session-event`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`,
            },
            body: JSON.stringify({
              event: 'heartbeat',
              user_id: userInfo.user_id,
              domain,
              menu: window.location.pathname,
            }),
          }
        )
        if (res.ok) {
          const data = await res.json()
          // 서버 응답에서 auto_logout_minutes 실시간 갱신
          if (typeof data.auto_logout_minutes === 'number') {
            autoLogoutMinutesRef.current = data.auto_logout_minutes > 0 ? data.auto_logout_minutes : null
          }
          lastHeartbeatRef.current = Date.now()
        }
      } catch {
        // 네트워크 오류 시 무시
      }
    }

    // 즉시 1회 실행 후 인터벌 설정
    sendHeartbeat()
    const id = setInterval(sendHeartbeat, interval)

    window.addEventListener('beforeunload', sendBeaconExit)

    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', sendBeaconExit)
    }
  }, [workspace, userInfo?.user_id, domain, interval])
}
