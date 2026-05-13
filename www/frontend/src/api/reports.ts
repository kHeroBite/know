import 클라이언트 from './client'

export interface ReportGenerateResult {
  path: string
  filename: string
  download_url: string
}

export interface DiffItem {
  key: string
  value?: string
  before?: any
  after?: any
}

export interface DiffResponse {
  workspace: string
  current_backup: string
  prev_backup: string | null
  category: string | null
  page: number
  page_size: number
  total_added?: number
  total_removed?: number
  total_modified?: number
  added?: DiffItem[]
  removed?: DiffItem[]
  modified?: DiffItem[]
  summary?: Record<string, { added: number; removed: number; modified: number }>
}

export const reportAPI = {
  generateReport: (workspace: string, current_backup: string, prev_backup?: string | null) =>
    클라이언트.post<ReportGenerateResult>('/reports/generate', {
      workspace,
      current_backup,
      prev_backup: prev_backup || null,
    }),

  downloadReportUrl: (workspace: string, backup_folder: string) =>
    `/api/reports/download/${encodeURIComponent(workspace)}/${encodeURIComponent(backup_folder)}`,

  downloadPptFile: (workspace: string, backup_folder: string) =>
    클라이언트.get(
      `/reports/download/${encodeURIComponent(workspace)}/${encodeURIComponent(backup_folder)}`,
      { responseType: 'blob' }
    ),

  // Excel 리포트 다운로드 — PPT 패턴 미러
  downloadExcelFile: (workspace: string, backup_folder: string, prev_backup?: string) =>
    클라이언트.get(
      `/reports/download_excel/${encodeURIComponent(workspace)}/${encodeURIComponent(backup_folder)}`,
      {
        responseType: 'blob',
        params: prev_backup ? { prev_backup } : undefined,
      }
    ),

  getDiff: (
    workspace: string,
    current_backup: string,
    options?: {
      prev_backup?: string | null
      category?: 'udic' | 'cndic' | 'thesaurus' | 'category' | null
      page?: number
      page_size?: number
    }
  ) =>
    클라이언트.get<DiffResponse>('/reports/diff', {
      params: {
        workspace,
        current_backup,
        prev_backup: options?.prev_backup || undefined,
        category: options?.category || undefined,
        page: options?.page ?? 1,
        page_size: options?.page_size ?? 50,
      },
    }),
}
