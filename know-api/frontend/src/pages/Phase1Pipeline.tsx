import { useState } from 'react'
import { Row, Col, Card, message, Typography } from 'antd'
import FilePanel from '../components/phase1/FilePanel'
import ControlPanel from '../components/phase1/ControlPanel'
import LogPanel from '../components/phase1/LogPanel'
import { usePhase1WebSocket } from '../hooks/usePhase1WebSocket'
import { phase1API } from '../api/phase1'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title } = Typography

function usePhase1State() {
  const [stepRange, setStepRange] = useState<[number, number]>([1, 4])
  const [runId, setRunId] = useState<string | null>(null)

  return {
    stepRange, setStepRange,
    runId, setRunId,
  }
}

export default function Phase1Pipeline() {
  const state = usePhase1State()
  const ws = usePhase1WebSocket(state.runId)
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()

  const 실행핸들러 = async (params: {
    category: string
    start_step: number
    end_step: number
  }) => {
    try {
      const { data } = await phase1API.실행({
        ...params,
        workspace: selectedWorkspace ?? '',
        domain: selectedDomain ?? '',
      })
      state.setRunId(data.run_id)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '실행 시작 실패')
    }
  }

  const 실행중 = state.runId !== null && !ws.isCompleted

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Title level={3}>데이터 전처리</Title>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title="파일관리">
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <FilePanel folder="popular" workspace={selectedWorkspace ?? undefined} />
              </Col>
              <Col xs={24} lg={12}>
                <FilePanel folder="fails" workspace={selectedWorkspace ?? undefined} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="파이프라인 실행" style={{ height: '100%' }}>
            <ControlPanel
              stepRange={state.stepRange}
              onStepRangeChange={state.setStepRange}
              folder="popular"
              onRun={실행핸들러}
              isRunning={실행중}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="실행 로그">
            <LogPanel
              logs={ws.logs}
              currentStep={ws.currentStep}
              stepStatuses={ws.stepStatuses}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
