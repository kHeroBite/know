import 클라이언트 from './client'

interface RunParams {
  category: string
  start_step: number
  end_step: number
  workspace: string
}

export const phase1API = {
  파일목록: (folder: string) =>
    클라이언트.get(`/preprocess/files/${folder}`),

  파일업로드: (folder: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post(`/preprocess/files/${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  파일삭제: (folder: string, filename: string) =>
    클라이언트.delete(`/preprocess/files/${folder}/${filename}`),

  실행: (params: RunParams) =>
    클라이언트.post('/preprocess/run', params),
}
