
import { useState, useEffect, useRef } from 'react'
import {
  Typography,
  Button,
  Input,
  Select,
  Space,
  Popconfirm,
  message,
  Badge,
  Card,
  Row,
  Col,
  Progress,
  Modal,
  Empty,
  Spin,
  ColorPicker,
} from 'antd'
import {
  PlusOutlined,
  LinkOutlined,
  DisconnectOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BgColorsOutlined,
  StopOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { workspaceAPI } from '../api/workspace'
import { assignmentApi } from '../api/assignment'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useGlobalTaskStore } from '../stores/globalTaskStore'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography

const 프리셋색상 = [
  '#0f1c3f', '#1a1a2e', '#1a2744', '#1e3a5f',
  '#134e4a', '#14532d', '#4c1d95', '#7f1d1d',
  '#7c2d12', '#1e293b', '#312e81', '#164e63',
]

interface 워크스페이스항목 {
  name: string
  status: 'IDLE' | 'USED' | 'CONNECTING' | 'FAILED'
  domain: string | null
  connected_by: string | null
  color: string | null
}

export default function Workspace() {
  const { user: currentUser } = useAuthStore()
  const { selectedWorkspace, setWorkspace, clearWorkspace, phase, myPhase } = useWorkspaceStore()
  const { isBlocked, startTask, updateProgress, finishTask, startPolling, currentTask } = useGlobalTaskStore()
  const navigate = useNavigate()
  const [목록, set목록] = useState<워크스페이스항목[]>([])
  const [도메인목록, set도메인목록] = useState<{id: string, name: string | null}[]>([])
  const [로딩, set로딩] = useState(false)
  const [새이름, set새이름] = useState('')
  const [새색상, set새색상] = useState<string | null>(null)
  const [생성로딩, set생성로딩] = useState(false)
  const [연결팝업WS, set연결팝업WS] = useState<string | null>(null)
  const [선택도메인, set선택도메인] = useState<string | null>(null)
  const [jiana버전목록, setJiana버전목록] = useState<string[]>([])
  const [선택jiana, set선택jiana] = useState<string>('')
  const [복사진행중, set복사진행중] = useState<Record<string, number>>(() => {
    // 페이지 복귀 시 store에서 즉시 초기값 설정 (0% 깜빡임 방지)
    const task = useGlobalTaskStore.getState().currentTask
    if (!task || task.status !== 'running') return {}
    const match = task.id.match(/^ws-(?:connect|reinit)-(.+?)-\d+/)
    if (!match) return {}
    return { [match[1]]: task.percent }
  })
  const [색상팝업WS, set색상팝업WS] = useState<string | null>(null)
  const [연결해제중, set연결해제중] = useState(false)
  const [에러메시지, set에러메시지] = useState<Record<string, string>>({})
  const [작업진행률, set작업진행률] = useState<Record<string, number>>({})
  // 페이지 이동 후 복원용: 진행 중인 taskId → wsName 매핑 (로컬 UI 상태 복원용)
  const 폴링ref = useRef<Record<string, string>>({})

  const isSuper = currentUser?.auth === 'A'




  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [wsRes, dmRes, jianaRes] = await Promise.all([
        workspaceAPI.워크스페이스목록(),
        workspaceAPI.도메인목록(),
        workspaceAPI.jiana버전목록(),
      ])
      const wsList: 워크스페이스항목[] = wsRes.data
      set목록(wsList)
      set도메인목록(dmRes.data)
      const versions = jianaRes.data?.versions || []
      setJiana버전목록(versions)
      if (!선택jiana && versions.length > 0) set선택jiana(versions[versions.length - 1])
      // CONNECTING 상태 워크스페이스 폴링 복원 (페이지 로드/새로고침 시)
      const storeState = useGlobalTaskStore.getState()
      const storeTimers = storeState._timers
      const storeTask = storeState.currentTask
      for (const ws of wsList) {
        if (ws.status !== 'CONNECTING') continue
        // store에 이 워크스페이스 관련 폴링 타이머가 살아있으면 완전 스킵
        const existingTaskId = Object.keys(storeTimers).find(tid => tid.startsWith('ws-') && tid.includes(ws.name))
        if (existingTaskId) continue
        // store currentTask가 이 워크스페이스 관련이고 running이면 스킵 (타이머만 없고 task는 살아있는 경우)
        if (storeTask?.status === 'running' && storeTask.id.includes(ws.name)) continue
        // 새로고침 또는 최초 로드 — 서버 진행률 조회 후 복원
        try {
          const pRes = await workspaceAPI.진행률조회(ws.name)
          const pct = pRes.data?.percent ?? 0
          set복사진행중(prev => ({ ...prev, [ws.name]: pct }))
          const taskId = `ws-connect-${ws.name}-${Date.now()}`
          startTask({ id: taskId, type: '워크스페이스 연결', label: `${ws.name} 연결 중`, percent: pct })
          폴링시작(ws.name, taskId)
        } catch {
          const taskId = `ws-connect-${ws.name}-${Date.now()}`
          startTask({ id: taskId, type: '워크스페이스 연결', label: `${ws.name} 연결 중`, percent: 0 })
          폴링시작(ws.name, taskId)
        }
      }
      // FAILED 워크스페이스 에러 메시지 조회
      wsList.filter(ws => ws.status === 'FAILED').forEach(ws => {
        workspaceAPI.진행률조회(ws.name).then(res => {
          if (res.data?.message) {
            set에러메시지(prev => ({ ...prev, [ws.name]: res.data.message }))
          }
        }).catch(() => {})
      })
    } catch {
      message.error('목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => {
    목록조회()
    // 폴링은 globalTaskStore가 관리 — 언마운트 시 중단하지 않음
  }, [])

  // store ↔ 로컬 복사진행중 동기화 (페이지 이동 후 복귀 시 + 완료 시)
  useEffect(() => {
    if (!currentTask) return
    const match = currentTask.id.match(/^ws-(?:connect|reinit)-(.+?)-\d+/)
    if (!match) return
    const wsName = match[1]
    if (currentTask.status === 'done' || currentTask.status === 'error') {
      // 완료/에러 시 로컬 state에서 제거 (99% 멈춤 방지)
      set복사진행중(prev => { const n = { ...prev }; delete n[wsName]; return n })
    } else if (currentTask.status === 'running') {
      set복사진행중(prev => ({ ...prev, [wsName]: currentTask.percent }))
    }
  }, [currentTask?.status, currentTask?.percent, currentTask?.id])

  // USED 상태 워크스페이스 작업 진행률 로드
  useEffect(() => {
    const usedList = 목록.filter(ws => ws.status === 'USED' && ws.domain)
    if (usedList.length === 0) return
    usedList.forEach(async (ws) => {
      try {
        const res = await workspaceAPI.멤버상태조회(ws.name)
        const data = res.data
        const total = data?.total_keywords ?? 0
        const completed = data?.completed_keywords ?? 0
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0
        set작업진행률(prev => ({ ...prev, [ws.name]: percent }))
      } catch {
        // 진행률 조회 실패 시 무시
      }
    })
  }, [목록])

  const 폴링시작 = (wsName: string, taskId: string, isReinit?: boolean) => {
    // store 폴링: 페이지 이동과 무관하게 유지됨
    폴링ref.current[taskId] = wsName
    startPolling(
      taskId,
      async () => {
        const res = await workspaceAPI.진행률조회(wsName)
        const st = res.data?.status
        if (st === 'done') {
          const elapsed = res.data?.elapsed
          const fileCount = res.data?.file_count
          const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}분 ${Math.round(elapsed % 60)}초` : `${elapsed}초`
          message.success(`${isReinit ? '초기화' : '연결'} 완료 — ${fileCount ?? 0}개 파일, ${timeStr}`)
          set복사진행중(prev => { const n = { ...prev }; delete n[wsName]; return n })
          set에러메시지(prev => { const n = { ...prev }; delete n[wsName + '_mode']; return n })
          return { percent: 100, done: true, error: false }
        }
        if (st === 'error') {
          const errMsg = res.data?.message || '알 수 없는 오류'
          set에러메시지(prev => ({ ...prev, [wsName]: errMsg }))
          message.error(`연결 실패: ${errMsg}`)
          set복사진행중(prev => { const n = { ...prev }; delete n[wsName]; return n })
          return { percent: 0, done: false, error: true, message: errMsg }
        }
        if (st === 'cancelled') {
          message.info(`"${wsName}" 연결이 취소되었습니다`)
          set복사진행중(prev => { const n = { ...prev }; delete n[wsName]; return n })
          set에러메시지(prev => { const n = { ...prev }; delete n[wsName + '_mode']; return n })
          return { percent: 0, done: true, error: false }
        }
        if (st === 'idle' || !st) {
          set복사진행중(prev => { const n = { ...prev }; delete n[wsName]; return n })
          return { percent: 100, done: true, error: false }
        }
        const percent: number = res.data?.percent ?? 0
        set복사진행중(prev => ({ ...prev, [wsName]: percent }))
        return { percent, done: false, error: false }
      },
      2000,
      () => { 목록조회(); delete 폴링ref.current[taskId] },
      () => { 목록조회(); delete 폴링ref.current[taskId] },
    )
  }

  const 생성핸들러 = async () => {
    if (!새이름.trim()) {
      message.warning('이름을 입력하세요')
      return
    }
    set생성로딩(true)
    try {
      await workspaceAPI.워크스페이스생성(새이름.trim(), 새색상)
      message.success(`워크스페이스 "${새이름}" 생성 완료`)
      set새이름('')
      set새색상(null)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '생성 실패')
    } finally {
      set생성로딩(false)
    }
  }

  const 삭제핸들러 = async (name: string) => {
    try {
      await workspaceAPI.워크스페이스삭제(name)
      message.success(`워크스페이스 "${name}" 삭제 완료`)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '삭제 실패')
    }
  }

  const 연결확인핸들러 = async () => {
    if (!연결팝업WS || !선택도메인) {
      message.warning('도메인을 선택하세요')
      return
    }
    if (!선택jiana) {
      message.warning('jiana 버전을 선택하세요')
      return
    }
    const wsName = 연결팝업WS
    const jianaVer = 선택jiana
    const taskId = `ws-connect-${wsName}-${Date.now()}`
    try {
      // 즉시 UI에 진행률 0% 표시 (서버 응답 전)
      set복사진행중(prev => ({ ...prev, [wsName]: 0 }))
      set연결팝업WS(null)
      set선택도메인(null)
      startTask({ id: taskId, type: '워크스페이스 연결', label: `${wsName} 연결 중`, percent: 0 })
      await workspaceAPI.도메인연결(wsName, 선택도메인, jianaVer)
      message.success(`"${wsName}" 도메인 연결 시작 (jiana ${jianaVer})`)
      폴링시작(wsName, taskId)
      await 목록조회()
    } catch (err: any) {
      // 실패 시 progress 제거
      set복사진행중(prev => {
        const next = { ...prev }
        delete next[wsName]
        return next
      })
      finishTask(taskId, 'error')
      const status = err.response?.status
      const detail = err.response?.data?.detail || '연결 실패'
      if (status === 404) {
        message.error(`도메인 디렉토리를 찾을 수 없습니다: ${detail}`)
      } else {
        message.error(detail)
      }
    }
  }

  const 해제핸들러 = async (wsName: string) => {
    const taskId = `ws-disconnect-${wsName}-${Date.now()}`
    set연결해제중(true)
    startTask({ id: taskId, type: '워크스페이스 연결해제', label: `${wsName} 연결해제 중`, percent: 50 })
    try {
      await workspaceAPI.워크스페이스해제(wsName)
      // 선택된 워크스페이스를 연결해제하면 선택도 해제 + 테마 초기화
      if (selectedWorkspace === wsName) {
        clearWorkspace()
      }
      message.success(`"${wsName}" 연결해제 완료`)
      finishTask(taskId, 'done')
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '연결해제 실패')
      finishTask(taskId, 'error')
    } finally {
      set연결해제중(false)
    }
  }

  const 선택해제핸들러 = () => {
    clearWorkspace()
    message.success('워크스페이스 선택 해제')
  }

  const 초기화핸들러 = async (wsName: string) => {
    // 현재 연결 정보 저장
    const ws = 목록.find(w => w.name === wsName)
    const domain = ws?.domain
    if (!domain) { message.error('연결된 도메인이 없습니다'); return }
    // state.json에서 jiana_version 가져오기
    let jianaVer: string | undefined
    try {
      const res = await workspaceAPI.도메인jiana설정(domain)
      jianaVer = res.data?.jiana_version || undefined
    } catch { /* 없으면 무시 */ }

    const taskId = `ws-reinit-${wsName}-${Date.now()}`
    startTask({ id: taskId, type: '워크스페이스 초기화', label: `${wsName} 초기화 중`, percent: 0 })
    try {
      // 1단계: 연결해제 (DB 정리 + 파일 정리)
      if (selectedWorkspace === wsName) clearWorkspace()
      await workspaceAPI.워크스페이스해제(wsName)
      // 2단계: 같은 도메인으로 재연결
      set복사진행중(prev => ({ ...prev, [wsName]: 0 }))
      set에러메시지(prev => ({ ...prev, [wsName + '_mode']: 'reinit' }))
      await workspaceAPI.도메인연결(wsName, domain, jianaVer)
      message.success(`"${wsName}" 초기화 중...`)
      폴링시작(wsName, taskId, true)
      await 목록조회()
    } catch (err: any) {
      set복사진행중(prev => {
        const next = { ...prev }
        delete next[wsName]
        return next
      })
      finishTask(taskId, 'error')
      message.error(err.response?.data?.detail || '초기화 실패')
      await 목록조회()
    }
  }

  const 색상변경핸들러 = async (wsName: string, color: string) => {
    try {
      await workspaceAPI.색상변경(wsName, color)
      set색상팝업WS(null)
      if (selectedWorkspace === wsName) {
        const ws = 목록.find(w => w.name === wsName)
        if (ws?.domain) setWorkspace(wsName, ws.domain, color)
      }
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '색상 변경 실패')
    }
  }

  const getCardStyle = (ws: 워크스페이스항목): React.CSSProperties => {
    const isSelected = selectedWorkspace === ws.name
    const themeColor = ws.color
    if (isSelected) {
      const bg = themeColor || '#1a1a2e'
      return {
        border: `2px solid ${bg}`,
        background: bg,
        color: '#fff',
        boxShadow: `0 0 14px ${bg}88`,
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (ws.status === 'FAILED') {
      return {
        border: '1px solid #ff4d4f',
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (ws.status === 'CONNECTING') {
      return {
        border: `1px solid ${themeColor || '#faad14'}`,
        boxShadow: '0 0 8px rgba(250, 173, 20, 0.3)',
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (themeColor) {
      return {
        border: ws.status === 'USED' ? `1px solid ${themeColor}` : `1px dashed ${themeColor}`,
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (ws.status === 'USED') {
      return {
        border: '1px solid #1677ff',
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    return {
      border: '1px dashed #d9d9d9',
      transition: 'all 0.3s ease',
      animation: 'wsCardFadeIn 0.4s ease',
    }
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <style>{`
        @keyframes wsCardFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <PageHeader
        title="워크스페이스"
        showNext={!!selectedWorkspace}
        nextLabel="다음단계로"
        nextPath={
          phase === 'preprocess' ? '/preprocess'
          : phase === 'work' && myPhase === 'idle' ? '/assignment'
          : phase === 'work' ? '/knowledge-work'
          : phase === 'build' ? '/build-history'
          : phase === 'verify' ? '/dict-verify'
          : '/preprocess'
        }
      />

      {isSuper && (
        <Card style={{ marginBottom: 16, animation: 'wsCardFadeIn 0.3s ease' }}>
          <Space direction="vertical" size={10}>
            <Space>
              <Input
                placeholder="워크스페이스 이름"
                value={새이름}
                onChange={e => set새이름(e.target.value)}
                onPressEnter={생성핸들러}
                style={{ width: 200 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={생성핸들러}
                loading={생성로딩}
                disabled={isBlocked}
              >
                생성
              </Button>
            </Space>
            {/* 색상 선택 (생성 시) — ColorPicker */}
            <Space size={8} align="center">
              <Text type="secondary" style={{ fontSize: 12 }}>색상:</Text>
              <ColorPicker
                value={새색상 || '#1a1a2e'}
                onChange={(color) => set새색상(color.toHexString())}
                presets={[{ label: '추천 색상', colors: 프리셋색상 }]}
                size="small"
              />
              {새색상 && (
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: 새색상, border: '1px solid #d9d9d9',
                }} />
              )}
            </Space>
          </Space>
        </Card>
      )}

      <Spin spinning={로딩}>
        <Row gutter={[16, 16]}>
          {목록.map(ws => {
            const isSelected = selectedWorkspace === ws.name
            const progressPercent = 복사진행중[ws.name]
            const isInProgress = progressPercent !== undefined || ws.status === 'CONNECTING'

            return (
              <Col xs={24} sm={12} key={ws.name}>
                <Card style={getCardStyle(ws)} styles={{ body: { padding: 16 } }}>
                  {/* 복사 진행률 오버레이 */}
                  {isInProgress && (
                    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Progress
                        percent={progressPercent ?? 0}
                        size="small"
                        status="active"
                        format={p => `${p}%`}
                        style={{ flex: 1 }}
                      />
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        onClick={async () => {
                          try {
                            await workspaceAPI.연결취소(ws.name)
                            message.info(`"${ws.name}" 연결 취소 요청됨`)
                          } catch (err: any) {
                            message.error(err.response?.data?.detail || '취소 실패')
                          }
                        }}
                      >
                        중지
                      </Button>
                    </div>
                  )}

                  {/* 카드 헤더 */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {ws.color && (
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: ws.color,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Text strong style={{ fontSize: 15, color: isSelected ? '#fff' : undefined }}>
                        {ws.name}
                      </Text>
                    </div>
                    {ws.status === 'CONNECTING' ? (
                      <Badge status="warning" text={<Text style={{ color: '#faad14', fontSize: 12 }}>{에러메시지[ws.name + '_mode'] === 'reinit' ? '초기화중' : '연결중'}</Text>} />
                    ) : ws.status === 'FAILED' ? (
                      <Badge status="error" text={<Text style={{ color: '#ff4d4f', fontSize: 12 }}>연결실패</Text>} />
                    ) : isSelected ? (
                      <Badge
                        status="success"
                        text={
                          <Text style={{ color: '#fff', fontSize: 12 }}>
                            선택됨
                          </Text>
                        }
                      />
                    ) : ws.status === 'USED' ? (
                      <Badge status="processing" text={<Text style={{ fontSize: 12 }}>연결됨</Text>} />
                    ) : (
                      <Badge status="default" text={<Text style={{ color: '#999', fontSize: 12 }}>유휴</Text>} />
                    )}
                  </div>

                  {/* 도메인 + 연결자 (한 줄) */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    minHeight: 22,
                  }}>
                    <div>
                      {ws.domain ? (
                        <Badge color={isSelected ? 'white' : 'blue'} text={<Text style={{ fontSize: 13, color: isSelected ? '#fff' : undefined }}>{ws.domain}</Text>} />
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12, color: isSelected ? 'rgba(255,255,255,0.7)' : undefined }}>
                          연결된 도메인 없음
                        </Text>
                      )}
                    </div>
                    {ws.connected_by && ws.status !== 'CONNECTING' && (
                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8, color: isSelected ? 'rgba(255,255,255,0.7)' : undefined }}>
                        연결: {ws.connected_by}
                      </Text>
                    )}
                  </div>

                  {/* 작업 진행률 (USED 상태이고 도메인 있을 때) */}
                  {ws.status === 'USED' && ws.domain && 작업진행률[ws.name] !== undefined && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.7)' : '#999' }}>
                          작업 진행률
                        </Text>
                        <Text style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.85)' : undefined }}>
                          {작업진행률[ws.name]}%
                        </Text>
                      </div>
                      <Progress
                        percent={작업진행률[ws.name]}
                        size="small"
                        showInfo={false}
                        strokeColor={isSelected ? 'rgba(255,255,255,0.85)' : undefined}
                        trailColor={isSelected ? 'rgba(255,255,255,0.2)' : undefined}
                      />
                    </div>
                  )}

                  {/* FAILED 에러 메시지 표시 */}
                  {ws.status === 'FAILED' && 에러메시지[ws.name] && (
                    <div style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 8, padding: '4px 8px', background: '#fff2f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                      ⚠ {에러메시지[ws.name]}
                    </div>
                  )}

                  {/* 버튼 영역 — 좌: 기능버튼, 우: 색상 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size={6} wrap>
                      {(ws.status === 'IDLE' || ws.status === 'FAILED') && (
                        <>
                          <Button
                            type="primary"
                            size="small"
                            icon={<LinkOutlined />}
                            disabled={isInProgress || 연결해제중 || 목록.some(w => w.status === 'CONNECTING') || isBlocked}
                            onClick={() => {
                              set연결팝업WS(ws.name)
                              set선택도메인(null)
                            }}
                          >
                            연결
                          </Button>
                          {isSuper && (
                            <Popconfirm
                              title={`"${ws.name}" 워크스페이스를 삭제하시겠습니까?`}
                              onConfirm={() => 삭제핸들러(ws.name)}
                              okText="삭제"
                              cancelText="취소"
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} disabled={연결해제중 || 목록.some(w => w.status === 'CONNECTING') || isBlocked}>
                                삭제
                              </Button>
                            </Popconfirm>
                          )}
                        </>
                      )}
                      {ws.status === 'USED' && (
                        <>
                          {isSelected ? (
                            <Button
                              size="small"
                              icon={<CloseCircleOutlined />}
                              onClick={선택해제핸들러}
                            >
                              선택해제
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="primary"
                                size="small"
                                icon={<CheckCircleOutlined />}
                                disabled={!currentUser}
                                onClick={async () => {
                                  if (ws.domain) {
                                    setWorkspace(ws.name, ws.domain, ws.color)
                                    message.success(`워크스페이스 "${ws.name}" 선택됨`)
                                    try {
                                      const res = await assignmentApi.작업상태(ws.name, ws.domain)
                                      const p = res.data.phase || 'preprocess'
                                      const mp = res.data.my_phase || 'idle'
                                      if (p === 'preprocess') navigate('/preprocess')
                                      else if (p === 'work' && mp === 'working') navigate('/knowledge-work')
                                      else if (p === 'work') navigate('/assignment')
                                      else if (p === 'build') navigate('/build-history')
                                      else if (p === 'verify') navigate('/dict-verify')
                                      else navigate('/preprocess')
                                    } catch {
                                      navigate('/preprocess')
                                    }
                                  }
                                }}
                              >
                                선택
                              </Button>
                              <Popconfirm
                                title={`"${ws.name}" 연결을 해제하시겠습니까? 프리징/할당 등 모든 작업 데이터가 삭제됩니다.`}
                                onConfirm={() => 해제핸들러(ws.name)}
                                okText="연결해제"
                                okButtonProps={{ danger: true }}
                                cancelText="취소"
                              >
                                <Button size="small" icon={<DisconnectOutlined />} disabled={연결해제중 || 목록.some(w => w.status === 'CONNECTING') || isBlocked}>
                                  연결해제
                                </Button>
                              </Popconfirm>
                            </>
                          )}
                          {ws.domain && (
                            <Popconfirm
                              title="프리징 상태를 해제하고 작업 데이터를 삭제합니다. 계속하시겠습니까?"
                              onConfirm={() => 초기화핸들러(ws.name)}
                              okText="초기화"
                              cancelText="취소"
                              okButtonProps={{ danger: true }}
                            >
                              <Button size="small" icon={<ReloadOutlined />} style={{ color: '#fa8c16', borderColor: '#fa8c16' }} disabled={연결해제중 || 목록.some(w => w.status === 'CONNECTING') || isBlocked}>
                                초기화
                              </Button>
                            </Popconfirm>
                          )}
                          {isSuper && (
                            <Button size="small" danger icon={<DeleteOutlined />} disabled>
                              삭제
                            </Button>
                          )}
                        </>
                      )}
                    </Space>
                    {/* 색상 버튼 — 우측 끝 */}
                    {(ws.status !== 'CONNECTING') && (
                      <ColorPicker
                        value={ws.color || '#1a1a2e'}
                        onChangeComplete={(color) => 색상변경핸들러(ws.name, color.toHexString())}
                        presets={[{ label: '추천 색상', colors: 프리셋색상 }]}
                        size="small"
                      >
                        <Button size="small" icon={<BgColorsOutlined />} style={{ backgroundColor: ws.color || '#1a1a2e', color: '#fff', border: `1px solid ${ws.color || '#1a1a2e'}`, ...(isSelected ? { outline: '1px solid #fff' } : {}) }}>
                          색상
                        </Button>
                      </ColorPicker>
                    )}
                  </div>
                </Card>
              </Col>
            )
          })}

          {목록.length === 0 && !로딩 && (
            <Col span={24}>
              <Card>
                <Empty description="워크스페이스가 없습니다" />
              </Card>
            </Col>
          )}
        </Row>
      </Spin>

      {/* 도메인 연결 모달 */}
      <Modal
        title={`도메인 연결 — ${연결팝업WS}`}
        open={!!연결팝업WS}
        onOk={연결확인핸들러}
        onCancel={() => {
          set연결팝업WS(null)
          set선택도메인(null)
        }}
        okText="연결"
        cancelText="취소"
        okButtonProps={{ disabled: !선택도메인 || !선택jiana }}
      >
        <Select
          style={{ width: '100%', marginTop: 8 }}
          placeholder="연결할 도메인 선택"
          options={도메인목록.map(d => {
            const 연결됨WS = 목록.find(ws => ws.domain === d.id && ws.status === 'USED')
            const 표시명 = d.name ? `${d.name} (${d.id})` : d.id
            return {
              label: 연결됨WS ? `${표시명} (${연결됨WS.name}에 연결됨)` : 표시명,
              value: d.id,
              disabled: !!연결됨WS,
            }
          })}
          onChange={v => {
            set선택도메인(v)
            // 도메인 선택 시 마지막 사용 jiana 버전 자동 복원
            if (v) {
              workspaceAPI.도메인jiana설정(v).then(res => {
                const saved = res.data?.jiana_version
                if (saved && jiana버전목록.includes(saved)) {
                  set선택jiana(saved)
                }
              }).catch(() => {})
            }
          }}
          value={선택도메인}
        />
        <Select
          style={{ width: '100%', marginTop: 12 }}
          placeholder="jiana 버전 선택"
          options={jiana버전목록.map(v => ({ label: `jiana ${v}`, value: v }))}
          onChange={v => set선택jiana(v)}
          value={선택jiana}
        />
      </Modal>

    </div>
  )
}
