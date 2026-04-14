import 클라이언트 from './client'

export interface KeywordItem {
  id: number
  line_num: number
  keyword: string
  analysis: string
  full_analysis?: string
  status: 'pending' | 'assigned' | 'completed'
  assigned_to: string | null
  assigned_at: string | null
  completed_at: string | null
  flag?: string
}

export interface AssignmentStats {
  total: number
  pending: number
  assigned: number
  completed: number
  reprocess_count: number
}

export const assignmentApi = {
  프리징: (workspace: string, domain: string) =>
    클라이언트.post('/assignments/freeze', null, { params: { workspace, domain } }),
  목록: (workspace: string, domain: string, filter: string, page: number, size: number, assigned_to?: string) =>
    클라이언트.get('/assignments/list', { params: { workspace, domain, filter, page, size, ...(assigned_to ? { assigned_to } : {}) } }),
  통계: (workspace: string, domain: string) =>
    클라이언트.get<AssignmentStats>('/assignments/stats', { params: { workspace, domain } }),
  할당: (workspace: string, domain: string, from_line: number, to_line: number, mode?: string) =>
    클라이언트.post('/assignments/assign', null, { params: { workspace, domain, from_line, to_line, ...(mode ? { mode } : {}) } }),
  완료: (workspace: string, domain: string) =>
    클라이언트.post('/assignments/complete', null, { params: { workspace, domain } }),
  초기화: (workspace: string, domain: string) =>
    클라이언트.post('/assignments/reset', null, { params: { workspace, domain } }),
  작업상태: (workspace: string, domain: string) =>
    클라이언트.get('/assignments/status', { params: { workspace, domain } }),
  updateFlag: (id: number, flag: string, workspace: string) =>
    클라이언트.put('/assignments/flag', null, { params: { keyword_id: id, flag, workspace } }),
  마지막읽은위치: (workspace: string, domain: string, size: number = 100) =>
    클라이언트.get('/assignments/last-read', { params: { workspace, domain, size } }),
  완료모드: (workspace: string, domain: string, mode: 'all_complete' | 'all_incomplete' | 'by_history') =>
    클라이언트.post('/assignments/complete-with-mode', { workspace, domain, mode }),
  키워드단건: (workspace: string, keywordId: number) =>
    클라이언트.get<KeywordItem>(`/assignments/keyword/${keywordId}`, { params: { workspace } }),
  마지막선택저장: (keywordId: number, workspace: string, domain: string) =>
    클라이언트.put('/assignments/last-selected', null, {
      params: { keyword_id: keywordId, workspace, domain }
    }),
  마지막선택조회: (workspace: string, domain: string) =>
    클라이언트.get<{ keyword_id: number | null }>('/assignments/last-selected', {
      params: { workspace, domain }
    }),
  키워드페이지조회: (keywordId: number, workspace: string, domain: string, size: number = 100) =>
    클라이언트.get<{ keyword_id: number; page: number; found: boolean }>('/assignments/keyword-page', {
      params: { keyword_id: keywordId, workspace, domain, size }
    }),
}
