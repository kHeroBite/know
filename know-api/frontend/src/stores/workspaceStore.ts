import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkspaceState {
  selectedWorkspace: string | null
  selectedDomain: string | null
  selectedColor: string | null
  setWorkspace: (name: string, domain: string, color: string | null) => void
  clearWorkspace: () => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      selectedWorkspace: null,
      selectedDomain: null,
      selectedColor: null,
      setWorkspace: (name, domain, color) => set({ selectedWorkspace: name, selectedDomain: domain, selectedColor: color }),
      clearWorkspace: () => set({ selectedWorkspace: null, selectedDomain: null, selectedColor: null }),
    }),
    { name: 'know-workspace', partialize: s => ({ selectedWorkspace: s.selectedWorkspace, selectedDomain: s.selectedDomain, selectedColor: s.selectedColor }) }
  )
)
