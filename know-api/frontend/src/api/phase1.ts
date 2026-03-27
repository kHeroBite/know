import 클라이언트 from './client'

interface RunParams {
  domain?: string
  category: string
  filename?: string
  start_step: number
  end_step: number
  workspace?: string
}

export const phase1API = {
  파일목록: (folder: string, workspace?: string) =>
    클라이언트.get(`/preprocess/files/${folder}`, { params: { workspace: workspace || '' } }),

  파일업로드: (folder: string, file: File, workspace?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post(`/preprocess/files/${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { workspace: workspace || '' },
    })
  },

  파일삭제: (folder: string, filename: string, workspace?: string) =>
    클라이언트.delete(`/preprocess/files/${folder}/${filename}`, { params: { workspace: workspace || '' } }),

  실행: (params: RunParams) =>
    클라이언트.post('/preprocess/run', params),
}
