import { useState, useEffect, useRef } from 'react'
import { Spin, Typography, Empty, Input, Button, Modal, message, Tabs } from 'antd'
import { EditOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { workspaceAPI } from '../../api/workspace'

const { Text } = Typography

interface Props {
  initialKeyword: string
  isAdmin?: boolean
  onSearch?: () => void
  forcedTab?: { tab: string; n: number }
}

interface AIResult {
  llm?: string
  wikipedia?: string
  query?: string
  provider?: string
  model?: string
}

export default function AIAnalysis({ initialKeyword, isAdmin, onSearch, forcedTab }: Props) {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState(initialKeyword || '')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('llm')
  const [hasAiResult, setHasAiResult] = useState(false)
  const [hasWikiResult, setHasWikiResult] = useState(false)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptText, setPromptText] = useState('')
  const prevInitialRef = useRef(initialKeyword)

  // forcedTab: 외부에서 탭 강제 전환 (PageUp/PageDown 핫키)
  useEffect(() => {
    if (forcedTab && forcedTab.tab) setActiveTab(forcedTab.tab)
  }, [forcedTab?.n])

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
    setHasAiResult(false)
    setHasWikiResult(false)
    workspaceAPI.searchAI(kw)
      .then(({ data }) => {
        setResult(data)
        onSearch?.()
        // 자동 탭 전환: 결과 있는 탭으로 이동
        const hasLLM = data.llm && !data.llm.includes('검색 결과가 없습니다')
        const hasWiki = data.wikipedia && !data.wikipedia.includes('정보를 찾을 수 없습니다')
        setHasAiResult(!!hasLLM)
        setHasWikiResult(!!hasWiki)
        if (hasLLM) {
          setActiveTab('llm')
        } else if (hasWiki) {
          setActiveTab('wikipedia')
        } else {
          setActiveTab('llm')
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

  const wikiUrl = searchKeyword ? `https://ko.wikipedia.org/wiki/${encodeURIComponent(searchKeyword)}` : ''

  const renderLLMResult = () => {
    // LLM 미설정 에러 감지
    if (error && (error.includes('설정되지 않았습니다') || error.includes('설정이 필요'))) {
      return (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            LLM이 설정되지 않았습니다. 설정 페이지에서 API를 등록해주세요.
          </Text>
          <Button
            type="primary"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => navigate('/llm-settings')}
          >
            LLM 설정으로 이동
          </Button>
        </div>
      )
    }
    const content = result?.llm
    const hasContent = content && !content.includes('검색 결과가 없습니다')
    return (
      <div style={{ padding: '0 4px' }}>
        {hasContent ? (
          <>
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12,
              margin: '4px 0', lineHeight: 1.5, background: '#f8f9fa',
              padding: 8, borderRadius: 4,
            }}>
              {content}
            </pre>
            {result?.provider && (
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                {result.provider}{result.model ? ` · ${result.model}` : ''}
              </Text>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Text type="secondary">결과 없음</Text>
          </div>
        )}
      </div>
    )
  }

  const renderWikiResult = () => {
    const content = result?.wikipedia
    const hasContent = content && !content.includes('정보를 찾을 수 없습니다')
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
        {wikiUrl && (
          <a href={wikiUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
            🔗 Wikipedia에서 직접 검색
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
          style={{ flex: 1, maxWidth: 'calc(100% - 10px)' }}
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
        ) : error && !error.includes('설정되지 않았습니다') && !error.includes('설정이 필요') ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="danger">{error}</Text>
          </div>
        ) : !result && !error ? (
          <Empty description="결과 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            size="small"
            items={[
              {
                key: 'llm',
                label: <span style={{ fontSize: 12, color: !hasAiResult ? '#ccc' : undefined }}>AI</span>,
                disabled: !hasAiResult,
                children: renderLLMResult(),
              },
              {
                key: 'wikipedia',
                label: <span style={{ fontSize: 12, color: !hasWikiResult ? '#ccc' : undefined }}>Wikipedia</span>,
                disabled: !hasWikiResult,
                children: renderWikiResult(),
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
