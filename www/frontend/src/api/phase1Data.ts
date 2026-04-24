import 클라이언트 from './client'

// ── 타입 정의 ──
export interface ColumnSpec {
  name: string
  split_delimiter?: string | null
}

export interface ColumnInfo {
  name: string
  samples: string[]
}

// ── 실행 페이로드 ──
export interface DataRunPayload {
  filenames: string[]
  columns: ColumnSpec[]
  workspace?: string
  domain?: string
}

export const phase1DataAPI = {
  파일목록: (workspace?: string) =>
    클라이언트.get('/preprocess/data-files', { params: { workspace: workspace || '' } }),

  파일업로드: (file: File, workspace?: string, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return 클라이언트.post('/preprocess/data-files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { workspace: workspace || '' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },

  파일삭제: (filename: string, workspace?: string) =>
    클라이언트.delete(`/preprocess/data-files/${filename}`, { params: { workspace: workspace || '' } }),

  컬럼분석: (filenames: string[], workspace?: string) =>
    클라이언트.post('/preprocess/data-analyze-columns', { filenames, workspace: workspace || '' }),

  컬럼설정조회: (domain: string) =>
    클라이언트.get('/preprocess/data-config', { params: { domain } }),

  컬럼설정저장: (domain: string, selected_columns: ColumnSpec[]) =>
    클라이언트.post('/preprocess/data-config', { domain, selected_columns }),

  실행: (payload: DataRunPayload) =>
    클라이언트.post('/preprocess/data-run', payload),

  최근실행: (workspace?: string) =>
    클라이언트.get('/preprocess/data-run/latest', { params: { workspace: workspace || '' } }),

  로그: (runId: string) =>
    클라이언트.get(`/preprocess/data-logs/${runId}`),
}
