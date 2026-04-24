import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Button, message, Result, Tabs } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons'
import FilePanel from '../components/phase1/FilePanel'
import ControlPanel from '../components/phase1/ControlPanel'
import LogPanel from '../components/phase1/LogPanel'
import DataFilePanel from '../components/phase1/DataFilePanel'
import DataControlPanel from '../components/phase1/DataControlPanel'
import { usePhase1WebSocket } from '../hooks/usePhase1WebSocket'
import { usePhase1DataWebSocket } from '../hooks/usePhase1DataWebSocket'
import { phase1API } from '../api/phase1'
import { phase1DataAPI, type ColumnSpec } from '../api/phase1Data'
import { useWorkspaceStore } from '../stores/workspaceStore'
import 클라이언트 from '../api/client'
import PageHeader from '../components/PageHeader'

export default function Phase1Pipeline() {
  // ── 로그기반 상태 ──
  const [runId, setRunId] = useState<string | null>(null)
  const [runStartStep, setRunStartStep] = useState(1)
  const ws = usePhase1WebSocket(runId, runStartStep)
  const [, setHasLogFiles] = useState(false)
  const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({})
  const [rankEnabled, setRankEnabled] = useState(true)
  const [rankValue, setRankValue] = useState(150000)
  const [rankPreset, setRankPreset] = useState('150000')
  const [countEnabled, setCountEnabled] = useState(false)
  const [countValue, setCountValue] = useState(5)
  const [countPreset, setCountPreset] = useState('5')
  const [combineMode, setCombineMode] = useState<'and' | 'or'>('and')
  const [sortBy, setSortBy] = useState<'count' | 'rank'>('count')
  const [freezeStatus, setFreezeStatus] = useState<'idle' | 'running'>('idle')
  const [fileTabs, setFileTabs] = useState<Record<string, string>>({})
  const [activeViewTab, setActiveViewTab] = useState<string | null>(null)
  const [stepElapsed, setStepElapsed] = useState<Record<number, number>>({})
  const [stepOutputs, setStepOutputs] = useState<Record<number, string>>({})

  // ── 데이터기반 상태 ──
  const [dataRunId, setDataRunId] = useState<string | null>(null)
  const dataWs = usePhase1DataWebSocket(dataRunId)
  const [dataFilesCount, setDataFilesCount] = useState<number>(0)
  const [dataFilenames, setDataFilenames] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<ColumnSpec[]>([])

  // ── 탭 선택 상태 ──
  const [activeTab, setActiveTab] = useState<'log' | 'data'>('log')

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()

  const 프리징핸들러 = async () => {
    if (!selectedWorkspace || !selectedDomain) return
    setFreezeStatus('running')
    try {
      await 클라이언트.post('/phase1/freeze', { workspace: selectedWorkspace, domain: selectedDomain })
      message.success('프리징 완료')
    } catch {
      message.error('프리징 실패')
    } finally {
      setFreezeStatus('idle')
    }
  }

  // ── 로그기반: 파일 존재 여부 체크 ──
  useEffect(() => {
    const checkFiles = async () => {
      if (!selectedWorkspace) { setHasLogFiles(false); return }
      try {
        const [pop, fail] = await Promise.all([
          phase1API.파일목록('popular', selectedWorkspace),
          phase1API.파일목록('fails', selectedWorkspace),
        ])
        const total = (pop.data.files?.length || 0) + (fail.data.files?.length || 0)
        setHasLogFiles(total > 0)
      } catch { setHasLogFiles(false) }
    }
    checkFiles()
  }, [selectedWorkspace])

  // ── 로그기반: 단계별 결과 파일 존재 여부 ──
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

  // ── 로그기반: 단계별 경과시간 + output 경로 집계 ──
  const stepPercents = useMemo(() => {
    const result: Record<number, number> = {}
    for (const entry of ws.logs) {
      if (entry.step_num >= 1 && entry.percent != null) {
        result[entry.step_num] = entry.percent
      }
    }
    return result
  }, [ws.logs])

  useEffect(() => {
    for (const entry of ws.logs) {
      if (entry.elapsed_sec && entry.elapsed_sec > 0 && entry.status === 'completed') {
        setStepElapsed(prev => ({ ...prev, [entry.step_num]: entry.elapsed_sec! }))
      }
      if (entry.message && entry.step_num >= 1) {
        const m = entry.message.match(/complete:\s*(\/[^\s(]+)\s*(\([^)]+\))?/)
        if (m) {
          const output = m[1].trim() + (m[2] ? ' ' + m[2] : '')
          setStepOutputs(prev => ({ ...prev, [entry.step_num]: output }))
        }
      }
    }
  }, [ws.logs])

  // ── 워크스페이스 변경 시 상태 초기화 ──
  useEffect(() => {
    setRunId(null)
    setFileTabs({})
    setActiveViewTab(null)
    setFileStatus({})
    setStepElapsed({})
    setStepOutputs({})
    setDataRunId(null)
    setDataFilesCount(0)
    setDataFilenames([])
  }, [selectedWorkspace])

  // ── reset=1 파라미터 감지 ──
  useEffect(() => {
    if (searchParams.get('reset') === '1') {
      setRunId(null)
      setFileTabs({})
      setActiveViewTab(null)
      setFileStatus({})
      setStepElapsed({})
      setStepOutputs({})
      setDataRunId(null)
      setSearchParams({})
    }
    // ── tab 파라미터 감지 (WorkComplete 재시작 시) ──
    const tabParam = searchParams.get('tab')
    if (tabParam === 'data' || tabParam === 'log') {
      setActiveTab(tabParam)
      setSearchParams({})
    }
  }, [searchParams])

  // ── 이전 로그기반 run 복원 ──
  useEffect(() => {
    const 이전실행로드 = async () => {
      try {
        const { data } = await 클라이언트.get('/preprocess/latest-run', {
          params: { workspace: selectedWorkspace ?? '' }
        })
        if (data.run_id) setRunId(data.run_id)
      } catch { /* ignore */ }
    }
    이전실행로드()
  }, [selectedWorkspace])

  // ── 이전 데이터기반 run 복원 ──
  useEffect(() => {
    const 이전데이터실행로드 = async () => {
      try {
        const { data } = await phase1DataAPI.최근실행(selectedWorkspace ?? '')
        if (data.run_id) setDataRunId(data.run_id)
      } catch { /* ignore */ }
    }
    이전데이터실행로드()
  }, [selectedWorkspace])

  // ── 도메인 변경 시 컬럼 설정 prefill ──
  useEffect(() => {
    const prefillColumns = async () => {
      if (!selectedDomain) {
        setSelectedColumns([])
        return
      }
      try {
        const { data } = await phase1DataAPI.컬럼설정조회(selectedDomain)
        setSelectedColumns(data.selected_columns || [])
      } catch {
        setSelectedColumns([])
      }
    }
    prefillColumns()
  }, [selectedDomain])

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
      if (params.start_step === 1) {
        setFileTabs({})
        setActiveViewTab(null)
        setFileStatus({})
        setStepElapsed({})
        setStepOutputs({})
      }
      // 로그기반 실행 시작 → method 저장
      if (selectedWorkspace) {
        localStorage.setItem(`preprocess_method_${selectedWorkspace}`, 'log')
      }
    } catch (err: any) {
      message.error(err.response?.data?.detail || '실행 시작 실패')
    }
  }

  // ── 데이터기반 실행 ──
  const 데이터실행핸들러 = async () => {
    if (dataFilenames.length === 0) {
      message.warning('업로드된 데이터 파일이 없습니다')
      return
    }
    if (selectedColumns.length === 0) {
      message.warning('컬럼을 먼저 선택하세요 ("컬럼 분석" 버튼)')
      return
    }
    try {
      const { data } = await phase1DataAPI.실행({
        filenames: dataFilenames,
        columns: selectedColumns,
        workspace: selectedWorkspace ?? '',
        domain: selectedDomain ?? '',
      })
      setDataRunId(data.run_id)
      // 데이터기반 실행 시작 → method 저장
      if (selectedWorkspace) {
        localStorage.setItem(`preprocess_method_${selectedWorkspace}`, 'data')
      }
    } catch (err: any) {
      message.error(err.response?.data?.detail || '데이터 전처리 실행 실패')
    }
  }

  // 다음단계 전이 (6단계 완료 후 phase preprocess → work)
  const [nextLoading, setNextLoading] = useState(false)

  const 다음단계핸들러 = async () => {
    if (!selectedWorkspace || !selectedDomain) {
      message.warning('워크스페이스와 도메인을 선택하세요')
      return
    }
    setNextLoading(true)
    try {
      const currentPhase = useWorkspaceStore.getState().phase
      if (currentPhase === 'preprocess') {
        await useWorkspaceStore.getState().advancePhase('work')
      }
      // 현재 활성 탭의 method를 localStorage에 저장 → 데이터할당에서 참조
      if (selectedWorkspace) {
        localStorage.setItem(`preprocess_method_${selectedWorkspace}`, activeTab === 'log' ? 'log' : 'data')
      }
      navigate('/assignment')
    } catch (e: any) {
      message.error(e.response?.data?.detail || '단계 전이 실패')
    } finally {
      setNextLoading(false)
    }
  }

  const 중지핸들러 = () => {
    setRunId(null)
    message.info('실행 중지')
  }

  const 파일보기 = async (rawOutput: string) => {
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
  const 데이터실행중 = dataRunId !== null && !dataWs.isCompleted
  const 데이터파일있음 = dataFilesCount > 0

  // 다음단계 조건: 현재 활성 탭 기준으로만 판단
  const 로그기반완료 = 유효단계상태[6] === 'completed' && !실행중
  const 데이터기반완료 = dataWs.isCompleted && !데이터실행중
  const 다음단계가능 = activeTab === 'log' ? 로그기반완료 : 데이터기반완료

  if (!selectedWorkspace) {
    return <Result status="warning" title="워크스페이스와 도메인을 먼저 선택하세요." />
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader
        title="데이터 전처리"
        showNext={다음단계가능}
        nextLabel="다음단계로 (데이터할당)"
        nextLoading={nextLoading}
        onNext={다음단계핸들러}
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'log' | 'data')}
        type="card"
        destroyInactiveTabPane
        style={{ padding: '0 0' }}
        items={[
          {
            key: 'log',
            label: '로그기반 전처리',
            children: (
              <div>
                <Card style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <FilePanel folder="popular" workspace={selectedWorkspace ?? undefined} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <FilePanel folder="fails" workspace={selectedWorkspace ?? undefined} />
                    </div>
                  </div>
                </Card>

                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <Card bodyStyle={{ padding: 0 }} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>전처리 실행</span>
                      {실행중 ? (
                        <Button danger size="small" icon={<PauseCircleOutlined />} onClick={중지핸들러}>
                          중지
                        </Button>
                      ) : (
                        <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => 실행핸들러({ category: 'popular', start_step: 1, end_step: 6 })}>
                          전체 실행 (1→6)
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
                        stepPercents={stepPercents}
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
                  </Card>

                  <Card bodyStyle={{ padding: 0 }} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>실행 로그</span>
                    </div>
                    <div style={{ padding: 16, minHeight: 300 }}>
                      <LogPanel
                        logs={ws.logs}
                        fileTabs={fileTabs}
                        activeViewTab={activeViewTab}
                        onTabChange={setActiveViewTab}
                        isRunning={실행중}
                      />
                    </div>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            key: 'data',
            label: '데이터기반 전처리',
            children: (
              <div>
                <Card style={{ marginBottom: 16 }}>
                  <DataFilePanel
                    workspace={selectedWorkspace ?? undefined}
                    domain={selectedDomain ?? undefined}
                    selectedColumns={selectedColumns}
                    onFilesChange={(count, filenames) => {
                      setDataFilesCount(count)
                      setDataFilenames(filenames)
                    }}
                    onColumnsConfigured={(cols) => {
                      setSelectedColumns(cols)
                    }}
                  />
                </Card>

                <Card bodyStyle={{ padding: 16 }}>
                  <DataControlPanel
                    workspace={selectedWorkspace ?? undefined}
                    selectedColumns={selectedColumns}
                    filenames={dataFilenames}
                    onRun={데이터실행핸들러}
                    isRunning={데이터실행중}
                    isCompleted={dataWs.isCompleted}
                    logs={dataWs.logs}
                    runId={dataRunId}
                    hasFiles={데이터파일있음}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
