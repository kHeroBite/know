import 클라이언트 from './client'

// 파이프라인 API
export const 파이프라인API = {
  시작: (domain: string, file_path: string) =>
    클라이언트.post('/pipeline/start', { domain, file_path }),

  상태조회: (id: number) =>
    클라이언트.get(`/pipeline/${id}/status`),

  승인: (id: number, stage: string) =>
    클라이언트.post(`/pipeline/${id}/approve/${stage}`),

  취소: (id: number) =>
    클라이언트.post(`/pipeline/${id}/cancel`),

  이력조회: () =>
    클라이언트.get('/pipeline/history'),
}

// 지식작업 API
export const 지식작업API = {
  파일업로드: (formData: FormData) =>
    클라이언트.post('/knowledge/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  작업분배: (data: { assignee: string; row_count: number; file_id: number }) =>
    클라이언트.post('/knowledge/assign', data),

  작업목록: () =>
    클라이언트.get('/knowledge/tasks'),
}

// 빌드 API
export const 빌드API = {
  빌드시작: (domain: string) =>
    클라이언트.post(`/build/${domain}`),

  상태조회: (domain: string) =>
    클라이언트.get(`/build/${domain}/status`),

  이력조회: (domain: string) =>
    클라이언트.get(`/build/${domain}/history`),
}

// 사전 API
export const 사전API = {
  동기화: (domain: string) =>
    클라이언트.post(`/dictionaries/${domain}/sync`),

  초기화: (domain: string) =>
    클라이언트.post(`/dictionaries/${domain}/init`),
}
