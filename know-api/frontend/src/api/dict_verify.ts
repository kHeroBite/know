import 클라이언트 from './client'

export interface 검증결과 {
  missing: { keyword: string; analysis: string }[]
  ukall: string[]
  skipped: string[]
  total: number
  domain: string
}

export interface 분석결과 {
  keyword: string
  result: string
  tokens: string[]
}

export interface 파일기반검증결과 {
  missing: { keyword: string; analysis: string }[]
  ukall: string[]
  skipped: string[]
  total: number
  domain: string
  workspace: string
}

export const 사전검증API = {
  검증실행: (keywords: string[], domain: string) =>
    클라이언트.post<검증결과>('/dict-verify/run', { keywords, domain }),

  결과조회: (domain: string) =>
    클라이언트.get<검증결과>(`/dict-verify/result/${domain}`),

  형태소분석: (keyword: string, domain?: string) =>
    클라이언트.post<분석결과>('/dict-verify/analyze', { keyword, domain }),

  파일기반검증: (workspace: string, domain: string) =>
    클라이언트.post<파일기반검증결과>('/dict-verify/run-file-based', { workspace, domain }),
}
