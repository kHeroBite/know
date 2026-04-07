import { Typography, Button, Space } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title } = Typography

interface PageHeaderProps {
  title: string
  prevLabel?: string
  prevPath?: string
  nextLabel?: string
  nextPath?: string
  showNext?: boolean
  showPrev?: boolean
  nextLoading?: boolean
  onNext?: () => void
  onPrev?: () => void
}

export default function PageHeader({
  title,
  prevLabel = '이전단계로',
  prevPath,
  nextLabel = '다음단계로',
  nextPath,
  showNext = false,
  showPrev = false,
  nextLoading = false,
  onNext,
  onPrev,
}: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 56, position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
      <Title level={4} style={{ margin: 0, fontSize: 18 }}>{title}</Title>
      <Space>
        {showPrev && (
          <Button
            icon={<LeftOutlined />}
            onClick={() => {
              if (onPrev) onPrev()
              else if (prevPath) navigate(prevPath)
            }}
          >
            {prevLabel}
          </Button>
        )}
        {showNext && (
          <Button
            type="primary"
            loading={nextLoading}
            disabled={nextLoading}
            onClick={() => {
              if (onNext) onNext()
              else if (nextPath) navigate(nextPath)
            }}
          >
            {nextLabel} {!nextLoading && <RightOutlined />}
          </Button>
        )}
      </Space>
    </div>
  )
}
