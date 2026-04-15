import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { workspaceAPI } from '../api/workspace'
import {
  Card, Button, Table, Tag, Typography, Space, Input, Tabs, Progress,
  message, Statistic, Row, Col, Checkbox,
} from 'antd'
import {
  CheckCircleOutlined, SearchOutlined, ExperimentOutlined,
  WarningOutlined, CloseCircleOutlined, CheckOutlined, RedoOutlined,
} from '@ant-design/icons'
import { 사전검증API, 검증결과, 분석결과 } from '../api/dict_verify'
import PageHeader from '../components/PageHeader'

const { Text } = Typography

export default function DictVerify() {
  const navigate = useNavigate()
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const currentDomain = selectedDomain || ''

  const handleComplete = async () => {
    if (!selectedWorkspace || !selectedDomain) {
      message.warning('워크스페이스(도메인)이 선택되지 않았습니다')
      return
    }
    try {
      await useWorkspaceStore.getState().prepareComplete(selectedWorkspace, selectedDomain)
      message.success('완료 대시보드로 이동합니다. 내용 확인 후 최종 완료 버튼을 눌러주세요.')
      navigate('/work-complete')
    } catch (e: any) {
      message.error('완료 준비 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  // 페이지 진입/이탈 step-log
  useEffect(() => {
    if (!selectedWorkspace || !selectedDomain) return
    workspaceAPI.logStep(selectedWorkspace, { phase: 'verify', action: 'enter', domain: selectedDomain })
    return () => {
      workspaceAPI.logStep(selectedWorkspace, { phase: 'verify', action: 'leave', domain: selectedDomain })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspace, selectedDomain])

  // --- 형태소분석 테스트 ---
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

  // --- 사전 검증 실행 ---
  const [완료검증, set완료검증] = useState<검증결과 | null>(null)
  const [미완료검증, set미완료검증] = useState<검증결과 | null>(null)
  const [검증중, set검증중] = useState(false)
  const [진행률, set진행률] = useState(0)

  // --- 재처리 체크박스 상태 (2그룹) ---
  // 그룹1: 작업 상태
  const [selCompleted, setSelCompleted] = useState(true)   // 작업완료 기본 체크
  const [selPending, setSelPending] = useState(false)
  // 그룹2: 분류 타입
  const [selMissing, setSelMissing] = useState(true)       // 누락 기본 체크
  const [selUkall, setSelUkall] = useState(true)           // 미등록 기본 체크
  const [reprocessLoading, setReprocessLoading] = useState(false)

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
      setSelCompleted(true); setSelPending(false)
      setSelMissing(true); setSelUkall(true)
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

  // 선택 건수 계산 (교차 조합)
  const selectedCount = (() => {
    let count = 0
    if (selCompleted && 완료검증) {
      if (selMissing) count += 완료검증.missing.length
      if (selUkall) count += 완료검증.ukall.length
    }
    if (selPending && 미완료검증) {
      if (selMissing) count += 미완료검증.missing.length
      if (selUkall) count += 미완료검증.ukall.length
    }
    return count
  })()

  const canReprocess = (selCompleted || selPending) && (selMissing || selUkall) && selectedCount > 0

  const collectKeywords = useCallback((): string[] => {
    const result: string[] = []
    const pushMissing = (r: 검증결과 | null) => {
      r?.missing.forEach((item: any) => {
        const kw = typeof item === 'string' ? item : item.keyword
        if (kw) result.push(kw)
      })
    }
    const pushUkall = (r: 검증결과 | null) => {
      r?.ukall.forEach((kw: string) => result.push(kw))
    }
    if (selCompleted) {
      if (selMissing) pushMissing(완료검증)
      if (selUkall) pushUkall(완료검증)
    }
    if (selPending) {
      if (selMissing) pushMissing(미완료검증)
      if (selUkall) pushUkall(미완료검증)
    }
    return [...new Set(result)]
  }, [selCompleted, selPending, selMissing, selUkall, 완료검증, 미완료검증])

  const runReprocess = useCallback(async () => {
    const keywords = collectKeywords()
    if (!selectedWorkspace || !currentDomain || keywords.length === 0) return
    setReprocessLoading(true)
    try {
      await 사전검증API.재처리(selectedWorkspace, currentDomain, keywords)
      await useWorkspaceStore.getState().loadWorkspaceStatus()
      set완료검증(null); set미완료검증(null)
      setSelCompleted(true); setSelPending(false)
      setSelMissing(true); setSelUkall(true)
      message.success(`${keywords.length}개 키워드 재처리 완료. 할당 페이지로 이동합니다.`)
      navigate('/assignment')
    } catch (e: any) {
      message.error('재처리 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setReprocessLoading(false)
    }
  }, [collectKeywords, selectedWorkspace, currentDomain, navigate])

  // --- 컬럼 정의 ---
  const missingColumns = [
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
  const ukallColumns = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    { title: '상태', key: 'status', width: 100, render: () => <Tag color="warning" icon={<WarningOutlined />}>미등록</Tag> },
  ]
  const skippedColumns = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    { title: '상태', key: 'status', width: 100, render: () => <Tag color="success" icon={<CheckOutlined />}>통과</Tag> },
  ]

  const renderPanel = (title: string, result: 검증결과 | null) => {
    if (!result) return null
    const missing = (result.missing || []).map((item: any, i: number) => ({ key: i, ...(typeof item === 'string' ? { keyword: item } : item) }))
    const ukall = (result.ukall || []).map((kw: string, i: number) => ({ key: i, keyword: kw }))
    const skipped = (result.skipped || []).map((kw: string, i: number) => ({ key: i, keyword: kw }))
    return (
      <Card size="small" title={title} style={{ flex: 1 }}>
        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col span={6}><Statistic title="전체" value={result.total} /></Col>
          <Col span={6}><Statistic title="통과" value={skipped.length} valueStyle={{ color: '#52c41a' }} prefix={<CheckOutlined />} /></Col>
          <Col span={6}><Statistic title="누락" value={missing.length} valueStyle={{ color: '#cf1322' }} prefix={<CloseCircleOutlined />} /></Col>
          <Col span={6}><Statistic title="미등록" value={ukall.length} valueStyle={{ color: '#faad14' }} prefix={<WarningOutlined />} /></Col>
        </Row>
        <Tabs defaultActiveKey="missing" items={[
          { key: 'missing', label: `누락 (${missing.length})`, children: <Table rowKey="key" dataSource={missing} columns={missingColumns} size="small" pagination={{ pageSize: 15, showTotal: t => `${t}건` }} /> },
          { key: 'ukall', label: `미등록 (${ukall.length})`, children: <Table rowKey="key" dataSource={ukall} columns={ukallColumns} size="small" pagination={{ pageSize: 15, showTotal: t => `${t}건` }} /> },
          { key: 'skipped', label: `통과 (${skipped.length})`, children: <Table rowKey="key" dataSource={skipped} columns={skippedColumns} size="small" pagination={{ pageSize: 15, showTotal: t => `${t}건` }} /> },
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
        showNext={!!selectedWorkspace && !!selectedDomain && (!!완료검증 || !!미완료검증)}
        nextLabel="다음단계로 (완료)"
        onNext={handleComplete}
      />

      {/* 형태소분석 테스트 — 숨김 처리 (기능 코드 보존) */}
      {false && (
        <Card size="small" title={<><ExperimentOutlined /> 형태소분석 테스트</>}>
          <Space style={{ marginBottom: 12 }}>
            <Input
              placeholder="키워드 입력 (여러 개: 쉼표/줄바꿈 구분)"
              value={분석키워드}
              onChange={e => set분석키워드(e.target.value)}
              onPressEnter={단일분석}
              style={{ width: 360 }}
              allowClear
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={단일분석} loading={분석중}>분석</Button>
            <Button icon={<ExperimentOutlined />} onClick={일괄분석} loading={분석중}>일괄</Button>
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
      )}

      {/* 사전 검증 실행 */}
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
        {검증중 && <div style={{ marginTop: 12 }}><Progress percent={진행률} status="active" /></div>}
      </Card>

      {/* 검증 결과 */}
      {(완료검증 || 미완료검증) && (
        <>
          {/* 선택 재처리 컨트롤 */}
          <Card size="small" title={<><RedoOutlined /> 선택 재처리</>}>
            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space size="large">
                {/* 그룹1: 작업 상태 */}
                <Space direction="vertical" size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>작업 상태</Text>
                  <Space>
                    <Checkbox checked={selCompleted} onChange={e => setSelCompleted(e.target.checked)}>작업완료</Checkbox>
                    <Checkbox checked={selPending} onChange={e => setSelPending(e.target.checked)}>미작업</Checkbox>
                  </Space>
                </Space>
                <div style={{ width: 1, height: 36, background: '#d9d9d9' }} />
                {/* 그룹2: 분류 */}
                <Space direction="vertical" size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>분류</Text>
                  <Space>
                    <Checkbox checked={selMissing} onChange={e => setSelMissing(e.target.checked)}>누락</Checkbox>
                    <Checkbox checked={selUkall} onChange={e => setSelUkall(e.target.checked)}>미등록</Checkbox>
                  </Space>
                </Space>
              </Space>
              <Button
                type="primary"
                danger
                icon={<RedoOutlined />}
                onClick={runReprocess}
                loading={reprocessLoading}
                disabled={!canReprocess}
              >
                선택 재처리 ({selectedCount}건)
              </Button>
            </Space>
            {(selCompleted || selPending || selMissing || selUkall) && !canReprocess && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                ※ 작업 상태와 분류를 각각 1개 이상 선택해야 합니다.
              </Text>
            )}
          </Card>

          <Row gutter={16}>
            <Col span={12}>{renderPanel('작업 완료 키워드', 완료검증)}</Col>
            <Col span={12}>{renderPanel('미작업 키워드', 미완료검증)}</Col>
          </Row>
        </>
      )}
    </Space>
  )
}
