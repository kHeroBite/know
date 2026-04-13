import { useState, useEffect, useRef, useMemo } from 'react'
import { Spin, Typography, Empty, Input, Button, Modal, message, Tabs } from 'antd'
import { EditOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { workspaceAPI } from '../../api/workspace'

const { Text } = Typography

interface Props {
  initialKeyword: string
  searchTrigger?: number
  isAdmin?: boolean
  onSearch?: () => void
  forcedTab?: { tab: string; n: number }
}

interface LocalResult {
  result?: string
  provider?: string
  model?: string
  error?: string
}

interface BaseResult {
  wikipedia?: string
  local_result?: LocalResult | null
  local_active?: boolean
  query?: string
}

interface ProviderResult {
  result?: string
  provider?: string
  model?: string
  error?: string
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
}

export default function AIAnalysis({ initialKeyword, searchTrigger, isAdmin, onSearch, forcedTab }: Props) {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState(initialKeyword || '')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [baseResult, setBaseResult] = useState<BaseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('local')
  const [hasWikiResult, setHasWikiResult] = useState(false)
  // 범용LLM: provider → { loading, result }
  const [providerResults, setProviderResults] = useState<Record<string, { loading: boolean; data: ProviderResult | null }>>({})
  const [activeProviders, setActiveProviders] = useState<{ provider: string; model: string }[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptText, setPromptText] = useState('')
  const prevInitialRef = useRef(initialKeyword)
  const pendingProvidersRef = useRef<Set<string>>(new Set())

  // 활성 범용LLM provider 목록 로드 (단일 setState로 배치 — flicker 방지)
  useEffect(() => {
    workspaceAPI.getActiveProviders()
      .then(({ data }) => {
        const generic = (data.providers || []).filter((p: any) => p.provider !== 'local')
        setActiveProviders(generic)
        setProvidersLoaded(true)
      })
      .catch(() => {
        setProvidersLoaded(true)
      })
  }, [])

  // forcedTab: 외부에서 탭 강제 전환 (PageUp/PageDown 핫키)
  useEffect(() => {
    if (forcedTab && forcedTab.tab) setActiveTab(forcedTab.tab)
  }, [forcedTab?.n])

  // initialKeyword prop 변경 시 입력값 업데이트 (키워드가 다를 때만)
  useEffect(() => {
    if (initialKeyword && initialKeyword !== prevInitialRef.current) {
      setInputValue(initialKeyword)
      prevInitialRef.current = initialKeyword
    }
  }, [initialKeyword])

  // searchTrigger 증가 시 항상 즉시 검색 (같은 키워드 반복 포함)
  useEffect(() => {
    if (searchTrigger && searchTrigger > 0 && initialKeyword) {
      setInputValue(initialKeyword)
      prevInitialRef.current = initialKeyword
      doSearch(initialKeyword)
    }
  }, [searchTrigger])

  const doSearch = (keyword: string) => {
    const kw = keyword.trim()
    if (!kw) return
    setSearchKeyword(kw)
    setLoading(true)
    setError(null)
    setHasWikiResult(false)
    setBaseResult(null)
    setProviderResults({})
    pendingProvidersRef.current.clear()
    workspaceAPI.searchAI(kw)
      .then(({ data }) => {
        setBaseResult(data)
        onSearch?.()
        const hasWiki = data.wikipedia && !data.wikipedia.includes('정보를 찾을 수 없습니다')
        setHasWikiResult(!!hasWiki)
        // 탭 초기 선택: 로컬LLM 활성이면 local, 아니면 wikipedia
        if (data.local_active && data.local_result?.result) {
          setActiveTab('local')
        } else if (hasWiki) {
          setActiveTab('wikipedia')
        } else {
          setActiveTab('local')
        }
      })
      .catch((err) => {
        setBaseResult(null)
        setError(err?.response?.data?.detail || 'AI 분석 실패')
      })
      .finally(() => setLoading(false))
  }

  const handleSearch = (val: string) => {
    const trimmed = val.trim()
    if (trimmed) doSearch(trimmed)
  }

  // 범용LLM provider 클릭 → 해당 provider 호출
  const handleProviderClick = (provider: string) => {
    if (!searchKeyword) return
    setActiveTab(provider)
    // 이미 결과 있거나 요청 진행 중이면 재사용 (이중 호출 차단)
    if (providerResults[provider]?.data) return
    if (providerResults[provider]?.loading) return
    if (pendingProvidersRef.current.has(provider)) return
    pendingProvidersRef.current.add(provider)
    setProviderResults(prev => ({ ...prev, [provider]: { loading: true, data: null } }))
    workspaceAPI.searchAIByProvider(searchKeyword, provider)
      .then(({ data }) => {
        pendingProvidersRef.current.delete(provider)
        setProviderResults(prev => ({ ...prev, [provider]: { loading: false, data } }))
      })
      .catch((err) => {
        pendingProvidersRef.current.delete(provider)
        setProviderResults(prev => ({
          ...prev,
          [provider]: {
            loading: false,
            data: { error: err?.response?.data?.detail || '호출 실패', provider, model: undefined },
          },
        }))
      })
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

  const renderTextResult = (content?: string | null, errorMsg?: string | null) => {
    if (errorMsg && (errorMsg.includes('설정되지 않았습니다') || errorMsg.includes('활성화되지 않았습니다') || errorMsg.includes('설정이 필요'))) {
      return (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            AI가 설정되지 않았습니다. 설정 페이지에서 API를 등록해주세요.
          </Text>
          <Button type="primary" size="small" icon={<SettingOutlined />} onClick={() => navigate('/llm-settings')}>
            AI 설정으로 이동
          </Button>
        </div>
      )
    }
    const hasContent = content && !content.includes('검색 결과가 없습니다')
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
            <Text type="secondary">{errorMsg || '결과 없음'}</Text>
          </div>
        )}
      </div>
    )
  }

  const renderWikiResult = () => {
    const content = baseResult?.wikipedia
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

  // 탭 구조 (label만 — children 없음)
  // providerResults를 의존성에서 완전히 제거 → 결과 수신 시 탭 구조 재생성/재마운트 없음
  const tabItems = useMemo(() => [
    ...(baseResult?.local_active ? [{
      key: 'local',
      label: <span style={{ fontSize: 11 }}>로컬LLM</span>,
    }] : []),
    {
      key: 'wikipedia',
      label: <span style={{ fontSize: 11, color: !hasWikiResult ? '#ccc' : undefined }}>Wikipedia</span>,
      disabled: !hasWikiResult,
    },
    ...(providersLoaded ? activeProviders : []).map(({ provider }) => ({
      key: provider,
      label: (
        <span style={{ fontSize: 11 }}>
          💰 {PROVIDER_LABELS[provider] || provider}
        </span>
      ),
    })),
  ], [baseResult?.local_active, hasWikiResult, providersLoaded, activeProviders])

  // 활성 탭 콘텐츠 — tabItems와 분리하여 직접 렌더링 (provider 결과 변경 시 탭 구조 재마운트 없음)
  const renderActiveTabContent = () => {
    if (activeTab === 'local') {
      return renderTextResult(baseResult?.local_result?.result, baseResult?.local_result?.error)
    }
    if (activeTab === 'wikipedia') {
      return renderWikiResult()
    }
    // 범용LLM
    const state = providerResults[activeTab]
    if (!searchKeyword) {
      return <div style={{ textAlign: 'center', padding: '12px 0' }}><Text type="secondary">검색 후 클릭하세요</Text></div>
    }
    if (!state) {
      return <div style={{ textAlign: 'center', padding: '12px 0' }}><Text type="secondary">클릭하여 분석 요청</Text></div>
    }
    if (state.loading) {
      return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin tip="분석 중..." /></div>
    }
    return renderTextResult(state.data?.result, state.data?.error)
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
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text type="danger">{error}</Text>
          </div>
        ) : !baseResult ? (
          <Empty description="결과 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <>
            <Tabs
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key)
                // 범용LLM 탭 클릭 시 호출
                if (activeProviders.some(p => p.provider === key)) {
                  handleProviderClick(key)
                }
              }}
              size="small"
              tabBarStyle={{ paddingLeft: 4, marginBottom: 0 }}
              items={tabItems}
            />
            {/* 탭 콘텐츠: tabItems와 완전히 분리하여 렌더링 — provider 결과 변경 시 탭 구조 재마운트 없음 */}
            <div style={{ marginTop: 4 }}>
              {renderActiveTabContent()}
            </div>
          </>
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
