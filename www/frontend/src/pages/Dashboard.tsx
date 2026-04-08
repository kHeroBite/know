import { useState, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { Card, Statistic, Row, Col, Table, Typography, Spin, message } from 'antd'
import {
  AppstoreOutlined, CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined,
} from '@ant-design/icons'
import 클라이언트 from '../api/client'

interface Summary {
  total: number
  pending: number
  assigned: number
  completed: number
  today_processed: number
  workspaces: WorkspaceStat[]
}

interface WorkspaceStat {
  workspace: string
  domain: string
  total: number
  completed: number
  progress: number
}

interface DomainStat {
  domain: string
  total: number
  completed: number
  pending: number
  completion_rate: number
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

  const 도메인통계컬럼 = [
    { title: '도메인', dataIndex: 'domain', key: 'domain', width: 150, ellipsis: true },
    {
      title: '전체',
      dataIndex: 'total',
      key: 'total',
      width: 80,
      render: (v: number) => <Typography.Text>{(v ?? 0).toLocaleString()}</Typography.Text>,
    },
    {
      title: '완료',
      dataIndex: 'completed',
      key: 'completed',
      width: 80,
      render: (v: number) => <Typography.Text type="success">{(v ?? 0).toLocaleString()}</Typography.Text>,
    },
    {
      title: '미완료',
      dataIndex: 'pending',
      key: 'pending',
      width: 80,
      render: (v: number) => <Typography.Text type="warning">{(v ?? 0).toLocaleString()}</Typography.Text>,
    },
    {
      title: '진행률',
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      width: 80,
      render: (v: number) => <Typography.Text>{v ?? 0}%</Typography.Text>,
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
                  title="전체 키워드"
                  value={summary?.total ?? 0}
                  suffix="개"
                  prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
                  valueStyle={{ color: '#1677ff' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card bordered>
                <Statistic
                  title="미배정"
                  value={summary?.pending ?? 0}
                  suffix="개"
                  prefix={<ClockCircleOutlined style={{ color: '#8c8c8c' }} />}
                  valueStyle={{ color: '#8c8c8c' }}
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
                  title="오늘 처리"
                  value={summary?.today_processed ?? 0}
                  suffix="건"
                  prefix={<PlayCircleOutlined style={{ color: '#fa8c16' }} />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 워크스페이스별 현황 */}
          <Card
            title="워크스페이스별 현황"
            bordered
            size="small"
            style={{ marginBottom: 24 }}
          >
            <Table
              dataSource={summary?.workspaces || []}
              columns={[
                { title: '워크스페이스', dataIndex: 'workspace', key: 'workspace', ellipsis: true },
                { title: '도메인', dataIndex: 'domain', key: 'domain', width: 140, ellipsis: true },
                { title: '전체', dataIndex: 'total', key: 'total', width: 70 },
                { title: '완료', dataIndex: 'completed', key: 'completed', width: 70 },
                {
                  title: '진행률',
                  dataIndex: 'progress',
                  key: 'progress',
                  width: 80,
                  render: (v: number) => `${v ?? 0}%`,
                },
              ]}
              rowKey={(r) => `${r.workspace}-${r.domain}`}
              size="small"
              pagination={false}
              locale={{ emptyText: '데이터가 없습니다.' }}
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
