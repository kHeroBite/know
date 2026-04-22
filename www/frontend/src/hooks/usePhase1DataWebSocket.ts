import { useState, useEffect, useRef } from 'react'
import type { LogEntry } from './usePhase1WebSocket'
import 클라이언트 from '../api/client'

export function usePhase1DataWebSocket(runId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const doneRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!runId) return

    setLogs([])
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
      const pipelineCompleted = entries.some(e => e.step_num === -1 && e.status === 'completed')
      const hasFailed = entries.some(e => e.status === 'failed')
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

  return { logs, isConnected, isCompleted, isReconnecting }
}
