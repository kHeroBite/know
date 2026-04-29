import { useRef } from 'react'
import { Button, Space, Typography, Tag, Progress, Select, InputNumber, Checkbox } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, EyeOutlined } from '@ant-design/icons'

const { Text } = Typography

const 단계목록 = [
  { num: 1, name: '키워드추출', color: '#1677ff', output: 'keywords.txt' },
  { num: 2, name: '정제', color: '#52c41a', output: 'refine.txt' },
  { num: 3, name: '형태소분석', color: '#fa8c16', output: 'analyzed.txt' },
  { num: 4, name: '결과변환', color: '#722ed1', output: 'transform.txt' },
  { num: 5, name: '유사어검사', color: '#eb2f96', output: 'synonym.txt' },
  { num: 6, name: 'DB업데이트', color: '#13c2c2', output: '' },
]

export const 단계색상맵: Record<string, string> = {
  '키워드추출': '#1677ff',
  '정제': '#52c41a',
  '형태소분석': '#fa8c16',
  '결과변환': '#722ed1',
  '유사어검사': '#eb2f96',
  'DB업데이트': '#13c2c2',
}

interface RunParams {
  category: string
  start_step: number
  end_step: number
  filter_mode?: string
  filter_value?: number
  rank_value?: number
  count_value?: number
  sort_by?: string
}

interface ControlPanelProps {
  folder: 'popular' | 'fails'
  onRun: (params: RunParams) => void
  onStop?: () => void
  onViewFile?: (filePath: string) => void
  isRunning: boolean
  stepStatuses: Record<number, string>
  stepElapsed: Record<number, number>
  stepOutputs: Record<number, string>
  stepPercents?: Record<number, number>
  rankEnabled: boolean
  rankValue: number
  rankPreset: string
  countEnabled: boolean
  countValue: number
  countPreset: string
  combineMode: 'and' | 'or'
  sortBy: 'count' | 'rank'
  onRankEnabledChange: (v: boolean) => void
  onRankValueChange: (v: number) => void
  onRankPresetChange: (v: string) => void
  onCountEnabledChange: (v: boolean) => void
  onCountValueChange: (v: number) => void
  onCountPresetChange: (v: string) => void
  onCombineModeChange: (v: 'and' | 'or') => void
  onSortByChange: (v: 'count' | 'rank') => void
  onFreeze?: () => void
  freezeDisabled?: boolean
  freezeLoading?: boolean
}

function 경과표시(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}초`
  return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`
}

export default function ControlPanel({
  folder, onRun, onStop, onViewFile, isRunning, stepStatuses, stepElapsed, stepOutputs,
  stepPercents,
  rankEnabled, rankValue, rankPreset, countEnabled, countValue, countPreset,
  combineMode, sortBy,
  onRankEnabledChange, onRankValueChange, onRankPresetChange,
  onCountEnabledChange, onCountValueChange, onCountPresetChange,
  onCombineModeChange, onSortByChange,
  onFreeze, freezeDisabled, freezeLoading,
}: ControlPanelProps) {
  const rankInputRef = useRef<any>(null)
  const countInputRef = useRef<any>(null)

  const 단계실행 = (stepNum: number) => {
    const runParams: RunParams = { category: folder, start_step: stepNum, end_step: stepNum }
    if (stepNum <= 1) {
      const mode = rankEnabled && countEnabled
        ? combineMode === 'and' ? 'both_and' : 'both_or'
        : rankEnabled ? 'rank' : 'count'
      runParams.filter_mode = mode
      runParams.sort_by = sortBy
      if (rankEnabled && countEnabled) {
        runParams.rank_value = rankValue
        runParams.count_value = countValue
      } else {
        runParams.filter_value = rankEnabled ? rankValue : countValue
      }
    }
    onRun(runParams)
  }

  const 실행가능 = (stepNum: number): boolean => {
    if (isRunning) return false
    if (stepNum === 1) return true
    if (stepStatuses[stepNum - 1] === 'completed') return true
    for (let i = stepNum; i <= 6; i++) {
      if (stepStatuses[i] === 'completed') return true
    }
    return false
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {단계목록.map(step => {
          const status = stepStatuses[step.num]
          const elapsed = stepElapsed[step.num]
          const output = stepOutputs[step.num]
          const running = status === 'running'
          const completed = status === 'completed'
          const failed = status === 'failed'

          return (
            <div key={step.num}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: step.num === 1 ? '8px 8px 0 0' : 8,
                background: running ? `${step.color}08` : completed ? '#f6ffed' : failed ? '#fff2f0' : '#fafafa',
                border: `1px solid ${running ? step.color : completed ? '#b7eb8f' : failed ? '#ffa39e' : '#f0f0f0'}`,
                borderBottom: step.num === 1 ? 'none' : undefined,
                minHeight: 44,
              }}>
                <Tag color={step.color} style={{ margin: 0, minWidth: 80, textAlign: 'center' }}>
                  {step.name}
                </Tag>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
                  {completed && (
                    <>
                      <Text type="success"><CheckCircleOutlined /> 완료</Text>
                      {elapsed && elapsed > 0 && <Text type="secondary" style={{ fontSize: 12 }}>({경과표시(elapsed)})</Text>}
                      {output && (() => {
                        const m = output.match(/\(([^)]+)\)/)
                        if (m) return <Text style={{ fontSize: 12, color: step.color }}>{m[1]}</Text>
                        // 괄호 없는 "N건" 형태 (DB업데이트 등)
                        const m2 = output.match(/^(\d+[^\n]*)$/)
                        if (m2) return <Text style={{ fontSize: 12, color: step.color }}>{m2[1]}</Text>
                        return null
                      })()}
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
                  {!status && <Text type="secondary">대기</Text>}
                </div>
                <Space size={4}>
                  {completed && output && onViewFile && (
                    <Button size="small" icon={<EyeOutlined />} onClick={() => onViewFile(output)}>
                      보기
                    </Button>
                  )}
                  <Button
                    size="small"
                    type={completed ? 'default' : 'primary'}
                    style={!completed && !running ? { background: step.color, borderColor: step.color } : {}}
                    icon={<PlayCircleOutlined />}
                    disabled={!실행가능(step.num)}
                    onClick={() => 단계실행(step.num)}
                  >
                    실행
                  </Button>
                </Space>
              </div>
              {step.num === 1 && (
                <div style={{
                  padding: '6px 12px 8px',
                  background: '#f0f5ff',
                  border: '1px solid #adc6ff',
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  marginBottom: 0,
                }}>
                  {/* 상위N개 행 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'nowrap' }}>
                    <Checkbox
                      checked={rankEnabled}
                      onChange={e => onRankEnabledChange(e.target.checked)}
                    >
                      <Text style={{ fontSize: 12 }}>상위N개</Text>
                    </Checkbox>
                    <InputNumber
                      ref={rankInputRef}
                      size="small"
                      value={rankValue}
                      onChange={v => { if (v != null) { onRankValueChange(v); onRankPresetChange('custom') } }}
                      disabled={!rankEnabled || rankPreset !== 'custom'}
                      min={1}
                      style={{ width: 90 }}
                    />
                    <Select
                      size="small"
                      value={rankPreset}
                      onChange={(v: string) => {
                        onRankPresetChange(v)
                        if (v !== 'custom') {
                          onRankValueChange(Number(v))
                        } else {
                          setTimeout(() => rankInputRef.current?.focus(), 50)
                        }
                      }}
                      disabled={!rankEnabled}
                      options={[
                        { label: '직접입력', value: 'custom' },
                        { label: '5만', value: '50000' },
                        { label: '10만', value: '100000' },
                        { label: '15만', value: '150000' },
                        { label: '20만', value: '200000' },
                        { label: '전체', value: '9999999' },
                      ]}
                      style={{ width: 88 }}
                    />
                    {rankEnabled && countEnabled && (
                      <Select
                        size="small"
                        value={combineMode}
                        onChange={onCombineModeChange}
                        options={[
                          { label: 'AND', value: 'and' },
                          { label: 'OR', value: 'or' },
                        ]}
                        style={{ width: 68 }}
                      />
                    )}
                  </div>
                  {/* 최소N회 행 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    <Checkbox
                      checked={countEnabled}
                      onChange={e => onCountEnabledChange(e.target.checked)}
                    >
                      <Text style={{ fontSize: 12 }}>최소N회</Text>
                    </Checkbox>
                    <InputNumber
                      ref={countInputRef}
                      size="small"
                      value={countValue}
                      onChange={v => { if (v != null) { onCountValueChange(v); onCountPresetChange('custom') } }}
                      disabled={!countEnabled || countPreset !== 'custom'}
                      min={1}
                      style={{ width: 90 }}
                    />
                    <Select
                      size="small"
                      value={countPreset}
                      onChange={(v: string) => {
                        onCountPresetChange(v)
                        if (v !== 'custom') {
                          onCountValueChange(Number(v))
                        } else {
                          setTimeout(() => countInputRef.current?.focus(), 50)
                        }
                      }}
                      disabled={!countEnabled}
                      options={[
                        { label: '직접입력', value: 'custom' },
                        { label: '5', value: '5' },
                        { label: '10', value: '10' },
                        { label: '50', value: '50' },
                        { label: '100', value: '100' },
                      ]}
                      style={{ width: 88 }}
                    />
                    <Select
                      size="small"
                      value={sortBy}
                      onChange={onSortByChange}
                      options={[
                        { label: '빈도순', value: 'count' },
                        { label: '등수순', value: 'rank' },
                      ]}
                      style={{ width: 80 }}
                    />
                  </div>
                </div>
              )}
              {/* 다음단계로 버튼은 PageHeader 우측 상단으로 이동됨 */}
            </div>
          )
        })}
      </div>
    </div>
  )
}
