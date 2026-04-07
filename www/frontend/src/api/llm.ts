import 클라이언트 from './client'

export interface LLM설정 {
  id: number
  provider: string
  api_key: string
  base_url: string
  model: string
  is_active: number
  test_passed: number
  created_at: string
  updated_at: string
}

export interface 통신테스트결과 {
  success: boolean
  message: string
}

export interface 모델목록결과 {
  provider: string
  models: string[]
}

export const llmAPI = {
  설정조회: () =>
    클라이언트.get<LLM설정[]>('/llm-settings'),

  설정저장: (provider: string, data: { api_key: string; base_url: string; model: string; is_active: number }) =>
    클라이언트.put(`/llm-settings/${provider}`, data),

  통신테스트: (provider: string, data: { api_key: string; base_url: string }) =>
    클라이언트.post<통신테스트결과>(`/llm-settings/${provider}/test`, data),

  모델목록: (provider: string, api_key: string, base_url: string) =>
    클라이언트.get<모델목록결과>(`/llm-settings/${provider}/models`, {
      params: { api_key, base_url },
    }),

  활성변경: (provider: string) =>
    클라이언트.put(`/llm-settings/active/${provider}`),
}
