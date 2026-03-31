import 클라이언트 from './client'

export interface KeywordItem {
  id: number
  line_num: number
  keyword: string
  analysis: string
  status: 'pending' | 'assigned' | 'completed'
  assigned_to: string | null
  assigned_at: string | null
  completed_at: string | null
}

export interface AssignmentStats {
  total: number
  pending: number
  assigned: number
  completed: number
}

export const assignmentApi = {
  프리징: (workspace: string, domain: string) =>
    클라이언트.post('/assignments/freeze', null, { params: { workspace, domain } }),
  목록: (workspace: string, domain: string, filter: string, page: number, size: number, assigned_to?: string) =>
    클라이언트.get('/assignments/list', { params: { workspace, domain, filter, page, size, ...(assigned_to ? { assigned_to } : {}) } }),
  통계: (workspace: string, domain: string) =>
    클라이언트.get<AssignmentStats>('/assignments/stats', { params: { workspace, domain } }),
  할당: (workspace: string, domain: string, from_line: number, to_line: number) =>
    클라이언트.post('/assignments/assign', null, { params: { workspace, domain, from_line, to_line } }),
  완료: (workspace: string, domain: string) =>
    클라이언트.post('/assignments/complete', null, { params: { workspace, domain } }),
  초기화: (workspace: string, domain: string) =>
    클라이언트.post('/assignments/reset', null, { params: { workspace, domain } }),
  작업상태: (workspace: string, domain: string) =>
    클라이언트.get('/assignments/status', { params: { workspace, domain } }),
}
