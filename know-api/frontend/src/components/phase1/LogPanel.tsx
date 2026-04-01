import { useEffect, useRef, useState } from 'react'
import { Typography, Tag, Tabs } from 'antd'
import type { LogEntry } from '../../hooks/usePhase1WebSocket'
import { 단계색상맵 } from './ControlPanel'

const { Text } = Typography

interface LogPanelProps {
  logs: LogEntry[]
  fileTabs: Record<string, string>
  activeViewTab: string | null
  onTabChange: (key: string) => void
  isRunning?: boolean
}

export default function LogPanel({ logs, fileTabs, activeViewTab, onTabChange, isRunning }: LogPanelProps) {
  const 로그박스Ref = useRef<HTMLDivElement>(null)
  const [activeKey, setActiveKey] = useState('log')

  useEffect(() => {
    if (로그박스Ref.current && activeKey === 'log') {
      로그박스Ref.current.scrollTop = 로그박스Ref.current.scrollHeight
    }
  }, [logs, activeKey])

  useEffect(() => {
    if (isRunning) setActiveKey('log')
  }, [isRunning])

  useEffect(() => {
    if (activeViewTab) setActiveKey(activeViewTab)
  }, [activeViewTab])

  const boxStyle = {
    height: 360,
    overflowY: 'auto' as const,
    background: '#1f1f1f',
    color: '#d4d4d4',
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    borderRadius: 6,
  }

  const items = [
    {
      key: 'log',
      label: '로그',
      children: (
        <div ref={로그박스Ref} style={boxStyle}>
          {logs.length === 0 ? (
            <Text style={{ color: '#666' }}>실행 대기 중...</Text>
          ) : (
            logs.map((entry, i) => {
              const tagColor = 단계색상맵[entry.step_name] || '#888'
              return (
                <div key={i} style={{ marginBottom: 2 }}>
                  <Tag color={tagColor} style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                    {entry.step_name}
                  </Tag>
                  <span style={{ color: '#ccc', marginLeft: 4 }}>{entry.message}</span>
                  {entry.elapsed_sec && entry.elapsed_sec > 0 && (
                    <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                      ({entry.elapsed_sec < 60 ? `${entry.elapsed_sec.toFixed(1)}초` : `${Math.floor(entry.elapsed_sec / 60)}분`})
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      ),
    },
    ...Object.entries(fileTabs).map(([name, content]) => ({
      key: name,
      label: name,
      children: (
        <div style={{ ...boxStyle, background: '#1a1a2e', color: '#e0e7ff', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const }}>
          {content}
        </div>
      ),
    })),
  ]

  return (
    <Tabs
      activeKey={activeKey}
      onChange={(key) => { setActiveKey(key); onTabChange(key) }}
      size="small"
      type="card"
      items={items}
    />
  )
}
