import 클라이언트 from './client'

export interface Backup {
  name: string
  path: string
  timestamp: string
  dict_counts: { udic?: number; cndic?: number; thesaurus?: number; category?: number }
  has_db_backup: boolean
  files: string[]
}

export const backupAPI = {
  listBackups: (domain: string) =>
    클라이언트.get<Backup[]>('/backups', { params: { domain } }),

  restoreBackup: (name: string, domain: string, skip_backup: boolean) =>
    클라이언트.post(`/backups/${encodeURIComponent(name)}/restore`, { domain, skip_backup }),

  deleteBackup: (name: string, domain: string) =>
    클라이언트.delete(`/backups/${encodeURIComponent(name)}`, { params: { domain } }),
}
