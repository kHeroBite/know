import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import 클라이언트 from '../api/client'
import { useWorkspaceStore } from './workspaceStore'

interface User { user_id: string; name: string; auth: string }
interface AuthState {
  token: string | null
  user: User | null
  login: (user_id: string, password: string) => Promise<void>
  logout: () => void
}

async function sendSessionEvent(event: 'login' | 'logout', user_id: string, token: string) {
  try {
    await fetch('/api/session-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ event, user_id }),
      keepalive: true,
    })
  } catch {
    // 네트워크 오류 무시
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: async (user_id, password) => {
        const res = await 클라이언트.post('/auth/login', { user_id, password })
        const { access_token, user_id: uid, name, auth } = res.data
        localStorage.setItem('access_token', access_token)
        set({ token: access_token, user: { user_id: uid, name, auth } })
        // login 이벤트 전송 (이전 댕글링 세션 서버에서 자동 정리)
        await sendSessionEvent('login', uid, access_token)
        // 로그인 후 서버에서 워크스페이스 설정 로드
        useWorkspaceStore.getState().loadPreference()
      },
      logout: () => {
        const token = localStorage.getItem('access_token')
        const user = useAuthStore.getState().user
        if (token && user) {
          // logout 이벤트 전송 (fire-and-forget)
          sendSessionEvent('logout', user.user_id, token)
        }
        localStorage.removeItem('access_token')
        set({ token: null, user: null })
      },
    }),
    { name: 'auth-storage', partialize: s => ({ token: s.token, user: s.user }) }
  )
)
