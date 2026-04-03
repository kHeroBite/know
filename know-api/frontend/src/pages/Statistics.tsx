import { useState, useEffect, useCallback } from 'react'
import { Card, Statistic, Row, Col, Typography, Spin, message, Checkbox, Radio, DatePicker, Space } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import dayjs from 'dayjs'
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
  models: string[]
  user_monthly: Record<string, string | number>[]
  model_monthly: Record<string, string | number>[]
}

const 색상 = [
  '#1677ff', '#52c41a', '#ff4d4f', '#faad14', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
]

export default function Statistics() {
  const [통계, set통계] = useState<DomainStat[]>([])
  const [로딩, set로딩] = useState(false)
  const [llm추이, setLlm추이] = useState<LlmTrend>({ users: [], models: [], user_monthly: [], model_monthly: [] })
  const [llm로딩, setLlm로딩] = useState(false)
  const [선택사용자, set선택사용자] = useState<string[]>([])
  const [선택모델, set선택모델] = useState<string[]>([])
  const [기간모드, set기간모드] = useState<'daily' | 'monthly'>('monthly')
  const [시작일, set시작일] = useState<dayjs.Dayjs>(dayjs().subtract(11, 'month').startOf('month'))
  const [종료일, set종료일] = useState<dayjs.Dayjs>(dayjs())

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

  const llm조회 = useCallback(async () => {
    setLlm로딩(true)
    try {
      const startFmt = 기간모드 === 'daily' ? 시작일.format('YYYY-MM-DD') : 시작일.format('YYYY-MM')
      const endFmt = 기간모드 === 'daily' ? 종료일.format('YYYY-MM-DD') : 종료일.format('YYYY-MM')
      const res = await 클라이언트.get('/stats/llm-usage-trend', { params: { mode: 기간모드, start: startFmt, end: endFmt } })
      const data = res.data
      setLlm추이({
        users: data.users || [],
        models: data.models || [],
        user_monthly: data.user_monthly || data.monthly || [],
        model_monthly: data.model_monthly || [],
      })
      set선택사용자(data.users || [])
      set선택모델(data.models || [])
    } catch {
      message.error('LLM 통계 조회 실패')
    } finally {
      setLlm로딩(false)
    }
  }, [기간모드, 시작일, 종료일])

  useEffect(() => { llm조회() }, [llm조회])

  const 사용자전체선택 = 선택사용자.length === llm추이.users.length
  const 모델전체선택 = 선택모델.length === llm추이.models.length

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

      <Space style={{ marginBottom: 16 }} wrap>
        <Radio.Group value={기간모드} onChange={e => {
          const mode = e.target.value
          set기간모드(mode)
          if (mode === 'daily') {
            set시작일(dayjs().subtract(29, 'day'))
            set종료일(dayjs())
          } else {
            set시작일(dayjs().subtract(11, 'month').startOf('month'))
            set종료일(dayjs())
          }
        }} optionType="button" buttonStyle="solid">
          <Radio.Button value="daily">일간</Radio.Button>
          <Radio.Button value="monthly">월간</Radio.Button>
        </Radio.Group>
        {기간모드 === 'daily' ? (
          <>
            <DatePicker value={시작일} onChange={v => v && set시작일(v)} format="YYYY-MM-DD" placeholder="시작일" />
            <span>~</span>
            <DatePicker value={종료일} onChange={v => v && set종료일(v)} format="YYYY-MM-DD" placeholder="종료일" />
          </>
        ) : (
          <>
            <DatePicker picker="month" value={시작일} onChange={v => v && set시작일(v)} format="YYYY-MM" placeholder="시작월" />
            <span>~</span>
            <DatePicker picker="month" value={종료일} onChange={v => v && set종료일(v)} format="YYYY-MM" placeholder="종료월" />
          </>
        )}
      </Space>

      {llm로딩 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {/* 사용자별 그래프 */}
          <Col span={24}>
            <Card title="사용자별 월별 사용 추이" bordered size="small">
              <div style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={사용자전체선택}
                  indeterminate={선택사용자.length > 0 && !사용자전체선택}
                  onChange={e => set선택사용자(e.target.checked ? [...llm추이.users] : [])}
                  style={{ marginRight: 16 }}
                >전체</Checkbox>
                {llm추이.users.map((user, idx) => (
                  <Checkbox
                    key={user}
                    checked={선택사용자.includes(user)}
                    onChange={e => set선택사용자(prev => e.target.checked ? [...prev, user] : prev.filter(u => u !== user))}
                    style={{ color: 색상[idx % 색상.length] }}
                  >{user}</Checkbox>
                ))}
              </div>
              {llm추이.user_monthly.length === 0 ? (
                <Typography.Text type="secondary">데이터가 없습니다.</Typography.Text>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={llm추이.user_monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {선택사용자.map((user) => {
                      const idx = llm추이.users.indexOf(user)
                      return (
                        <Line key={user} type="monotone" dataKey={user} name={user}
                          stroke={색상[idx % 색상.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>

          {/* 모델별 그래프 */}
          <Col span={24}>
            <Card title="모델별 월별 사용 추이" bordered size="small">
              <div style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={모델전체선택}
                  indeterminate={선택모델.length > 0 && !모델전체선택}
                  onChange={e => set선택모델(e.target.checked ? [...llm추이.models] : [])}
                  style={{ marginRight: 16 }}
                >전체</Checkbox>
                {llm추이.models.map((mdl, idx) => (
                  <Checkbox
                    key={mdl}
                    checked={선택모델.includes(mdl)}
                    onChange={e => set선택모델(prev => e.target.checked ? [...prev, mdl] : prev.filter(m => m !== mdl))}
                    style={{ color: 색상[(idx + 5) % 색상.length] }}
                  >{mdl}</Checkbox>
                ))}
              </div>
              {llm추이.model_monthly.length === 0 ? (
                <Typography.Text type="secondary">데이터가 없습니다.</Typography.Text>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={llm추이.model_monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {선택모델.map((mdl) => {
                      const idx = llm추이.models.indexOf(mdl)
                      return (
                        <Line key={mdl} type="monotone" dataKey={mdl} name={mdl}
                          stroke={색상[(idx + 5) % 색상.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}
