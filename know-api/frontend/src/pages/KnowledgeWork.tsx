import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table, Typography, Card, Tabs, Input, Button, Form, Modal,
  Popconfirm, message, Spin,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons'
import { assignmentApi, KeywordItem } from '../api/assignment'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import 클라이언트 from '../api/client'

const { Text } = Typography
const PAGE_SIZE = 10

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

function DicTab({ dicType, domain }: { dicType: DicType; domain: string }) {
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

function MorphemeTab({ domain }: { domain: string }) {
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

  return (
    <div>
      <Input.Search
        placeholder="분석할 키워드를 입력하세요"
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
      {result === null && (
        <Text type="secondary">키워드를 입력하고 분석 버튼을 클릭하세요.</Text>
      )}
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────

export default function KnowledgeWork() {
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const user = useAuthStore(s => s.user)
  const [items, setItems] = useState<KeywordItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [minPage, setMinPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const [selected, setSelected] = useState<KeywordItem | null>(null)
  const [isCenterFocused, setIsCenterFocused] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

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
        // 상단 prepend 후 스크롤 위치 보정
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
    if (scrollHeight - scrollTop - clientHeight < 80) {
      다음페이지로드()
    }
    if (scrollTop < 80 && minPage > 1) {
      이전페이지로드()
    }
  }, [다음페이지로드, 이전페이지로드, minPage])

  useEffect(() => {
    목록초기화()
    setSelected(null)
  }, [selectedWorkspace, selectedDomain])

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">워크스페이스와 도메인을 먼저 선택하세요.</Text>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', gap: 0 }} onClick={() => setIsCenterFocused(false)}>
      {/* 상단 3파티션 영역 */}
      <div style={{ display: 'flex', gap: 12, height: 340, flexShrink: 0, marginBottom: 12 }}>
        {/* 좌: 키워드 목록 (인피니티 스크롤) */}
        <Card
          title={`키워드(${total}건)`}
          size="small"
          style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
        >
          <div
            ref={listRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflowY: 'auto' }}
          >
            {loadingPrev && (
              <div style={{ textAlign: 'center', padding: 8 }}>
                <Spin size="small" />
              </div>
            )}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spin />
              </div>
            ) : items.map(record => (
              <div
                key={record.id}
                onClick={(e) => { e.stopPropagation(); setSelected(record) }}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: selected?.id === record.id ? '#e6f4ff' : undefined,
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {record.keyword}
              </div>
            ))}
            {loadingMore && (
              <div style={{ textAlign: 'center', padding: 8 }}>
                <Spin size="small" />
              </div>
            )}

          </div>
        </Card>

        {/* 중: 분석결과 */}
        <Card
          title={selected ? `분석결과 — ${selected.keyword}` : '분석결과'}
          size="small"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            cursor: 'default',
            transition: 'all 0.3s ease',
            ...(isCenterFocused ? {
              boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
              background: '#f0f5ff',
              border: '2px solid #1890ff',
              transform: 'translateY(-2px)',
            } : {}),
          }}
          styles={{ body: { flex: 1, overflow: 'auto', padding: 16 } }}
          onClick={(e) => { e.stopPropagation(); setIsCenterFocused(true) }}
        >
          {selected ? (
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              fontSize: 13, margin: 0, lineHeight: 1.6,
            }}>
              {selected.analysis || '분석결과가 없습니다.'}
            </pre>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Text type="secondary">좌측에서 키워드를 선택하세요.</Text>
            </div>
          )}
        </Card>

        {/* 우: AI 분석 */}
        <Card
          title="AI 분석"
          size="small"
          style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
        >
          <Text type="secondary">AI 분석 기능은 차후 개발 예정입니다.</Text>
        </Card>
      </div>

      {/* 하단 탭 영역 */}
      <Card size="small" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} styles={{ body: { flex: 1, overflow: 'auto', padding: '4px 12px 12px' } }}>
        <Tabs
          defaultActiveKey="morpheme"
          items={[
            {
              key: 'morpheme',
              label: '키워드 분석',
              children: <MorphemeTab domain={selectedDomain} />,
            },
            {
              key: 'udic',
              label: '사용자사전',
              children: <DicTab dicType="udic" domain={selectedDomain} />,
            },
            {
              key: 'cndic',
              label: '복합명사사전',
              children: <DicTab dicType="cndic" domain={selectedDomain} />,
            },
            {
              key: 'thesaurus',
              label: '유사어사전',
              children: <DicTab dicType="thesaurus" domain={selectedDomain} />,
            },
          ]}
        />
      </Card>
    </div>
  )
}
