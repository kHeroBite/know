import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Button, message, Typography, Result } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons'
import FilePanel from '../components/phase1/FilePanel'
import ControlPanel from '../components/phase1/ControlPanel'
import LogPanel from '../components/phase1/LogPanel'
import { usePhase1WebSocket } from '../hooks/usePhase1WebSocket'
import { phase1API } from '../api/phase1'
import { assignmentApi } from '../api/assignment'
import { useWorkspaceStore } from '../stores/workspaceStore'
import 클라이언트 from '../api/client'
import PageHeader from '../components/PageHeader'

const { Title } = Typography

export default function Phase1Pipeline() {
  const [runId, setRunId] = useState<string | null>(null)
  const [runStartStep, setRunStartStep] = useState(1)
  const ws = usePhase1WebSocket(runId, runStartStep)
  const navigate = useNavigate()
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const [fileTabs, setFileTabs] = useState<Record<string, string>>({})
  const [activeViewTab, setActiveViewTab] = useState<string | null>(null)
  const [hasFiles, setHasFiles] = useState(false)
  const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({})
  const [rankEnabled, setRankEnabled] = useState(true)
  const [rankValue, setRankValue] = useState(150000)
  const [rankPreset, setRankPreset] = useState('150000')
  const [countEnabled, setCountEnabled] = useState(false)
  const [countValue, setCountValue] = useState(5)
  const [countPreset, setCountPreset] = useState('5')
  const [combineMode, setCombineMode] = useState<'and' | 'or'>('and')
  const [sortBy, setSortBy] = useState<'count' | 'rank'>('count')

  // 파일 존재 여부 체크
  useEffect(() => {
    const checkFiles = async () => {
      if (!selectedWorkspace) { setHasFiles(false); return }
      try {
        const [pop, fail] = await Promise.all([
          phase1API.파일목록('popular', selectedWorkspace),
          phase1API.파일목록('fails', selectedWorkspace),
        ])
        const total = (pop.data.files?.length || 0) + (fail.data.files?.length || 0)
        setHasFiles(total > 0)
      } catch { setHasFiles(false) }
    }
    checkFiles()
  }, [selectedWorkspace])

  // 단계별 결과 파일 존재 여부 확인
  useEffect(() => {
    const checkStepStatus = async () => {
      if (!selectedWorkspace) { setFileStatus({}); return }
      try {
        const { data } = await phase1API.단계상태(selectedWorkspace)
        setFileStatus(data)
      } catch { setFileStatus({}) }
    }
    checkStepStatus()
  }, [selectedWorkspace, ws.isCompleted])

  // 단계별 경과시간 + output 경로 집계 (이전 run 정보 보존)
  const [stepElapsed, setStepElapsed] = useState<Record<number, number>>({})
  const [stepOutputs, setStepOutputs] = useState<Record<number, string>>({})
  useEffect(() => {
    for (const entry of ws.logs) {
      if (entry.elapsed_sec && entry.elapsed_sec > 0 && entry.status === 'completed') {
        setStepElapsed(prev => ({ ...prev, [entry.step_num]: entry.elapsed_sec! }))
      }
      // executor.py 메시지 형식: "추출 complete: /path/file.txt (3643건, ...)" (status='running' row)
      if (entry.message && entry.step_num >= 1) {
        const m = entry.message.match(/complete:\s*(\/[^\s(]+)\s*(\([^)]+\))?/)
        if (m) {
          const output = m[1].trim() + (m[2] ? ' ' + m[2] : '')
          setStepOutputs(prev => ({ ...prev, [entry.step_num]: output }))
        }
      }
    }
  }, [ws.logs])

  useEffect(() => {
    const 이전실행로드 = async () => {
      try {
        const { data } = await 클라이언트.get('/preprocess/latest-run')
        if (data.run_id) setRunId(data.run_id)
      } catch { /* ignore */ }
    }
    이전실행로드()
  }, [])

  const 실행핸들러 = async (params: {
    category: string
    start_step: number
    end_step: number
  }) => {
    // 실행 직전 파일 존재 여부 실시간 체크
    if (params.start_step <= 1) {
      try {
        const [pop, fail] = await Promise.all([
          phase1API.파일목록('popular', selectedWorkspace ?? ''),
          phase1API.파일목록('fails', selectedWorkspace ?? ''),
        ])
        const total = (pop.data.files?.length || 0) + (fail.data.files?.length || 0)
        if (total === 0) {
          message.warning('인기검색어 또는 실패검색어 파일을 먼저 업로드하세요.')
          return
        }
      } catch {
        message.warning('파일 목록 확인 실패')
        return
      }
    }
    try {
      const filterParams: Record<string, unknown> = {}
      if (params.start_step <= 1) {
        const mode = rankEnabled && countEnabled
          ? combineMode === 'and' ? 'both_and' : 'both_or'
          : rankEnabled ? 'rank' : 'count'
        filterParams.filter_mode = mode
        filterParams.sort_by = sortBy
        if (rankEnabled && countEnabled) {
          filterParams.rank_value = rankValue
          filterParams.count_value = countValue
        } else {
          filterParams.filter_value = rankEnabled ? rankValue : countValue
        }
      }
      const { data } = await phase1API.실행({
        ...params,
        workspace: selectedWorkspace ?? '',
        domain: selectedDomain ?? '',
        ...filterParams,
      } as any)
      setRunStartStep(params.start_step)
      setRunId(data.run_id)
      // 1단계부터 시작 시 파일 탭 + 단계 결과 초기화, 개별실행 시 기존 탭 유지
      if (params.start_step === 1) {
        setFileTabs({})
        setActiveViewTab(null)
        setFileStatus({})
        setStepElapsed({})
        setStepOutputs({})
      }
    } catch (err: any) {
      message.error(err.response?.data?.detail || '실행 시작 실패')
    }
  }

  // 프리징 (6단계)
  const [freezeStatus, setFreezeStatus] = useState<string>('')

  const 프리징핸들러 = async () => {
    if (!selectedWorkspace || !selectedDomain) {
      message.warning('워크스페이스와 도메인을 선택하세요')
      return
    }
    setFreezeStatus('running')
    try {
      const { data } = await assignmentApi.프리징(selectedWorkspace, selectedDomain)
      setFreezeStatus('completed')
      // phase 전이: preprocess → work (이미 work이면 건너뛰기)
      const currentPhase = useWorkspaceStore.getState().phase
      if (currentPhase === 'preprocess') {
        await useWorkspaceStore.getState().advancePhase('work')
      }
      message.success(`프리징 완료: ${data.total || 0}건`)
      navigate('/assignment')
    } catch (e: any) {
      setFreezeStatus('failed')
      message.error(e.response?.data?.detail || '프리징 실패')
    }
  }

  const 중지핸들러 = () => {
    setRunId(null)
    message.info('실행 중지')
  }

  const 파일보기 = async (rawOutput: string) => {
    // output에서 경로만 추출 (건수 정보 제거)
    const filePath = rawOutput.split(' (')[0].trim()
    const tabKey = filePath.split('/').pop() || filePath
    try {
      const { data } = await 클라이언트.get('/preprocess/view-file', { params: { path: filePath } })
      setFileTabs(prev => ({ ...prev, [tabKey]: data.content }))
      setActiveViewTab(tabKey)
    } catch {
      message.error('파일 읽기 실패')
    }
  }

  // 파일 존재 기반으로 stepStatuses 보정
  const 유효단계상태 = useMemo(() => {
    // 실행 중이면 WebSocket 실시간 상태 + 이전 단계 자동 완료 처리
    if (runId !== null && !ws.isCompleted) {
      const statuses = { ...ws.stepStatuses }
      const runningEntry = Object.entries(statuses).find(([, s]) => s === 'running')
      const runningStepNum = runningEntry ? parseInt(runningEntry[0]) : -1
      if (runningStepNum > 0) {
        for (let i = 1; i < runningStepNum; i++) {
          statuses[i] = 'completed'
        }
      }
      return statuses
    }

    // 실행 중이 아닐 때만 fileStatus로 검증
    const fileToStep: Record<string, number> = { keywords: 1, refine: 2 }
    const result = { ...ws.stepStatuses }
    if (Object.keys(fileStatus).length > 0) {
      for (const [file, stepNum] of Object.entries(fileToStep)) {
        if (result[stepNum] === 'completed' && !fileStatus[file]) {
          delete result[stepNum]
        }
      }
    }
    return result
  }, [ws.stepStatuses, ws.isCompleted, runId, fileStatus])

  const 실행중 = runId !== null && !ws.isCompleted

  if (!selectedWorkspace) {
    return <Result status="warning" title="워크스페이스와 도메인을 먼저 선택하세요." />
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        title="데이터 전처리"
        showNext={유효단계상태[5] === 'completed' && !실행중}
        nextLabel="다음단계로 (데이터할당)"
        nextLoading={freezeStatus === 'running'}
        onNext={프리징핸들러}
      />

      <Card title="파일관리" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <FilePanel folder="popular" workspace={selectedWorkspace ?? undefined} />
          </Col>
          <Col xs={24} lg={12}>
            <FilePanel folder="fails" workspace={selectedWorkspace ?? undefined} />
          </Col>
        </Row>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <Row gutter={0}>
          <Col xs={24} lg={13} style={{ borderRight: '1px solid #f0f0f0' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>전처리 실행</span>
              {실행중 ? (
                <Button danger size="small" icon={<PauseCircleOutlined />} onClick={중지핸들러}>
                  중지
                </Button>
              ) : (
                <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => 실행핸들러({ category: 'popular', start_step: 1, end_step: 5 })}>
                  전체 실행 (1→5)
                </Button>
              )}
            </div>
            <div style={{ padding: 16 }}>
              <ControlPanel
                folder="popular"
                onRun={실행핸들러}
                onStop={중지핸들러}
                onViewFile={파일보기}
                isRunning={실행중}
                stepStatuses={유효단계상태}
                stepElapsed={stepElapsed}
                stepOutputs={stepOutputs}
                rankEnabled={rankEnabled}
                rankValue={rankValue}
                rankPreset={rankPreset}
                countEnabled={countEnabled}
                countValue={countValue}
                countPreset={countPreset}
                combineMode={combineMode}
                sortBy={sortBy}
                onRankEnabledChange={setRankEnabled}
                onRankValueChange={setRankValue}
                onRankPresetChange={setRankPreset}
                onCountEnabledChange={setCountEnabled}
                onCountValueChange={setCountValue}
                onCountPresetChange={setCountPreset}
                onCombineModeChange={setCombineMode}
                onSortByChange={setSortBy}
                onFreeze={프리징핸들러}
                freezeDisabled={실행중 || 유효단계상태[5] !== 'completed' || freezeStatus === 'running'}
                freezeLoading={freezeStatus === 'running'}
              />
            </div>
          </Col>
          <Col xs={24} lg={11}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>실행 로그</span>
            </div>
            <div style={{ padding: 16, minHeight: 450 }}>
              <LogPanel
                logs={ws.logs}
                fileTabs={fileTabs}
                activeViewTab={activeViewTab}
                onTabChange={setActiveViewTab}
                isRunning={실행중}
              />
            </div>
          </Col>
        </Row>
      </Card>


    </div>
  )
}
