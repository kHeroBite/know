import { useEffect, useRef } from 'react'
import { workspaceAPI } from '../api/workspace'

export function useHeartbeat(
  workspace: string | null,
  userInfo: { user_id: string } | null,
  domain: string | null,
  interval = 30000
) {
  const lastActivityRef = useRef<number>(Date.now())
  const autoLogoutMinutesRef = useRef<number | null>(null)

  // 자동 로그아웃 설정값 로드
  useEffect(() => {
    workspaceAPI.getSystemSettings()
      .then(res => {
        const setting = res.data.find(s => s.key === 'auto_logout_minutes')
        if (setting && setting.value) {
          const minutes = parseInt(setting.value, 10)
          if (!isNaN(minutes) && minutes > 0) {
            autoLogoutMinutesRef.current = minutes
          }
        }
      })
      .catch(() => {})
  }, [])

  // 사용자 활동 추적 (ref 기반 — 리렌더 없음)
  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now() }
    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })
    window.addEventListener('mousedown', onActivity, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('mousedown', onActivity)
    }
  }, [])

  useEffect(() => {
    if (!workspace || !userInfo || !domain) return

    const send = (event: string) => {
      const data = JSON.stringify({
        event,
        user_id: userInfo.user_id,
        domain,
        menu: window.location.pathname,
      })
      navigator.sendBeacon(
        `/api/workspaces/${encodeURIComponent(workspace)}/session-event`,
        new Blob([data], { type: 'application/json' })
      )
    }

    const id = setInterval(() => {
      send('heartbeat')

      // 자동 로그아웃 체크
      const minutes = autoLogoutMinutesRef.current
      if (minutes && minutes > 0) {
        const idleMs = Date.now() - lastActivityRef.current
        if (idleMs > minutes * 60 * 1000) {
          send('force_exit')
          window.location.href = '/login'
        }
      }
    }, interval)

    const onUnload = () => send('force_exit')
    window.addEventListener('beforeunload', onUnload)

    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [workspace, userInfo?.user_id, domain, interval])
}
