import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import 클라이언트 from '../api/client'
import { assignmentApi } from '../api/assignment'
import { workspaceAPI } from '../api/workspace'

export type Phase = 'preprocess' | 'work' | 'build' | 'verify' | 'complete' | 'finished'
export type MyPhase = 'idle' | 'working' | 'done'

interface WorkspaceState {
  selectedWorkspace: string | null
  selectedDomain: string | null
  selectedDomainLabel: string | null
  selectedColor: string | null
  lastMenu: string | null
  phase: Phase
  myPhase: MyPhase
  _statusLoaded: boolean
  setWorkspace: (name: string, domain: string, color: string | null, label?: string | null) => void
  clearWorkspace: () => void
  setPhase: (p: Phase) => void
  setMyPhase: (p: MyPhase) => void
  advancePhase: (to: Phase) => Promise<void>
  revertPhase: (to: Phase) => Promise<void>
  setLastMenu: (path: string) => void
  loadPreference: () => Promise<void>
  savePreference: () => Promise<void>
  loadWorkspaceStatus: () => Promise<void>
  lastCompleteResult: any | null
  completeWorkspace: (wsName: string, domain: string, skipBackup?: boolean) => Promise<any>
  prepareComplete: (wsName: string) => Promise<any>
  finalizeComplete: (wsName: string, opts: { backup_folder?: string; skip_backup?: boolean; site_id?: number | null }) => Promise<any>
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      selectedWorkspace: null,
      selectedDomain: null,
      selectedDomainLabel: null,
      selectedColor: null,
      lastMenu: null,
      phase: 'preprocess',
      myPhase: 'idle',
      _statusLoaded: false,
      lastCompleteResult: null,
      setWorkspace: (name, domain, color, label) => {
        set({ selectedWorkspace: name, selectedDomain: domain, selectedDomainLabel: label ?? null, selectedColor: color, phase: 'preprocess', myPhase: 'idle', _statusLoaded: false })
        // 서버에 비동기 저장
        클라이언트.put('/workspaces/preference', { workspace: name, domain, color }).catch(() => {})
        // phase/myPhase 상태 복원
        assignmentApi.작업상태(name, domain).then(res => {
          set({ phase: res.data.phase, myPhase: res.data.my_phase })
        }).catch(() => {})
      },
      clearWorkspace: () => {
        set({ selectedWorkspace: null, selectedDomain: null, selectedDomainLabel: null, selectedColor: null, phase: 'preprocess', myPhase: 'idle', _statusLoaded: false })
        // 서버 설정도 초기화 — 재로그인 시 이전 워크스페이스 복원 방지
        클라이언트.put('/workspaces/preference', { workspace: '', domain: null, color: null }).catch(() => {})
      },
      setPhase: (p) => set({ phase: p }),
      setMyPhase: (p) => set({ myPhase: p }),
      advancePhase: async (to) => {
        const { selectedWorkspace, selectedDomain } = get()
        if (!selectedWorkspace || !selectedDomain) return
        await workspaceAPI.advancePhase(selectedWorkspace, to)
        await get().loadWorkspaceStatus()
      },
      revertPhase: async (to) => {
        const { selectedWorkspace, selectedDomain } = get()
        if (!selectedWorkspace || !selectedDomain) return
        await workspaceAPI.revertPhase(selectedWorkspace, to)
        await get().loadWorkspaceStatus()
      },
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
            // phase/myPhase 상태 복원
            try {
              const res = await assignmentApi.작업상태(data.workspace, data.domain)
              set({ phase: res.data.phase, myPhase: res.data.my_phase })
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
          set({ phase: res.data.phase, myPhase: res.data.my_phase, _statusLoaded: true })
        } catch {
          set({ _statusLoaded: true })
        }
      },
      completeWorkspace: async (wsName: string, domain: string, skipBackup: boolean = false) => {
        const res = await workspaceAPI.completeWorkspace(wsName, domain, skipBackup)
        set({ lastCompleteResult: res.data })
        await get().loadWorkspaceStatus()
        return res.data
      },
      prepareComplete: async (wsName: string) => {
        const res = await workspaceAPI.prepareComplete(wsName)
        await get().loadWorkspaceStatus()
        return res.data
      },
      finalizeComplete: async (wsName: string, opts) => {
        const res = await workspaceAPI.finalizeComplete(wsName, opts)
        set({ lastCompleteResult: res.data })
        await get().loadWorkspaceStatus()
        return res.data
      },
    }),
    { name: 'know-workspace', partialize: s => ({ selectedWorkspace: s.selectedWorkspace, selectedDomain: s.selectedDomain, selectedDomainLabel: s.selectedDomainLabel, selectedColor: s.selectedColor, lastMenu: s.lastMenu }) }
  )
)
