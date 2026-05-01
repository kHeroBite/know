import 클라이언트 from './client'

interface RunParams {
  domain?: string
  category: string
  filename?: string
  start_step: number
  end_step: number
  workspace?: string
  filter_mode?: string
  filter_value?: number
  rank_value?: number
  count_value?: number
  sort_by?: string
}

export const phase1API = {
  파일목록: (folder: string, workspace?: string) =>
    클라이언트.get(`/preprocess/files/${folder}`, { params: { workspace: workspace || '' } }),

  파일업로드: (folder: string, file: File, workspace?: string, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post(`/preprocess/files/${folder}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { workspace: workspace || '' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },

  파일삭제: (folder: string, filename: string, workspace?: string) =>
    클라이언트.delete(`/preprocess/files/${folder}/${filename}`, { params: { workspace: workspace || '' } }),

  실행: (params: RunParams) =>
    클라이언트.post('/preprocess/run', params),

  단계상태: (workspace?: string) =>
    클라이언트.get('/preprocess/step-status', { params: { workspace: workspace || '' } }),

  결과파일삭제: (workspace: string) =>
    클라이언트.post('/preprocess/cleanup-results', null, { params: { workspace } }),

  snapshotArchive: (workspace: string, method: 'log' | 'data') =>
    클라이언트.post<{ snapshot_id: string | null; kw_count: number; created_at: string; message?: string }>(
      '/preprocess/snapshot-archive', null, { params: { workspace, method } }
    ),

  snapshotList: (workspace: string) =>
    클라이언트.get<{ snapshots: Array<{ snapshot_id: string; method: string; created_at: string; kw_count: number }> }>(
      '/preprocess/snapshots', { params: { workspace } }
    ),

  snapshotRestore: (workspace: string, snapshotId: string) =>
    클라이언트.post<{ restored: boolean; snapshot_id: string; kw_count: number }>(
      '/preprocess/snapshot-restore', null, { params: { workspace, snapshot_id: snapshotId } }
    ),
}
