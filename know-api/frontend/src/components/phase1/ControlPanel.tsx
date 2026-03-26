import { Select, Slider, Button, Space, Tooltip, Typography } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

const 도메인목록 = ['it', 'law', 'med', 'eco', 'sci', 'general']

const 단계마크 = {
  0: '업로드',
  1: '정제',
  2: '형태소',
  3: '등록',
  4: '빌드',
}

interface RunParams {
  domain: string
  category: string
  filename: string
  start_step: number
  end_step: number
}

interface ControlPanelProps {
  stepRange: [number, number]
  onStepRangeChange: (range: [number, number]) => void
  selectedFile: string | null
  folder: 'popular' | 'fails'
  domain: string
  onDomainChange: (d: string) => void
  onRun: (params: RunParams) => void
  isRunning: boolean
}

export default function ControlPanel({
  stepRange, onStepRangeChange,
  selectedFile, folder, domain, onDomainChange,
  onRun, isRunning,
}: ControlPanelProps) {
  const 실행가능 = !!selectedFile && !!domain && !isRunning

  const 실행클릭 = (전체: boolean) => {
    if (!selectedFile || !domain) return
    const range = 전체 ? [0, 4] as [number, number] : stepRange
    onRun({
      domain,
      category: folder,
      filename: selectedFile,
      start_step: range[0],
      end_step: range[1],
    })
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 도메인 선택 */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>도메인 선택</Text>
        <Select
          placeholder="도메인 선택"
          style={{ width: 200 }}
          value={domain || undefined}
          onChange={onDomainChange}
          options={도메인목록.map(d => ({ value: d, label: d.toUpperCase() }))}
        />
      </div>

      {/* 선택 파일 */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>선택 파일</Text>
        {selectedFile
          ? <Text code>{selectedFile}</Text>
          : <Text type="secondary">왼쪽 패널에서 파일을 선택하세요</Text>
        }
      </div>

      {/* 단계 범위 트랙바 */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          실행 단계: {단계마크[stepRange[0] as keyof typeof 단계마크]} → {단계마크[stepRange[1] as keyof typeof 단계마크]}
        </Text>
        <Slider
          range
          min={0}
          max={4}
          step={1}
          marks={단계마크}
          value={stepRange}
          onChange={(v) => onStepRangeChange(v as [number, number])}
          style={{ marginBottom: 32 }}
          disabled={isRunning}
        />
      </div>

      {/* 실행 버튼 */}
      <Space>
        <Tooltip title={!실행가능 ? (isRunning ? '실행 중' : '파일과 도메인을 선택하세요') : ''}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => 실행클릭(false)}
            disabled={!실행가능}
            loading={isRunning}
          >
            범위 실행 ({단계마크[stepRange[0] as keyof typeof 단계마크]}~{단계마크[stepRange[1] as keyof typeof 단계마크]})
          </Button>
        </Tooltip>
        <Tooltip title={!실행가능 ? (isRunning ? '실행 중' : '파일과 도메인을 선택하세요') : ''}>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => 실행클릭(true)}
            disabled={!실행가능}
          >
            전체 실행 (0→4)
          </Button>
        </Tooltip>
      </Space>
    </Space>
  )
}
