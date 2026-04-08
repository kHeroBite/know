import { useState, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { Card, Statistic, Row, Col, Table, Typography, Spin, message, Tag } from 'antd'
import {
  AppstoreOutlined, CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined,
} from '@ant-design/icons'
import 클라이언트 from '../api/client'

interface Summary {
  not_started: number
  in_progress: number
  completed: number
  today_count: number
  recent_works: RecentWork[]
}

interface RecentWork {
  workspace: string
  domain: string
  keyword: string
  action: string
  worked_at: string
}

interface DomainStat {
  domain: string
  total: number
  completed: number
  in_progress: number
}

const statusColor: Record<string, string> = {
  등록: 'green',
  수정: 'blue',
  삭제: 'red',
  작업: 'default',
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [domainStats, setDomainStats] = useState<DomainStat[]>([])
  const [loading, setLoading] = useState(false)
  const [domainLoading, setDomainLoading] = useState(false)

  useEffect(() => {
    const 조회 = async () => {
      setLoading(true)
      try {
        const res = await 클라이언트.get('/dashboard/summary')
        setSummary(res.data)
      } catch {
        message.error('대시보드 조회 실패')
      } finally {
        setLoading(false)
      }
    }
    조회()
  }, [])

  useEffect(() => {
    const 조회 = async () => {
      setDomainLoading(true)
      try {
        const res = await 클라이언트.get('/dashboard/domain-stats')
        setDomainStats(res.data || [])
      } catch {
        message.error('도메인 통계 조회 실패')
      } finally {
        setDomainLoading(false)
      }
    }
    조회()
  }, [])

  const 최근작업컬럼 = [
    {
      title: '워크스페이스',
      dataIndex: 'workspace',
      key: 'workspace',
      width: 140,
      ellipsis: true,
    },
    {
      title: '도메인',
      dataIndex: 'domain',
      key: 'domain',
      width: 120,
      ellipsis: true,
    },
    {
      title: '키워드',
      dataIndex: 'keyword',
      key: 'keyword',
      width: 150,
      ellipsis: true,
    },
    {
      title: '작업',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (action: string) => (
        <Tag color={statusColor[action] || 'default'}>{action}</Tag>
      ),
    },
    {
      title: '작업일시',
      dataIndex: 'worked_at',
      key: 'worked_at',
      render: (val: string) => val ? new Date(val).toLocaleString('ko-KR') : '-',
    },
  ]

  const 도메인통계컬럼 = [
    { title: '도메인', dataIndex: 'domain', key: 'domain', width: 150, ellipsis: true },
    {
      title: '전체',
      dataIndex: 'total',
      key: 'total',
      width: 80,
      render: (v: number) => <Typography.Text>{v.toLocaleString()}</Typography.Text>,
    },
    {
      title: '완료',
      dataIndex: 'completed',
      key: 'completed',
      width: 80,
      render: (v: number) => <Typography.Text type="success">{v.toLocaleString()}</Typography.Text>,
    },
    {
      title: '진행중',
      dataIndex: 'in_progress',
      key: 'in_progress',
      width: 80,
      render: (v: number) => <Typography.Text type="warning">{v.toLocaleString()}</Typography.Text>,
    },
    {
      title: '진행률',
      key: 'rate',
      render: (_: any, row: DomainStat) => {
        const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
        return <Typography.Text>{rate}%</Typography.Text>
      },
    },
  ]

  return (
    <div>
      <PageHeader title="대시보드" />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* 현황 카드 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
              <Card bordered>
                <Statistic
                  title="미시작"
                  value={summary?.not_started ?? 0}
                  suffix="개"
                  prefix={<AppstoreOutlined style={{ color: '#8c8c8c' }} />}
                  valueStyle={{ color: '#8c8c8c' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card bordered>
                <Statistic
                  title="진행중"
                  value={summary?.in_progress ?? 0}
                  suffix="개"
                  prefix={<PlayCircleOutlined style={{ color: '#1677ff' }} />}
                  valueStyle={{ color: '#1677ff' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card bordered>
                <Statistic
                  title="완료"
                  value={summary?.completed ?? 0}
                  suffix="개"
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card bordered>
                <Statistic
                  title="오늘 작업"
                  value={summary?.today_count ?? 0}
                  suffix="건"
                  prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 최근 작업 이력 */}
          <Card
            title="최근 작업 이력"
            bordered
            size="small"
            style={{ marginBottom: 24 }}
          >
            <Table
              dataSource={summary?.recent_works || []}
              columns={최근작업컬럼}
              rowKey={(r, i) => String(i)}
              size="small"
              pagination={false}
              locale={{ emptyText: '작업 이력이 없습니다.' }}
            />
          </Card>
        </>
      )}

      {/* 도메인별 통계 */}
      <Card title="도메인별 통계" bordered size="small">
        {domainLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <Table
            dataSource={domainStats}
            columns={도메인통계컬럼}
            rowKey="domain"
            size="small"
            pagination={false}
            locale={{ emptyText: '데이터가 없습니다.' }}
          />
        )}
      </Card>
    </div>
  )
}
