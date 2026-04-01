import { useState, useEffect } from 'react'
import { Spin, Typography, Empty } from 'antd'
import { workspaceAPI } from '../../api/workspace'

const { Text } = Typography

interface Props {
  keyword: string
  onSearch?: () => void
}

interface AIResult {
  google?: string
  perplexity?: string
}

export default function AIAnalysis({ keyword, onSearch }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIResult | null>(null)

  useEffect(() => {
    if (!keyword) { setResult(null); return }
    let cancelled = false
    setLoading(true)
    workspaceAPI.searchAI(keyword)
      .then(({ data }) => {
        if (!cancelled) { setResult(data); onSearch?.() }
      })
      .catch(() => { if (!cancelled) setResult(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [keyword])

  if (!keyword) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Text type="secondary">키워드를 선택 후 / 키로 AI 분석</Text>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spin tip="AI 분석 중..." />
      </div>
    )
  }

  if (!result) return <Empty description="결과 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto', padding: '0 4px' }}>
      <div>
        <Text strong style={{ fontSize: 12, color: '#1890ff' }}>Google</Text>
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12,
          margin: '4px 0', lineHeight: 1.5, background: '#f8f9fa',
          padding: 8, borderRadius: 4,
        }}>
          {result.google || '결과 없음'}
        </pre>
      </div>
      <div>
        <Text strong style={{ fontSize: 12, color: '#722ed1' }}>Perplexity</Text>
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12,
          margin: '4px 0', lineHeight: 1.5, background: '#f8f9fa',
          padding: 8, borderRadius: 4,
        }}>
          {result.perplexity || '결과 없음'}
        </pre>
      </div>
    </div>
  )
}
