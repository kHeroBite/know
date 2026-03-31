import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import 클라이언트 from '../api/client'
import { assignmentApi } from '../api/assignment'

interface WorkspaceState {
  selectedWorkspace: string | null
  selectedDomain: string | null
  selectedColor: string | null
  lastMenu: string | null
  isFrozen: boolean
  isAssigned: boolean
  _statusLoaded: boolean
  setWorkspace: (name: string, domain: string, color: string | null) => void
  clearWorkspace: () => void
  setFrozen: (v: boolean) => void
  setAssigned: (v: boolean) => void
  setLastMenu: (path: string) => void
  loadPreference: () => Promise<void>
  savePreference: () => Promise<void>
  loadWorkspaceStatus: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      selectedWorkspace: null,
      selectedDomain: null,
      selectedColor: null,
      lastMenu: null,
      isFrozen: false,
      isAssigned: false,
      _statusLoaded: false,
      setWorkspace: (name, domain, color) => {
        set({ selectedWorkspace: name, selectedDomain: domain, selectedColor: color, isFrozen: false, isAssigned: false, _statusLoaded: false })
        // 서버에 비동기 저장
        클라이언트.put('/workspaces/preference', { workspace: name, domain, color }).catch(() => {})
        // 프리징/할당 상태 복원
        assignmentApi.작업상태(name, domain).then(res => {
          set({ isFrozen: res.data.is_frozen, isAssigned: res.data.is_assigned })
        }).catch(() => {})
      },
      clearWorkspace: () => {
        set({ selectedWorkspace: null, selectedDomain: null, selectedColor: null, isFrozen: false, isAssigned: false, _statusLoaded: false })
        // 서버 설정도 초기화 — 재로그인 시 이전 워크스페이스 복원 방지
        클라이언트.put('/workspaces/preference', { workspace: '', domain: null, color: null }).catch(() => {})
      },
      setFrozen: (v) => set({ isFrozen: v }),
      setAssigned: (v) => set({ isAssigned: v }),
      setLastMenu: (path) => {
        const prev = get().lastMenu
        if (prev === path) return
        set({ lastMenu: path })
        const { selectedWorkspace, selectedDomain, selectedColor } = get()
        if (selectedWorkspace) {
          클라이언트.put('/workspaces/preference', {
            workspace: selectedWorkspace, domain: selectedDomain, color: selectedColor, last_menu: path,
          }).catch(() => {})
        }
      },
      loadPreference: async () => {
        try {
          const { data } = await 클라이언트.get('/workspaces/preference')
          if (data.workspace) {
            set({ selectedWorkspace: data.workspace, selectedDomain: data.domain, selectedColor: data.color, lastMenu: data.last_menu || null })
            // 프리징/할당 상태 복원
            try {
              const res = await assignmentApi.작업상태(data.workspace, data.domain)
              set({ isFrozen: res.data.is_frozen, isAssigned: res.data.is_assigned })
            } catch {
              // 상태 조회 실패 시 기본값 유지
            }
          }
        } catch {
          // 서버 설정 없으면 무시
        }
      },
      savePreference: async () => {
        const { selectedWorkspace, selectedDomain, selectedColor, lastMenu } = get()
        if (selectedWorkspace) {
          await 클라이언트.put('/workspaces/preference', {
            workspace: selectedWorkspace,
            domain: selectedDomain,
            color: selectedColor,
            last_menu: lastMenu,
          }).catch(() => {})
        }
      },
      loadWorkspaceStatus: async () => {
        const { selectedWorkspace, selectedDomain } = get()
        if (!selectedWorkspace || !selectedDomain) {
          set({ _statusLoaded: true })
          return
        }
        try {
          const res = await assignmentApi.작업상태(selectedWorkspace, selectedDomain)
          set({ isFrozen: res.data.is_frozen, isAssigned: res.data.is_assigned, _statusLoaded: true })
        } catch {
          set({ _statusLoaded: true })
        }
      },
    }),
    { name: 'know-workspace', partialize: s => ({ selectedWorkspace: s.selectedWorkspace, selectedDomain: s.selectedDomain, selectedColor: s.selectedColor, lastMenu: s.lastMenu }) }
  )
)
