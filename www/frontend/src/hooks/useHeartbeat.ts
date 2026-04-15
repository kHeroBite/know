import { useEffect } from 'react'

export function useHeartbeat(
  workspace: string | null,
  userInfo: { user_id: string } | null,
  domain: string | null,
  interval = 30000
) {
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

    const id = setInterval(() => send('heartbeat'), interval)
    const onUnload = () => send('force_exit')
    window.addEventListener('beforeunload', onUnload)

    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [workspace, userInfo?.user_id, domain, interval])
}
