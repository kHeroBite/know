import { Button, Space, Typography, Tag, Progress, Select, InputNumber } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, EyeOutlined } from '@ant-design/icons'

const { Text } = Typography

const 단계목록 = [
  { num: 1, name: '키워드추출', color: '#1677ff', output: 'keywords.txt' },
  { num: 2, name: '정제', color: '#52c41a', output: 'refine.txt' },
  { num: 3, name: '형태소분석', color: '#722ed1', output: 'analyzed.txt' },
  { num: 4, name: '결과변환', color: '#fa8c16', output: 'transform.txt' },
  { num: 5, name: '유사어체크', color: '#eb2f96', output: 'synonym.txt' },
]

export const 단계색상맵: Record<string, string> = {
  '키워드추출': '#1677ff',
  '정제': '#52c41a',
  '형태소분석': '#722ed1',
  '결과변환': '#fa8c16',
  '유사어체크': '#eb2f96',
}

interface RunParams {
  category: string
  start_step: number
  end_step: number
  filter_mode?: string
  filter_value?: number
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
  filterMode: 'rank' | 'count'
  filterValue: number
  sortBy: 'count' | 'rank'
  onFilterModeChange: (mode: 'rank' | 'count') => void
  onFilterValueChange: (value: number) => void
  onSortByChange: (sortBy: 'count' | 'rank') => void
}

function 경과표시(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}초`
  return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`
}

export default function ControlPanel({
  folder, onRun, onStop, onViewFile, isRunning, stepStatuses, stepElapsed, stepOutputs,
  filterMode, filterValue, sortBy, onFilterModeChange, onFilterValueChange, onSortByChange,
}: ControlPanelProps) {
  const 단계실행 = (stepNum: number) => {
    const runParams: RunParams = { category: folder, start_step: stepNum, end_step: stepNum }
    if (stepNum <= 1) {
      runParams.filter_mode = filterMode
      runParams.filter_value = filterValue
      runParams.sort_by = sortBy
    }
    onRun(runParams)
  }

  const 실행가능 = (stepNum: number): boolean => {
    if (isRunning) return false
    if (stepNum === 1) return true
    // 이전 단계 완료이거나, 자기 이후 단계가 완료된 경우(이전 단계도 이미 완료된 것)
    if (stepStatuses[stepNum - 1] === 'completed') return true
    for (let i = stepNum; i <= 5; i++) {
      if (stepStatuses[i] === 'completed') return true
    }
    return false
  }

  const rankPresets = [50000, 100000, 150000, 200000]
  const countPresets = [5, 10, 50, 100]

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
              }}>
                <Tag color={step.color} style={{ margin: 0, minWidth: 80, textAlign: 'center' }}>
                  {step.name}
                </Tag>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {completed && (
                    <>
                      <Text type="success"><CheckCircleOutlined /> 완료</Text>
                      {elapsed && elapsed > 0 && <Text type="secondary" style={{ fontSize: 12 }}>({경과표시(elapsed)})</Text>}
                      {output && (() => { const m = output.match(/\(([^)]+)\)/); return m ? <Text style={{ fontSize: 12, color: step.color }}>{m[1]}</Text> : null })()}
                    </>
                  )}
                  {running && (
                    <div style={{ flex: 1 }}>
                      <Text style={{ color: step.color }}><ClockCircleOutlined /> 실행 중</Text>
                      <Progress percent={50} size="small" status="active" showInfo={false} strokeColor={step.color} style={{ margin: '2px 0 0', maxWidth: 120 }} />
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
                  <Space size={6} wrap>
                    <Text style={{ fontSize: 12, color: '#555' }}>추출기준</Text>
                    <Select
                      size="small"
                      value={filterMode}
                      onChange={(val: 'rank' | 'count') => {
                        onFilterModeChange(val)
                        onFilterValueChange(val === 'rank' ? 150000 : 10)
                      }}
                      style={{ width: 120 }}
                      options={[
                        { label: '상위 N개', value: 'rank' },
                        { label: '최소 N회 이상', value: 'count' },
                      ]}
                    />
                    <InputNumber
                      size="small"
                      value={filterValue === 9999999 ? undefined : filterValue}
                      placeholder="전체"
                      onChange={(val) => val != null && onFilterValueChange(val)}
                      style={{ width: 90 }}
                    />
                    <Space size={2}>
                      {filterMode === 'rank'
                        ? rankPresets.map(v => (
                          <Tag.CheckableTag
                            key={v}
                            checked={filterValue === v}
                            onChange={() => onFilterValueChange(v)}
                          >
                            {`${v / 10000}만`}
                          </Tag.CheckableTag>
                        ))
                        : countPresets.map(v => (
                          <Tag.CheckableTag
                            key={v}
                            checked={filterValue === v}
                            onChange={() => onFilterValueChange(v)}
                          >
                            {v}
                          </Tag.CheckableTag>
                        ))
                      }
                      <Tag.CheckableTag
                        checked={filterValue === 9999999}
                        onChange={() => onFilterValueChange(9999999)}
                      >
                        전체
                      </Tag.CheckableTag>
                    </Space>
                    <Text style={{ fontSize: 12, color: '#555' }}>정렬</Text>
                    <Select
                      size="small"
                      value={sortBy}
                      onChange={onSortByChange}
                      style={{ width: 140 }}
                      options={[
                        { label: '검색횟수순', value: 'count' },
                        { label: '등수순(원본순서)', value: 'rank' },
                      ]}
                    />
                  </Space>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
