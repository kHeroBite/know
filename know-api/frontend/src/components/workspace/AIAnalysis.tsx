import { useState, useEffect, useRef } from 'react'
import { Spin, Typography, Empty, Input, Button, Modal, message, Tabs } from 'antd'
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
  wikipedia?: string
  query?: string
}

export default function AIAnalysis({ initialKeyword, isAdmin, onSearch }: Props) {
  const [inputValue, setInputValue] = useState(initialKeyword || '')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('google')
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptText, setPromptText] = useState('')
  const prevInitialRef = useRef(initialKeyword)

  // initialKeyword prop 변경 시 입력값만 업데이트 (자동검색 안 함)
  useEffect(() => {
    if (initialKeyword && initialKeyword !== prevInitialRef.current) {
      setInputValue(initialKeyword)
      prevInitialRef.current = initialKeyword
      // / 핫키로 호출된 경우에만 자동 검색 실행
      doSearch(initialKeyword)
    }
  }, [initialKeyword])

  const doSearch = (keyword: string) => {
    const kw = keyword.trim()
    if (!kw) return
    setSearchKeyword(kw)
    setLoading(true)
    setError(null)
    workspaceAPI.searchAI(kw)
      .then(({ data }) => {
        setResult(data)
        onSearch?.()
        // 자동 탭 전환: 결과 있는 탭으로 이동
        const hasGoogle = data.google && !data.google.includes('검색 결과가 없습니다')
        const hasWiki = data.wikipedia && !data.wikipedia.includes('정보를 찾을 수 없습니다')
        if (hasGoogle) {
          setActiveTab('google')
        } else if (hasWiki) {
          setActiveTab('wikipedia')
        } else {
          setActiveTab('google')
        }
      })
      .catch((err) => {
        setResult(null)
        setError(err?.response?.data?.detail || 'AI 분석 실패')
      })
      .finally(() => setLoading(false))
  }

  const handleSearch = (val: string) => {
    const trimmed = val.trim()
    if (trimmed) doSearch(trimmed)
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

  // URL 생성: query(프롬프트 포함) 사용
  const queryText = result?.query || searchKeyword
  const googleUrl = queryText ? `https://www.google.com/search?q=${encodeURIComponent(queryText)}` : ''
  const perplexityUrl = queryText ? `https://www.perplexity.ai/search?q=${encodeURIComponent(queryText)}` : ''
  const wikiUrl = searchKeyword ? `https://ko.wikipedia.org/wiki/${encodeURIComponent(searchKeyword)}` : ''

  const renderResult = (content: string | undefined | null, linkUrl: string, linkLabel: string) => {
    const hasContent = content && !content.includes('검색 결과가 없습니다') && !content.includes('정보를 찾을 수 없습니다')
    return (
      <div style={{ padding: '0 4px' }}>
        {hasContent ? (
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12,
            margin: '4px 0', lineHeight: 1.5, background: '#f8f9fa',
            padding: 8, borderRadius: 4,
          }}>
            {content}
          </pre>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Text type="secondary">결과 없음</Text>
          </div>
        )}
        {linkUrl && (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
            🔗 {linkLabel}에서 직접 검색
          </a>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 상단: 검색 입력 + 프롬프트 수정 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <Input.Search
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onSearch={handleSearch}
          placeholder="키워드 입력 후 Enter"
          size="small"
          style={{ flex: 1 }}
          enterButton
        />
        {isAdmin && (
          <Button size="small" icon={<EditOutlined />} onClick={openPromptModal}>
            프롬프트
          </Button>
        )}
      </div>

      {/* 본문 영역 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!searchKeyword ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="secondary">키워드 입력 후 Enter로 검색</Text>
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
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            size="small"
            items={[
              {
                key: 'google',
                label: <span style={{ fontSize: 12 }}>Google</span>,
                children: renderResult(result.google, googleUrl, 'Google'),
              },
              {
                key: 'perplexity',
                label: <span style={{ fontSize: 12 }}>Perplexity</span>,
                children: (
                  <div style={{ padding: '12px 4px', textAlign: 'center' }}>
                    {perplexityUrl && (
                      <a href={perplexityUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 13 }}>
                        🔗 Perplexity에서 검색하기
                      </a>
                    )}
                  </div>
                ),
              },
              {
                key: 'wikipedia',
                label: <span style={{ fontSize: 12 }}>Wikipedia</span>,
                children: renderResult(result.wikipedia, wikiUrl, 'Wikipedia'),
              },
            ]}
          />
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
