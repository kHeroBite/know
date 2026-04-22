
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
import { backupAPI } from '../api/backup'
import { formatDomain } from '../utils/displayFormat'
import { listSites, type Site } from '../api/site'
import { assignmentApi } from '../api/assignment'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useGlobalTaskStore } from '../stores/globalTaskStore'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography

function fmt날짜(dt?: string | null): string | null {
  if (!dt) return null
  try {
    const d = new Date(dt)
    if (isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${hh}:${mm}`
  } catch {
    return null
  }
}

const 프리셋색상 = [
  '#0f1c3f', '#1a1a2e', '#1a2744', '#1e3a5f',
  '#134e4a', '#14532d', '#4c1d95', '#7f1d1d',
  '#7c2d12', '#1e293b', '#312e81', '#164e63',
]

interface 워크스페이스항목 {
  name: string
  status: 'IDLE' | 'USED' | 'CONNECTING' | 'FAILED'
  domain: string | null
  site_code: string | null
  connected_by: string | null
  color: string | null
  backup_name: string | null
}

function buildProgressLabel(wsName: string, domain: string | null, siteCode: string | null, sites: Site[], domains: {id: string, name: string | null}[], action: string): string {
  // site_code로 먼저 찾고, 없으면 domain_code로 역매핑
  const site = siteCode
    ? sites.find(s => s.site_code?.toLowerCase() === siteCode.toLowerCase())
    : domain
      ? sites.find(s => s.domain_code?.toLowerCase() === domain.toLowerCase())
      : null
  const domainInfo = domain ? domains.find(d => d.id?.toLowerCase() === domain.toLowerCase()) : null
  const domainLabel = domainInfo?.name || domain || ''
  if (site) {
    return `${wsName}:${site.name}(${site.site_code || ''}) ${action}`
  }
  return `${wsName} ${action}`
}

function buildCardLabel(ws: 워크스페이스항목, sites: Site[], domains: {id: string, name: string | null}[]): string {
  // site_code로 먼저 찾고, 없으면 domain_code로 역매핑
  const site = ws.site_code
    ? sites.find(s => s.site_code?.toLowerCase() === ws.site_code?.toLowerCase())
    : ws.domain
      ? sites.find(s => s.domain_code?.toLowerCase() === ws.domain?.toLowerCase())
      : null
  const domainInfo = ws.domain ? domains.find(d => d.id?.toLowerCase() === ws.domain?.toLowerCase()) : null
  const domainLabel = domainInfo?.name || ws.domain || ''
  if (site && ws.domain) {
    return `${site.name}(${site.site_code || ''})/${domainLabel}(${ws.domain})`
  }
  if (ws.domain && domainInfo?.name) {
    return `${domainLabel}(${ws.domain})`
  }
  return ws.domain || ''
}

export default function Workspace() {
  const { user: currentUser } = useAuthStore()
  const { selectedWorkspace, setWorkspace, clearWorkspace, phase, myPhase } = useWorkspaceStore()
  const { isBlocked, currentTask, executeConnect, executeCancel, executeRelease, executeReinit, executeCreate, restoreWorkspacePolling } = useGlobalTaskStore()
  const navigate = useNavigate()
  const [목록, set목록] = useState<워크스페이스항목[]>([])
  const [도메인목록, set도메인목록] = useState<{id: string, name: string | null}[]>([])
  const [사이트목록, set사이트목록] = useState<Site[]>([])
  const [로딩, set로딩] = useState(false)
  const [새이름, set새이름] = useState('')
  const [새색상, set새색상] = useState<string | null>(null)
  const 생성중 = currentTask?.status === 'running' && currentTask.id.startsWith('ws-create-')
  const [연결팝업WS, set연결팝업WS] = useState<string | null>(null)
  const [선택도메인, set선택도메인] = useState<string | null>(null)
  const [선택사이트, set선택사이트] = useState<string | null>(null)
  const [jiana버전목록, setJiana버전목록] = useState<string[]>([])
  const [선택jiana, set선택jiana] = useState<string>('')
  const [연결소스, set연결소스] = useState<'site' | 'backup'>('site')
  const [선택백업, set선택백업] = useState<string | null>(null)
  const [백업목록, set백업목록] = useState<{name: string, domain: string, timestamp: string, dict_counts: any}[]>([])
  const [색상팝업WS, set색상팝업WS] = useState<string | null>(null)
  const [에러메시지, set에러메시지] = useState<Record<string, string>>({})
  const [작업진행률, set작업진행률] = useState<Record<string, number>>({})

  // store에서 직접 파생: 현재 연결 진행 중인 WS 이름과 진행률
  const 연결진행중WS = (() => {
    if (!currentTask || currentTask.status !== 'running') return null
    const match = currentTask.id.match(/^ws-(?:connect|reinit)-(.+?)-\d+/)
    if (!match) return null
    return { name: match[1], percent: currentTask.percent }
  })()

  const isSuper = currentUser?.auth === 'A'

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [wsRes, dmRes, jianaRes, siteRes] = await Promise.all([
        workspaceAPI.워크스페이스목록(),
        workspaceAPI.도메인목록(),
        workspaceAPI.jiana버전목록(),
        listSites(),
      ])
      const wsList: 워크스페이스항목[] = wsRes.data
      set목록(wsList)
      await restoreWorkspacePolling(wsList)
      set도메인목록(dmRes.data)
      set사이트목록(siteRes)
      const versions = jianaRes.data?.versions || []
      setJiana버전목록(versions)
      if (!선택jiana && versions.length > 0) set선택jiana(versions[versions.length - 1])
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
  }, [])

  // task 완료/취소 시 목록 자동 갱신
  const prevTaskStatusRef = useRef<string | null>(null)
  useEffect(() => {
    const status = currentTask?.status ?? null
    const prev = prevTaskStatusRef.current
    // running → done/error/cancelled 전환 시 목록 재조회
    if (prev === 'running' && (status === 'done' || status === 'error' || status === 'cancelled')) {
      목록조회()
    }
    prevTaskStatusRef.current = status
  }, [currentTask?.status])

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
        if (total === 0) return
        const percent = Math.round((completed / total) * 100)
        set작업진행률(prev => ({ ...prev, [ws.name]: percent }))
      } catch {
        // 진행률 조회 실패 시 무시
      }
    })
  }, [목록])

  const 생성핸들러 = async () => {
    if (!새이름.trim()) { message.warning('이름을 입력하세요'); return }
    await executeCreate(새이름.trim(), 새색상, {
      onDone: async () => {
        message.success(`워크스페이스 "${새이름}" 생성 완료`)
        set새이름('')
        set새색상(null)
        await 목록조회()
      },
      onError: async (err) => {
        message.error(err || '생성 실패')
        await 목록조회()
      },
    })
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
    if (!연결팝업WS) return
    const wsName = 연결팝업WS

    if (연결소스 === 'backup') {
      if (!선택백업) { message.warning('백업을 선택하세요'); return }
      if (!선택jiana) { message.warning('jiana 버전을 선택하세요'); return }
      const backup = 백업목록.find(b => b.name === 선택백업)
      const domain = backup?.domain ?? ''
      set연결팝업WS(null); set선택백업(null); set선택도메인(null)
      await executeConnect(wsName, domain, 선택jiana, {
        onDone: async () => {
          message.success(`"${wsName}" 백업 연결 완료`)
          set에러메시지(prev => { const n = { ...prev }; delete n[wsName + '_mode']; return n })
          await 목록조회()
        },
        onError: async (err) => {
          message.error(err || '연결 실패')
          await 목록조회()
        },
      }, { label: `${wsName} 백업 연결 중` }, 선택백업)
      return
    }

    if (!선택사이트) {
      message.warning('사이트를 선택하세요')
      return
    }
    if (!선택jiana) {
      message.warning('jiana 버전을 선택하세요')
      return
    }
    const siteCode = 선택사이트
    const jianaVer = 선택jiana
    const site = 사이트목록.find(s => s.site_code === siteCode)
    const domain = site?.domain_code ?? siteCode
    set연결팝업WS(null)
    set선택사이트(null)
    set선택도메인(null)

    await executeConnect(wsName, domain, jianaVer, {
      onDone: async () => {
        message.success(`"${wsName}" 연결 완료`)
        set에러메시지(prev => { const n = { ...prev }; delete n[wsName + '_mode']; return n })
        await 목록조회()
      },
      onError: async (err) => {
        const status = (err || '').includes('404') ? 404 : 0
        if (status === 404) {
          message.error(`도메인 디렉토리를 찾을 수 없습니다: ${err}`)
        } else {
          message.error(err || '연결 실패')
        }
        await 목록조회()
      },
    }, { label: buildProgressLabel(wsName, domain, siteCode, 사이트목록, 도메인목록, '연결 중') })
  }

  const 해제핸들러 = async (wsName: string) => {
    const ws = 목록.find(w => w.name === wsName)
    await executeRelease(wsName, {
      onDone: async () => {
        if (selectedWorkspace === wsName) {
          clearWorkspace()
        }
        message.success(`"${wsName}" 연결해제 완료`)
        await 목록조회()
      },
      onError: async (err) => {
        message.error(err || '연결해제 실패')
        await 목록조회()
      },
    }, { label: buildProgressLabel(wsName, ws?.domain ?? null, ws?.site_code ?? null, 사이트목록, 도메인목록, '연결 해제 중') })
  }

  const 선택해제핸들러 = () => {
    clearWorkspace()
    message.success('워크스페이스 선택 해제')
  }

  const 초기화핸들러 = async (wsName: string) => {
    const ws = 목록.find(w => w.name === wsName)
    const domain = ws?.domain
    if (!domain) { message.error('연결된 도메인이 없습니다'); return }

    let jianaVer: string | undefined
    try {
      const res = await workspaceAPI.도메인jiana설정(domain)
      jianaVer = res.data?.jiana_version || undefined
    } catch { /* 없으면 무시 */ }

    if (selectedWorkspace === wsName) clearWorkspace()

    set에러메시지(prev => ({ ...prev, [wsName + '_mode']: 'reinit' }))

    await executeReinit(wsName, domain, jianaVer, {
      onDone: async () => {
        message.success(`"${wsName}" 초기화 완료`)
        set에러메시지(prev => { const n = { ...prev }; delete n[wsName + '_mode']; return n })
        await 목록조회()
      },
      onError: async (err) => {
        message.error(err || '초기화 실패')
        await 목록조회()
      },
    }, { label: buildProgressLabel(wsName, domain, ws?.site_code ?? null, 사이트목록, 도메인목록, '초기화 중') })
  }

  const 취소핸들러 = async (wsName: string) => {
    await executeCancel(wsName, {
      onCancel: async () => {
        message.info(`"${wsName}" 연결 취소 요청됨`)
        await 목록조회()
      },
      onError: (err) => {
        message.error(err || '취소 실패')
      },
    })
  }

  const 색상변경핸들러 = async (wsName: string, color: string) => {
    try {
      await workspaceAPI.색상변경(wsName, color)
      set색상팝업WS(null)
      if (selectedWorkspace === wsName) {
        const ws = 목록.find(w => w.name === wsName)
        if (ws?.domain) setWorkspace(wsName, ws.domain, color, 도메인목록.find(d => d.id === ws.domain)?.name ?? null)
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

      <Spin spinning={로딩}>
        <Row gutter={[16, 16]}>
          {목록.map(ws => {
            const isSelected = selectedWorkspace === ws.name
            const isMyTask = 연결진행중WS?.name === ws.name
            // CONNECTING 상태이거나 globalTaskStore에 이 ws 작업이 running 중이면 progress 표시
            const isInProgress = ws.status === 'CONNECTING' || isMyTask
            const progressPercent = isMyTask ? 연결진행중WS!.percent : undefined

            return (
              <Col xs={24} sm={12} key={ws.name}>
                <Card style={{ minHeight: 160, ...getCardStyle(ws) }} styles={{ body: { padding: 16 } }}>
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
                        onClick={() => 취소핸들러(ws.name)}
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
                        <Badge color={isSelected ? 'white' : 'blue'} text={<Text style={{ fontSize: 13, color: isSelected ? '#fff' : undefined }}>{buildCardLabel(ws, 사이트목록, 도메인목록)}</Text>} />
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12, color: isSelected ? 'rgba(255,255,255,0.7)' : undefined }}>
                          연결된 사이트 없음
                        </Text>
                      )}
                    </div>
                    {ws.connected_by && ws.status !== 'CONNECTING' && (
                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8, color: isSelected ? 'rgba(255,255,255,0.7)' : undefined }}>
                        연결: {ws.connected_by}
                      </Text>
                    )}
                  </div>

                  {/* 백업 출처 표시 — 항상 동일 높이 확보 */}
                  {ws.status === 'USED' && (
                    <div style={{ marginBottom: 8, visibility: ws.backup_name ? 'visible' : 'hidden' }}>
                      <Text style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.75)' : '#fa8c16' }}>
                        📦 백업: {ws.backup_name ?? ''}
                      </Text>
                    </div>
                  )}

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
                            size="small"
                            icon={<LinkOutlined />}
                            disabled={isInProgress || 목록.some(w => w.status === 'CONNECTING') || isBlocked}
                            onClick={async () => {
                              set연결팝업WS(ws.name)
                              set선택사이트(null)
                              set선택도메인(null)
                              set연결소스('site')
                              set선택백업(null)
                              // 모든 도메인 백업 목록 로드
                              try {
                                const allDomains = 도메인목록.map(d => d.id).filter(Boolean)
                                const allBackups: any[] = []
                                await Promise.all(allDomains.map(async (dom: string) => {
                                  try {
                                    const res = await backupAPI.listBackups(dom)
                                    const items = res.data?.backups ?? []
                                    items.forEach((b: any) => allBackups.push({ ...b, domain: dom }))
                                  } catch {}
                                }))
                                allBackups.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                                set백업목록(allBackups)
                              } catch {}
                            }}
                            style={{ backgroundColor: ws.color || '#1a1a2e', borderColor: ws.color || '#1a1a2e', color: '#fff' }}
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
                              <Button size="small" danger icon={<DeleteOutlined />} disabled={목록.some(w => w.status === 'CONNECTING') || isBlocked}>
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
                                size="small"
                                icon={<CheckCircleOutlined />}
                                disabled={!currentUser}
                                style={{ backgroundColor: ws.color || '#1a1a2e', borderColor: ws.color || '#1a1a2e', color: '#fff' }}
                                onClick={async () => {
                                  if (ws.domain) {
                                    setWorkspace(ws.name, ws.domain, ws.color, 도메인목록.find(d => d.id === ws.domain)?.name ?? null)
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
                                <Button size="small" icon={<DisconnectOutlined />} disabled={목록.some(w => w.status === 'CONNECTING') || isBlocked}>
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
                              <Button size="small" icon={<ReloadOutlined />} style={{ color: '#fa8c16', borderColor: '#fa8c16' }} disabled={목록.some(w => w.status === 'CONNECTING') || isBlocked}>
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

      {isSuper && (
        <Card style={{ marginTop: 16, animation: 'wsCardFadeIn 0.3s ease' }}>
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
                loading={생성중}
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

      {/* 사이트/백업 연결 모달 */}
      <Modal
        title={`워크스페이스 연결 : ${연결팝업WS}`}
        open={!!연결팝업WS}
        onOk={연결확인핸들러}
        onCancel={() => {
          set연결팝업WS(null)
          set선택사이트(null)
          set선택도메인(null)
          set선택백업(null)
          set연결소스('site')
        }}
        okText="연결"
        cancelText="취소"
        okButtonProps={{
          disabled: 연결소스 === 'site'
            ? (!선택사이트 || !선택jiana)
            : (!선택백업 || !선택jiana)
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Button
            size="small"
            type={연결소스 === 'site' ? 'primary' : 'default'}
            onClick={() => { set연결소스('site'); set선택백업(null) }}
          >사이트/도메인</Button>
          <Button
            size="small"
            type={연결소스 === 'backup' ? 'primary' : 'default'}
            onClick={() => { set연결소스('backup'); set선택사이트(null); set선택도메인(null) }}
          >백업에서 복사</Button>
        </div>

        {연결소스 === 'site' ? (
          <>
            <Select
              style={{ width: '100%' }}
              placeholder="연결할 사이트 선택"
              options={사이트목록.map(s => {
                const 연결됨WS = 목록.find(ws => ws.domain === s.domain_code && ws.status === 'USED')
                const 표시명 = `${s.site_code} (${s.name})`
                return {
                  label: s.orphaned
                    ? `${표시명} (연결 끊김)`
                    : 연결됨WS
                      ? `${표시명} (${연결됨WS.name}에 연결됨)`
                      : 표시명,
                  value: s.site_code,
                  disabled: s.orphaned || !!연결됨WS,
                }
              })}
              onChange={v => {
                set선택사이트(v)
                if (v) {
                  const site = 사이트목록.find(s => s.site_code === v)
                  if (site?.domain_code) {
                    set선택도메인(site.domain_code)
                    workspaceAPI.도메인jiana설정(site.domain_code).then(res => {
                      const saved = res.data?.jiana_version
                      if (saved && jiana버전목록.includes(saved)) {
                        set선택jiana(saved)
                      }
                    }).catch(() => {})
                  }
                }
              }}
              value={선택사이트}
            />
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {선택도메인
                ? <Text>도메인 : {formatDomain(선택도메인, 도메인목록.find(d => d.id?.toLowerCase() === 선택도메인?.toLowerCase())?.name)}</Text>
                : <Text type="secondary">사이트를 먼저 선택하세요</Text>
              }
            </div>
            {선택사이트 && (() => {
              const site = 사이트목록.find(s => s.site_code === 선택사이트)
              const 최근작업 = fmt날짜(site?.last_work_at)
              return (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>최근 작업: {최근작업 ?? '없음'}</Text>
                </div>
              )
            })()}
          </>
        ) : (
          <>
            <Select
              style={{ width: '100%' }}
              placeholder="복사할 백업 선택"
              showSearch
              optionFilterProp="label"
              options={백업목록.map(b => ({
                label: `[${b.domain}] ${b.name}`,
                value: b.name,
              }))}
              onChange={v => {
                set선택백업(v)
                const b = 백업목록.find(x => x.name === v)
                if (b?.domain) {
                  workspaceAPI.도메인jiana설정(b.domain).then(res => {
                    const saved = res.data?.jiana_version
                    if (saved && jiana버전목록.includes(saved)) set선택jiana(saved)
                  }).catch(() => {})
                }
              }}
              value={선택백업}
            />
            {선택백업 && (() => {
              const b = 백업목록.find(x => x.name === 선택백업)
              return b ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  도메인: {b.domain} | udic: {b.dict_counts?.udic ?? 0} | cndic: {b.dict_counts?.cndic ?? 0} | thesaurus: {b.dict_counts?.thesaurus ?? 0}
                </div>
              ) : null
            })()}
            <div style={{ marginTop: 8, fontSize: 12, color: '#faad14' }}>
              ⚠ 백업 사전 데이터를 워크스페이스에 직접 로드합니다. 도메인 원본은 변경되지 않습니다.
            </div>
          </>
        )}

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
