import 클라이언트 from './client'

export const workspaceAPI = {
  워크스페이스목록: () =>
    클라이언트.get('/workspaces'),

  워크스페이스생성: (name: string, color?: string | null) =>
    클라이언트.post('/workspaces', { name, ...(color ? { color } : {}) }),

  워크스페이스삭제: (name: string) =>
    클라이언트.delete(`/workspaces/${name}`),

  도메인연결: (wsName: string, domain: string) =>
    클라이언트.post(`/workspaces/${wsName}/connect`, { domain }),

  워크스페이스해제: (wsName: string) =>
    클라이언트.post(`/workspaces/${wsName}/release`),

  도메인목록: () =>
    클라이언트.get('/workspaces/domains'),

  진행률조회: (name: string) =>
    클라이언트.get(`/workspaces/${name}/progress`),

  색상변경: (name: string, color: string) =>
    클라이언트.put(`/workspaces/${name}/color`, { color }),

  // 도메인 관리
  old도메인소스목록: () =>
    클라이언트.get('/workspace-domains/old-sources'),

  도메인추가: (name: string, base_source: string, base_name: string,
    copy_dict_from?: string | null, mysql_dict_from?: string | null) =>
    클라이언트.post('/workspace-domains', {
      name, base_source, base_name,
      ...(copy_dict_from ? { copy_dict_from } : {}),
      ...(mysql_dict_from ? { mysql_dict_from } : {}),
    }),

  mysql도메인소스목록: () =>
    클라이언트.get('/workspace-domains/mysql-sources'),

  도메인추가진행률: (name: string) =>
    클라이언트.get(`/workspace-domains/${name}/progress`),

  도메인삭제: (name: string) =>
    클라이언트.delete(`/workspace-domains/${name}`),

  도메인이름변경: (name: string, new_name: string) =>
    클라이언트.put(`/workspace-domains/${name}/rename`, { new_name }),

  // 작업이력
  fetchWorkHistory: (workspace: string, domain: string) =>
    클라이언트.get('/work-history', { params: { workspace, domain } }),

  addWorkHistory: (data: { workspace: string; domain: string; action: string; keyword: string; detail?: string }) =>
    클라이언트.post('/work-history', data),

  undoWorkHistory: (id: number) =>
    클라이언트.post(`/work-history/undo/${id}`),

  // AI 분석
  searchAI: (keyword: string) =>
    클라이언트.get('/ai-analysis/search', { params: { keyword } }),

  // 핫키
  getHotkeys: () =>
    클라이언트.get('/workspaces/hotkeys'),

  saveHotkeys: (hotkeys: Record<string, string>) =>
    클라이언트.put('/workspaces/hotkeys', hotkeys),
}
