import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkspaceState {
  selectedWorkspace: string | null
  selectedDomain: string | null
  setWorkspace: (name: string, domain: string) => void
  clearWorkspace: () => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      selectedWorkspace: null,
      selectedDomain: null,
      setWorkspace: (name, domain) => set({ selectedWorkspace: name, selectedDomain: domain }),
      clearWorkspace: () => set({ selectedWorkspace: null, selectedDomain: null }),
    }),
    { name: 'know-workspace', partialize: s => ({ selectedWorkspace: s.selectedWorkspace, selectedDomain: s.selectedDomain }) }
  )
)
