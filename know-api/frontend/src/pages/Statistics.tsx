import { useState, useEffect } from 'react'
import { Card, Statistic, Row, Col, Typography, Spin, message } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import 클라이언트 from '../api/client'

interface DomainStat {
  site: string
  udic_count: number
  cndic_count: number
  thesaurus_count: number
  category_count: number
}

interface LlmTrend {
  users: string[]
  monthly: Record<string, string | number>[]
}

const 사용자색상 = [
  '#1677ff', '#52c41a', '#ff4d4f', '#faad14', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
]

export default function Statistics() {
  const [통계, set통계] = useState<DomainStat[]>([])
  const [로딩, set로딩] = useState(false)
  const [llm추이, setLlm추이] = useState<LlmTrend>({ users: [], monthly: [] })
  const [llm로딩, setLlm로딩] = useState(false)

  useEffect(() => {
    const 조회 = async () => {
      set로딩(true)
      try {
        const res = await 클라이언트.get('/stats/domains')
        set통계(res.data)
      } catch {
        message.error('통계 조회 실패')
      } finally {
        set로딩(false)
      }
    }
    조회()
  }, [])

  useEffect(() => {
    const llm조회 = async () => {
      setLlm로딩(true)
      try {
        const res = await 클라이언트.get('/stats/llm-usage-trend')
        setLlm추이(res.data)
      } catch {
        message.error('LLM 통계 조회 실패')
      } finally {
        setLlm로딩(false)
      }
    }
    llm조회()
  }, [])

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>도메인별 사전 현황</Typography.Title>

      {로딩 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {통계.map(stat => (
            <Col key={stat.site} xs={24} sm={12} lg={8} xl={6}>
              <Card title={stat.site} bordered>
                <Row gutter={8}>
                  <Col span={12}>
                    <Statistic title="사용자 사전" value={stat.udic_count} suffix="개" />
                  </Col>
                  <Col span={12}>
                    <Statistic title="복합어 사전" value={stat.cndic_count} suffix="개" />
                  </Col>
                  <Col span={12} style={{ marginTop: 16 }}>
                    <Statistic title="유의어" value={stat.thesaurus_count} suffix="개" />
                  </Col>
                  <Col span={12} style={{ marginTop: 16 }}>
                    <Statistic title="카테고리" value={stat.category_count} suffix="개" />
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
          {통계.length === 0 && !로딩 && (
            <Col span={24}>
              <Typography.Text type="secondary">데이터가 없습니다.</Typography.Text>
            </Col>
          )}
        </Row>
      )}

      <Typography.Title level={4} style={{ marginTop: 48, marginBottom: 16 }}>LLM 사용 통계 (최근 12개월)</Typography.Title>

      {llm로딩 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Card title="사용자별 월별 LLM 사용 추이" bordered>
          {llm추이.monthly.length === 0 ? (
            <Typography.Text type="secondary">데이터가 없습니다.</Typography.Text>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={llm추이.monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                {llm추이.users.map((user, idx) => (
                  <Line
                    key={user}
                    type="monotone"
                    dataKey={user}
                    name={user}
                    stroke={사용자색상[idx % 사용자색상.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}
    </div>
  )
}
