import { useEffect, useRef } from 'react'
import { Steps, Typography, Tag } from 'antd'
import type { LogEntry } from '../../hooks/usePhase1WebSocket'

const { Text } = Typography

const 단계이름 = ['파일선택', '정제', '형태소분석', '결과변환']

interface LogPanelProps {
  logs: LogEntry[]
  currentStep: number
  stepStatuses: Record<number, string>
}

const 상태색: Record<string, string> = {
  running: 'processing',
  completed: 'success',
  failed: 'error',
  pending: 'default',
  skipped: 'warning',
}

export default function LogPanel({ logs, currentStep, stepStatuses }: LogPanelProps) {
  const 로그박스Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (로그박스Ref.current) {
      로그박스Ref.current.scrollTop = 로그박스Ref.current.scrollHeight
    }
  }, [logs])

  const 스텝아이템 = 단계이름.map((name, idx) => {
    const status = stepStatuses[idx]
    return {
      title: name,
      status: (
        status === 'completed' ? 'finish' :
        status === 'running' ? 'process' :
        status === 'failed' ? 'error' : 'wait'
      ) as 'finish' | 'process' | 'error' | 'wait',
    }
  })

  return (
    <div>
      {/* 단계 진행 표시 */}
      <Steps
        size="small"
        current={currentStep >= 0 ? currentStep : undefined}
        items={스텝아이템}
        style={{ marginBottom: 16 }}
      />

      {/* 로그 출력 */}
      <div
        ref={로그박스Ref}
        style={{
          height: 280,
          overflowY: 'auto',
          background: '#1f1f1f',
          color: '#d4d4d4',
          padding: 12,
          fontFamily: 'monospace',
          fontSize: 12,
          borderRadius: 4,
        }}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#666' }}>실행 대기 중...</Text>
        ) : (
          logs.map((entry, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <Tag color={상태색[entry.status] || 'default'} style={{ fontSize: 10, padding: '0 4px' }}>
                {entry.step_name}
              </Tag>
              <span style={{ color: '#ccc' }}>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
