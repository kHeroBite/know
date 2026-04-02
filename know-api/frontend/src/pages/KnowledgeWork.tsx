import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Table, Typography, Card, Tabs, Input, Button, Form, Modal,
  Popconfirm, message, Spin, Switch, Tag, Space, Tooltip,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, SettingOutlined, EditOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { assignmentApi, KeywordItem } from '../api/assignment'
import { workspaceAPI } from '../api/workspace'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import 클라이언트 from '../api/client'
import AIAnalysis from '../components/workspace/AIAnalysis'
import WorkHistory, { WorkHistoryRef, WorkHistoryItem } from '../components/workspace/WorkHistory'
import HotkeySettings from '../components/workspace/HotkeySettings'

const { Text, Title } = Typography
const PAGE_SIZE = 100

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
function isNavigableToken(toks: Token[], idx: number): boolean {
  const t = toks[idx]
  if (!isWordToken(t.text)) return false
  if (t.text === 'comp' && toks[idx + 1]?.text === ':') return false
  return true
}
function displayTabKey(key: string): string {
  return key.replace(/^Alt\+/, '')
}
const KbdKey = ({ children }: { children: React.ReactNode }) => {
  const [pressed, setPressed] = useState(false)
  return (
    <kbd
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: 'inline-block', padding: '1px 6px', fontSize: '11px', lineHeight: '1.4',
        color: '#444',
        background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)',
        border: '1px solid #adb5bd',
        borderBottom: pressed ? '1px solid #adb5bd' : '3px solid #adb5bd',
        borderRadius: 4,
        boxShadow: pressed
          ? '0 0px 1px rgba(0,0,0,0.1)'
          : '0 1px 0 rgba(0,0,0,0.2), 0 2px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)',
        textShadow: '0 1px 0 rgba(255,255,255,0.8)',
        fontFamily: 'monospace', whiteSpace: 'nowrap',
        cursor: 'default',
        transform: pressed ? 'translateY(1px)' : 'none',
        transition: 'transform 0.05s, box-shadow 0.05s',
        userSelect: 'none' as React.CSSProperties['userSelect'],
      }}
    >{children}</kbd>
  )
}

// ─── 사전 컴포넌트 (DomainManage.tsx DicColumn 패턴 재사용) ────────

type DicType = 'udic' | 'cndic' | 'thesaurus'

const 사전설정: Record<DicType, { title: string; label: string }> = {
  udic: { title: '사용자사전', label: '사용자사전(udic)' },
  cndic: { title: '복합명사사전', label: '복합명사사전(cndic)' },
  thesaurus: { title: '유사어사전', label: '유사어사전(thesaurus)' },
}

function 사전컬럼(dicType: DicType) {
  return (삭제버튼: (r: any) => React.ReactNode, 편집버튼?: (r: any) => React.ReactNode) => {
    if (dicType === 'thesaurus') {
      return [
        { title: '키워드', dataIndex: 'head_word', key: 'head_word', ellipsis: true },
        { title: '유사어', dataIndex: 'tail_word', key: 'tail_word', ellipsis: true },
        { title: '', key: 'action', width: 80, render: (_: unknown, r: any) => (
          <Space size={0}>
            {편집버튼?.(r)}
            {삭제버튼(r)}
          </Space>
        )},
      ]
    }
    return [
      { title: '단어', dataIndex: 'word', key: 'word', ellipsis: true },
      { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true },
      { title: '', key: 'action', width: 50, render: (_: unknown, r: any) => 삭제버튼(r) },
    ]
  }
}

function DicTab({ dicType, domain, refreshKey, externalSearch, autoFocusTrigger }: {
  dicType: DicType; domain: string; refreshKey?: number; externalSearch?: string; autoFocusTrigger?: number
}) {
  const 검색입력Ref = useRef<any>(null)
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

  // 유사어 편집 상태
  const [편집모달열림, set편집모달열림] = useState(false)
  const [편집대상, set편집대상] = useState<any>(null)
  const [편집유사어목록, set편집유사어목록] = useState<string[]>([])
  const [새유사어, set새유사어] = useState('')
  const [양방향, set양방향] = useState(false)
  const [편집저장중, set편집저장중] = useState(false)

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

  // autoFocusTrigger: 탭 전환 시 검색 입력 자동 포커스
  useEffect(() => {
    if (autoFocusTrigger && autoFocusTrigger > 0) {
      setTimeout(() => 검색입력Ref.current?.focus(), 50)
    }
  }, [autoFocusTrigger])

  const 삭제 = async (record: any) => {
    try {
      const word = dicType === 'thesaurus' ? record.head_word : record.word
      await 클라이언트.delete(`/dictionaries/${domain}/${dicType}/${encodeURIComponent(word)}`)
      message.success('삭제 완료')
      데이터조회()
    } catch { message.error('삭제 실패') }
  }

  // 유사어 편집 열기
  const 편집열기 = async (record: any) => {
    set편집대상(record)
    set양방향(false)
    set새유사어('')
    // 해당 head_word의 모든 유사어 조회
    try {
      const res = await 클라이언트.get(`/dictionaries/${domain}/thesaurus/list`, {
        params: { search: record.head_word, size: 100 },
      })
      const items = (res.data?.items || []).filter((i: any) => i.head_word === record.head_word)
      set편집유사어목록(items.map((i: any) => i.tail_word))
    } catch {
      set편집유사어목록([record.tail_word].filter(Boolean))
    }
    set편집모달열림(true)
  }

  const 유사어개별삭제 = async (tailWord: string) => {
    if (!편집대상) return
    try {
      await 클라이언트.delete(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(편집대상.head_word)}`, {
        params: { tail_word: tailWord },
      })
      set편집유사어목록(prev => prev.filter(w => w !== tailWord))
      message.success(`"${tailWord}" 삭제됨`)
    } catch {
      // tail_word 파라미터 미지원 시 fallback
      try {
        await 클라이언트.delete(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(편집대상.head_word)}`)
        set편집유사어목록(prev => prev.filter(w => w !== tailWord))
        message.success(`"${tailWord}" 삭제됨`)
      } catch { message.error('삭제 실패') }
    }
    데이터조회()
  }

  const 유사어개별추가 = async () => {
    const word = 새유사어.trim()
    if (!word || !편집대상) return
    set편집저장중(true)
    try {
      await 클라이언트.post(`/dictionaries/${domain}/thesaurus`, {
        head_word: 편집대상.head_word, tail_word: word, memo: '',
      })
      if (양방향) {
        await 클라이언트.post(`/dictionaries/${domain}/thesaurus`, {
          head_word: word, tail_word: 편집대상.head_word, memo: '',
        }).catch(() => { /* 역방향 중복 무시 */ })
      }
      set편집유사어목록(prev => [...prev, word])
      set새유사어('')
      message.success(`"${word}" 추가됨${양방향 ? ' (양방향)' : ''}`)
      데이터조회()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '추가 실패')
    } finally { set편집저장중(false) }
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

  const 편집버튼렌더 = dicType === 'thesaurus' ? (record: any) => (
    <Tooltip title="편집">
      <Button size="small" icon={<EditOutlined />} type="text" onClick={() => 편집열기(record)} />
    </Tooltip>
  ) : undefined

  const columns = 사전컬럼(dicType)(삭제버튼, 편집버튼렌더)

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
          ref={검색입력Ref}
          placeholder="검색..." value={검색어} onChange={e => set검색어(e.target.value)}
          allowClear size="small" prefix={<SearchOutlined />} style={{ width: 200 }}
        />
        <Button size="small" type="primary" icon={<PlusOutlined />}
          onClick={() => { form.resetFields(); set모달열림(true) }}>추가</Button>
      </div>
      <Table
        dataSource={데이터} columns={columns}
        rowKey={dicType === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'}
        loading={로딩} size="small" scroll={{ y: 160 }}
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

      {/* 유사어 편집 모달 */}
      {dicType === 'thesaurus' && (
        <Modal
          title={`유사어 편집: ${편집대상?.head_word || ''}`}
          open={편집모달열림}
          onCancel={() => set편집모달열림(false)}
          footer={<Button onClick={() => set편집모달열림(false)}>닫기</Button>}
          width={420}
        >
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>등록된 유사어 목록:</Text>
            <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {편집유사어목록.length === 0 ? (
                <Text type="secondary">없음</Text>
              ) : 편집유사어목록.map(w => (
                <div key={w} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 8px', borderBottom: '1px solid #f0f0f0',
                }}>
                  <span style={{ fontSize: 13 }}>{w}</span>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}
                    onClick={() => 유사어개별삭제(w)} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Input
              placeholder="새 유사어 입력"
              value={새유사어}
              onChange={e => set새유사어(e.target.value)}
              onPressEnter={유사어개별추가}
              size="small"
              style={{ flex: 1 }}
            />
            <Button size="small" type="primary" onClick={유사어개별추가} loading={편집저장중}>추가</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch size="small" checked={양방향} onChange={set양방향} />
            <Text style={{ fontSize: 12 }}>
              {양방향 ? (
                <><SwapOutlined /> 양방향 (A↔B 모두 등록)</>
              ) : (
                <>단방향 (A→B만 등록)</>
              )}
            </Text>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── 형태소분석 탭 ───────────────────────────────────────────────

function MorphemeTab({ domain, prefillKeyword, prefillTrigger, autoFocusTrigger }: {
  domain: string; prefillKeyword?: string; prefillTrigger?: number; autoFocusTrigger?: number
}) {
  const [keyword, setKeyword] = useState('')
  const morphInputRef = useRef<any>(null)
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
  const itemRefs = useRef<{[key: number]: HTMLDivElement | null}>({})

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
  const [udicFocusTrigger, setUdicFocusTrigger] = useState(0)
  const [cndicFocusTrigger, setCndicFocusTrigger] = useState(0)
  const [thesaurusFocusTrigger, setThesaurusFocusTrigger] = useState(0)
  const [morphFocusTrigger, setMorphFocusTrigger] = useState(0)
  const [escKeyword, setEscKeyword] = useState<string | null>(null)
  const [escCount, setEscCount] = useState<number>(0)

  // AI분석
  const [aiKeyword, setAiKeyword] = useState('')

  // 키워드 카운트
  const [workedCount, setWorkedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // 작업이력
  const historyRef = useRef<WorkHistoryRef>(null)
  const selectLastTokenRef = useRef(false)

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
      setWorkedCount(data.worked_count || 0)
      setTotalCount(data.total_count || data.total || 0)
      setMinPage(1)
      setMaxPage(1)
      // REQ-12: 마지막 작업한 키워드 자동 선택 (이어서 작업하기 위해)
      const allItems = data.items || []
      const lastWorked = [...allItems].reverse().find((i: KeywordItem) => i.flag === 'W' || i.flag === 'R')
      const target = lastWorked || allItems[0]
      if (target) {
        setSelected(target)
        setIsCenterFocused(true)
        if (!target.flag) {
          assignmentApi.updateFlag(target.id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === target.id ? { ...i, flag: 'R' } : i))
        }
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

  // REQ-20: 키워드 선택 시 자동포커스 + 첫/마지막 단어 선택
  useEffect(() => {
    if (selected?.analysis) {
      const toks = parseAnalysisText(selected.analysis).filter(t => !t.lineBreak)
      if (selectLastTokenRef.current) {
        let lastIdx = toks.length - 1
        while (lastIdx >= 0 && !isNavigableToken(toks, lastIdx)) lastIdx--
        setSelectedTokenIdx(lastIdx >= 0 ? lastIdx : 0)
        selectLastTokenRef.current = false
      } else {
        const firstWord = toks.findIndex((_, idx) => isNavigableToken(toks, idx))
        setSelectedTokenIdx(firstWord >= 0 ? firstWord : 0)
      }
    } else {
      setSelectedTokenIdx(-1)
    }
  }, [selected])

  // 선택 키워드 자동 중앙 스크롤
  useEffect(() => {
    if (selected && itemRefs.current[selected.id]) {
      itemRefs.current[selected.id]!.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [selected])

  // ─── 토큰 ───────────────────────────────────────────────────

  const tokens = selected?.analysis ? parseAnalysisText(selected.analysis) : []
  const selectableTokens = tokens.filter(t => !t.lineBreak)
  const selectedWord = selectedTokenIdx >= 0 && selectedTokenIdx < selectableTokens.length
    ? selectableTokens[selectedTokenIdx].text : ''

  // 선택 키워드 자동 클립보드 복사 (HTTP 환경: navigator.clipboard 없을 수 있음)
  useEffect(() => {
    if (selectedWord) {
      navigator.clipboard?.writeText(selectedWord).catch(() => {})
    }
  }, [selectedWord])

  // ─── 핫키 로드 ──────────────────────────────────────────────

  useEffect(() => {
    workspaceAPI.getHotkeys()
      .then(({ data }) => {
        if (data?.hotkeys && typeof data.hotkeys === 'object') {
          setHotkeys(prev => ({ ...prev, ...data.hotkeys }))
        }
      })
      .catch(() => { /* 기본값 사용 */ })
  }, [])

  // ─── derivedHotkeys: 등록키 기반 탭 단축키 ─────────────────
  const derivedHotkeys = useMemo(() => ({
    tabUdic: 'Alt+' + (hotkeys.registerUdic || '1'),
    tabCndic: 'Alt+' + (hotkeys.registerCndic || '2'),
    tabThesaurus: 'Alt+' + (hotkeys.registerThesaurus || '3'),
    tabMorpheme: 'Alt+' + (hotkeys.analyzeKeyword || '0'),
  }), [hotkeys.registerUdic, hotkeys.registerCndic, hotkeys.registerThesaurus, hotkeys.analyzeKeyword])

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

    // Alt+N 탭 전환은 항상 동작 (포커스 모드 무관) + 자동 포커스
    if (encoded === derivedHotkeys.tabUdic) {
      e.preventDefault(); setActiveTab('udic'); setUdicFocusTrigger(prev => prev + 1); return
    }
    if (encoded === derivedHotkeys.tabCndic) {
      e.preventDefault(); setActiveTab('cndic'); setCndicFocusTrigger(prev => prev + 1); return
    }
    if (encoded === derivedHotkeys.tabThesaurus) {
      e.preventDefault(); setActiveTab('thesaurus'); setThesaurusFocusTrigger(prev => prev + 1); return
    }
    if (encoded === derivedHotkeys.tabMorpheme) {
      e.preventDefault(); setActiveTab('morpheme'); setMorphFocusTrigger(prev => prev + 1); return
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
        if (!items[newIdx].flag) {
          assignmentApi.updateFlag(items[newIdx].id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === items[newIdx].id ? { ...i, flag: 'R' } : i))
        }
        break
      }
      case 'nextKeyword': {
        if (!items.length) break
        const curIdx = selected ? items.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx < items.length - 1 ? curIdx + 1 : items.length - 1
        setSelected(items[newIdx])
        if (!items[newIdx].flag) {
          assignmentApi.updateFlag(items[newIdx].id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === items[newIdx].id ? { ...i, flag: 'R' } : i))
        }
        break
      }
      case 'prevAnalysis': {
        if (!selectableTokens.length) break
        let prevIdx = selectedTokenIdx - 1
        while (prevIdx >= 0 && !isNavigableToken(selectableTokens, prevIdx)) prevIdx--
        if (prevIdx >= 0) {
          setSelectedTokenIdx(prevIdx)
        } else {
          const curIdx = selected ? items.findIndex(i => i.id === selected.id) : -1
          if (curIdx > 0) {
            selectLastTokenRef.current = true
            setSelected(items[curIdx - 1])
            if (!items[curIdx - 1].flag) {
              assignmentApi.updateFlag(items[curIdx - 1].id, 'R').catch(() => {})
              setItems(prev => prev.map(i => i.id === items[curIdx - 1].id ? { ...i, flag: 'R' } : i))
            }
          }
        }
        break
      }
      case 'nextAnalysis': {
        if (!selectableTokens.length) break
        let nextIdx = selectedTokenIdx + 1
        while (nextIdx < selectableTokens.length && !isNavigableToken(selectableTokens, nextIdx)) nextIdx++
        if (nextIdx >= selectableTokens.length) {
          // REQ-21: 마지막 토큰 → 다음 키워드 자동 이동
          const curIdx = selected ? items.findIndex(i => i.id === selected.id) : -1
          if (curIdx >= 0 && curIdx < items.length - 1) {
            setSelected(items[curIdx + 1])
            if (!items[curIdx + 1].flag) {
              assignmentApi.updateFlag(items[curIdx + 1].id, 'R').catch(() => {})
              setItems(prev => prev.map(i => i.id === items[curIdx + 1].id ? { ...i, flag: 'R' } : i))
            }
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
              setEscKeyword(selectedWord)
              setEscCount(0)
              setDicRefreshKey(prev => prev + 1)
              setActiveTab('thesaurus')
              setThesaurusSearch(selectedWord)
              if (selected) {
                assignmentApi.updateFlag(selected.id, 'W').catch(() => {})
                setItems(prev => prev.map(i => i.id === selected.id ? { ...i, flag: 'W' } : i))
              }
              if (selectedWorkspace && selectedDomain) {
                workspaceAPI.addWorkHistory({
                  workspace: selectedWorkspace, domain: selectedDomain,
                  action_type: 'add', dic_type: 'thesaurus', head_word: selectedWord, tail_word: '', word: selectedWord,
                })
                historyRef.current?.reload()
              }
            })
            .catch((err: any) => {
              const detail = typeof err?.response?.data?.detail === 'string'
                ? err.response.data.detail
                : Array.isArray(err?.response?.data?.detail)
                  ? err.response.data.detail.map((d: any) => d.msg || d).join(', ')
                  : err?.response?.data?.message || err?.message || '등록 실패'
              message.error(detail)
            })
        } else {
          클라이언트.post(`/dictionaries/${selectedDomain}/${dicType}`, { word: selectedWord, memo: '' })
            .then(() => {
              message.success(`${사전설정[dicType].title}에 "${selectedWord}" 등록`)
              setEscKeyword(selectedWord)
              setEscCount(0)
              setDicRefreshKey(prev => prev + 1)
              setActiveTab(dicType)
              if (dicType === 'udic') setUdicSearch(selectedWord)
              else if (dicType === 'cndic') setCndicSearch(selectedWord)
              if (selected) {
                assignmentApi.updateFlag(selected.id, 'W').catch(() => {})
                setItems(prev => prev.map(i => i.id === selected.id ? { ...i, flag: 'W' } : i))
              }
              if (selectedWorkspace && selectedDomain) {
                workspaceAPI.addWorkHistory({
                  workspace: selectedWorkspace, domain: selectedDomain,
                  action_type: 'add', dic_type: dicType, head_word: selectedWord, word: selectedWord,
                })
                historyRef.current?.reload()
              }
            })
            .catch((err: any) => {
              const detail = typeof err?.response?.data?.detail === 'string'
                ? err.response.data.detail
                : Array.isArray(err?.response?.data?.detail)
                  ? err.response.data.detail.map((d: any) => d.msg || d).join(', ')
                  : err?.response?.data?.message || err?.message || '등록 실패'
              message.error(detail)
            })
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
      case 'aiAnalysis': {
        const kw = selectedWord || selected?.keyword
        if (kw) setAiKeyword(kw)
        break
      }
      case 'undoHistory': {
        if (escKeyword && escCount < 3) {
          historyRef.current?.undoLatestForKeyword(escKeyword || '')
          setEscCount(prev => prev + 1)
        }
        break
      }
    }
  }, [hotkeys, derivedHotkeys, isCenterFocused, items, selected, selectableTokens, selectedWord, selectedDomain, selectedWorkspace, escKeyword, escCount])

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

  // ─── Undo 콜백 ───────────────────────────────────────────────
  const handleUndoDone = useCallback((item: WorkHistoryItem) => {
    const tabMap: Record<string, string> = { udic: 'udic', cndic: 'cndic', thesaurus: 'thesaurus' }
    const tab = tabMap[item.dic_type] || 'udic'
    setActiveTab(tab)
    const word = item.word || item.head_word || ''
    if (tab === 'udic') setUdicSearch(word)
    else if (tab === 'cndic') setCndicSearch(word)
    else if (tab === 'thesaurus') setThesaurusSearch(word)
    setDicRefreshKey(prev => prev + 1)
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
          단축키설정
        </Button>
      </div>

      {/* 3컬럼 메인 */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* 좌측열: 키워드목록 + 키워드분석 */}
        <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={`키워드(${workedCount}/${totalCount})`}
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
          >
            <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto' }}>
              {loadingPrev && (
                <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
              )}
              {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              ) : items.map((record, index) => (
                <div
                  key={record.id}
                  ref={(el) => { itemRefs.current[record.id] = el }}
                  onClick={(e) => {
                    e.stopPropagation(); setSelected(record); setIsCenterFocused(true)
                    if (!record.flag) {
                      assignmentApi.updateFlag(record.id, 'R').catch(() => {})
                      setItems(prev => prev.map(i => i.id === record.id ? { ...i, flag: 'R' } : i))
                    }
                  }}
                  style={{
                    padding: '6px 12px', cursor: 'pointer',
                    background: record.flag === 'W' ? '#FCE4EC' : record.flag === 'R' ? '#FFF9C4' : 'white',
                    boxShadow: selected?.id === record.id ? 'inset 0 0 0 1px #000' : undefined,
                    borderBottom: selected?.id === record.id ? undefined : '1px solid #f0f0f0',
                    fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: selected?.id === record.id ? 600 : 'normal',
                    color: record.status === 'completed' ? '#999' : '#333',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ width: 28, flexShrink: 0, textAlign: 'right', color: '#999', fontSize: 12 }}>
                      {index + 1}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.keyword}
                    </span>
                  </div>
                </div>
              ))}
              {loadingMore && (
                <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
              )}
            </div>
          </Card>
          <Card
            title={<span>키워드 분석 <KbdKey>{displayTabKey(derivedHotkeys.tabMorpheme)}</KbdKey></span>}
            size="small"
            style={{ height: 350, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: '4px 12px 12px' } }}
          >
            <MorphemeTab domain={selectedDomain} prefillKeyword={morphPrefillKw} prefillTrigger={morphTrigger} autoFocusTrigger={morphFocusTrigger} />
          </Card>
        </div>

        {/* 중앙열: 분석결과 + 사전탭 */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={<span>분석결과 <KbdKey>{displayKey(hotkeys.focusAnalysis)}</KbdKey></span>}
            size="small"
            style={{
              flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
              cursor: 'default', transition: 'all 0.3s ease',
              ...(isCenterFocused ? {
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                outline: `2px solid ${selectedColor || '#faad14'}`,
                transform: 'translateY(-2px)',
              } : {}),
            }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
            onClick={(e) => { e.stopPropagation(); setIsCenterFocused(true) }}
          >
            <div style={{
              padding: 16, minHeight: '100%', transition: 'background-color 0.3s ease',
              backgroundColor: isCenterFocused ? '#FFFDE7' : undefined,
            }}>
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
                        ...(isSelected ? { background: '#FCE4EC' } : {}),
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
            </div>
          </Card>
          <Card
            size="small"
            style={{ height: 350, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'hidden', padding: '4px 12px 12px' } }}
          >
            <Tabs
              activeKey={['udic', 'cndic', 'thesaurus'].includes(activeTab) ? activeTab : 'udic'}
              onChange={(key) => {
                setActiveTab(key)
                if (key === 'udic') setUdicFocusTrigger(prev => prev + 1)
                else if (key === 'cndic') setCndicFocusTrigger(prev => prev + 1)
                else if (key === 'thesaurus') setThesaurusFocusTrigger(prev => prev + 1)
              }}
              items={[
                {
                  key: 'udic',
                  label: <span>사용자사전 <KbdKey>{displayTabKey(derivedHotkeys.tabUdic)}</KbdKey></span>,
                  children: <DicTab dicType="udic" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={udicSearch} autoFocusTrigger={udicFocusTrigger} />,
                },
                {
                  key: 'cndic',
                  label: <span>복합명사사전 <KbdKey>{displayTabKey(derivedHotkeys.tabCndic)}</KbdKey></span>,
                  children: <DicTab dicType="cndic" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={cndicSearch} autoFocusTrigger={cndicFocusTrigger} />,
                },
                {
                  key: 'thesaurus',
                  label: <span>유사어사전 <KbdKey>{displayTabKey(derivedHotkeys.tabThesaurus)}</KbdKey></span>,
                  children: <DicTab dicType="thesaurus" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={thesaurusSearch} autoFocusTrigger={thesaurusFocusTrigger} />,
                },
              ]}
            />
          </Card>
        </div>

        {/* 우측열: AI분석(~200px 고정) + 작업이력(flex:1) */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={<span>AI 분석 <KbdKey>{displayKey(hotkeys.aiAnalysis)}</KbdKey></span>}
            size="small"
            style={{ height: 400, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 8 } }}
          >
            <AIAnalysis initialKeyword={aiKeyword} isAdmin={user?.auth === 'A'} />
          </Card>
          <Card
            title={<span>작업이력 <KbdKey>{displayKey(hotkeys.undoHistory)}</KbdKey></span>}
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 8 } }}
          >
            <WorkHistory
              ref={historyRef}
              workspace={selectedWorkspace}
              domain={selectedDomain}
              onUndo={handleUndoDone}
            />
          </Card>
        </div>
      </div>

      {/* 핫키 설정 모달 */}
      <HotkeySettings
        open={hotkeyModalOpen}
        onClose={() => setHotkeyModalOpen(false)}
        onSave={handleSaveHotkeys}
      />
    </div>
  )
}
