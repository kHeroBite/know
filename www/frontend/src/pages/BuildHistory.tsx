import { useState, useEffect, useRef, useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  Card, Button, Table, Tag, Typography, Space, Modal,
  message, Statistic, Row, Col, Divider
} from 'antd'
import { BuildOutlined, ReloadOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { 빌드API } from '../api/pipeline'
import { workspaceAPI } from '../api/workspace'
import 클라이언트 from '../api/client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography

interface 빌드이력항목 {
  id: number
  domain: string
  status: string
  row_count: number
  prev_row_count: number | null
  started_at: string
  completed_at: string | null
  error_message: string | null
}

interface 도메인통계 {
  domain: string
  total: number
  success: number
  failed: number
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  running: { color: 'processing', label: '진행중' },
  completed: { color: 'success', label: '성공' },
  failed: { color: 'error', label: '실패' },
  cancelled: { color: 'warning', label: '중지' },
}
const DOMAIN_COLORS: Record<string, string> = {}
const PALETTE = ['#1890ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1', '#13c2c2', '#fa541c', '#2f54eb']
function getDomainColor(domain: string): string {
  if (!DOMAIN_COLORS[domain]) {
    DOMAIN_COLORS[domain] = PALETTE[Object.keys(DOMAIN_COLORS).length % PALETTE.length]
  }
  return DOMAIN_COLORS[domain]
}

function 파일다운로드(buildId: number, filename: string) {
  const tk = localStorage.getItem('access_token') || ''
  const url = `/api/build/${buildId}/download/${filename}?token=${tk}`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function BuildHistory() {
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const navigate = useNavigate()
  const currentDomain = selectedDomain || ''

  // 현재 워크스페이스 빌드
  const [빌드로그, set빌드로그] = useState<string[]>([])
  const [빌드중, set빌드중] = useState(false)
  const [최근빌드ID, set최근빌드ID] = useState<number | null>(null)
  const [최근빌드상태, set최근빌드상태] = useState<string>('')
  const [현재이력, set현재이력] = useState<빌드이력항목[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const 로그박스Ref = useRef<HTMLDivElement>(null)

  // 전체 이력
  const [전체이력, set전체이력] = useState<빌드이력항목[]>([])
  const [도메인통계목록, set도메인통계목록] = useState<도메인통계[]>([])
  const [이력로딩, set이력로딩] = useState(false)

  // 현재 도메인 이력 조회 + 최근 빌드 상태 복원
  const 현재이력조회 = useCallback(async () => {
    if (!currentDomain) return
    try {
      const res = await 빌드API.이력조회(currentDomain)
      const items = res.data?.items || []
      set현재이력(items)
      // 최근 빌드 상태 복원
      if (items.length > 0) {
        const latest = items[0]
        set최근빌드ID(latest.id)
        set최근빌드상태(latest.status)
        if (latest.status === 'running') {
          set빌드중(true)
        }
      }
    } catch { /* 무시 */ }
  }, [currentDomain])

  // 페이지 진입 시 최근 빌드 상태 복원 (폴링 재시작 포함 — 아래 pollRef/빌드로그조회 선언 이후로 이동)

  // 전체 이력 조회
  const 전체이력조회 = useCallback(async () => {
    set이력로딩(true)
    try {
      const res: any = await 빌드API.전체이력()
      set전체이력(res.data?.items || [])
      set도메인통계목록(res.data?.domain_stats || [])
    } catch {
      message.error('빌드 이력 조회 실패')
    } finally {
      set이력로딩(false)
    }
  }, [])

  useEffect(() => { 현재이력조회() }, [현재이력조회])
  useEffect(() => { 전체이력조회() }, [전체이력조회])

  useEffect(() => {
    if (로그박스Ref.current) {
      로그박스Ref.current.scrollTop = 로그박스Ref.current.scrollHeight
    }
  }, [빌드로그])

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 페이지 진입/새로고침 시 빌드 상태 복원 (pollRef, 빌드로그조회 선언 이후에 위치 — TDZ 방지)
  useEffect(() => {
    if (!currentDomain) return
    빌드API.상태조회(currentDomain).then((res: any) => {
      const d = res.data
      if (!d) return
      // 로그 복원 (있을 때만)
      if (d.log_text) {
        const lines = d.log_text.split('\n').filter((l: string) => l.trim())
        set빌드로그(lines)
      }
      // 상태 복원 (항상)
      if (d.id) set최근빌드ID(d.id)
      if (d.status) set최근빌드상태(d.status)
      // running 중이면 폴링 자동 복원 (빌드 완료 감지 위해)
      if (d.status === 'running') {
        set빌드중(true)
        if (!pollRef.current) {
          pollRef.current = setInterval(빌드로그조회, 2000)
        }
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDomain])

  const 빌드로그조회 = useCallback(async () => {
    if (!currentDomain) return
    try {
      const res = await 빌드API.상태조회(currentDomain)
      const d = res.data
      if (d.log_text) {
        const lines = d.log_text.split('\n').filter((l: string) => l.trim())
        set빌드로그(lines)
      }
      set최근빌드상태(d.status)
      if (d.id) set최근빌드ID(d.id)
      // 빌드 중에도 이력 테이블 갱신
      현재이력조회()
      전체이력조회()
      if (d.status !== 'running') {
        set빌드중(false)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch { /* 무시 */ }
  }, [currentDomain, 현재이력조회, 전체이력조회])

  const 빌드웹소켓연결 = (domain: string) => {
    wsRef.current?.close()
    // DB 폴링 시작 (2초 간격 — WebSocket 누락 시 fallback)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(빌드로그조회, 2000)

    const connect = () => {
      const ws = new WebSocket(`ws://${window.location.host}/ws/build/${domain}`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'ping') return
          if (msg.log) {
            const lines = msg.log.split('\n').filter((l: string) => l.trim())
            set빌드로그(lines)
          } else {
            set빌드로그(prev => [...prev.slice(-499), e.data])
          }
        } catch {
          set빌드로그(prev => [...prev.slice(-499), e.data])
        }
      }
      ws.onclose = () => {
        빌드로그조회()
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
      ws.onerror = () => setTimeout(connect, 3000)
    }
    connect()
  }

  const 빌드시작 = async () => {
    set빌드중(true)
    set빌드로그([])
    // WebSocket 먼저 연결 후 빌드 시작 (빠른 빌드 로그 누락 방지)
    빌드웹소켓연결(currentDomain)
    try {
      const startRes = await 빌드API.빌드시작(currentDomain, selectedWorkspace || undefined)
      set최근빌드ID(startRes.data?.build_history_id || null)
      set최근빌드상태('running')
      message.success(`워크스페이스 ${selectedWorkspace} 빌드 시작`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '빌드 시작 실패')
      set빌드중(false)
      wsRef.current?.close()
    }
  }

  const 빌드중지 = async () => {
    try {
      await 빌드API.빌드취소(currentDomain)
      message.info('빌드가 중지되었습니다')
      set빌드중(false)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      wsRef.current?.close()
      현재이력조회()
      전체이력조회()
    } catch {
      message.error('빌드 중지 실패')
    }
  }

  // 현재 도메인 통계
  const 최근빌드 = 현재이력[0]
  const 성공건수 = 현재이력.filter(h => h.status === 'success').length
  const 실패건수 = 현재이력.filter(h => h.status === 'failed').length

  // 차트 데이터: 도메인별 빌드 현황
  const 차트데이터 = 도메인통계목록.map(s => ({
    name: s.domain.toUpperCase(),
    성공: s.success,
    실패: s.failed,
    전체: s.total,
  }))

  // 전체 이력 컬럼
  const 전체이력컬럼 = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    {
      title: '도메인', dataIndex: 'domain', key: 'domain', width: 110,
      render: (v: string) => <Tag color={getDomainColor(v)}>{v.toUpperCase()}</Tag>,
    },
    {
      title: '워크스페이스', dataIndex: 'workspace', key: 'workspace', width: 110,
      render: (v: string | null) => v || '-',
    },
    {
      title: '실행자', dataIndex: 'started_by_display', key: 'started_by_display', width: 160,
      render: (v: string | null, r: any) => <span style={{ whiteSpace: 'nowrap' }}>{v || r.started_by || '-'}</span>,
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', label: v }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '시작', dataIndex: 'started_at', key: 'started_at',
      render: (v: string) => v ? v.replace('T', ' ').slice(0, 19) : '-',
    },
    {
      title: '완료', dataIndex: 'completed_at', key: 'completed_at',
      render: (v: string | null) => v ? v.replace('T', ' ').slice(0, 19) : '-',
    },
    {
      title: '소요', key: 'duration',
      width: 70,
      render: (_: any, r: 빌드이력항목) => {
        if (!r.started_at || !r.completed_at) return r.status === 'running' ? <Tag color="processing">진행중</Tag> : '-'
        const sec = Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
        return sec >= 60 ? `${Math.floor(sec/60)}분 ${sec%60}초` : `${sec}초`
      },
    },
    {
      title: '다운로드', key: 'download', width: 160,
      render: (_: any, r: 빌드이력항목) => {
        if (r.status !== 'completed') return '-'
        const dl = (filename: string) => 파일다운로드(r.id, filename)
        return (
          <Space size={4}>
            <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => dl('data.tar')}>data.tar</Button>
            <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => dl('synonym.UTF-8')}>synonym</Button>
          </Space>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <PageHeader
        title="사전 빌드"
        showPrev
        prevLabel="이전단계로 (데이터할당)"
        onPrev={() => {
          Modal.confirm({
            title: '이전단계로 돌아가시겠습니까?',
            content: '데이터할당 단계로 돌아갑니다.',
            okText: '확인',
            cancelText: '취소',
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                await useWorkspaceStore.getState().revertPhase('work')
                navigate('/assignment')
              } catch (err: any) {
                message.error(err.response?.data?.detail || 'phase 전이 실패')
              }
            },
          })
        }}
        showNext={최근빌드상태 === 'completed' && !빌드중}
        nextLabel="다음단계로 (사전검증)"
        onNext={async () => {
          if (!selectedWorkspace) { message.warning('워크스페이스가 선택되지 않았습니다'); return }
          try {
            await workspaceAPI.advancePhase(selectedWorkspace, 'verify')
            await useWorkspaceStore.getState().loadWorkspaceStatus()
            message.success('검증 단계로 전환되었습니다')
            navigate('/dict-verify')
          } catch (e: any) {
            message.error('phase 전환 실패: ' + (e?.response?.data?.detail || e.message))
          }
        }}
      />
      {/* ═══ 상단: 사전 빌드 ═══ */}
      <Card
        extra={
          <Space>
            {빌드중 ? (
              <Button danger icon={<StopOutlined />} onClick={빌드중지}>
                빌드 중지
              </Button>
            ) : (
              <Button type="primary" icon={<BuildOutlined />} onClick={빌드시작} disabled={!currentDomain}>
                빌드 시작
              </Button>
            )}
          </Space>
        }
      >
        <div
          ref={로그박스Ref}
          style={{
            height: 빌드중 || 빌드로그.length > 0 ? 300 : 60, overflowY: 'auto', background: '#1f1f1f',
            color: '#d4d4d4', padding: 12, fontFamily: 'monospace',
            fontSize: 12, borderRadius: 4, transition: 'height 0.3s',
          }}
        >
          {빌드로그.length > 0
            ? 빌드로그.map((l, i) => <div key={i}>{l}</div>)
            : 빌드중
              ? <div style={{ color: '#888' }}>빌드 준비 중...</div>
              : <div style={{ color: '#555' }}>빌드를 시작하면 실시간 로그가 여기에 표시됩니다.</div>
          }
        </div>
        {최근빌드상태 === 'completed' && 최근빌드ID && (
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <Button icon={<ReloadOutlined />} onClick={() => 파일다운로드(최근빌드ID!, 'synonym.UTF-8')}>synonym.UTF-8 다운로드</Button>
            <Button icon={<BuildOutlined />} onClick={() => 파일다운로드(최근빌드ID!, 'data.tar')}>data.tar 다운로드</Button>
            {/* 다음단계 버튼은 PageHeader 상단으로 이동 */}
          </div>
        )}
      </Card>

      <Divider />

      {/* ═══ 하단: 빌드 이력 ═══ */}
      <Title level={4}>빌드 이력</Title>

      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="전체 빌드" value={전체이력.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="성공" value={전체이력.filter(h => h.status === 'success' || h.status === 'completed').length} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="실패" value={전체이력.filter(h => h.status === 'failed').length} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="도메인 수" value={도메인통계목록.length} />
          </Card>
        </Col>
      </Row>

      {/* 도메인별 빌드 현황 차트 */}
      {차트데이터.length > 0 && (
        <Card size="small" title="도메인별 빌드 현황">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={차트데이터} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="성공" stackId="a" fill="#52c41a" />
              <Bar dataKey="실패" stackId="a" fill="#ff4d4f" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* 전체 이력 테이블 */}
      <Card
        size="small"
        title="전체 빌드 이력"
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={전체이력조회} loading={이력로딩}>
            새로고침
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={전체이력}
          columns={전체이력컬럼}
          size="small"
          pagination={{ pageSize: 15, showTotal: t => `총 ${t}건` }}
          loading={이력로딩}
        />
      </Card>
    </Space>
  )
}
