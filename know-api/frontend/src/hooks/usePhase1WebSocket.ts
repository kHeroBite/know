import { useState, useEffect, useRef } from 'react'
import 클라이언트 from '../api/client'

export interface LogEntry {
  run_id: string
  step_num: number
  step_name: string
  percent: number
  message: string
  status: string
  elapsed_sec?: number
  ts: string
}

export function usePhase1WebSocket(runId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [stepStatuses, setStepStatuses] = useState<Record<number, string>>({})
  const [isConnected, setIsConnected] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const doneRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!runId) return

    setLogs([])
    setCurrentStep(-1)
    // 기존 completed 상태 보존 (개별 실행 시 이전 단계 유지)
    setStepStatuses(prev => {
      const preserved: Record<number, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (v === 'completed') preserved[Number(k)] = v
      }
      return preserved
    })
    setIsCompleted(false)
    doneRef.current = false

    let cancelled = false
    let retryCount = 0

    const doMarkDone = () => {
      if (doneRef.current) return
      doneRef.current = true
      setIsCompleted(true)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }

    const applyLogs = (entries: LogEntry[]) => {
      setLogs(entries)
      const newStatuses: Record<number, string> = {}
      let lastStep = -1
      let completed = false
      for (const e of entries) {
        if (newStatuses[e.step_num] === 'completed' && e.status !== 'completed') continue
        newStatuses[e.step_num] = e.status
        if (e.step_num > lastStep) lastStep = e.step_num
        if (e.step_num === -1 && e.status === 'completed') completed = true
        if (e.status === 'failed') completed = true
      }
      // 기존 completed 상태 보존 + 새 로그 머지
      setStepStatuses(prev => {
        const merged: Record<number, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (v === 'completed') merged[Number(k)] = v
        }
        for (const [k, v] of Object.entries(newStatuses)) {
          merged[Number(k)] = v
        }
        return merged
      })
      setCurrentStep(lastStep)
      if (completed) doMarkDone()
      return completed
    }

    const fetchLogs = async (): Promise<boolean> => {
      try {
        const { data } = await 클라이언트.get(`/preprocess/logs/${runId}`)
        if (Array.isArray(data) && data.length > 0) {
          return applyLogs(data)
        }
      } catch { /* ignore */ }
      return false
    }

    // DB 폴링 — WebSocket 메시지 누락 시 fallback (2초 간격)
    const startPoll = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(async () => {
        if (doneRef.current || cancelled) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          return
        }
        await fetchLogs()
      }, 2000)
    }

    const connectWs = () => {
      if (doneRef.current || cancelled) return
      const ws = new WebSocket(`ws://${window.location.host}/ws/preprocess/${runId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        retryCount = 0
      }

      ws.onmessage = (e) => {
        try {
          const data: LogEntry = JSON.parse(e.data)
          setLogs(prev => [...prev.slice(-999), data])
          setCurrentStep(data.step_num)
          setStepStatuses(prev => ({ ...prev, [data.step_num]: data.status }))
          if ((data.status === 'completed' && data.step_num === -1) || data.status === 'failed') {
            doMarkDone()
          }
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (doneRef.current || cancelled) return
        if (retryCount < 2) {
          retryCount += 1
          setTimeout(connectWs, retryCount * 1000)
        }
      }

      ws.onerror = () => { ws.close() }
    }

    const init = async () => {
      // 1. DB에서 히스토리 로드
      const done = await fetchLogs()
      if (done || cancelled) return

      // 2. WebSocket 연결 + DB 폴링 fallback 시작
      connectWs()
      startPoll()
    }

    init()
    return () => {
      cancelled = true
      wsRef.current?.close()
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [runId])

  return { logs, currentStep, stepStatuses, isConnected, isCompleted }
}
