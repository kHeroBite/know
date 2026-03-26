import { useState, useEffect, useRef } from 'react'

export interface LogEntry {
  run_id: string
  step_num: number
  step_name: string
  percent: number
  message: string
  status: string
  ts: string
}

export function usePhase1WebSocket(runId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [stepStatuses, setStepStatuses] = useState<Record<number, string>>({})
  const [isConnected, setIsConnected] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)

  useEffect(() => {
    if (!runId) return

    setLogs([])
    setCurrentStep(-1)
    setStepStatuses({})
    setIsCompleted(false)
    retryRef.current = 0

    const connect = () => {
      const ws = new WebSocket(`ws://${window.location.host}/ws/phase1/${runId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        retryRef.current = 0
      }

      ws.onmessage = (e) => {
        try {
          const data: LogEntry = JSON.parse(e.data)
          setLogs(prev => [...prev.slice(-999), data])
          setCurrentStep(data.step_num)
          setStepStatuses(prev => ({ ...prev, [data.step_num]: data.status }))
          if (data.status === 'completed' && data.step_num === -1) {
            // 전체 완료
          }
          if (data.status === 'failed') {
            setIsCompleted(true)
          }
        } catch {
          // 비JSON 메시지 무시
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        // 완료/실패가 아닌 경우 재연결 (최대 3회, exponential backoff)
        if (!isCompleted && retryRef.current < 3) {
          const delay = Math.pow(2, retryRef.current) * 1000
          retryRef.current += 1
          setTimeout(connect, delay)
        } else {
          setIsCompleted(true)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [runId])

  return { logs, currentStep, stepStatuses, isConnected, isCompleted }
}
