import { Slider, Button, Space, Tooltip, Typography } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

const 단계마크 = {
  0: '업로드',
  1: '정제',
  2: '형태소',
  3: '등록',
  4: '빌드',
}

interface RunParams {
  category: string
  start_step: number
  end_step: number
}

interface ControlPanelProps {
  stepRange: [number, number]
  onStepRangeChange: (range: [number, number]) => void
  folder: 'popular' | 'fails'
  onRun: (params: RunParams) => void
  isRunning: boolean
}

export default function ControlPanel({
  stepRange, onStepRangeChange,
  folder,
  onRun, isRunning,
}: ControlPanelProps) {
  const 실행가능 = !isRunning

  const 실행클릭 = (전체: boolean) => {
    const range = 전체 ? [0, 4] as [number, number] : stepRange
    onRun({
      category: folder,
      start_step: range[0],
      end_step: range[1],
    })
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
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
        <Tooltip title={isRunning ? '실행 중' : ''}>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => 실행클릭(false)}
            disabled={!실행가능}
            loading={isRunning}
          >
            범위 실행 ({단계마크[stepRange[0] as keyof typeof 단계마크]}~{단계마크[stepRange[1] as keyof typeof 단계마크]})
          </Button>
        </Tooltip>
        <Tooltip title={isRunning ? '실행 중' : ''}>
          <Button
            type="primary"
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
