import 클라이언트 from './client'

export type DataFolder = 'galleria' | 'hmall' | 'thd' | 'ssf'

export const phase1DataAPI = {
  파일목록: (folder: DataFolder, workspace?: string) =>
    클라이언트.get(`/preprocess/data-files/${folder}`, { params: { workspace: workspace || '' } }),

  파일업로드: (folder: DataFolder, file: File, workspace?: string, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post(`/preprocess/data-files/${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { workspace: workspace || '' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },

  파일삭제: (folder: DataFolder, filename: string, workspace?: string) =>
    클라이언트.delete(`/preprocess/data-files/${folder}/${filename}`, { params: { workspace: workspace || '' } }),

  실행: (folder: DataFolder, workspace?: string) =>
    클라이언트.post('/preprocess/data-run', { folder, workspace: workspace || '' }),

  최근실행: (workspace?: string, folder?: string) =>
    클라이언트.get('/preprocess/data-run/latest', { params: { workspace: workspace || '', folder: folder || '' } }),

  로그: (runId: string) =>
    클라이언트.get(`/preprocess/data-logs/${runId}`),
}
