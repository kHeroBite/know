import 클라이언트 from './client'

export const workspaceAPI = {
  워크스페이스목록: () =>
    클라이언트.get('/workspaces'),

  워크스페이스생성: (name: string, color?: string | null) =>
    클라이언트.post('/workspaces', { name, ...(color ? { color } : {}) }),

  워크스페이스삭제: (name: string) =>
    클라이언트.delete(`/workspaces/${name}`),

  도메인연결: (wsName: string, domain: string, jianaVersion?: string) =>
    클라이언트.post(`/workspaces/${wsName}/connect`, { domain, jiana_version: jianaVersion }),

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
  advancePhase: (workspace: string, to: 'preprocess' | 'work' | 'build' | 'verify' | 'complete') =>
    클라이언트.post(`/workspaces/${encodeURIComponent(workspace)}/phase/advance`, { to }),

  revertPhase: (workspace: string, to: 'preprocess' | 'work' | 'build' | 'verify' | 'complete') =>
    클라이언트.post(`/workspaces/${encodeURIComponent(workspace)}/phase/revert`, { to }),

  getPhase: (workspace: string) =>
    클라이언트.get(`/workspaces/${encodeURIComponent(workspace)}/phase`),

  getMyPhase: (workspace: string, domain: string) =>
    클라이언트.get(`/workspaces/${encodeURIComponent(workspace)}/my-phase`, { params: { domain } }),

  setMyPhase: (workspace: string, domain: string, phase: 'idle' | 'working' | 'done') =>
    클라이언트.put(`/workspaces/${encodeURIComponent(workspace)}/my-phase`, { domain, phase }),

  멤버상태조회: (workspace: string) =>
    클라이언트.get(`/workspaces/${encodeURIComponent(workspace)}/members-status`),
}
