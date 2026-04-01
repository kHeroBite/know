import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table, Typography, Card, Tabs, Input, Button, Form, Modal,
  Popconfirm, message, Spin,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, SettingOutlined,
} from '@ant-design/icons'
import { assignmentApi, KeywordItem } from '../api/assignment'
import { workspaceAPI } from '../api/workspace'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import 클라이언트 from '../api/client'
import AIAnalysis from '../components/workspace/AIAnalysis'
import WorkHistory, { WorkHistoryRef } from '../components/workspace/WorkHistory'
import HotkeySettings from '../components/workspace/HotkeySettings'

const { Text, Title } = Typography
const PAGE_SIZE = 10

// ─── 핫키 기본값 ────────────────────────────────────────────────

const 기본핫키맵: Record<string, string> = {
  prevKeyword: 'ArrowUp',
  nextKeyword: 'ArrowDown',
  prevAnalysis: 'ArrowLeft',
  nextAnalysis: 'ArrowRight',
  registerUdic: '1',
  registerCndic: '2',
  registerThesaurus: '3',
  analyzeKeyword: '0',
  focusAnalysis: 'Home',
  tabUdic: 'Alt+1',
  tabCndic: 'Alt+2',
  tabThesaurus: 'Alt+3',
  tabMorpheme: 'Alt+0',
  aiAnalysis: '/',
  undoHistory: 'Escape',
}

function encodeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.altKey) parts.push('Alt')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  const k = e.key === ' ' ? 'Space' : e.key
  if (!['Alt', 'Control', 'Shift', 'Meta'].includes(k)) parts.push(k)
  return parts.join('+')
}

// ─── 분석결과 토큰 파싱 ─────────────────────────────────────────

interface Token {
  text: string
  index: number
  lineBreak?: boolean
}

function parseAnalysisText(text: string): Token[] {
  if (!text) return []
  const tokens: Token[] = []
  let idx = 0
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const words = line.split(/\s+/).filter(Boolean)
    words.forEach(w => {
      tokens.push({ text: w, index: idx })
      idx++
    })
    if (li < lines.length - 1) {
      tokens.push({ text: '\n', index: -1, lineBreak: true })
    }
  })
  return tokens
}

// ─── 토큰 필터 + 핫키 표시 ──────────────────────────────────────
const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home',
}
function displayKey(key: string): string {
  if (key.includes('+')) {
    return key.split('+').map(p => keyDisplayMap[p] || p).join('+')
  }
  return keyDisplayMap[key] || key
}
function isWordToken(text: string): boolean {
  return /[가-힣a-zA-Z]/.test(text)
}

// ─── 사전 컴포넌트 (DomainManage.tsx DicColumn 패턴 재사용) ────────

type DicType = 'udic' | 'cndic' | 'thesaurus'

const 사전설정: Record<DicType, { title: string; label: string }> = {
  udic: { title: '사용자사전', label: '사용자사전(udic)' },
  cndic: { title: '복합명사사전', label: '복합명사사전(cndic)' },
  thesaurus: { title: '유사어사전', label: '유사어사전(thesaurus)' },
}

function 사전컬럼(dicType: DicType) {
  return (삭제버튼: (r: any) => React.ReactNode) => {
    if (dicType === 'thesaurus') {
      return [
        { title: '키워드', dataIndex: 'head_word', key: 'head_word', ellipsis: true },
        { title: '유사어', dataIndex: 'tail_word', key: 'tail_word', ellipsis: true },
        { title: '', key: 'action', width: 50, render: (_: unknown, r: any) => 삭제버튼(r) },
      ]
    }
    return [
      { title: '단어', dataIndex: 'word', key: 'word', ellipsis: true },
      { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true },
      { title: '', key: 'action', width: 50, render: (_: unknown, r: any) => 삭제버튼(r) },
    ]
  }
}

function DicTab({ dicType, domain, refreshKey, externalSearch }: {
  dicType: DicType; domain: string; refreshKey?: number; externalSearch?: string
}) {
  const [데이터, set데이터] = useState<any[]>([])
  const [검색어, set검색어] = useState('')
  const [검색쿼리, set검색쿼리] = useState('')
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [총건수, set총건수] = useState(0)
  const [현재페이지, set현재페이지] = useState(1)
  const [form] = Form.useForm()
  const cfg = 사전설정[dicType]

  const 데이터조회 = useCallback(async () => {
    if (!domain) return
    set로딩(true)
    try {
      const 경로 = dicType === 'thesaurus' ? 'thesaurus/list' : dicType
      const res = await 클라이언트.get(`/dictionaries/${domain}/${경로}`, {
        params: { page: 현재페이지, size: 50, ...(검색쿼리 ? { search: 검색쿼리 } : {}) },
      })
      set데이터(res.data?.items || [])
      set총건수(res.data?.total || 0)
    } catch {
      message.error(`${cfg.title} 조회 실패`)
    } finally {
      set로딩(false)
    }
  }, [domain, dicType, 현재페이지, 검색쿼리])

  useEffect(() => {
    const timer = setTimeout(() => { set검색쿼리(검색어); set현재페이지(1) }, 100)
    return () => clearTimeout(timer)
  }, [검색어])

  useEffect(() => { if (domain) 데이터조회() }, [domain, 데이터조회])

  // refreshKey 변경 시 강제 리로드
  useEffect(() => {
    if (refreshKey && refreshKey > 0 && domain) 데이터조회()
  }, [refreshKey])

  // externalSearch: 외부에서 검색어 주입
  useEffect(() => {
    if (externalSearch !== undefined && externalSearch !== '') {
      set검색어(externalSearch)
    }
  }, [externalSearch])

  const 삭제 = async (record: any) => {
    try {
      const word = dicType === 'thesaurus' ? record.head_word : record.word
      await 클라이언트.delete(`/dictionaries/${domain}/${dicType}/${encodeURIComponent(word)}`)
      message.success('삭제 완료')
      데이터조회()
    } catch { message.error('삭제 실패') }
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      set저장중(true)
      await 클라이언트.post(`/dictionaries/${domain}/${dicType}`, values)
      message.success('추가 완료')
      set모달열림(false)
      form.resetFields()
      데이터조회()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('추가 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally { set저장중(false) }
  }

  const 삭제버튼 = (record: any) => (
    <Popconfirm title="삭제?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
      <Button size="small" icon={<DeleteOutlined />} danger type="text" />
    </Popconfirm>
  )

  const columns = 사전컬럼(dicType)(삭제버튼)

  const 모달폼내용 = () => {
    if (dicType === 'thesaurus') {
      return (<>
        <Form.Item name="head_word" label="키워드" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="tail_word" label="유사어" rules={[{ required: true }]}><Input /></Form.Item>
      </>)
    }
    return (<>
      <Form.Item name="word" label="단어" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="memo" label="메모"><Input /></Form.Item>
    </>)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Input
          placeholder="검색..." value={검색어} onChange={e => set검색어(e.target.value)}
          allowClear size="small" prefix={<SearchOutlined />} style={{ width: 200 }}
        />
        <Button size="small" type="primary" icon={<PlusOutlined />}
          onClick={() => { form.resetFields(); set모달열림(true) }}>추가</Button>
      </div>
      <Table
        dataSource={데이터} columns={columns}
        rowKey={dicType === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'}
        loading={로딩} size="small" scroll={{ y: 250 }}
        pagination={{
          current: 현재페이지, pageSize: 50, total: 총건수,
          showTotal: (total) => `총 ${total.toLocaleString()}건`,
          showSizeChanger: false, size: 'small',
          onChange: (page) => set현재페이지(page),
        }}
      />
      <Modal title={`${cfg.label} 추가`} open={모달열림} onOk={저장}
        onCancel={() => set모달열림(false)} confirmLoading={저장중} okText="저장" cancelText="취소">
        <Form form={form} layout="vertical">{모달폼내용()}</Form>
      </Modal>
    </div>
  )
}

// ─── 형태소분석 탭 ───────────────────────────────────────────────

function MorphemeTab({ domain, prefillKeyword, prefillTrigger }: {
  domain: string; prefillKeyword?: string; prefillTrigger?: number
}) {
  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const 분석실행 = async (value: string) => {
    const kw = value.trim()
    if (!kw) return
    setLoading(true)
    try {
      const { data } = await 클라이언트.post('/morpheme/analyze', { keyword: kw, domain })
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

  return (
    <div>
      <Input.Search
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

// ─── 메인 페이지 ─────────────────────────────────────────────────

export default function KnowledgeWork() {
  const { selectedWorkspace, selectedDomain, selectedColor } = useWorkspaceStore()
  const user = useAuthStore(s => s.user)

  // 키워드 목록
  const [items, setItems] = useState<KeywordItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [minPage, setMinPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const [selected, setSelected] = useState<KeywordItem | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 포커스/토큰
  const [isCenterFocused, setIsCenterFocused] = useState(false)
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(-1)

  // 핫키
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(기본핫키맵)
  const [hotkeyModalOpen, setHotkeyModalOpen] = useState(false)

  // 하단 탭
  const [activeTab, setActiveTab] = useState('morpheme')
  const [dicRefreshKey, setDicRefreshKey] = useState(0)
  const [thesaurusSearch, setThesaurusSearch] = useState('')
  const [udicSearch, setUdicSearch] = useState('')
  const [cndicSearch, setCndicSearch] = useState('')
  const [morphPrefillKw, setMorphPrefillKw] = useState('')
  const [morphTrigger, setMorphTrigger] = useState(0)

  // AI분석
  const [aiKeyword, setAiKeyword] = useState('')

  // 키워드 읽음/등록 추적
  const [viewedKeywordIds, setViewedKeywordIds] = useState<Set<number>>(new Set())
  const [registeredKeywordIds, setRegisteredKeywordIds] = useState<Set<number>>(new Set())

  // 작업이력
  const historyRef = useRef<WorkHistoryRef>(null)

  // ─── 키워드 목록 ────────────────────────────────────────────

  const 목록초기화 = useCallback(async () => {
    if (!selectedWorkspace || !selectedDomain || !user) return
    setLoading(true)
    try {
      const { data } = await assignmentApi.목록(
        selectedWorkspace, selectedDomain, 'assigned', 1, PAGE_SIZE, user.user_id,
      )
      setItems(data.items || [])
      setTotal(data.total || 0)
      setMinPage(1)
      setMaxPage(1)
      // REQ-12: 첫 안읽은 키워드 자동 선택
      const firstUnread = (data.items || []).find((i: KeywordItem) => i.status !== 'completed')
      if (firstUnread) {
        setSelected(firstUnread)
        setIsCenterFocused(true)
      }
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, user])

  const 다음페이지로드 = useCallback(async () => {
    if (loadingMore || loading) return
    if (items.length >= total) return
    const nextPage = maxPage + 1
    setLoadingMore(true)
    try {
      const { data } = await assignmentApi.목록(
        selectedWorkspace!, selectedDomain!, 'assigned', nextPage, PAGE_SIZE, user!.user_id,
      )
      if ((data.items || []).length > 0) {
        setItems(prev => [...prev, ...(data.items || [])])
        setMaxPage(nextPage)
        setTotal(data.total || 0)
      }
    } catch { /* 무시 */ } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, items.length, total, maxPage, selectedWorkspace, selectedDomain, user])

  const 이전페이지로드 = useCallback(async () => {
    if (loadingPrev || loading || minPage <= 1) return
    const prevPage = minPage - 1
    const prevScrollHeight = listRef.current?.scrollHeight || 0
    setLoadingPrev(true)
    try {
      const { data } = await assignmentApi.목록(
        selectedWorkspace!, selectedDomain!, 'assigned', prevPage, PAGE_SIZE, user!.user_id,
      )
      if ((data.items || []).length > 0) {
        setItems(prev => [...(data.items || []), ...prev])
        setMinPage(prevPage)
        requestAnimationFrame(() => {
          if (listRef.current) {
            const newScrollHeight = listRef.current.scrollHeight
            listRef.current.scrollTop += newScrollHeight - prevScrollHeight
          }
        })
      }
    } catch { /* 무시 */ } finally {
      setLoadingPrev(false)
    }
  }, [loadingPrev, loading, minPage, selectedWorkspace, selectedDomain, user])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 80) 다음페이지로드()
    if (scrollTop < 80 && minPage > 1) 이전페이지로드()
  }, [다음페이지로드, 이전페이지로드, minPage])

  useEffect(() => {
    목록초기화()
    setSelected(null)
    setSelectedTokenIdx(-1)
  }, [selectedWorkspace, selectedDomain])

  // REQ-20: 키워드 선택 시 자동포커스 + 첫 단어 선택
  useEffect(() => {
    if (selected?.analysis) {
      const toks = parseAnalysisText(selected.analysis).filter(t => !t.lineBreak)
      const firstWord = toks.findIndex(t => isWordToken(t.text))
      setSelectedTokenIdx(firstWord >= 0 ? firstWord : 0)
    } else {
      setSelectedTokenIdx(-1)
    }
  }, [selected])

  // ─── 토큰 ───────────────────────────────────────────────────

  const tokens = selected?.analysis ? parseAnalysisText(selected.analysis) : []
  const selectableTokens = tokens.filter(t => !t.lineBreak)
  const selectedWord = selectedTokenIdx >= 0 && selectedTokenIdx < selectableTokens.length
    ? selectableTokens[selectedTokenIdx].text : ''

  // ─── 핫키 로드 ──────────────────────────────────────────────

  useEffect(() => {
    workspaceAPI.getHotkeys()
      .then(({ data }) => {
        if (data && typeof data === 'object') {
          setHotkeys(prev => ({ ...prev, ...data }))
        }
      })
      .catch(() => { /* 기본값 사용 */ })
  }, [])

  // ─── 핫키 핸들러 ────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const encoded = encodeKeyEvent(e)
    const actionMap = Object.entries(hotkeys).reduce<Record<string, string>>(
      (acc, [action, key]) => { acc[key] = action; return acc },
      {},
    )
    const action = actionMap[encoded]
    if (!action) return

    // Home(focusAnalysis)는 항상 동작
    if (action === 'focusAnalysis') {
      e.preventDefault()
      setIsCenterFocused(true)
      return
    }

    // 나머지 핫키는 포커스 모드에서만
    if (!isCenterFocused) return
    e.preventDefault()

    switch (action) {
      case 'prevKeyword': {
        if (!items.length) break
        const curIdx = selected ? items.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx > 0 ? curIdx - 1 : 0
        setSelected(items[newIdx])
        break
      }
      case 'nextKeyword': {
        if (!items.length) break
        const curIdx = selected ? items.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx < items.length - 1 ? curIdx + 1 : items.length - 1
        setSelected(items[newIdx])
        break
      }
      case 'prevAnalysis': {
        if (!selectableTokens.length) break
        let prevIdx = selectedTokenIdx - 1
        while (prevIdx >= 0 && !isWordToken(selectableTokens[prevIdx].text)) prevIdx--
        if (prevIdx >= 0) setSelectedTokenIdx(prevIdx)
        break
      }
      case 'nextAnalysis': {
        if (!selectableTokens.length) break
        let nextIdx = selectedTokenIdx + 1
        while (nextIdx < selectableTokens.length && !isWordToken(selectableTokens[nextIdx].text)) nextIdx++
        if (nextIdx >= selectableTokens.length) {
          // REQ-21: 마지막 토큰 → 다음 키워드 자동 이동
          const curIdx = selected ? items.findIndex(i => i.id === selected.id) : -1
          if (curIdx >= 0 && curIdx < items.length - 1) {
            setSelected(items[curIdx + 1])
          } else {
            message.info('모든 키워드를 완료했습니다')
          }
        } else {
          setSelectedTokenIdx(nextIdx)
        }
        break
      }
      case 'registerUdic':
      case 'registerCndic':
      case 'registerThesaurus': {
        if (!selectedWord || !selectedDomain) break
        const dicType: DicType = action === 'registerUdic' ? 'udic'
          : action === 'registerCndic' ? 'cndic' : 'thesaurus'
        if (dicType === 'thesaurus') {
          클라이언트.post(`/dictionaries/${selectedDomain}/thesaurus`, { head_word: selectedWord, tail_word: '', memo: '' })
            .then(() => {
              message.success(`유사어사전에 "${selectedWord}" 등록`)
              setDicRefreshKey(prev => prev + 1)
              setActiveTab('thesaurus')
              setThesaurusSearch(selectedWord)
              if (selected) setRegisteredKeywordIds(prev => new Set(prev).add(selected.id))
              if (selectedWorkspace && selectedDomain) {
                workspaceAPI.addWorkHistory({
                  workspace: selectedWorkspace, domain: selectedDomain,
                  action: '유사어사전 등록', keyword: selectedWord,
                })
                historyRef.current?.reload()
              }
            })
            .catch((err: any) => {
              const detail = err?.response?.data?.detail || '등록 실패'
              message.error(detail)
            })
        } else {
          클라이언트.post(`/dictionaries/${selectedDomain}/${dicType}`, { word: selectedWord, memo: '' })
            .then(() => {
              message.success(`${사전설정[dicType].title}에 "${selectedWord}" 등록`)
              setDicRefreshKey(prev => prev + 1)
              setActiveTab(dicType)
              if (dicType === 'udic') setUdicSearch(selectedWord)
              else if (dicType === 'cndic') setCndicSearch(selectedWord)
              if (selected) setRegisteredKeywordIds(prev => new Set(prev).add(selected.id))
              if (selectedWorkspace && selectedDomain) {
                workspaceAPI.addWorkHistory({
                  workspace: selectedWorkspace, domain: selectedDomain,
                  action: `${사전설정[dicType].title} 등록`, keyword: selectedWord,
                })
                historyRef.current?.reload()
              }
            })
            .catch((err: any) => { const detail = err?.response?.data?.detail || '등록 실패'; message.error(detail) })
        }
        break
      }
      case 'analyzeKeyword': {
        const kw = selectedWord || selected?.keyword
        if (kw) {
          setActiveTab('morpheme')
          setMorphPrefillKw(kw)
          setMorphTrigger(prev => prev + 1)
        }
        break
      }
      case 'tabUdic': setActiveTab('udic'); break
      case 'tabCndic': setActiveTab('cndic'); break
      case 'tabThesaurus': setActiveTab('thesaurus'); break
      case 'tabMorpheme': setActiveTab('morpheme'); break
      case 'aiAnalysis': {
        const kw = selectedWord || selected?.keyword
        if (kw) setAiKeyword(kw)
        break
      }
      case 'undoHistory': {
        historyRef.current?.undoLatest()
        break
      }
    }
  }, [hotkeys, isCenterFocused, items, selected, selectableTokens, selectedWord, selectedDomain, selectedWorkspace])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ─── 핫키 저장 ──────────────────────────────────────────────

  const handleSaveHotkeys = useCallback((newHotkeys: Record<string, string>) => {
    setHotkeys(prev => ({ ...prev, ...newHotkeys }))
    workspaceAPI.saveHotkeys(newHotkeys)
      .then(() => message.success('핫키 설정 저장 완료'))
      .catch(() => message.error('핫키 설정 저장 실패'))
  }, [])

  // ─── Guard ──────────────────────────────────────────────────

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">워크스페이스와 도메인을 먼저 선택하세요.</Text>
      </div>
    )
  }

  // ─── 렌더링 ─────────────────────────────────────────────────

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', gap: 0 }}
      onClick={() => setIsCenterFocused(false)}
    >
      {/* 배너 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', marginBottom: 8,
        background: '#fafafa', borderBottom: '1px solid #f0f0f0', borderRadius: 6,
      }}>
        <Title level={4} style={{ margin: 0 }}>📋 작업실</Title>
        <Button
          icon={<SettingOutlined />}
          onClick={(e) => { e.stopPropagation(); setHotkeyModalOpen(true) }}
        >
          핫키설정
        </Button>
      </div>

      {/* 상단 3컬럼 */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, marginBottom: 12 }}>
        {/* 좌: 키워드 목록 */}
        <Card
          title={`키워드(${total}건)`}
          size="small"
          style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
        >
          <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto' }}>
            {loadingPrev && (
              <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
            )}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : items.map(record => (
              <div
                key={record.id}
                onClick={(e) => { e.stopPropagation(); setSelected(record); setIsCenterFocused(true); setViewedKeywordIds(prev => new Set(prev).add(record.id)) }}
                style={{
                  padding: '6px 12px', cursor: 'pointer',
                  background: selected?.id === record.id ? '#e6f4ff'
                    : registeredKeywordIds.has(record.id) ? '#FFE0E0'
                    : viewedKeywordIds.has(record.id) || record.status === 'completed' ? '#FFFDE7' : undefined,
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: record.status === 'completed' ? 'normal' : 600,
                  color: record.status === 'completed' ? '#999' : '#333',
                }}
              >
                {record.keyword}
              </div>
            ))}
            {loadingMore && (
              <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
            )}
          </div>
        </Card>

        {/* 중: 분석결과 */}
        <Card
          title={`분석결과 (${displayKey(hotkeys.focusAnalysis)})`}
          size="small"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            cursor: 'default', transition: 'all 0.3s ease',
            ...(isCenterFocused ? {
              boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
              background: selectedColor ? `${selectedColor}18` : '#FFF9C4',
              border: `2px solid ${selectedColor || '#FFF176'}`,
              transform: 'translateY(-2px)',
            } : {}),
          }}
          styles={{ body: { flex: 1, overflow: 'auto', padding: 16 } }}
          onClick={(e) => { e.stopPropagation(); setIsCenterFocused(true) }}
        >
          {selected ? (
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              {tokens.map((token, i) => {
                if (token.lineBreak) return <br key={`br-${i}`} />
                const selIdx = selectableTokens.findIndex(t => t === token)
                const isSelected = selIdx === selectedTokenIdx
                return (
                  <span
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setSelectedTokenIdx(selIdx); setIsCenterFocused(true) }}
                    style={{
                      cursor: 'pointer', padding: '1px 2px', borderRadius: 3, marginRight: 4,
                      transition: 'background 0.15s',
                      ...(isSelected ? { background: '#b3d9ff' } : {}),
                    }}
                  >
                    {token.text}
                  </span>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Text type="secondary">좌측에서 키워드를 선택하세요.</Text>
            </div>
          )}
        </Card>

        {/* 우: AI분석 + 작업이력 */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card
            title={`AI 분석 (${displayKey(hotkeys.aiAnalysis)})`}
            size="small"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 8 } }}
          >
            <AIAnalysis keyword={aiKeyword} />
          </Card>
          <Card
            title={`작업이력 (${displayKey(hotkeys.undoHistory)})`}
            size="small"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 8 } }}
          >
            <WorkHistory
              ref={historyRef}
              workspace={selectedWorkspace}
              domain={selectedDomain}
            />
          </Card>
        </div>
      </div>

      {/* 하단 탭 */}
      <Card
        size="small"
        style={{ height: 320, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, overflow: 'auto', padding: '4px 12px 12px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'morpheme',
              label: `키워드 분석 (${displayKey(hotkeys.tabMorpheme)})`,
              children: <MorphemeTab domain={selectedDomain} prefillKeyword={morphPrefillKw} prefillTrigger={morphTrigger} />,
            },
            {
              key: 'udic',
              label: `사용자사전 (${displayKey(hotkeys.tabUdic)})`,
              children: <DicTab dicType="udic" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={udicSearch} />,
            },
            {
              key: 'cndic',
              label: `복합명사사전 (${displayKey(hotkeys.tabCndic)})`,
              children: <DicTab dicType="cndic" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={cndicSearch} />,
            },
            {
              key: 'thesaurus',
              label: `유사어사전 (${displayKey(hotkeys.tabThesaurus)})`,
              children: <DicTab dicType="thesaurus" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={thesaurusSearch} />,
            },
          ]}
        />
      </Card>

      {/* 핫키 설정 모달 */}
      <HotkeySettings
        open={hotkeyModalOpen}
        onClose={() => setHotkeyModalOpen(false)}
        onSave={handleSaveHotkeys}
      />
    </div>
  )
}
