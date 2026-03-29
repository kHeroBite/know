import 클라이언트 from './client'

export interface Account {
  user_id: string
  name: string | null
  auth: string
  created: string | null
  updated: string | null
}

export interface CreateAccountReq {
  user_id: string
  name: string
  password: string
  auth: string
}

export interface UpdateAccountReq {
  name?: string
  password?: string
  auth?: string
}

export const accountApi = {
  목록: () => 클라이언트.get<Account[]>('/accounts'),
  생성: (data: CreateAccountReq) => 클라이언트.post<Account>('/accounts', data),
  수정: (userId: string, data: UpdateAccountReq) => 클라이언트.put<Account>(`/accounts/${userId}`, data),
  삭제: (userId: string) => 클라이언트.delete(`/accounts/${userId}`),
}
