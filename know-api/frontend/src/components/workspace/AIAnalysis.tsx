import { useState, useEffect } from 'react'
import { Spin, Typography, Empty, Input, Button, Modal, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { workspaceAPI } from '../../api/workspace'

const { Text } = Typography

interface Props {
  initialKeyword: string
  isAdmin?: boolean
  onSearch?: () => void
}

interface AIResult {
  google?: string
  perplexity?: string
}

export default function AIAnalysis({ initialKeyword, isAdmin, onSearch }: Props) {
  const [activeKeyword, setActiveKeyword] = useState(initialKeyword || '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptText, setPromptText] = useState('')

  // initialKeyword prop 변경 시 activeKeyword 자동 업데이트 (/ 핫키 연동)
  useEffect(() => {
    setActiveKeyword(initialKeyword || '')
  }, [initialKeyword])

  // activeKeyword 변경 시 AI 검색 실행
  useEffect(() => {
    if (!activeKeyword) { setResult(null); setError(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    workspaceAPI.searchAI(activeKeyword)
      .then(({ data }) => {
        if (!cancelled) { setResult(data); onSearch?.() }
      })
      .catch((err) => { if (!cancelled) { setResult(null); setError(err?.response?.data?.detail || 'AI 분석 실패') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeKeyword])

  const handleSearch = (val: string) => {
    const trimmed = val.trim()
    if (trimmed) setActiveKeyword(trimmed)
  }

  const openPromptModal = async () => {
    setPromptModalOpen(true)
    setPromptLoading(true)
    try {
      const { data } = await workspaceAPI.getAIPrompt()
      setPromptText(data.prompt_template || '')
    } catch {
      message.error('프롬프트 로드 실패')
    } finally {
      setPromptLoading(false)
    }
  }

  const savePrompt = async () => {
    setPromptSaving(true)
    try {
      await workspaceAPI.updateAIPrompt(promptText)
      message.success('프롬프트 저장 완료')
      setPromptModalOpen(false)
    } catch {
      message.error('프롬프트 저장 실패')
    } finally {
      setPromptSaving(false)
    }
  }

  const googleUrl = activeKeyword ? `https://www.google.com/search?q=${encodeURIComponent(activeKeyword)}` : ''
  const wikiUrl = activeKeyword ? `https://ko.wikipedia.org/wiki/${encodeURIComponent(activeKeyword)}` : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 상단: 검색 입력 + 프롬프트 수정 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <Input.Search
          value={activeKeyword}
          onChange={e => setActiveKeyword(e.target.value)}
          onSearch={handleSearch}
          placeholder="키워드 직접 입력"
          size="small"
          style={{ flex: 1 }}
          enterButton
        />
        {isAdmin && (
          <Button size="small" icon={<EditOutlined />} onClick={openPromptModal}>
            프롬프트 수정
          </Button>
        )}
      </div>

      {/* 본문 영역 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!activeKeyword ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="secondary">키워드를 선택 후 / 키로 AI 분석</Text>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin tip="AI 분석 중..." />
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="danger">{error}</Text>
          </div>
        ) : !result ? (
          <Empty description="결과 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
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
            {/* URL 링크 */}
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
                🔍 Google 검색
              </a>
              <a href={wikiUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
                📖 Wikipedia
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 프롬프트 수정 모달 */}
      <Modal
        title="AI 분석 프롬프트 수정"
        open={promptModalOpen}
        onOk={savePrompt}
        onCancel={() => setPromptModalOpen(false)}
        confirmLoading={promptSaving}
        okText="저장"
        cancelText="취소"
        width={520}
      >
        {promptLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              {'{keyword}'} 자리에 선택한 키워드가 입력됩니다.
            </Text>
            <Input.TextArea
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              rows={4}
              placeholder="{keyword} 무엇인지 짧게 2줄로 설명해줘"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
