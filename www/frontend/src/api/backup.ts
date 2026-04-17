import 클라이언트 from './client'

export interface Backup {
  name: string
  path: string
  timestamp: string
  dict_counts: { udic?: number; cndic?: number; thesaurus?: number; category?: number }
  has_db_backup: boolean
  files: string[]
  workspace_name?: string | null
  share_url?: string | null
  has_report?: boolean
  size_mb?: number
  jiana_version?: string | null
}

export interface BackupListResponse {
  domain: string
  backups: Backup[]
  count: number
}

export interface EmailBackupResult {
  status: string
  share_url: string
  share_token: string
  message_id?: string
  [key: string]: any
}

export const backupAPI = {
  listBackups: (domain: string) =>
    클라이언트.get<BackupListResponse>('/backups/', { params: { domain } }),

  restoreBackup: (name: string, domain: string, skip_backup: boolean) =>
    클라이언트.post(`/backups/${encodeURIComponent(name)}/restore`, { domain, skip_backup }),

  deleteBackup: (name: string, domain: string) =>
    클라이언트.delete(`/backups/${encodeURIComponent(name)}`, { params: { domain } }),

  generateBackupReport: (name: string, workspace: string, prev_backup?: string | null) =>
    클라이언트.post<{ status: string; path: string; filename: string; download_url: string }>(
      `/backups/${encodeURIComponent(name)}/report`,
      { workspace, prev_backup: prev_backup || null }
    ),

  sendBackupEmail: (
    name: string,
    params: { to: string; workspace: string; share_token?: string }
  ) =>
    클라이언트.post<EmailBackupResult>(
      `/backups/${encodeURIComponent(name)}/email`,
      params
    ),

  downloadDataTarUrl: (name: string) =>
    `/api/backups/${encodeURIComponent(name)}/data-tar`,
}

// 메일 연락처 API
export const getEmailContacts = () =>
  클라이언트.get<{ id: number; name: string; email: string; created_at: string }[]>('/email-contacts')

export const createEmailContact = (data: { name: string; email: string }) =>
  클라이언트.post<{ id: number; name: string; email: string; created_at: string }>('/email-contacts', data)

export const deleteEmailContact = (id: number) =>
  클라이언트.delete(`/email-contacts/${id}`)
