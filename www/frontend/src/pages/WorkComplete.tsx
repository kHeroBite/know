import { useState } from 'react'
import { Button, Card, Alert, Spin, Typography, Space } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title, Text } = Typography

export default function WorkComplete() {
  const { selectedWorkspace, selectedDomain, completeWorkspace } = useWorkspaceStore()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ backup_path: string; copied_files: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    if (!selectedWorkspace || !selectedDomain) return
    setLoading(true)
    setError(null)
    try {
      const res = await completeWorkspace(selectedWorkspace, selectedDomain)
      setResult(res)
    } catch (e: any) {
      setError(e.message || '작업 완료 처리 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>
        <CheckCircleOutlined style={{ marginRight: 8 }} />
        작업 완료
      </Title>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>사전 검증이 완료되었습니다. 아래 버튼을 누르면 워크스페이스 사전을 도메인에 반영합니다.</Text>
          <Text type="secondary">
            · 도메인 사전 백업 후 워크스페이스 사전을 도메인에 복사합니다.<br />
            · 이 작업은 되돌릴 수 없습니다. 신중하게 진행하세요.
          </Text>
          {!result && (
            <Button
              type="primary"
              size="large"
              onClick={handleComplete}
              disabled={loading}
              loading={loading}
            >
              도메인 반영
            </Button>
          )}
          {loading && <Spin tip="백업 및 복사 중..." />}
          {error && <Alert type="error" message={error} showIcon />}
          {result && (
            <Alert
              type="success"
              message="작업 완료"
              showIcon
              description={
                <>
                  <div>백업 경로: {result.backup_path}</div>
                  <div>복사된 항목: {result.copied_files}개</div>
                </>
              }
            />
          )}
        </Space>
      </Card>
    </div>
  )
}
