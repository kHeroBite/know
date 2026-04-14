import 클라이언트 from './client'

export interface ShareToken {
  token: string
  workspace_name: string
  backup_folder: string
  created_at: string
  expires_at: string | null
  url?: string
}

export interface PublicShareData {
  workspace: string
  backup_folder: string
  prev_backup: string | null
  metadata: Record<string, any>
  snapshot: {
    before: Record<string, number> | null
    after: Record<string, number> | null
  }
  participants: Array<{
    user_id: string
    name: string
    r_count: number
    w_count: number
  }>
}

export const shareAPI = {
  generateShare: (workspace: string, backup_folder: string, ttl_days?: number) =>
    클라이언트.post<ShareToken & { url: string }>('/share/generate', {
      workspace,
      backup_folder,
      ttl_days: ttl_days ?? 30,
    }),

  listShareTokens: (workspace: string) =>
    클라이언트.get<{ workspace: string; tokens: ShareToken[] }>('/share/list', {
      params: { workspace },
    }),

  revokeShareToken: (token: string) =>
    클라이언트.post<{ status: string; token: string }>(
      `/share/revoke/${encodeURIComponent(token)}`
    ),

  // 공개용 — 인증 없이 호출 (토큰 자체가 인증)
  getPublicShareData: (token: string) =>
    클라이언트.get<PublicShareData>(`/public/share/${encodeURIComponent(token)}`),

  publicShareReportUrl: (token: string) =>
    `/api/public/share/${encodeURIComponent(token)}/report`,

  publicShareDataTarUrl: (token: string) =>
    `/api/public/share/${encodeURIComponent(token)}/data-tar`,
}
