import { useState, useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  Card, Button, Table, Tag, Typography, Space, Input, Tabs, Progress,
  message, Statistic, Row, Col,
} from 'antd'
import {
  CheckCircleOutlined, SearchOutlined, ExperimentOutlined,
  WarningOutlined, CloseCircleOutlined, CheckOutlined,
} from '@ant-design/icons'
import { 사전검증API, 파일기반검증결과, 분석결과 } from '../api/dict_verify'

const { Title, Text } = Typography

export default function DictVerify() {
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
      const res = await 사전검증API.형태소분석(kw, currentDomain || undefined)
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
        const res = await 사전검증API.형태소분석(keyword, currentDomain || undefined)
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

  // ─── 사전 검증 실행 (파일 기반) ──────────────────────────
  const [검증결과, set검증결과] = useState<파일기반검증결과 | null>(null)
  const [검증중, set검증중] = useState(false)
  const [진행률, set진행률] = useState(0)

  const 전체검증 = useCallback(async () => {
    if (!selectedWorkspace) { message.warning('워크스페이스가 선택되지 않았습니다'); return }
    if (!currentDomain) { message.warning('워크스페이스(도메인) 선택 필요'); return }
    set검증중(true)
    set진행률(10)
    try {
      set진행률(30)
      const res = await 사전검증API.파일기반검증(selectedWorkspace, currentDomain)
      set진행률(100)
      set검증결과(res.data)
      const { missing, ukall } = res.data
      const 누락합계 = missing.length + ukall.length
      if (누락합계 === 0) {
        message.success('검증 완료 — 누락 키워드 없음')
      } else {
        message.info(`검증 완료 — 누락 ${missing.length} · 미등록 ${ukall.length}`)
      }
    } catch (e: any) {
      message.error('사전 검증 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      set검증중(false)
    }
  }, [selectedWorkspace, currentDomain])

  // ─── 검증 결과 ───────────────────────────────
  const missing목록 = (검증결과?.missing || []).map((item, i) => ({ key: i, ...item }))
  const ukall목록 = (검증결과?.ukall || []).map((kw, i) => ({ key: i, keyword: kw }))
  const skipped목록 = (검증결과?.skipped || []).map((kw, i) => ({ key: i, keyword: kw }))

  const missing컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword', width: 180 },
    {
      title: '분석 결과', dataIndex: 'analysis', key: 'analysis',
      render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '상태', key: 'status', width: 120,
      render: () => <Tag color="error" icon={<CloseCircleOutlined />}>복합어 누락</Tag>,
    },
  ]

  const ukall컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    {
      title: '상태', key: 'status', width: 120,
      render: () => <Tag color="warning" icon={<WarningOutlined />}>미등록어</Tag>,
    },
  ]

  const skipped컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    {
      title: '상태', key: 'status', width: 120,
      render: () => <Tag color="success" icon={<CheckOutlined />}>통과</Tag>,
    },
  ]

  const 탭항목 = [
    {
      key: 'missing',
      label: `누락 (${missing목록.length})`,
      children: (
        <Table
          rowKey="key"
          dataSource={missing목록}
          columns={missing컬럼}
          size="small"
          pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }}
        />
      ),
    },
    {
      key: 'ukall',
      label: `미등록 (${ukall목록.length})`,
      children: (
        <Table
          rowKey="key"
          dataSource={ukall목록}
          columns={ukall컬럼}
          size="small"
          pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }}
        />
      ),
    },
    {
      key: 'skipped',
      label: `통과 (${skipped목록.length})`,
      children: (
        <Table
          rowKey="key"
          dataSource={skipped목록}
          columns={skipped컬럼}
          size="small"
          pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }}
        />
      ),
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Title level={4} style={{ margin: 0 }}>
        사전 검증 — {selectedWorkspace}({currentDomain})
      </Title>

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

      {/* ═══ 검증 결과 ═══ */}
      {검증결과 && (
        <Card size="small" title="검증 결과">
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic title="전체 키워드" value={검증결과.total} />
            </Col>
            <Col span={6}>
              <Statistic
                title="통과 (skipped)"
                value={skipped목록.length}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="누락 (missing)"
                value={missing목록.length}
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="미등록 (ukall)"
                value={ukall목록.length}
                valueStyle={{ color: '#faad14' }}
                prefix={<WarningOutlined />}
              />
            </Col>
          </Row>
          <Tabs items={탭항목} defaultActiveKey="missing" />
        </Card>
      )}
    </Space>
  )
}
