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
    클라이언트.get(`/api/phase1/files/${folder}`),

  파일업로드: (folder: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post(`/api/phase1/files/${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  파일삭제: (folder: string, filename: string) =>
    클라이언트.delete(`/api/phase1/files/${folder}/${filename}`),

  실행: (params: RunParams) =>
    클라이언트.post('/api/phase1/run', params),
}
