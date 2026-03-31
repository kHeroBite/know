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
        // 로그인 후 서버에서 워크스페이스 설정 로드
        useWorkspaceStore.getState().loadPreference()
      },
      logout: () => {
        localStorage.removeItem('access_token')
        set({ token: null, user: null })
      },
    }),
    { name: 'auth-storage', partialize: s => ({ token: s.token, user: s.user }) }
  )
)
