import { useState, useEffect, useRef } from 'react'
import {
  Card, Form, Input, Button, Steps, Table, Tag, Modal,
  Typography, Space, Divider, message
} from 'antd'
import {
  PlayCircleOutlined, StopOutlined, CheckCircleOutlined,
  LoadingOutlined, ClockCircleOutlined, WarningOutlined
} from '@ant-design/icons'
import { usePipelineStore } from '../stores/pipelineStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { 파이프라인API } from '../api/pipeline'

const { Title, Text } = Typography

const 단계아이콘: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined />,
  running: <LoadingOutlined />,
  completed: <CheckCircleOutlined />,
  failed: <WarningOutlined />,
  waiting_approval: <WarningOutlined style={{ color: '#faad14' }} />,
}

const 단계색: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  waiting_approval: 'warning',
}

export default function Pipeline() {
  const [form] = Form.useForm()
  const [이력, set이력] = useState<any[]>([])
  const [승인모달, set승인모달] = useState<{ visible: boolean; stage: string }>({
    visible: false, stage: '',
  })
  const [로딩, set로딩] = useState(false)
  const 로그박스Ref = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { selectedDomain } = useWorkspaceStore()

  const {
    currentPipelineId, status, stages, logs,
    setCurrentPipeline, updateStage, appendLog, reset
  } = usePipelineStore()

  // 이력 조회
  const 이력조회 = async () => {
    try {
      const res = await 파이프라인API.이력조회()
      set이력(res.data?.items || [])
    } catch { /* 무시 */ }
  }

  useEffect(() => { 이력조회() }, [])

  // WebSocket 연결
  useEffect(() => {
    if (!currentPipelineId) return
    const connect = () => {
      const ws = new WebSocket(`ws://${window.location.host}/ws/pipeline/${currentPipelineId}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.stage && data.status) updateStage(data.stage, data.status)
          if (data.log) appendLog(data.log)
          if (data.status === 'waiting_approval') {
            set승인모달({ visible: true, stage: data.stage })
          }
        } catch {
          appendLog(e.data)
        }
      }
      ws.onerror = () => {
        setTimeout(connect, 3000)
      }
      ws.onclose = () => {
        if (status === 'running') setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { wsRef.current?.close() }
  }, [currentPipelineId])

  // 로그 자동 스크롤
  useEffect(() => {
    if (로그박스Ref.current) {
      로그박스Ref.current.scrollTop = 로그박스Ref.current.scrollHeight
    }
  }, [logs])

  const 파이프라인시작 = async (values: any) => {
    if (!selectedDomain) {
      message.warning('워크스페이스에서 도메인을 먼저 선택하세요.')
      return
    }
    set로딩(true)
    try {
      const res = await 파이프라인API.시작(selectedDomain, values.file_path)
      setCurrentPipeline(res.data.pipeline_id)
      message.success('파이프라인이 시작되었습니다.')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '파이프라인 시작 실패')
    } finally {
      set로딩(false)
    }
  }

  const 파이프라인취소 = async () => {
    if (!currentPipelineId) return
    try {
      await 파이프라인API.취소(currentPipelineId)
      reset()
      message.info('파이프라인이 취소되었습니다.')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '취소 실패')
    }
  }

  const 승인처리 = async () => {
    if (!currentPipelineId) return
    try {
      await 파이프라인API.승인(currentPipelineId, 승인모달.stage)
      set승인모달({ visible: false, stage: '' })
      message.success(`${승인모달.stage} 단계 승인 완료`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '승인 실패')
    }
  }

  const 이력컬럼 = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '도메인', dataIndex: 'domain', key: 'domain' },
    {
      title: '상태', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={단계색[v] || 'default'}>{v}</Tag>,
    },
    { title: '파일', dataIndex: 'file_path', key: 'file_path', ellipsis: true },
    { title: '시작', dataIndex: 'started_at', key: 'started_at' },
    { title: '완료', dataIndex: 'completed_at', key: 'completed_at' },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={3}>파이프라인 대시보드</Title>

      {/* 시작 폼 */}
      <Card title="파이프라인 시작">
        <Form form={form} layout="inline" onFinish={파이프라인시작}>
          <Form.Item label="도메인">
            <Text strong>{selectedDomain || <Text type="secondary">워크스페이스 미선택</Text>}</Text>
          </Form.Item>
          <Form.Item name="file_path" rules={[{ required: true, message: '파일 경로 입력' }]} style={{ flex: 1 }}>
            <Input placeholder="/path/to/input.csv" style={{ width: 400 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary" htmlType="submit"
                icon={<PlayCircleOutlined />}
                loading={로딩}
                disabled={status === 'running'}
              >
                시작
              </Button>
              <Button
                danger icon={<StopOutlined />}
                disabled={status !== 'running'}
                onClick={파이프라인취소}
              >
                취소
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 단계 표시 */}
      {currentPipelineId && (
        <Card title={`파이프라인 #${currentPipelineId} 진행 상태`}>
          <Steps
            current={stages.findIndex(s => s.status === 'running' || s.status === 'waiting_approval')}
            items={stages.map(s => ({
              key: s.name,
              title: s.label,
              icon: 단계아이콘[s.status],
              status: s.status === 'completed' ? 'finish'
                : s.status === 'running' ? 'process'
                : s.status === 'failed' ? 'error'
                : 'wait',
            }))}
          />

          <Divider />

          {/* 로그 */}
          <div
            ref={로그박스Ref}
            style={{
              height: 300, overflowY: 'auto', background: '#1f1f1f',
              color: '#d4d4d4', padding: 12, fontFamily: 'monospace',
              fontSize: 12, borderRadius: 4,
            }}
          >
            {logs.length === 0
              ? <Text style={{ color: '#666' }}>로그 대기 중...</Text>
              : logs.map((l, i) => <div key={i}>{l}</div>)
            }
          </div>
        </Card>
      )}

      {/* 이력 테이블 */}
      <Card
        title="파이프라인 이력"
        extra={<Button size="small" onClick={이력조회}>새로고침</Button>}
      >
        <Table
          rowKey="id"
          dataSource={이력}
          columns={이력컬럼}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 승인 게이트 모달 */}
      <Modal
        title={`승인 게이트 — ${승인모달.stage}`}
        open={승인모달.visible}
        onOk={승인처리}
        onCancel={() => set승인모달({ visible: false, stage: '' })}
        okText="승인"
        cancelText="나중에"
      >
        <p><strong>{승인모달.stage}</strong> 단계가 완료되었습니다. 다음 단계로 진행하시겠습니까?</p>
      </Modal>
    </Space>
  )
}
