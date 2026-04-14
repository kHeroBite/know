import { Card, Alert, Typography, Space } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title, Text } = Typography

export default function WorkComplete() {
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const completeResult = (useWorkspaceStore.getState() as any).completeResult || null

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: '24px' }}>
        <Title level={3}>
          <CheckCircleOutlined style={{ marginRight: 8 }} />
          작업 완료
        </Title>
        <Alert
          type="warning"
          message="워크스페이스를 먼저 선택해주세요."
          description="상단 워크스페이스 메뉴에서 작업할 워크스페이스와 도메인을 선택한 후 이 페이지를 이용하세요."
          showIcon
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>
        <CheckCircleOutlined style={{ marginRight: 8 }} />
        작업 완료 결과
      </Title>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          {!completeResult && (
            <Alert
              type="info"
              message="완료 처리 결과가 없습니다"
              description="사전 검증 페이지에서 '다음단계로 (완료)' 버튼을 눌러 완료 처리를 실행하세요."
              showIcon
            />
          )}
          {completeResult && (
            <Alert
              type="success"
              message="작업 완료"
              showIcon
              description={
                <>
                  <div>백업 경로: {completeResult.backup_path}</div>
                  <div>완료 일시: {completeResult.completed_at || '-'}</div>
                  <div>복사된 항목: {completeResult.copied_files}개</div>
                </>
              }
            />
          )}
          <Text type="secondary">
            완료 처리는 사전 검증 페이지의 '다음단계로 (완료)' 버튼에서 실행됩니다.
          </Text>
        </Space>
      </Card>
    </div>
  )
}
