import { useState, useEffect, useRef } from 'react'
import type { LogEntry } from './usePhase1WebSocket'
import 클라이언트 from '../api/client'

export function usePhase1DataWebSocket(runId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stepStatuses, setStepStatuses] = useState<Record<number, string>>({})
  const [isConnected, setIsConnected] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const doneRef = useRef(false)
  const stepStatusesRef = useRef<Record<number, string>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!runId) return

    setLogs([])
    setStepStatuses({})
    stepStatusesRef.current = {}
    setIsCompleted(false)
    doneRef.current = false

    let cancelled = false
    let retryDelay = 1000
    const maxRetryDelay = 30000

    const doMarkDone = () => {
      if (doneRef.current) return
      doneRef.current = true
      setIsCompleted(true)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }

    const applyLogs = (entries: LogEntry[]) => {
      setLogs(entries)
      // stepStatuses 집계: 단계별 마지막 상태 추적
      const stepLatest: Record<number, LogEntry> = {}
      let pipelineCompleted = false
      let hasFailed = false
      for (const e of entries) {
        stepLatest[e.step_num] = e
        if (e.step_num === -1 && e.status === 'completed') pipelineCompleted = true
        if (e.status === 'failed') hasFailed = true
      }
      const newStatuses: Record<number, string> = {}
      for (const [k, e] of Object.entries(stepLatest)) {
        if (Number(k) >= 1) newStatuses[Number(k)] = e.status
      }
      stepStatusesRef.current = { ...stepStatusesRef.current, ...newStatuses }
      setStepStatuses(prev => {
        const merged = { ...prev }
        for (const [k, v] of Object.entries(newStatuses)) merged[Number(k)] = v
        return merged
      })
      if (pipelineCompleted || hasFailed) doMarkDone()
      return pipelineCompleted || hasFailed
    }

    const fetchLogs = async (): Promise<boolean> => {
      try {
        const { data } = await 클라이언트.get(`/preprocess/data-logs/${runId}`)
        if (Array.isArray(data) && data.length > 0) {
          return applyLogs(data)
        }
      } catch { /* ignore */ }
      return false
    }

    const scheduleTimeout = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (doneRef.current || cancelled) return
      timeoutRef.current = setTimeout(async () => {
        if (doneRef.current || cancelled) return
        await fetchLogs()
      }, 30000)
    }

    const startPoll = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(async () => {
        if (doneRef.current || cancelled) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          return
        }
        await fetchLogs()
      }, 300)
    }

    const connectWs = () => {
      if (doneRef.current || cancelled) return
      const ws = new WebSocket(`ws://${window.location.host}/ws/preprocess-data/${runId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setIsReconnecting(false)
        retryDelay = 1000
        scheduleTimeout()
      }

      ws.onmessage = (e) => {
        try {
          const data: LogEntry = JSON.parse(e.data)
          setLogs(prev => [...prev.slice(-999), data])
          // stepStatuses 실시간 갱신
          if (data.step_num >= 1) {
            stepStatusesRef.current = { ...stepStatusesRef.current, [data.step_num]: data.status }
            setStepStatuses(prev => ({ ...prev, [data.step_num]: data.status }))
          }
          if ((data.status === 'completed' && data.step_num === -1) || data.status === 'failed') {
            doMarkDone()
          } else {
            scheduleTimeout()
          }
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (doneRef.current || cancelled) return
        setIsReconnecting(true)
        retryTimerRef.current = setTimeout(() => {
          if (doneRef.current || cancelled) { setIsReconnecting(false); return }
          retryDelay = Math.min(retryDelay * 2, maxRetryDelay)
          connectWs()
        }, retryDelay)
      }

      ws.onerror = () => { ws.close() }
    }

    connectWs()
    startPoll()

    return () => {
      cancelled = true
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      wsRef.current?.close()
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [runId])

  return { logs, stepStatuses, isConnected, isCompleted, isReconnecting }
}
