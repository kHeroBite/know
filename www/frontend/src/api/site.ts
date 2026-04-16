import 클라이언트 from './client'

export interface Site {
  id: number
  site_code: string
  name: string
  domain_code: string
  description?: string | null
  created_at?: string
  updated_at?: string
  orphaned?: boolean
  last_work_at?: string | null
}

export interface SiteInput {
  site_code: string
  name: string
  domain_code: string
  description?: string | null
}

export async function listSites(): Promise<Site[]> {
  const res = await 클라이언트.get<Site[]>('/sites')
  return res.data
}

export async function getSite(id: number): Promise<Site> {
  const res = await 클라이언트.get<Site>(`/sites/${id}`)
  return res.data
}

export async function createSite(data: SiteInput): Promise<Site> {
  const res = await 클라이언트.post<Site>('/sites', data)
  return res.data
}

export async function updateSite(id: number, data: SiteInput): Promise<Site> {
  const res = await 클라이언트.put<Site>(`/sites/${id}`, data)
  return res.data
}

export async function deleteSite(id: number): Promise<void> {
  await 클라이언트.delete(`/sites/${id}`)
}
