import { useState, useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  Card, Button, Table, Tag, Typography, Space, Input, Tabs, Progress,
  message, Statistic, Row, Col,
} from 'antd'
import {
  CheckCircleOutlined, SearchOutlined, ExperimentOutlined,
  WarningOutlined, CloseCircleOutlined,
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
      const { missing_user, missing_cn, missing_syn } = res.data
      const 합계 = missing_user.length + missing_cn.length + missing_syn.length
      if (합계 === 0) {
        message.success('검증 완료 — 누락 키워드 없음')
      } else {
        message.info(`검증 완료 — 단일어 ${missing_user.length} · 복합어 ${missing_cn.length} · 유사어 ${missing_syn.length}`)
      }
    } catch (e: any) {
      message.error('사전 검증 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      set검증중(false)
    }
  }, [selectedWorkspace, currentDomain])

  // ─── 검증 결과 ───────────────────────────────
  const missingUser목록 = (검증결과?.missing_user || []).map((kw, i) => ({ key: i, keyword: kw }))
  const missingCn목록 = (검증결과?.missing_cn || []).map((kw, i) => ({ key: i, keyword: kw }))
  const missingSyn목록 = (검증결과?.missing_syn || []).map((kw, i) => ({ key: i, keyword: kw }))

  const 단일어컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    {
      title: '상태', key: 'status', width: 120,
      render: () => <Tag color="warning" icon={<WarningOutlined />}>단일어 누락</Tag>,
    },
  ]

  const 복합어컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    {
      title: '상태', key: 'status', width: 120,
      render: () => <Tag color="error" icon={<CloseCircleOutlined />}>복합어 누락</Tag>,
    },
  ]

  const 유사어컬럼 = [
    { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    {
      title: '상태', key: 'status', width: 120,
      render: () => <Tag color="processing" icon={<WarningOutlined />}>유사어 누락</Tag>,
    },
  ]

  const 탭항목 = [
    {
      key: 'missing_user',
      label: `단일어 누락 (${missingUser목록.length})`,
      children: (
        <Table
          rowKey="key"
          dataSource={missingUser목록}
          columns={단일어컬럼}
          size="small"
          pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }}
        />
      ),
    },
    {
      key: 'missing_cn',
      label: `복합어 누락 (${missingCn목록.length})`,
      children: (
        <Table
          rowKey="key"
          dataSource={missingCn목록}
          columns={복합어컬럼}
          size="small"
          pagination={{ pageSize: 20, showTotal: t => `총 ${t}건` }}
        />
      ),
    },
    {
      key: 'missing_syn',
      label: `유사어 누락 (${missingSyn목록.length})`,
      children: (
        <Table
          rowKey="key"
          dataSource={missingSyn목록}
          columns={유사어컬럼}
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
        <Text type="secondary">빌드된 사전 파일 기반으로 단일어·복합어·유사어 누락을 검증합니다.</Text>
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
                title="단일어 누락"
                value={missingUser목록.length}
                valueStyle={{ color: '#faad14' }}
                prefix={<WarningOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="복합어 누락"
                value={missingCn목록.length}
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="유사어 누락"
                value={missingSyn목록.length}
                valueStyle={{ color: '#1890ff' }}
                prefix={<WarningOutlined />}
              />
            </Col>
          </Row>
          <Tabs items={탭항목} defaultActiveKey="missing_user" />
        </Card>
      )}
    </Space>
  )
}
