import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  Card, Button, Table, Tag, Typography, Space, Input, Tabs, Progress,
  message, Statistic, Row, Col,
} from 'antd'
import {
  CheckCircleOutlined, SearchOutlined, ExperimentOutlined,
  WarningOutlined, CloseCircleOutlined, CheckOutlined, RedoOutlined,
} from '@ant-design/icons'
import { 사전검증API, 검증결과, 분석결과 } from '../api/dict_verify'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography

export default function DictVerify() {
  const navigate = useNavigate()
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const currentDomain = selectedDomain || ''

  // ─── 형태소분석 테스트 ────────────────────────
  const [분석키워드, set분석키워드] = useState('')
  const [분석결과목록, set분석결과목록] = useState<분석결과[]>([])
  const [분석중, set분석중] = useState(false)

  const 단일분석 = useCallback(async () => {
    const kw = 분석키워드.trim()
    if (!kw) { message.warning('키워드를 입력하세요'); return }
    set분석중(true)
    try {
      const res = await 사전검증API.형태소분석(kw, currentDomain || undefined, selectedWorkspace || undefined)
      set분석결과목록(prev => [res.data, ...prev])
    } catch {
      message.error('형태소분석 실패')
    } finally {
      set분석중(false)
    }
  }, [분석키워드, currentDomain])

  const 일괄분석 = useCallback(async () => {
    const kw = 분석키워드.trim()
    if (!kw) { message.warning('키워드를 입력하세요 (여러 개는 쉼표/줄바꿈 구분)'); return }
    const keywords = kw.split(/[,\n]+/).map(k => k.trim()).filter(Boolean)
    if (keywords.length === 0) return
    set분석중(true)
    try {
      const results: 분석결과[] = []
      for (const keyword of keywords) {
        const res = await 사전검증API.형태소분석(keyword, currentDomain || undefined, selectedWorkspace || undefined)
        results.push(res.data)
      }
      set분석결과목록(prev => [...results, ...prev])
    } catch {
      message.error('일괄 형태소분석 실패')
    } finally {
      set분석중(false)
    }
  }, [분석키워드, currentDomain])

  const 분석컬럼 = [
    { title: '키워드', dataIndex: 'keyword', key: 'keyword', width: 180 },
    {
      title: '분석 결과', dataIndex: 'result', key: 'result',
      render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{v || '-'}</Text>,
    },
    {
      title: '토큰', dataIndex: 'tokens', key: 'tokens',
      render: (v: string[]) => v && v.length > 0
        ? v.map((t, i) => <Tag key={i} style={{ fontSize: 11 }}>{t}</Tag>)
        : <Text type="secondary">-</Text>,
    },
  ]

  // ─── 사전 검증 실행 (분리형: 완료/미완료) ──────────────────────────
  const [완료검증, set완료검증] = useState<검증결과 | null>(null)
  const [미완료검증, set미완료검증] = useState<검증결과 | null>(null)
  const [검증중, set검증중] = useState(false)
  const [진행률, set진행률] = useState(0)

  // ─── 재처리 상태 ────────────────────────────────────────
  const [완료선택키워드, set완료선택키워드] = useState<Set<string>>(new Set())
  const [미작업선택키워드, set미작업선택키워드] = useState<Set<string>>(new Set())
  const [재처리중, set재처리중] = useState(false)
  const 총선택건수 = 완료선택키워드.size + 미작업선택키워드.size

  const 전체검증 = useCallback(async () => {
    if (!selectedWorkspace) { message.warning('워크스페이스가 선택되지 않았습니다'); return }
    if (!currentDomain) { message.warning('워크스페이스(도메인) 선택 필요'); return }
    set검증중(true)
    set진행률(10)
    try {
      set진행률(30)
      const res = await 사전검증API.분리검증(selectedWorkspace, currentDomain)
      set진행률(100)
      set완료검증(res.data.completed)
      set미완료검증(res.data.pending)
      const cm = res.data.completed.missing.length
      const cu = res.data.completed.ukall.length
      const pm = res.data.pending.missing.length
      const pu = res.data.pending.ukall.length
      message.info(`검증 완료 — 작업분: 누락${cm}·미등록${cu} / 미작업분: 누락${pm}·미등록${pu}`)
    } catch (e: any) {
      message.error('사전 검증 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      set검증중(false)
    }
  }, [selectedWorkspace, currentDomain])

  const 재처리실행 = useCallback(async () => {
    const allKeywords = [...완료선택키워드, ...미작업선택키워드]
    if (!selectedWorkspace || !currentDomain || allKeywords.length === 0) return
    set재처리중(true)
    try {
      await 사전검증API.재처리(selectedWorkspace, currentDomain, allKeywords)
      await useWorkspaceStore.getState().loadWorkspaceStatus()
      set완료검증(null)
      set미완료검증(null)
      set완료선택키워드(new Set())
      set미작업선택키워드(new Set())
      message.success(`${allKeywords.length}개 키워드 재처리 완료. 할당 페이지로 이동합니다.`)
      navigate('/assignment')
    } catch (e: any) {
      message.error('재처리 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      set재처리중(false)
    }
  }, [완료선택키워드, 미작업선택키워드, selectedWorkspace, currentDomain, navigate])

  // ─── 검증 결과 렌더 헬퍼 ───────────────────────────────
  const missing컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword', width: 180 },
    {
      title: '분석 결과', dataIndex: 'analysis', key: 'analysis',
      render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '상태', key: 'status', width: 100,
      render: () => <Tag color="error" icon={<CloseCircleOutlined />}>누락</Tag>,
    },
  ]
  const ukall컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    { title: '상태', key: 'status', width: 100, render: () => <Tag color="warning" icon={<WarningOutlined />}>미등록</Tag> },
  ]
  const skipped컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    { title: '상태', key: 'status', width: 100, render: () => <Tag color="success" icon={<CheckOutlined />}>통과</Tag> },
  ]

  const 결과패널 = (
    제목: string,
    결과: 검증결과 | null,
    showCheckbox: boolean,
    선택키워드: Set<string>,
    on선택변경: (keys: Set<string>) => void,
  ) => {
    if (!결과) return null
    const missing = (결과.missing || []).map((item: any, i: number) => ({ key: i, ...(typeof item === 'string' ? { keyword: item } : item) }))
    const ukall = (결과.ukall || []).map((kw: string, i: number) => ({ key: i, keyword: kw }))
    const skipped = (결과.skipped || []).map((kw: string, i: number) => ({ key: i, keyword: kw }))

    const missingRowSelection = showCheckbox ? {
      selectedRowKeys: missing.filter((r: any) => 선택키워드.has(r.keyword)).map((r: any) => r.key),
      onChange: (selectedKeys: React.Key[]) => {
        const next = new Set(선택키워드)
        missing.forEach((r: any) => next.delete(r.keyword))
        selectedKeys.forEach((k) => {
          const row = missing.find((r: any) => r.key === k)
          if (row) next.add(row.keyword)
        })
        on선택변경(next)
      },
    } : undefined

    const ukallRowSelection = showCheckbox ? {
      selectedRowKeys: ukall.filter((r: any) => 선택키워드.has(r.keyword)).map((r: any) => r.key),
      onChange: (selectedKeys: React.Key[]) => {
        const next = new Set(선택키워드)
        ukall.forEach((r: any) => next.delete(r.keyword))
        selectedKeys.forEach((k) => {
          const row = ukall.find((r: any) => r.key === k)
          if (row) next.add(row.keyword)
        })
        on선택변경(next)
      },
    } : undefined

    return (
      <Card size="small" title={제목} style={{ flex: 1 }}>
        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col span={6}><Statistic title="전체" value={결과.total} /></Col>
          <Col span={6}><Statistic title="통과" value={skipped.length} valueStyle={{ color: '#52c41a' }} prefix={<CheckOutlined />} /></Col>
          <Col span={6}><Statistic title="누락" value={missing.length} valueStyle={{ color: '#cf1322' }} prefix={<CloseCircleOutlined />} /></Col>
          <Col span={6}><Statistic title="미등록" value={ukall.length} valueStyle={{ color: '#faad14' }} prefix={<WarningOutlined />} /></Col>
        </Row>
        <Tabs defaultActiveKey="missing" items={[
          { key: 'missing', label: `누락 (${missing.length})`, children: <Table rowKey="key" dataSource={missing} columns={missing컬럼} size="small" pagination={{ pageSize: 15, showTotal: t => `${t}건` }} rowSelection={missingRowSelection} /> },
          { key: 'ukall', label: `미등록 (${ukall.length})`, children: <Table rowKey="key" dataSource={ukall} columns={ukall컬럼} size="small" pagination={{ pageSize: 15, showTotal: t => `${t}건` }} rowSelection={ukallRowSelection} /> },
          { key: 'skipped', label: `통과 (${skipped.length})`, children: <Table rowKey="key" dataSource={skipped} columns={skipped컬럼} size="small" pagination={{ pageSize: 15, showTotal: t => `${t}건` }} /> },
        ]} />
      </Card>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <PageHeader
        title="사전 검증"
        showPrev
        prevLabel="이전단계로 (사전빌드)"
        onPrev={async () => {
          try {
            await useWorkspaceStore.getState().revertPhase('build')
            navigate('/build-history')
          } catch (err: any) {
            message.error(err.response?.data?.detail || 'phase 전이 실패')
          }
        }}
      />

      {/* ═══ 형태소분석 테스트 ═══ */}
      <Card
        size="small"
        title={<><ExperimentOutlined /> 형태소분석 테스트</>}
      >
        <Space style={{ marginBottom: 12 }}>
          <Input
            placeholder="키워드 입력 (여러 개: 쉼표/줄바꿈 구분)"
            value={분석키워드}
            onChange={e => set분석키워드(e.target.value)}
            onPressEnter={단일분석}
            style={{ width: 360 }}
            allowClear
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={단일분석}
            loading={분석중}
          >
            분석
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            onClick={일괄분석}
            loading={분석중}
          >
            일괄
          </Button>
        </Space>
        {분석결과목록.length > 0 && (
          <Table
            rowKey={(_, i) => `a-${i}`}
            dataSource={분석결과목록}
            columns={분석컬럼}
            size="small"
            pagination={false}
            style={{ maxHeight: 300, overflow: 'auto' }}
          />
        )}
      </Card>

      {/* ═══ 사전 검증 실행 ═══ */}
      <Card
        size="small"
        title={<><CheckCircleOutlined /> 사전 검증 실행</>}
        extra={
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={전체검증}
            loading={검증중}
            disabled={!currentDomain || !selectedWorkspace}
          >
            전체 검증 실행
          </Button>
        }
      >
        <Text type="secondary">형태소분석(Java) 기반으로 복합어 누락·미등록어·통과 키워드를 분류합니다.</Text>
        {검증중 && (
          <div style={{ marginTop: 12 }}>
            <Progress percent={진행률} status="active" />
          </div>
        )}
      </Card>

      {/* ═══ 검증 결과 (좌: 작업완료분 / 우: 미작업분) ═══ */}
      {(완료검증 || 미완료검증) && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              danger
              icon={<RedoOutlined />}
              onClick={재처리실행}
              loading={재처리중}
              disabled={총선택건수 === 0}
            >
              선택 재처리 ({총선택건수})
            </Button>
          </div>
          <Row gutter={16}>
            <Col span={12}>{결과패널('작업 완료 키워드', 완료검증, true, 완료선택키워드, set완료선택키워드)}</Col>
            <Col span={12}>{결과패널('미작업 키워드', 미완료검증, true, 미작업선택키워드, set미작업선택키워드)}</Col>
          </Row>
        </>
      )}
    </Space>
  )
}
