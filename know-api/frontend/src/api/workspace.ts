import 클라이언트 from './client'

export const workspaceAPI = {
  워크스페이스목록: () =>
    클라이언트.get('/workspaces'),

  워크스페이스생성: (name: string) =>
    클라이언트.post('/workspaces', { name }),

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
}
