import { useState, useEffect, useRef } from 'react'
import {
  Card, Tabs, Button, Table, Tag, Typography, Space,
  Divider, message, Statistic, Row, Col
} from 'antd'
import { BuildOutlined, ReloadOutlined } from '@ant-design/icons'
import { 빌드API } from '../api/pipeline'
import { workspaceAPI } from '../api/workspace'

const { Title, Text } = Typography

interface 빌드이력항목 {
  id: number
  domain: string
  status: string
  row_count: number
  prev_row_count: number | null
  started_at: string
  completed_at: string | null
  error_message: string | null
}

export default function BuildHistory() {
  const [도메인목록, set도메인목록] = useState<string[]>([])
  const [선택도메인, set선택도메인] = useState<string>('')
  const [이력, set이력] = useState<빌드이력항목[]>([])
  const [빌드로그, set빌드로그] = useState<string[]>([])
  const [빌드중, set빌드중] = useState(false)
  const [이력로딩, set이력로딩] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const 로그박스Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    workspaceAPI.도메인목록().then(res => {
      const list = (res.data as {id: string, name: string | null}[]).map(d => d.id)
      set도메인목록(list)
      if (list.length > 0) set선택도메인(list[0])
    }).catch(() => message.error('도메인 목록 조회 실패'))
  }, [])

  const 이력조회 = async (domain: string) => {
    set이력로딩(true)
    try {
      const res = await 빌드API.이력조회(domain)
      set이력(res.data?.items || [])
    } catch {
      message.error('이력 조회 실패')
    } finally {
      set이력로딩(false)
    }
  }

  useEffect(() => {
    이력조회(선택도메인)
  }, [선택도메인])

  useEffect(() => {
    if (로그박스Ref.current) {
      로그박스Ref.current.scrollTop = 로그박스Ref.current.scrollHeight
    }
  }, [빌드로그])

  const 빌드웹소켓연결 = (domain: string) => {
    wsRef.current?.close()
    const connect = () => {
      const ws = new WebSocket(`ws://${window.location.host}/ws/build/${domain}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        set빌드로그(prev => [...prev.slice(-499), e.data])
      }
      ws.onclose = () => {
        set빌드중(false)
        이력조회(domain)
      }
      ws.onerror = () => {
        setTimeout(connect, 3000)
      }
    }
    connect()
  }

  const 빌드시작 = async () => {
    set빌드중(true)
    set빌드로그([])
    try {
      await 빌드API.빌드시작(선택도메인)
      빌드웹소켓연결(선택도메인)
      message.success(`${선택도메인} 빌드 시작`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '빌드 시작 실패')
      set빌드중(false)
    }
  }

  const diff표시 = (current: number, prev: number | null) => {
    if (prev === null) return <Tag>첫 빌드</Tag>
    const diff = current - prev
    if (diff > 0) return <Tag color="green">+{diff}</Tag>
    if (diff < 0) return <Tag color="red">{diff}</Tag>
    return <Tag>변동 없음</Tag>
  }

  const 이력컬럼 = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '상태', dataIndex: 'status', key: 'status',
      render: (v: string) => (
        <Tag color={v === 'success' ? 'success' : v === 'running' ? 'processing' : 'error'}>{v}</Tag>
      ),
    },
    { title: '행 수', dataIndex: 'row_count', key: 'row_count' },
    {
      title: '변동', key: 'diff',
      render: (_: any, r: 빌드이력항목) => diff표시(r.row_count, r.prev_row_count),
    },
    { title: '시작', dataIndex: 'started_at', key: 'started_at' },
    { title: '완료', dataIndex: 'completed_at', key: 'completed_at', render: (v: any) => v || '-' },
    {
      title: '오류', dataIndex: 'error_message', key: 'error_message',
      render: (v: string | null) => v ? <Text type="danger" ellipsis style={{ maxWidth: 200 }}>{v}</Text> : '-',
    },
  ]

  // 최근 빌드 통계
  const 최근빌드 = 이력[0]
  const 성공건수 = 이력.filter(h => h.status === 'success').length
  const 실패건수 = 이력.filter(h => h.status === 'failed').length

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={3}>빌드 이력</Title>

      <Tabs
        activeKey={선택도메인}
        onChange={set선택도메인}
        items={도메인목록.map(d => ({ key: d, label: d.toUpperCase() }))}
      />

      {/* 통계 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="전체 빌드" value={이력.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="성공" value={성공건수} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="실패" value={실패건수} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="최근 빌드 행 수"
              value={최근빌드?.row_count ?? '-'}
            />
          </Card>
        </Col>
      </Row>

      {/* 빌드 실행 */}
      <Card
        title={`${선택도메인.toUpperCase()} 사전 빌드`}
        extra={
          <Button
            type="primary"
            icon={<BuildOutlined />}
            loading={빌드중}
            onClick={빌드시작}
          >
            빌드 시작
          </Button>
        }
      >
        {빌드로그.length > 0 && (
          <div
            ref={로그박스Ref}
            style={{
              height: 250, overflowY: 'auto', background: '#1f1f1f',
              color: '#d4d4d4', padding: 12, fontFamily: 'monospace',
              fontSize: 12, borderRadius: 4,
            }}
          >
            {빌드로그.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        {빌드로그.length === 0 && (
          <Text type="secondary">빌드를 시작하면 실시간 로그가 여기에 표시됩니다.</Text>
        )}
      </Card>

      {/* 이력 테이블 */}
      <Card
        title="빌드 이력 목록"
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => 이력조회(선택도메인)}
            loading={이력로딩}
          >
            새로고침
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={이력}
          columns={이력컬럼}
          size="small"
          pagination={{ pageSize: 15 }}
          loading={이력로딩}
        />
      </Card>
    </Space>
  )
}
