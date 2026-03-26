import { useState } from 'react'
import { Row, Col, Card, message, Typography } from 'antd'
import FilePanel from '../components/phase1/FilePanel'
import ControlPanel from '../components/phase1/ControlPanel'
import LogPanel from '../components/phase1/LogPanel'
import { usePhase1WebSocket } from '../hooks/usePhase1WebSocket'
import { phase1API } from '../api/phase1'

const { Title } = Typography

function usePhase1State() {
  const [folder, setFolder] = useState<'popular' | 'fails'>('popular')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [stepRange, setStepRange] = useState<[number, number]>([0, 4])
  const [domain, setDomain] = useState<string>('')
  const [runId, setRunId] = useState<string | null>(null)

  return {
    folder, setFolder,
    selectedFile, setSelectedFile,
    stepRange, setStepRange,
    domain, setDomain,
    runId, setRunId,
  }
}

export default function Phase1Pipeline() {
  const state = usePhase1State()
  const ws = usePhase1WebSocket(state.runId)

  const 실행핸들러 = async (params: {
    domain: string
    category: string
    filename: string
    start_step: number
    end_step: number
  }) => {
    try {
      const { data } = await phase1API.실행(params)
      state.setRunId(data.run_id)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '실행 시작 실패')
    }
  }

  const 실행중 = state.runId !== null && !ws.isCompleted

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Title level={3}>Phase 1 파이프라인</Title>
      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="파일 관리" style={{ height: '100%' }}>
            <FilePanel
              folder={state.folder}
              onFolderChange={(f) => state.setFolder(f as 'popular' | 'fails')}
              selectedFile={state.selectedFile}
              onFileSelect={state.setSelectedFile}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="파이프라인 실행" style={{ marginBottom: 16 }}>
            <ControlPanel
              stepRange={state.stepRange}
              onStepRangeChange={state.setStepRange}
              selectedFile={state.selectedFile}
              folder={state.folder}
              domain={state.domain}
              onDomainChange={state.setDomain}
              onRun={실행핸들러}
              isRunning={실행중}
            />
          </Card>
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
