import { useState, useEffect } from 'react'
import { Card, Statistic, Row, Col, Typography, Spin, message } from 'antd'
import 클라이언트 from '../api/client'

interface DomainStat {
  site: string
  udic_count: number
  cndic_count: number
  thesaurus_count: number
  category_count: number
}

export default function Statistics() {
  const [통계, set통계] = useState<DomainStat[]>([])
  const [로딩, set로딩] = useState(false)

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
    </div>
  )
}
