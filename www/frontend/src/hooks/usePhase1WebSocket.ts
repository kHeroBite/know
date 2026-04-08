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

export function usePhase1WebSocket(runId: string | null, startStep?: number) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [stepStatuses, setStepStatuses] = useState<Record<number, string>>({})
  const [isConnected, setIsConnected] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const doneRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepStatusesRef = useRef<Record<number, string>>({})

  useEffect(() => {
    if (!runId) return

    setLogs([])
    setCurrentStep(-1)
    stepStatusesRef.current = {}
    // 기존 completed 상태 보존 (개별 실행 시 이전 단계 유지)
    setStepStatuses(prev => {
      const preserved: Record<number, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        const stepNum = Number(k)
        if (v === 'completed' && (startStep === undefined || stepNum < startStep)) {
          preserved[stepNum] = v
        }
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
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }

    const applyLogs = (entries: LogEntry[], prevStatuses?: Record<number, string>) => {
      // 각 step별 최신 상태 추출
      const stepLatest: Record<number, LogEntry> = {}
      let pipelineCompleted = false
      let hasFailed = false
      for (const e of entries) {
        stepLatest[e.step_num] = e
        if (e.step_num === -1 && e.status === 'completed') pipelineCompleted = true
        if (e.status === 'failed') hasFailed = true
      }

      const sortedSteps = Object.keys(stepLatest)
        .map(Number)
        .filter(n => n >= 1)
        .sort((a, b) => a - b)

      // 이미 UI에 반영된 step 제외
      const already = prevStatuses ?? {}
      const newSteps = sortedSteps.filter(n => !already[n] || already[n] === 'running')

      if (newSteps.length === 0) {
        setLogs(entries)
        if (pipelineCompleted || hasFailed) doMarkDone()
        return pipelineCompleted || hasFailed
      }

      // 새 step들을 400ms 간격으로 순차 표시 (로그도 함께)
      newSteps.forEach((stepNum, idx) => {
        setTimeout(() => {
          // 해당 step까지의 로그만 표시
          const visibleSteps = new Set([...Object.keys(already).map(Number), ...newSteps.slice(0, idx + 1), -1])
          setLogs(entries.filter(e => visibleSteps.has(e.step_num)))

          const status = stepLatest[stepNum].status
          stepStatusesRef.current = { ...stepStatusesRef.current, [stepNum]: status }
          setStepStatuses(prev => ({ ...prev, [stepNum]: status }))
          setCurrentStep(stepNum)
          if (idx === newSteps.length - 1 && (pipelineCompleted || hasFailed)) {
            setLogs(entries) // 마지막엔 전체 로그 표시
            doMarkDone()
          }
        }, idx * 400)
      })

      return false
    }

    const fetchLogs = async (): Promise<boolean> => {
      try {
        const { data } = await 클라이언트.get(`/preprocess/logs/${runId}`)
        if (Array.isArray(data) && data.length > 0) {
          return applyLogs(data, stepStatusesRef.current)
        }
      } catch { /* ignore */ }
      return false
    }

    // 30초 타임아웃 fallback — WS 메시지 없을 시 API로 최종 상태 확인
    const scheduleTimeout = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (doneRef.current || cancelled) return
      timeoutRef.current = setTimeout(async () => {
        if (doneRef.current || cancelled) return
        await fetchLogs()
      }, 30000)
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
        scheduleTimeout()
      }

      ws.onmessage = (e) => {
        try {
          const data: LogEntry = JSON.parse(e.data)
          setLogs(prev => [...prev.slice(-999), data])
          setCurrentStep(data.step_num)
          setStepStatuses(prev => ({ ...prev, [data.step_num]: data.status }))
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
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      wsRef.current?.close()
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [runId])

  return { logs, currentStep, stepStatuses, isConnected, isCompleted }
}
