import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Button, Card, Space, Spin, Typography, Tag } from 'antd'
import { DownloadOutlined, CheckCircleOutlined, FilePptOutlined, FileZipOutlined } from '@ant-design/icons'
import { shareAPI, type PublicShareData } from '../api/share'
import CompletionDashboard from '../components/CompletionDashboard'
import ReportPanel from '../components/ReportPanel'

const { Title, Text } = Typography

export default function PublicShare() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PublicShareData | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) {
        setError('토큰이 없습니다')
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await shareAPI.getPublicShareData(token)
        if (!cancelled) setData(res.data)
      } catch (e: any) {
        if (!cancelled) {
          const detail = e?.response?.data?.detail || e?.message || '알 수 없는 오류'
          setError('유효하지 않거나 만료된 링크입니다: ' + detail)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="공유 데이터 로딩 중..." />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', padding: 40, background: '#f5f5f5' }}>
        <div style={{ maxWidth: 720, margin: '60px auto' }}>
          <Alert
            type="error"
            showIcon
            message="유효하지 않은 링크"
            description={error || '데이터를 불러올 수 없습니다.'}
          />
        </div>
      </div>
    )
  }

  const snapshotData = {
    ...data.snapshot,
    created_at: data.metadata?.created_at || null,
    prepared_at: data.metadata?.prepared_at || null,
    finished_at: data.metadata?.finished_at || data.metadata?.timestamp || null,
  }

  const reportUrl = shareAPI.publicShareReportUrl(token!)
  const dataTarUrl = shareAPI.publicShareDataTarUrl(token!)

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Card style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Title level={3} style={{ margin: 0 }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              사전 작업 완료 리포트 (공유)
            </Title>
            <Space wrap>
              <Tag color="blue">워크스페이스: {data.workspace}</Tag>
              <Tag>백업: {data.backup_folder}</Tag>
              {data.prev_backup && <Tag color="purple">이전 백업: {data.prev_backup}</Tag>}
            </Space>
            <Text type="secondary">
              이 페이지는 관리자가 발급한 공유 링크로 접근 중이며, 읽기 전용입니다.
            </Text>
          </Space>
        </Card>

        <CompletionDashboard
          snapshot={snapshotData as any}
          participants={data.participants}
          readonly
        />

        <ReportPanel
          workspace={data.workspace}
          currentBackup={data.backup_folder}
          defaultPrevBackup={data.prev_backup}
          mode="public"
          hasReport
        />

        <Card size="small" title="다운로드">
          <Space wrap>
            <Button
              type="primary"
              icon={<FilePptOutlined />}
              onClick={() => window.open(reportUrl, '_blank')}
            >
              PPT 리포트 다운로드
            </Button>
            <Button
              icon={<FileZipOutlined />}
              onClick={() => window.open(dataTarUrl, '_blank')}
            >
              data.tar 다운로드
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled
              title="synonym.UTF-8은 data.tar에 포함됩니다"
            >
              synonym.UTF-8
            </Button>
          </Space>
        </Card>
      </div>
    </div>
  )
}
