import { useMemo } from 'react'
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Descriptions,
} from 'antd'
import { ClockCircleOutlined, TeamOutlined, DatabaseOutlined } from '@ant-design/icons'

const { Text } = Typography

export interface Snapshot {
  workspace?: string
  domain?: string | null
  before: Record<string, number> | null
  after: Record<string, number> | null
  prepared_at?: string | null
  finished_at?: string | null
  created_at?: string | null
}

export interface Participant {
  user_id: string
  name: string
  r_count: number
  w_count: number
}

interface Props {
  snapshot: Snapshot | null
  participants: Participant[]
  readonly?: boolean
}

const DICT_KEYS: { key: string; label: string }[] = [
  { key: 'UDIC', label: 'UDIC (사용자사전)' },
  { key: 'CNDIC', label: 'CNDIC (복합명사)' },
  { key: 'THESAURUS', label: 'THESAURUS (동의어)' },
  { key: 'CATEGORY', label: 'CATEGORY (카테고리)' },
]

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

function formatDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso) return '-'
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  if (isNaN(start) || isNaN(end) || end < start) return '-'
  const sec = Math.floor((end - start) / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}

export default function CompletionDashboard({ snapshot, participants }: Props) {
  const dictRows = useMemo(() => {
    const before = snapshot?.before || {}
    const after = snapshot?.after || {}
    return DICT_KEYS.map(({ key, label }) => {
      const b = before[key] ?? 0
      const a = after[key]
      const delta = a !== undefined ? a - b : null
      return { key, label, before: b, after: a, delta }
    })
  }, [snapshot])

  const dictColumns = [
    { title: '사전 타입', dataIndex: 'label', key: 'label' },
    {
      title: 'Before', dataIndex: 'before', key: 'before', width: 120, align: 'right' as const,
      render: (v: number) => <Text>{v.toLocaleString()}</Text>,
    },
    {
      title: 'After', dataIndex: 'after', key: 'after', width: 120, align: 'right' as const,
      render: (v: number | undefined) =>
        v === undefined
          ? <Text type="secondary">아직 적용 전</Text>
          : <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '증감', dataIndex: 'delta', key: 'delta', width: 120, align: 'right' as const,
      render: (v: number | null) => {
        if (v === null) return <Text type="secondary">-</Text>
        if (v === 0) return <Text>0</Text>
        const color = v > 0 ? '#52c41a' : '#cf1322'
        return <Text style={{ color }}>{v > 0 ? '+' : ''}{v.toLocaleString()}</Text>
      },
    },
  ]

  const participantColumns = [
    { title: '이름', dataIndex: 'name', key: 'name', render: (v: string, row: Participant) => v || row.user_id },
    { title: '사용자ID', dataIndex: 'user_id', key: 'user_id', width: 140 },
    {
      title: '등록/수정 (W)', dataIndex: 'w_count', key: 'w_count', width: 140, align: 'right' as const,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '읽기전용 (R)', dataIndex: 'r_count', key: 'r_count', width: 140, align: 'right' as const,
      render: (v: number) => <Tag color="default">{v}</Tag>,
    },
  ]

  return (
    <>
      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<><DatabaseOutlined /> 사전 개수 (Before / After)</>}
            style={{ marginBottom: 16 }}
          >
            <Table
              rowKey="key"
              dataSource={dictRows}
              columns={dictColumns}
              size="small"
              pagination={false}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={<><ClockCircleOutlined /> 시간</>}
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="접속/시작">{formatDateTime(snapshot?.created_at)}</Descriptions.Item>
              <Descriptions.Item label="완료 준비(prepared)">{formatDateTime(snapshot?.prepared_at)}</Descriptions.Item>
              <Descriptions.Item label="완료(finished)">{formatDateTime(snapshot?.finished_at)}</Descriptions.Item>
              <Descriptions.Item label="경과 시간">
                {formatDuration(snapshot?.created_at, snapshot?.finished_at)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={<><TeamOutlined /> 참여자 통계 ({participants.length}명)</>}
        style={{ marginBottom: 16 }}
      >
        {participants.length === 0 ? (
          <Text type="secondary">참여자 정보가 없습니다.</Text>
        ) : (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={6}><Statistic title="총 참여자" value={participants.length} /></Col>
              <Col span={6}>
                <Statistic
                  title="총 등록/수정 (W)"
                  value={participants.reduce((s, p) => s + (p.w_count || 0), 0)}
                  valueStyle={{ color: '#1677ff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="총 읽기전용 (R)"
                  value={participants.reduce((s, p) => s + (p.r_count || 0), 0)}
                />
              </Col>
            </Row>
            <Table
              rowKey="user_id"
              dataSource={participants}
              columns={participantColumns}
              size="small"
              pagination={false}
            />
          </>
        )}
      </Card>
    </>
  )
}
