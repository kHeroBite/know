import { useState, useEffect } from 'react'
import { Card, Statistic, Row, Col, Typography, Spin, message, Select, Space } from 'antd'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import 클라이언트 from '../api/client'

interface DomainStat {
  site: string
  udic_count: number
  cndic_count: number
  thesaurus_count: number
  category_count: number
}

interface LlmUserStat {
  user_id: string
  count: number
}

interface LlmMonthlyStat {
  month: string
  count: number
}

interface LlmStats {
  users: LlmUserStat[]
  monthly: LlmMonthlyStat[]
}

const 현재년도 = new Date().getFullYear()
const 년도목록 = Array.from({ length: 3 }, (_, i) => 현재년도 - i).map(y => ({ label: `${y}년`, value: y }))
const 월목록 = Array.from({ length: 12 }, (_, i) => i + 1).map(m => ({ label: `${m}월`, value: m }))

export default function Statistics() {
  const [통계, set통계] = useState<DomainStat[]>([])
  const [로딩, set로딩] = useState(false)
  const [llm통계, setLlm통계] = useState<LlmStats>({ users: [], monthly: [] })
  const [llm로딩, setLlm로딩] = useState(false)
  const [선택년도, set선택년도] = useState(현재년도)
  const [선택월, set선택월] = useState(new Date().getMonth() + 1)

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
        const res = await 클라이언트.get('/stats/llm-usage', {
          params: { year: 선택년도, month: 선택월 },
        })
        setLlm통계(res.data)
      } catch {
        message.error('LLM 통계 조회 실패')
      } finally {
        setLlm로딩(false)
      }
    }
    llm조회()
  }, [선택년도, 선택월])

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

      <Typography.Title level={4} style={{ marginTop: 48, marginBottom: 16 }}>LLM 사용 통계</Typography.Title>

      <Space style={{ marginBottom: 20 }}>
        <Select
          value={선택년도}
          onChange={set선택년도}
          options={년도목록}
          style={{ width: 110 }}
        />
        <Select
          value={선택월}
          onChange={set선택월}
          options={월목록}
          style={{ width: 90 }}
        />
      </Space>

      {llm로딩 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card title="사용자별 LLM 사용 횟수" bordered>
              {llm통계.users.length === 0 ? (
                <Typography.Text type="secondary">데이터가 없습니다.</Typography.Text>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={llm통계.users} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="user_id" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="사용 횟수" fill="#1677ff" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
          <Col span={24}>
            <Card title="월별 LLM 사용 추이" bordered>
              {llm통계.monthly.length === 0 ? (
                <Typography.Text type="secondary">데이터가 없습니다.</Typography.Text>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={llm통계.monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="사용 횟수" fill="#52c41a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}
