import 클라이언트 from './client'

export interface StepLog {
  id: number
  workspace: string
  domain: string
  phase: string
  action: string
  user_id: string | null
  created_at: string
}

export interface PhaseStats {
  first_enter: string | null
  last_leave: string | null
  total_seconds: number
  visit_count: number
}

export interface StepReportResponse {
  logs: StepLog[]
  phases: Record<string, PhaseStats>
}

export interface ParticipantStat {
  user_id: string
  first_login: string | null
  last_activity: string | null
  total_minutes: number
  items_per_hour: number
  kw_count: number
  kw_per_hour: number
  dict_count: number
  dict_per_hour: number
}

export interface SystemSetting {
  key: string
  value: string
  updated_at: string | null
}

export const workspaceAPI = {
  워크스페이스목록: () =>
    클라이언트.get('/workspaces'),

  워크스페이스생성: (name: string, color?: string | null) =>
    클라이언트.post('/workspaces', { name, ...(color ? { color } : {}) }),

  워크스페이스삭제: (name: string) =>
    클라이언트.delete(`/workspaces/${name}`),

  도메인연결: (wsName: string, domain: string, jianaVersion?: string, backupName?: string) =>
    클라이언트.post(`/workspaces/${wsName}/connect`, { domain, jiana_version: jianaVersion, backup_name: backupName }),

  사이트연결: (wsName: string, siteCode: string, jianaVersion: string) =>
    클라이언트.post(`/workspaces/${wsName}/connect`, { site_code: siteCode, jiana_version: jianaVersion }),

  백업연결: (wsName: string, domain: string, backupName: string, jianaVersion?: string) =>
    클라이언트.post(`/workspaces/${wsName}/connect`, { domain, backup_name: backupName, jiana_version: jianaVersion }),

  연결취소: (wsName: string) =>
    클라이언트.post(`/workspaces/${wsName}/cancel-connect`),

  워크스페이스해제: (wsName: string) =>
    클라이언트.post(`/workspaces/${wsName}/release`),

  도메인목록: () =>
    클라이언트.get<{id: string, name: string | null}[]>('/workspaces/domains'),

  진행률조회: (name: string) =>
    클라이언트.get(`/workspaces/${name}/progress`),

  jiana버전목록: () =>
    클라이언트.get<{ versions: string[] }>('/workspaces/jiana-versions'),

  도메인jiana설정: (domain: string) =>
    클라이언트.get<{ domain: string, jiana_version: string | null }>(`/workspaces/jiana-pref/${domain}`),

  색상변경: (name: string, color: string) =>
    클라이언트.put(`/workspaces/${name}/color`, { color }),

  // 도메인 관리
  old도메인소스목록: () =>
    클라이언트.get('/workspace-domains/old-sources'),

  도메인추가: (name: string, base_source: string, base_name: string,
    copy_dict_from?: string | null, mysql_dict_from?: string | null,
    display_name?: string | null) =>
    클라이언트.post('/workspace-domains', {
      name, base_source, base_name,
      ...(copy_dict_from ? { copy_dict_from } : {}),
      ...(mysql_dict_from ? { mysql_dict_from } : {}),
      ...(display_name ? { display_name } : {}),
    }),

  mysql도메인소스목록: () =>
    클라이언트.get('/workspace-domains/mysql-sources'),

  도메인추가진행률: (name: string) =>
    클라이언트.get(`/workspace-domains/${name}/progress`),

  진행중도메인추가목록: () =>
    클라이언트.get('/workspace-domains/active-adds'),

  도메인추가취소: (name: string) =>
    클라이언트.post(`/workspace-domains/${name}/cancel-add`),

  도메인삭제: (name: string) =>
    클라이언트.delete(`/workspace-domains/${name}`),

  도메인이름변경: (name: string, new_name: string) =>
    클라이언트.put(`/workspace-domains/${name}/rename`, { new_name }),

  도메인표시이름변경: (name: string, display_name: string) =>
    클라이언트.put(`/workspace-domains/${name}/display-name`, { display_name }),

  // 작업이력
  fetchWorkHistory: (workspace: string, domain: string) =>
    클라이언트.get('/work-history', { params: { workspace, domain } }),

  addWorkHistory: (data: {
    workspace: string; domain: string;
    action_type: string; dic_type: string;
    word?: string; head_word?: string; tail_word?: string; memo?: string;
  }) =>
    클라이언트.post('/work-history', data),

  undoWorkHistory: (id: number) =>
    클라이언트.post(`/work-history/undo/${id}`),

  // AI 분석
  searchAI: (keyword: string) =>
    클라이언트.get('/ai-analysis/search', { params: { keyword } }),

  searchAIByProvider: (keyword: string, provider: string) =>
    클라이언트.get(`/ai-analysis/search/${provider}`, { params: { keyword } }),

  getActiveProviders: () =>
    클라이언트.get<{ providers: { provider: string; model: string }[] }>('/ai-analysis/active-providers'),

  getAIPrompt: () =>
    클라이언트.get('/ai-analysis/prompt'),

  updateAIPrompt: (prompt_template: string) =>
    클라이언트.put('/ai-analysis/prompt', { prompt_template }),

  // 핫키
  getHotkeys: () =>
    클라이언트.get('/workspaces/hotkeys'),

  saveHotkeys: (hotkeys: Record<string, string>) =>
    클라이언트.put('/workspaces/hotkeys', { hotkeys }),

  // Phase 전이
  advancePhase: (workspace: string, to: 'preprocess' | 'work' | 'build' | 'verify' | 'complete' | 'finished') =>
    클라이언트.post(`/workspaces/${encodeURIComponent(workspace)}/phase/advance`, { to }),

  revertPhase: (workspace: string, to: 'preprocess' | 'work' | 'build' | 'verify' | 'complete' | 'finished') =>
    클라이언트.post(`/workspaces/${encodeURIComponent(workspace)}/phase/revert`, { to }),

  getPhase: (workspace: string) =>
    클라이언트.get(`/workspaces/${encodeURIComponent(workspace)}/phase`),

  getMyPhase: (workspace: string, domain: string) =>
    클라이언트.get(`/workspaces/${encodeURIComponent(workspace)}/my-phase`, { params: { domain } }),

  setMyPhase: (workspace: string, domain: string, phase: 'idle' | 'working' | 'done') =>
    클라이언트.put(`/workspaces/${encodeURIComponent(workspace)}/my-phase`, { domain, phase }),

  멤버상태조회: (workspace: string) =>
    클라이언트.get(`/workspaces/${encodeURIComponent(workspace)}/members-status`),

  completeWorkspace: (ws: string, domain: string, skip_backup: boolean) =>
    클라이언트.post(`/workspaces/${encodeURIComponent(ws)}/complete`, { domain, skip_backup }),

  // 2단계 완료 프로세스 (Batch 2)
  prepareComplete: (ws: string, domain: string) =>
    클라이언트.post<{ phase: string; snapshot_before: Record<string, number>; prepared_at: string }>(
      `/workspaces/${encodeURIComponent(ws)}/prepare-complete`, { domain }
    ),

  finalizeComplete: (ws: string, opts: { domain?: string; backup_folder?: string; skip_backup?: boolean; site_id?: number | null }) =>
    클라이언트.post<{ phase: string; backup_folder: string | null; snapshot_after: Record<string, number>; finished_at: string }>(
      `/workspaces/${encodeURIComponent(ws)}/finalize-complete`,
      {
        domain: opts.domain,
        ...(opts.backup_folder !== undefined ? { backup_folder: opts.backup_folder } : {}),
        skip_backup: opts.skip_backup ?? false,
        ...(opts.site_id !== undefined && opts.site_id !== null ? { site_id: opts.site_id } : {}),
      }
    ),

  getParticipantsStats: (ws: string) =>
    클라이언트.get<{ participants: { user_id: string; name: string; r_count: number; w_count: number }[] }>(
      `/workspaces/${encodeURIComponent(ws)}/participants`
    ),

  getWorkspaceSnapshots: (ws: string, domain?: string) =>
    클라이언트.get<{
      workspace: string
      domain: string | null
      phase: string
      connected_at: string | null
      prepared_at: string | null
      finished_at: string | null
      snapshot_before: Record<string, number> | null
      snapshot_after: Record<string, number> | null
      participants: any[]
    }>(`/workspaces/${encodeURIComponent(ws)}/completion-dashboard`, { params: { domain: domain || '' } }),

  // 단계별 step-log
  logStep: (workspace: string, data: { phase: string; action: string; user_id?: string; domain?: string }) =>
    클라이언트.post(`/workspaces/${encodeURIComponent(workspace)}/step-log`, data).catch(() => {}),

  // 단계별 step-report
  getStepReport: (workspace: string, domain: string) =>
    클라이언트.get<StepReportResponse>(`/workspaces/${encodeURIComponent(workspace)}/step-report`, { params: { domain } }),

  // 세션 이벤트
  logSessionEvent: (workspace: string, data: { event: string; user_id: string; domain?: string; menu?: string }) =>
    클라이언트.post(`/workspaces/${encodeURIComponent(workspace)}/session-event`, data).catch(() => {}),

  // user_session_log 기반 참여자 통계
  getParticipantStats: (workspace: string, domain: string) =>
    클라이언트.get<{ workspace: string; participants: ParticipantStat[] }>(
      `/workspaces/${encodeURIComponent(workspace)}/participant-stats`,
      { params: { domain } }
    ),

  // 워크스페이스 해제 (release)
  releaseWorkspace: (ws: string) =>
    클라이언트.post(`/workspaces/${encodeURIComponent(ws)}/release`),

  // 시스템 설정
  getSystemSettings: () =>
    클라이언트.get<Record<string, string>>('/system-settings'),

  updateSystemSettings: (key: string, value: string) =>
    클라이언트.put('/system-settings', { settings: { [key]: value } }),
}
