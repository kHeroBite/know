import { useState, useEffect, useRef } from 'react'
import { Button, Typography, Tag, Progress } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import type { LogEntry } from '../../hooks/usePhase1WebSocket'
import type { DataFolder } from '../../api/phase1Data'

const { Text } = Typography

interface DataControlPanelProps {
  folder: DataFolder
  workspace?: string
  onRun: () => void
  isRunning: boolean
  isCompleted: boolean
  logs: LogEntry[]
  runId: string | null
  hasFiles: boolean
}

export default function DataControlPanel({
  folder,
  workspace,
  onRun,
  isRunning,
  isCompleted,
  logs,
  runId,
  hasFiles,
}: DataControlPanelProps) {
  const 로그박스Ref = useRef<HTMLDivElement>(null)

  // 최근 50줄만 표시
  const 표시로그 = logs.slice(-50)

  // 전체 진행률 (step_num=1 기준)
  const 전체진행률 = logs.reduce((acc, e) => {
    if (e.step_num === 1 && e.percent != null) return e.percent
    return acc
  }, 0)

  const 현재상태 = isCompleted
    ? (logs.some(e => e.status === 'failed') ? 'failed' : 'completed')
    : isRunning ? 'running' : 'idle'

  // 로그 자동 스크롤
  useEffect(() => {
    if (로그박스Ref.current) {
      로그박스Ref.current.scrollTop = 로그박스Ref.current.scrollHeight
    }
  }, [logs])

  return (
    <div>
      {/* 실행 상태 표시 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 8,
        background: 현재상태 === 'running' ? '#1677ff08'
          : 현재상태 === 'completed' ? '#f6ffed'
          : 현재상태 === 'failed' ? '#fff2f0'
          : '#fafafa',
        border: `1px solid ${현재상태 === 'running' ? '#1677ff'
          : 현재상태 === 'completed' ? '#b7eb8f'
          : 현재상태 === 'failed' ? '#ffa39e'
          : '#f0f0f0'}`,
        marginBottom: 12,
      }}>
        <Tag color="#1677ff" style={{ margin: 0, minWidth: 80, textAlign: 'center' }}>
          데이터처리
        </Tag>
        <div style={{ flex: 1 }}>
          {현재상태 === 'completed' && (
            <Text type="success"><CheckCircleOutlined /> 완료</Text>
          )}
          {현재상태 === 'running' && (
            <div>
              <Text style={{ color: '#1677ff' }}><ClockCircleOutlined /> 실행 중</Text>
              <Progress
                percent={전체진행률}
                size="small"
                status="active"
                strokeColor="#1677ff"
                style={{ margin: '2px 0 0', maxWidth: 160 }}
                format={(p) => `${p}%`}
              />
            </div>
          )}
          {현재상태 === 'failed' && (
            <Text type="danger"><CloseCircleOutlined /> 실패</Text>
          )}
          {현재상태 === 'idle' && (
            <Text type="secondary">대기</Text>
          )}
        </div>
        <Button
          size="small"
          type={현재상태 === 'completed' ? 'default' : 'primary'}
          style={현재상태 === 'idle' ? { background: '#1677ff', borderColor: '#1677ff' } : {}}
          icon={<PlayCircleOutlined />}
          disabled={isRunning || !hasFiles}
          onClick={onRun}
        >
          실행
        </Button>
      </div>

      {/* 실행 로그 */}
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
          borderRadius: 6,
        }}
      >
        {표시로그.length === 0 ? (
          <Text style={{ color: '#666' }}>실행 대기 중...</Text>
        ) : (
          표시로그.map((entry, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <Tag
                color="#1677ff"
                style={{ fontSize: 10, padding: '0 4px', margin: 0 }}
              >
                {entry.step_name}
              </Tag>
              <span style={{ color: '#ccc', marginLeft: 4 }}>{entry.message}</span>
              {entry.elapsed_sec != null && entry.elapsed_sec > 0 && (
                <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                  ({entry.elapsed_sec < 60 ? `${entry.elapsed_sec.toFixed(1)}초` : `${Math.floor(entry.elapsed_sec / 60)}분`})
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
