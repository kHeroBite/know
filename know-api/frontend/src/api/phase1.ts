import 클라이언트 from './client'

interface RunParams {
  domain: string
  category: string
  filename: string
  start_step: number
  end_step: number
}

export const phase1API = {
  파일목록: (folder: string) =>
    클라이언트.get(`/api/preprocess/files/${folder}`),

  파일업로드: (folder: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post(`/api/preprocess/files/${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  파일삭제: (folder: string, filename: string) =>
    클라이언트.delete(`/api/preprocess/files/${folder}/${filename}`),

  실행: (params: RunParams) =>
    클라이언트.post('/api/preprocess/run', params),

  도메인목록: () =>
    클라이언트.get('/api/preprocess/domains'),

  도메인생성: (name: string) =>
    클라이언트.post('/api/preprocess/domains', { name }),

  도메인삭제: (name: string) =>
    클라이언트.delete(`/api/preprocess/domains/${name}`),

  도메인불러오기: (name: string) =>
    클라이언트.post(`/api/preprocess/domains/${name}/load`),
}
