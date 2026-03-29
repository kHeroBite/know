import 클라이언트 from './client'

export interface Account {
  user_id: string
  name: string | null
  auth: string
  email: string | null
  created: string | null
  updated: string | null
}

export interface CreateAccountReq {
  user_id: string
  name: string
  password: string
  auth: string
  email?: string
}

export interface UpdateAccountReq {
  name?: string
  password?: string
  auth?: string
  email?: string
}

export const accountApi = {
  목록: () => 클라이언트.get<Account[]>('/accounts'),
  생성: (data: CreateAccountReq) => 클라이언트.post<Account>('/accounts', data),
  수정: (userId: string, data: UpdateAccountReq) => 클라이언트.put<Account>(`/accounts/${userId}`, data),
  삭제: (userId: string) => 클라이언트.delete(`/accounts/${userId}`),
  비밀번호초기화: (userId: string) => 클라이언트.post(`/accounts/${userId}/reset-password`),
  비밀번호찾기: (user_id: string, email: string) => 클라이언트.post('/auth/forgot-password', { user_id, email }),
}
