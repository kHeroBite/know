import React, { useState, useEffect, useRef } from 'react'
import { Input, message } from 'antd'
import 클라이언트 from '../../api/client'

export interface MorphemeTabProps {
  domain: string
  workspace?: string
  prefillKeyword?: string
  prefillTrigger?: number
  autoFocusTrigger?: number
}

/**
 * 형태소분석 탭 컴포넌트
 * - 키워드 입력 → 형태소분석 API 호출 → 결과 표시
 * - 외부에서 키워드 주입 + 자동 분석 지원
 */
export default function MorphemeTab({
  domain, workspace, prefillKeyword, prefillTrigger, autoFocusTrigger,
}: MorphemeTabProps) {
  const [keyword, setKeyword] = useState('')
  const morphInputRef = useRef<any>(null)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const 분석실행 = async (value: string) => {
    const kw = value.trim()
    if (!kw) return
    setLoading(true)
    try {
      const { data } = await 클라이언트.post('/morpheme/analyze', { keyword: kw, domain, workspace })
      setResult(data.result || '결과 없음')
    } catch {
      message.error('형태소분석 실패')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // 외부에서 키워드 주입 + 자동 분석
  useEffect(() => {
    if (prefillTrigger && prefillTrigger > 0 && prefillKeyword) {
      setKeyword(prefillKeyword)
      분석실행(prefillKeyword)
    }
  }, [prefillTrigger])

  // autoFocusTrigger: 탭 전환 시 입력 자동 포커스
  useEffect(() => {
    if (autoFocusTrigger && autoFocusTrigger > 0) {
      setTimeout(() => morphInputRef.current?.focus(), 50)
    }
  }, [autoFocusTrigger])

  return (
    <div>
      <Input.Search
        ref={morphInputRef}
        enterButton="분석"
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        onSearch={분석실행}
        loading={loading}
        style={{ maxWidth: 400, marginBottom: 12 }}
      />
      {result !== null && (
        <pre style={{
          maxHeight: 260, overflow: 'auto', padding: 12,
          background: '#f5f5f5', borderRadius: 6, fontSize: 13,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {result}
        </pre>
      )}
    </div>
  )
}
