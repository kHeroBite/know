import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import 클라이언트 from '../api/client'

interface WorkspaceState {
  selectedWorkspace: string | null
  selectedDomain: string | null
  selectedColor: string | null
  isFrozen: boolean
  setWorkspace: (name: string, domain: string, color: string | null) => void
  clearWorkspace: () => void
  setFrozen: (v: boolean) => void
  loadPreference: () => Promise<void>
  savePreference: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      selectedWorkspace: null,
      selectedDomain: null,
      selectedColor: null,
      isFrozen: false,
      setWorkspace: (name, domain, color) => {
        set({ selectedWorkspace: name, selectedDomain: domain, selectedColor: color, isFrozen: false })
        // 서버에 비동기 저장
        클라이언트.put('/workspaces/preference', { workspace: name, domain, color }).catch(() => {})
      },
      clearWorkspace: () => set({ selectedWorkspace: null, selectedDomain: null, selectedColor: null, isFrozen: false }),
      setFrozen: (v) => set({ isFrozen: v }),
      loadPreference: async () => {
        try {
          const { data } = await 클라이언트.get('/workspaces/preference')
          if (data.workspace) {
            set({ selectedWorkspace: data.workspace, selectedDomain: data.domain, selectedColor: data.color })
          }
        } catch {
          // 서버 설정 없으면 무시
        }
      },
      savePreference: async () => {
        const { selectedWorkspace, selectedDomain, selectedColor } = get()
        if (selectedWorkspace) {
          await 클라이언트.put('/workspaces/preference', {
            workspace: selectedWorkspace,
            domain: selectedDomain,
            color: selectedColor,
          }).catch(() => {})
        }
      },
    }),
    { name: 'know-workspace', partialize: s => ({ selectedWorkspace: s.selectedWorkspace, selectedDomain: s.selectedDomain, selectedColor: s.selectedColor }) }
  )
)
