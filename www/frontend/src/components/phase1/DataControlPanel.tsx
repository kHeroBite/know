import { Button, Space, Typography, Tag, Progress } from 'antd'
import {
  PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, SettingOutlined,
} from '@ant-design/icons'

const { Text } = Typography

// ── 데이터기반 전처리 6단계 정의 ──
const 단계목록 = [
  { num: 1, name: '컬럼분석',   color: '#1677ff', output: 'output/*.txt' },
  { num: 2, name: '정제',       color: '#52c41a', output: 'refine.txt' },
  { num: 3, name: '형태소분석', color: '#fa8c16', output: 'analyzed.txt' },
  { num: 4, name: '결과변환',   color: '#722ed1', output: 'transform.txt' },
  { num: 5, name: '유사어검사', color: '#eb2f96', output: 'synonym.txt' },
  { num: 6, name: 'DB업데이트', color: '#13c2c2', output: '' },
]

interface DataControlPanelProps {
  workspace: string
  // 파일/컬럼 정보
  selectedColumns: Array<{ name: string; split_delimiter?: string | null }>
  filenames: string[]
  hasFiles: boolean
  // 실행 상태
  isRunning: boolean
  isCompleted: boolean
  runId: string | null
  // 단계 상태
  stepStatuses: Record<number, string>
  stepPercents?: Record<number, number>
  stepElapsed?: Record<number, number>
  stepOutputs?: Record<number, string>
  // 콜백
  onRunAll: () => void
  onRunStep: (stepNum: number) => void
  onOpenColumnModal: () => void
}

function 경과표시(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}초`
  return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`
}

export default function DataControlPanel({
  selectedColumns, filenames, hasFiles,
  isRunning, isCompleted, runId,
  stepStatuses, stepPercents, stepElapsed, stepOutputs,
  onRunAll, onRunStep, onOpenColumnModal,
}: DataControlPanelProps) {

  const 실행가능 = (stepNum: number): boolean => {
    if (isRunning) return false
    if (stepNum === 1) return hasFiles && selectedColumns.length > 0
    // 이전 단계가 completed이거나, 해당 단계 이후가 이미 completed면 허용
    if (stepStatuses[stepNum - 1] === 'completed') return true
    for (let i = stepNum; i <= 6; i++) {
      if (stepStatuses[i] === 'completed') return true
    }
    return false
  }

  const 전체실행가능 = !isRunning && hasFiles && selectedColumns.length > 0

  return (
    <div>
      {/* 전체 실행 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={!전체실행가능}
          onClick={onRunAll}
          style={{ flex: 1 }}
        >
          전체 실행 (6단계)
        </Button>
        <Button
          icon={<SettingOutlined />}
          onClick={onOpenColumnModal}
          title="컬럼 선택 설정"
        >
          컬럼분석
        </Button>
      </div>

      {/* 6단계 카드 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {단계목록.map(step => {
          // step 1: selectedColumns 기반으로 완료 여부 판단
          const isStep1 = step.num === 1
          const step1Done = isStep1 && selectedColumns.length >= 1
          const status = isStep1
            ? (step1Done ? 'completed' : (stepStatuses[1] ?? undefined))
            : stepStatuses[step.num]
          const elapsed = stepElapsed?.[step.num] ?? 0
          const output = stepOutputs?.[step.num] ?? ''
          // output에서 정보 추출: "(N건, 형태소:M ...)" 또는 괄호 없는 "N건"
          const outputInfo = (() => {
            const m = output.match(/\(([^)]+)\)/)
            if (m) return m[1]
            const m2 = output.match(/^(\d+[^\n]*)$/)
            return m2 ? m2[1] : null
          })()
          const running = status === 'running'
          const completed = status === 'completed'
          const failed = status === 'failed'

          return (
            <div
              key={step.num}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                background: running ? `${step.color}08` : completed ? '#f6ffed' : failed ? '#fff2f0' : '#fafafa',
                border: `1px solid ${running ? step.color : completed ? '#b7eb8f' : failed ? '#ffa39e' : '#f0f0f0'}`,
                minHeight: 44,
              }}
            >
              {/* 단계 태그 */}
              <Tag color={step.color} style={{ margin: 0, minWidth: 72, textAlign: 'center' }}>
                {step.name}
              </Tag>

              {/* 상태 영역 */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                {completed && (
                  <>
                    <Text type="success"><CheckCircleOutlined /> 완료</Text>
                    {/* step 1: 파일/컬럼 요약 표시 */}
                    {isStep1 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        파일 {filenames.length}개 | 컬럼 {selectedColumns.length}개
                        {selectedColumns.length > 0 && (
                          <>
                            {' ('}
                            {selectedColumns.slice(0, 3).map(c => c.name).join(', ')}
                            {selectedColumns.length > 3 ? ` 외 ${selectedColumns.length - 3}개` : ''}
                            {')'}
                          </>
                        )}
                      </Text>
                    ) : (
                      <>
                        {elapsed > 0 && (
                          <Text type="secondary" style={{ fontSize: 12 }}>({경과표시(elapsed)})</Text>
                        )}
                        {outputInfo && (
                          <Text style={{ fontSize: 12, color: step.color }}>{outputInfo}</Text>
                        )}
                      </>
                    )}
                  </>
                )}
                {running && (
                  <div style={{ flex: 1 }}>
                    <Text style={{ color: step.color }}><ClockCircleOutlined /> 실행 중</Text>
                    <Progress
                      percent={stepPercents?.[step.num] ?? 0}
                      size="small"
                      status="active"
                      showInfo={stepPercents?.[step.num] != null}
                      strokeColor={step.color}
                      style={{ margin: '2px 0 0', maxWidth: 160 }}
                      format={(p) => `${p}%`}
                    />
                  </div>
                )}
                {failed && <Text type="danger"><CloseCircleOutlined /> 실패</Text>}
                {!status && <Text type="secondary" style={{ fontSize: 12 }}>대기</Text>}
              </div>

              {/* 단계 실행 버튼 (step 1 컬럼분석은 제외) */}
              {step.num !== 1 && (
                <Space size={4}>
                  <Button
                    size="small"
                    type={completed ? 'default' : 'primary'}
                    style={!completed && !running ? { background: step.color, borderColor: step.color } : {}}
                    icon={<PlayCircleOutlined />}
                    disabled={!실행가능(step.num)}
                    onClick={() => onRunStep(step.num)}
                  >
                    실행
                  </Button>
                </Space>
              )}
            </div>
          )
        })}
      </div>

      {/* run_id 표시 */}
      {runId && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#bbb', wordBreak: 'break-all' }}>
          실행ID: {runId}
        </div>
      )}
    </div>
  )
}
