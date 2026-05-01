import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Card, Alert, Typography, Space, Row, Col, Statistic, Table, Tag,
  Checkbox, Input, Button, Modal, message, Descriptions, Spin, Form, Collapse, Select, Progress,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, TeamOutlined, DatabaseOutlined,
  ShareAltOutlined, MailOutlined, CopyOutlined, ExclamationCircleFilled,
  FileTextOutlined, FilePptOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { workspaceAPI, type StepReportResponse, type ParticipantStat } from '../api/workspace'
import { phase1API } from '../api/phase1'
import SnapshotListModal from '../components/phase1/SnapshotListModal'

import { backupAPI, getEmailContacts, type Backup } from '../api/backup'
import { shareAPI } from '../api/share'
import { reportAPI } from '../api/reports'
import ReportPanel from '../components/ReportPanel'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography

interface Snapshot {
  workspace: string
  domain: string | null
  phase: string
  connected_at: string | null
  prepared_at: string | null
  finished_at: string | null
  snapshot_before: Record<string, number> | null
  snapshot_after: Record<string, number> | null
  before?: Record<string, number> | null
  after?: Record<string, number> | null
  created_at?: string | null
}

interface Participant {
  user_id: string
  name: string
  r_count: number
  w_count: number
}

const DICT_KEYS: { key: string; label: string }[] = [
  { key: 'udic_count', label: 'UDIC (사용자사전)' },
  { key: 'cndic_count', label: 'CNDIC (복합명사)' },
  { key: 'thesaurus_count', label: 'THESAURUS (동의어)' },
  { key: 'category_count', label: 'CATEGORY (카테고리)' },
]

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

function formatDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso) return '-'
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  if (isNaN(start) || isNaN(end) || end < start) return '-'
  const sec = Math.floor((end - start) / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}시간 ${m}분`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}



export default function WorkComplete() {
  const navigate = useNavigate()
  const { selectedWorkspace, selectedDomain, selectedDomainLabel, phase } = useWorkspaceStore()

  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])

  const [siteCode, setSiteCode] = useState<string | null>(null)
  const [siteName, setSiteName] = useState<string | null>(null)
  const [backupSourceName, setBackupSourceName] = useState<string | null>(null)
  const [doCopyDomain, setDoCopyDomain] = useState(true)
  const [doBackup, setDoBackup] = useState(true)
  const [backupSuffix, setBackupSuffix] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [finalProgress, setFinalProgress] = useState(0)
  const [finalStep, setFinalStep] = useState('')
  const finalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // finished 뷰 전용
  const [latestBackup, setLatestBackup] = useState<Backup | null>(null)
  const [prevBackupName, setPrevBackupName] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareGenerating, setShareGenerating] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailForm] = Form.useForm<{ to: string }>()
  const [emailSending, setEmailSending] = useState(false)
  const [pptDownloading, setPptDownloading] = useState(false)
  const [emailContacts, setEmailContacts] = useState<{ id: number; name: string; email: string }[]>([])

  // 단계별 리포트 (isFinished 후 조회)
  const [stepReport, setStepReport] = useState<StepReportResponse | null>(null)
  const [participantStats, setParticipantStats] = useState<ParticipantStat[] | null>(null)

  // 스냅샷 복원 모달
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false)

  const loadAll = useCallback(async () => {
    if (!selectedWorkspace) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [snapRes, partRes, wsList] = await Promise.all([
        workspaceAPI.getWorkspaceSnapshots(selectedWorkspace, selectedDomain || undefined).catch(() => ({ data: null as any })),
        workspaceAPI.getParticipantsStats(selectedWorkspace).catch(() => ({ data: { participants: [] } })),
        workspaceAPI.워크스페이스목록().catch(() => ({ data: [] as any[] })),
      ])
      if (snapRes.data) setSnapshot(snapRes.data)
      setParticipants(partRes.data?.participants || [])
      // 현재 워크스페이스의 site_code 추출 (없으면 사이트 목록에서 domain_code 역매핑)
      const wsInfo = (wsList.data || []).find((w: any) => w.name === selectedWorkspace)
      // 백업 소스 연결 여부 감지 — 백업 연결 시 도메인 복사 기본 OFF
      const srcBackup = wsInfo?.backup_name || null
      setBackupSourceName(srcBackup)
      setDoCopyDomain(!srcBackup)
      let sc = wsInfo?.site_code || null
      let sn: string | null = null
      if (!sc && selectedDomain) {
        try {
          const { listSites } = await import('../api/site')
          const sites = await listSites()
          const matched = sites.find((s: any) => s.domain_code?.toLowerCase() === selectedDomain.toLowerCase())
          if (matched) { sc = matched.site_code; sn = matched.name || null }
        } catch {}
      } else if (sc) {
        try {
          const { listSites } = await import('../api/site')
          const sites = await listSites()
          const matched = sites.find((s: any) => s.site_code === sc)
          if (matched) sn = matched.name || null
        } catch {}
      }
      setSiteCode(sc)
      setSiteName(sn)

      // finished 뷰 — 해당 워크스페이스에 연결된 최신 백업 조회
      if (phase === 'finished' && selectedDomain) {
        try {
          const bres = await backupAPI.listBackups(selectedDomain)
          const items = bres.data?.backups || []
          const wsBackups = items.filter((b) => b.workspace_name === selectedWorkspace)
          if (wsBackups.length > 0) {
            setLatestBackup(wsBackups[0])
            setShareUrl(wsBackups[0].share_url || null)
            setPrevBackupName(wsBackups[1]?.name || null)
          } else {
            setLatestBackup(null)
            setShareUrl(null)
            setPrevBackupName(null)
          }
        } catch (e: any) {
          console.warn('백업 목록 로드 실패', e?.message)
        }
      }
    } catch (e: any) {
      message.error('대시보드 로딩 실패: ' + (e?.message || ''))
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, phase])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 페이지 진입/이탈 step-log
  useEffect(() => {
    if (!selectedWorkspace || !selectedDomain) return
    workspaceAPI.logStep(selectedWorkspace, { phase: 'complete', action: 'enter', domain: selectedDomain })
    return () => {
      workspaceAPI.logStep(selectedWorkspace, { phase: 'complete', action: 'leave', domain: selectedDomain })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspace, selectedDomain])

  // isFinished 시 step-report + 참여자 통계 조회
  useEffect(() => {
    if (phase !== 'finished' || !selectedWorkspace || !selectedDomain) return
    workspaceAPI.getStepReport(selectedWorkspace, selectedDomain)
      .then(res => setStepReport(res.data))
      .catch(() => {})
    workspaceAPI.getParticipantStats(selectedWorkspace, selectedDomain)
      .then(res => setParticipantStats(res.data?.participants || []))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedWorkspace, selectedDomain])

  // 백업 suffix 초기값: YYYYMMDD_HHMMSS
  useEffect(() => {
    if (!backupSuffix) {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      setBackupSuffix(`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isFinished = phase === 'finished'
  const isComplete = phase === 'complete'

  const handleFinalize = () => {
    if (!selectedWorkspace) return
    const fixedPrefix = `${siteCode || selectedDomain}_${selectedDomain}_`
    const fullBackupFolder = fixedPrefix + backupSuffix
    Modal.confirm({
      title: '정말 완료 처리하시겠습니까?',
      content: (
        <div>
          <p>이 작업은 되돌릴 수 없습니다.</p>
          {doBackup
            ? <p>백업 폴더: <code>{fullBackupFolder}</code></p>
            : <p>⚠️ 백업 없이 바로 적용됩니다.</p>}
          {siteCode && <p>사이트: {siteName ? `${siteName}(${siteCode})` : siteCode}</p>}
          {selectedDomain && <p>도메인: {selectedDomainLabel ? `${selectedDomainLabel}(${selectedDomain})` : selectedDomain}</p>}
        </div>
      ),
      okText: '모든 작업 완료',
      cancelText: '취소',
      okButtonProps: { danger: !doBackup },
      onOk: async () => {
        // 진행 모달 시작
        setFinalizing(true)
        setFinalProgress(0)
        setFinalStep('준비 중...')

        const steps = doBackup
          ? [
              { pct: 10, label: '백업 폴더 생성 중...' },
              { pct: 30, label: '도메인 파일 백업 중...' },
              { pct: 55, label: '사전 DB 백업 중...' },
              { pct: 75, label: '도메인에 적용 중...' },
              { pct: 88, label: '스냅샷 기록 중...' },
              { pct: 95, label: '완료 처리 중...' },
            ]
          : [
              { pct: 20, label: '도메인에 적용 중...' },
              { pct: 55, label: '스냅샷 기록 중...' },
              { pct: 85, label: '완료 처리 중...' },
            ]

        let stepIdx = 0
        finalTimerRef.current = setInterval(() => {
          if (stepIdx < steps.length) {
            setFinalProgress(steps[stepIdx].pct)
            setFinalStep(steps[stepIdx].label)
            stepIdx++
          }
        }, 1800)

        try {
          await useWorkspaceStore.getState().finalizeComplete(selectedWorkspace, {
            domain: selectedDomain || undefined,
            backup_folder: doBackup ? fullBackupFolder : undefined,
            skip_backup: !doBackup,
            skip_copy_domain: !doCopyDomain,
            site_id: null,
          })
          if (finalTimerRef.current) clearInterval(finalTimerRef.current)
          setFinalProgress(100)
          setFinalStep('완료!')
          try { await workspaceAPI.releaseWorkspace(selectedWorkspace) } catch {}
          // 테마 색상 포함 워크스페이스 연결 완전 초기화
          useWorkspaceStore.getState().clearWorkspace()
          await new Promise(r => setTimeout(r, 800))
          message.success('워크스페이스가 완료 처리되었습니다.')
          navigate('/workspace')
        } catch (e: any) {
          if (finalTimerRef.current) clearInterval(finalTimerRef.current)
          message.error('완료 처리 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        } finally {
          setFinalizing(false)
          setFinalProgress(0)
          setFinalStep('')
        }
      },
    })
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('클립보드에 복사됨')
    } catch {
      message.warning('복사 실패 — 수동으로 복사해주세요')
    }
  }

  const handleGenerateShare = async () => {
    if (!selectedWorkspace || !latestBackup) return
    setShareGenerating(true)
    try {
      const res = await shareAPI.generateShare(selectedWorkspace, latestBackup.name, 30)
      setShareUrl(res.data.url)
      message.success('공유 링크 발급 완료')
    } catch (e: any) {
      message.error('공유 링크 발급 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setShareGenerating(false)
    }
  }

  const handleSendEmail = async () => {
    if (!selectedWorkspace || !latestBackup) return
    try {
      const values = await emailForm.validateFields()
      setEmailSending(true)
      const res = await backupAPI.sendBackupEmail(latestBackup.name, {
        to: values.to,
        workspace: selectedWorkspace,
      })
      message.success(`메일 전송 완료 (공유 URL 포함)`)
      setShareUrl(res.data.share_url)
      setEmailModalOpen(false)
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('메일 전송 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setEmailSending(false)
    }
  }

  const handleDownloadDataTar = () => {
    if (!latestBackup) return
    window.open(backupAPI.downloadDataTarUrl(latestBackup.name), '_blank')
  }

  const handleDownloadPpt = async () => {
    if (!selectedWorkspace || !latestBackup) return
    setPptDownloading(true)
    try {
      const res = await reportAPI.downloadPptFile(selectedWorkspace, latestBackup.name)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${latestBackup.name}.pptx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      message.error('PPT 다운로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setPptDownloading(false)
    }
  }

  const handleOpenEmailModal = async () => {
    emailForm.resetFields()
    setEmailModalOpen(true)
    try {
      const res = await getEmailContacts()
      setEmailContacts(res.data || [])
    } catch {
      setEmailContacts([])
    }
  }

  const goBackToVerify = async () => {
    if (!selectedWorkspace) return
    try {
      // 서버에서 현재 실제 phase를 조회 후 1단계 역전이
      const phaseRes = await workspaceAPI.getPhase(selectedWorkspace)
      const serverPhase: string = phaseRes.data?.phase || 'complete'
      const phaseOrder = ['preprocess', 'work', 'build', 'verify', 'complete', 'finished']
      const idx = phaseOrder.indexOf(serverPhase)
      if (idx <= 0) {
        message.warning(`현재 단계(${serverPhase})에서는 되돌릴 수 없습니다.`)
        return
      }
      if (serverPhase === 'finished') {
        message.warning('완료(finished) 상태에서는 되돌릴 수 없습니다.')
        return
      }
      const prevPhase = phaseOrder[idx - 1]
      await useWorkspaceStore.getState().revertPhase(prevPhase as any)
      const pageMap: Record<string, string> = { build: '/build-history', verify: '/dict-verify', work: '/workroom' }
      navigate(pageMap[prevPhase] || '/dict-verify')
    } catch (e: any) {
      message.error('되돌리기 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  const handleRestartWithOtherMethod = async () => {
    if (!selectedWorkspace) return
    const prevMethod = localStorage.getItem(`preprocess_method_${selectedWorkspace}`) ?? 'log'
    const nextMethod = prevMethod === 'log' ? 'data' : 'log'
    Modal.confirm({
      title: `${nextMethod === 'data' ? '데이터기반' : '로그기반'} 전처리로 재시작`,
      content: '이전 전처리 결과는 스냅샷으로 자동 보존됩니다. 필요 시 "이전 스냅샷 복원" 버튼으로 되돌릴 수 있습니다. 계속하시겠습니까?',
      okText: '재시작',
      cancelText: '취소',
      onOk: async () => {
        try {
          await workspaceAPI.restartPreserve(selectedWorkspace, prevMethod as 'log' | 'data')
          // 백엔드에서 phase_backward 처리 → 프론트 store 동기화
          await useWorkspaceStore.getState().loadWorkspaceStatus()
          navigate(`/preprocess?tab=${nextMethod}`)
        } catch (e: any) {
          message.error('재시작 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        }
      },
    })
  }

  const dictRows = useMemo(() => {
    const before = snapshot?.snapshot_before || snapshot?.before || {}
    const after = snapshot?.snapshot_after || snapshot?.after || {}
    return DICT_KEYS.map(({ key, label }) => {
      const b = before[key] ?? 0
      const a = after[key]
      const delta = a !== undefined ? a - b : null
      return { key, label, before: b, after: a, delta }
    })
  }, [snapshot])

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: 24 }}>
        <Title level={3}><CheckCircleOutlined style={{ marginRight: 8 }} /> 작업 완료</Title>
        <Alert type="warning" message="워크스페이스를 먼저 선택해주세요." showIcon />
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin tip="대시보드 로딩 중..." />
      </div>
    )
  }

  const participantColumns = [
    { title: '이름', dataIndex: 'name', key: 'name', render: (v: string, row: Participant) => v || row.user_id },
    { title: '사용자ID', dataIndex: 'user_id', key: 'user_id', width: 140 },
    {
      title: '등록/수정 (W)', dataIndex: 'w_count', key: 'w_count', width: 140, align: 'right' as const,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '읽기전용 (R)', dataIndex: 'r_count', key: 'r_count', width: 140, align: 'right' as const,
      render: (v: number) => <Tag color="default">{v}</Tag>,
    },
  ]

  const dictColumns = [
    { title: '사전 타입', dataIndex: 'label', key: 'label' },
    {
      title: 'Before', dataIndex: 'before', key: 'before', width: 120, align: 'right' as const,
      render: (v: number) => <Text>{v.toLocaleString()}</Text>,
    },
    {
      title: 'After', dataIndex: 'after', key: 'after', width: 120, align: 'right' as const,
      render: (v: number | undefined) =>
        v === undefined
          ? <Text type="secondary">아직 적용 전</Text>
          : <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '증감', dataIndex: 'delta', key: 'delta', width: 120, align: 'right' as const,
      render: (v: number | null) => {
        if (v === null) return <Text type="secondary">-</Text>
        if (v === 0) return <Text>0</Text>
        const color = v > 0 ? '#52c41a' : '#cf1322'
        return <Text style={{ color }}>{v > 0 ? '+' : ''}{v.toLocaleString()}</Text>
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title={`작업 완료 대시보드 — ${siteCode ? (siteName || siteCode) : ''} / ${selectedDomainLabel || selectedDomain || ''}`}
        showPrev={isComplete}
        prevLabel="이전단계로"
        onPrev={goBackToVerify}
      />

      {/* 완료 처리 진행 모달 */}
      <Modal
        open={finalizing}
        title="완료 처리 중"
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        width={400}
      >
        <div style={{ padding: '16px 0' }}>
          <Progress
            percent={finalProgress}
            status={finalProgress === 100 ? 'success' : 'active'}
            strokeColor={finalProgress === 100 ? '#52c41a' : { '0%': '#108ee9', '100%': '#87d068' }}
          />
          <div style={{ marginTop: 12, textAlign: 'center', color: '#666' }}>
            {finalStep}
          </div>
        </div>
      </Modal>

      <div style={{ padding: '0 24px 24px' }}>

      {isFinished && (
        <Alert
          type="success"
          message="이미 완료된 워크스페이스입니다"
          description={`완료 일시: ${formatDateTime(snapshot?.finished_at)}`}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}



      {isComplete && (
        <Alert
          type="info"
          message="완료 준비 단계 — 아래 내용을 확인 후 최종 완료 버튼을 눌러주세요"
          description="필요하면 이전 단계(사전 검증)로 되돌아갈 수 있습니다."
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={<><DatabaseOutlined /> 사전 개수 (Before / After)</>}
            style={{ marginBottom: 16 }}
          >
            <Table
              rowKey="key"
              dataSource={dictRows}
              columns={dictColumns}
              size="small"
              pagination={false}
            />
          </Card>
        </Col>

        {isComplete && (
          <Col xs={24} lg={12}>
            <Card size="small" title="도메인 백업" style={{ marginBottom: 16 }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {backupSourceName && (
                  <div style={{ padding: '6px 10px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4, fontSize: 12 }}>
                    📦 백업 소스 연결: <Text strong>{backupSourceName}</Text>
                  </div>
                )}
                <div>
                  <Checkbox checked={doCopyDomain} onChange={e => setDoCopyDomain(e.target.checked)}>
                    도메인에 적용 (WS → 도메인 역방향 복사){!backupSourceName && <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>(권장)</Text>}
                  </Checkbox>
                  {backupSourceName && !doCopyDomain && (
                    <div style={{ marginTop: 4, marginLeft: 24, fontSize: 11, color: '#fa8c16' }}>
                      ⚠ 도메인 원본이 업데이트되지 않습니다.
                    </div>
                  )}
                </div>
                <div>
                  <Checkbox checked={doBackup} onChange={e => setDoBackup(e.target.checked)}>
                    백업 생성 (권장)
                  </Checkbox>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>백업 폴더명</Text>
                  <div style={{ marginTop: 4, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4, fontFamily: 'monospace', fontSize: 14 }}>
                    <Text strong>{siteCode || selectedDomain}_{selectedDomain}_</Text>
                    <Input
                      value={backupSuffix}
                      disabled={!doBackup}
                      onChange={e => setBackupSuffix(e.target.value)}
                      placeholder="YYYYMMDD_HHMMSS"
                      size="small"
                      style={{ width: 180, marginLeft: 0, border: 'none', borderBottom: '1px solid #d9d9d9', background: 'transparent', fontFamily: 'monospace', fontSize: 14 }}
                    />
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
        )}

        {isFinished && (
          <Col xs={24} lg={12}>
            <Card
              size="small"
              title={<><ClockCircleOutlined /> 시간</>}
              style={{ marginBottom: 16 }}
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="시작시각(연결)">{formatDateTime(snapshot?.connected_at)}</Descriptions.Item>
                <Descriptions.Item label="완료(finished)">{formatDateTime(snapshot?.finished_at)}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        )}
      </Row>

      {isFinished && (
        <Card
          size="small"
          title={<><TeamOutlined /> 참여자 통계 ({participants.length}명)</>}
          style={{ marginBottom: 16 }}
        >
          {participants.length === 0 ? (
            <Text type="secondary">참여자 정보가 없습니다.</Text>
          ) : (
            <>
              <Row gutter={16} style={{ marginBottom: 12 }}>
                <Col span={6}><Statistic title="총 참여자" value={participants.length} /></Col>
                <Col span={6}>
                  <Statistic
                    title="총 등록/수정 (W)"
                    value={participants.reduce((s, p) => s + (p.w_count || 0), 0)}
                    valueStyle={{ color: '#1677ff' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="총 읽기전용 (R)"
                    value={participants.reduce((s, p) => s + (p.r_count || 0), 0)}
                  />
                </Col>
              </Row>
              <Table
                rowKey="user_id"
                dataSource={participants}
                columns={participantColumns}
                size="small"
                pagination={false}
              />
            </>
          )}
        </Card>
      )}

      {isComplete && selectedWorkspace && (
        <SnapshotListModal
          open={snapshotModalOpen}
          workspace={selectedWorkspace}
          onClose={() => setSnapshotModalOpen(false)}
          onRestored={() => {
            setSnapshotModalOpen(false)
            useWorkspaceStore.getState().loadWorkspaceStatus().catch(() => {})
            window.location.reload()
          }}
        />
      )}

      {isComplete && (() => {
        const prevMethod = selectedWorkspace
          ? (localStorage.getItem(`preprocess_method_${selectedWorkspace}`) ?? 'log')
          : 'log'
        const otherMethodLabel = prevMethod === 'log' ? '데이터기반' : '로그기반'
        return (
          <>
            <Card
              size="small"
              style={{ marginTop: 16, borderColor: '#faad14', background: '#fffbe6' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Text style={{ color: '#614700' }}>
                  다른 방식으로 다시 전처리하려면 아래 버튼을 클릭하세요. 이전 전처리 결과는 스냅샷으로 자동 보존됩니다.
                </Text>
                <Space wrap>
                  <Button
                    onClick={() => setSnapshotModalOpen(true)}
                    style={{ borderColor: '#d9d9d9', color: '#595959' }}
                  >
                    이전 스냅샷 복원
                  </Button>
                  <Button
                    onClick={handleRestartWithOtherMethod}
                    style={{ borderColor: '#faad14', color: '#614700', background: '#fff7e6' }}
                  >
                    {otherMethodLabel}으로 전처리 재시작
                  </Button>
                </Space>
              </div>
            </Card>

            <Alert
              type="error"
              showIcon
              icon={<ExclamationCircleFilled style={{ color: '#ff4d4f' }} />}
              message={<strong>⚠️ 완료 처리 후에는 절대 되돌릴 수 없습니다</strong>}
              description="최종 완료 처리 시 모든 작업 이력이 확정되며, 어떠한 경우에도 이전 단계로 돌아갈 수 없습니다. 백업 폴더 경로, 사전 개수 등을 반드시 확인 후 완료 버튼을 누르세요."
              style={{ marginTop: 16, borderColor: '#ff4d4f' }}
              action={
                <Button
                  type="primary"
                  danger
                  icon={<CheckCircleOutlined />}
                  size="large"
                  loading={finalizing}
                  onClick={handleFinalize}
                  disabled={doBackup && !backupSuffix.trim()}
                >
                  모든 작업 완료
                </Button>
              }
            />
          </>
        )
      })()}

      {isFinished && (
        <>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              <Tag color="success" icon={<CheckCircleOutlined />}>이미 완료됨</Tag>
              <Text type="secondary">이 워크스페이스는 완료 처리되어 더 이상 수정할 수 없습니다.</Text>
              {latestBackup && <Tag color="blue">최근 백업: {latestBackup.name}</Tag>}
            </Space>
          </Card>

          {latestBackup && selectedWorkspace && (
            <>
              <ReportPanel
                workspace={selectedWorkspace}
                currentBackup={latestBackup.name}
                domain={selectedDomain || undefined}
                defaultPrevBackup={prevBackupName}
                mode="admin"
                hasReport={latestBackup.has_report}
              />

              <Card size="small" title="공유 및 배포" style={{ marginBottom: 16 }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space wrap>
                    <Button
                      icon={<FileTextOutlined />}
                      disabled={!shareUrl}
                      onClick={() => shareUrl && window.open(shareUrl, '_blank')}
                    >
                      완료리포트
                    </Button>
                    <Button
                      icon={<ShareAltOutlined />}
                      onClick={() => setShareModalOpen(true)}
                    >
                      {shareUrl ? '공유 링크 보기' : '공유 링크 생성'}
                    </Button>
                    <Button
                      icon={<FilePptOutlined />}
                      loading={pptDownloading}
                      onClick={handleDownloadPpt}
                    >
                      파워포인트
                    </Button>
                    <Button
                      icon={<MailOutlined />}
                      disabled={!shareUrl || !latestBackup?.has_report}
                      onClick={handleOpenEmailModal}
                    >
                      메일
                    </Button>
                    <Button onClick={handleDownloadDataTar}>data.tar 다운로드</Button>
                  </Space>
                  {shareUrl && (
                    <div>
                      <Text type="secondary">현재 공유 URL:</Text>
                      <Input.TextArea value={shareUrl} readOnly rows={2} style={{ marginTop: 4 }} />
                      <Space style={{ marginTop: 4 }}>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(shareUrl)}>
                          복사
                        </Button>
                        <Button size="small" onClick={() => window.open(shareUrl, '_blank')}>
                          새 탭에서 열기
                        </Button>
                      </Space>
                    </div>
                  )}
                </Space>
              </Card>
            </>
          )}

          <Modal
            title="공유 링크"
            open={shareModalOpen}
            onCancel={() => setShareModalOpen(false)}
            footer={[<Button key="close" onClick={() => setShareModalOpen(false)}>닫기</Button>]}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {shareUrl
                ? (
                  <>
                    <Text>공유 URL (TTL 30일)</Text>
                    <Input.TextArea value={shareUrl} readOnly rows={2} />
                    <Space>
                      <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(shareUrl)}>복사</Button>
                      <Button onClick={() => window.open(shareUrl, '_blank')}>새 탭에서 열기</Button>
                      <Button type="primary" loading={shareGenerating} onClick={handleGenerateShare}>새 링크 발급</Button>
                    </Space>
                  </>
                )
                : (
                  <>
                    <Text type="secondary">아직 발급된 공유 링크가 없습니다.</Text>
                    <Button
                      type="primary"
                      icon={<ShareAltOutlined />}
                      loading={shareGenerating}
                      onClick={handleGenerateShare}
                    >
                      공유 링크 생성
                    </Button>
                  </>
                )}
            </Space>
          </Modal>

          <Modal
            title="메일 발송"
            open={emailModalOpen}
            onCancel={() => setEmailModalOpen(false)}
            onOk={handleSendEmail}
            okText="발송"
            confirmLoading={emailSending}
          >
            <Form form={emailForm} layout="vertical">
              <Form.Item
                name="to"
                label="수신자"
                rules={[{ required: true, message: '수신자를 선택하세요' }]}
              >
                <Select
                  placeholder="수신자 선택"
                  showSearch
                  optionFilterProp="label"
                  options={emailContacts.map(c => ({
                    value: c.email,
                    label: `${c.name} <${c.email}>`,
                  }))}
                  notFoundContent={emailContacts.length === 0 ? '등록된 연락처가 없습니다' : '없음'}
                />
              </Form.Item>
              <Text type="secondary">
                첨부: PPT 리포트 + data.tar. 공유 URL이 자동으로 본문에 포함됩니다.
              </Text>
            </Form>
          </Modal>
        </>
      )}

      {isFinished && stepReport && Object.keys(stepReport.phases).length > 0 && (
        <Card title="📊 단계별 작업 시간" style={{ marginTop: 16 }}>
          <Table
            size="small"
            dataSource={Object.entries(stepReport.phases).map(([phase, stats]) => ({
              phase, ...stats
            }))}
            columns={[
              { title: '단계', dataIndex: 'phase', key: 'phase' },
              { title: '최초 진입', dataIndex: 'first_enter', key: 'first_enter', render: (v: string | null) => v || '-' },
              { title: '마지막 이탈', dataIndex: 'last_leave', key: 'last_leave', render: (v: string | null) => v || '-' },
              {
                title: '총 소요시간', dataIndex: 'total_seconds', key: 'total_seconds',
                render: (s: number) => s > 0 ? `${Math.floor(s / 60)}분 ${s % 60}초` : '-',
              },
              { title: '방문 횟수', dataIndex: 'visit_count', key: 'visit_count' },
            ]}
            rowKey="phase"
            pagination={false}
          />
          {stepReport.logs.length > 0 && (
            <Collapse style={{ marginTop: 8 }}>
              <Collapse.Panel header="전환 히스토리 상세" key="1">
                <Table
                  size="small"
                  dataSource={stepReport.logs}
                  columns={[
                    { title: '시각', dataIndex: 'created_at', key: 'created_at', width: 160 },
                    { title: '단계', dataIndex: 'phase', key: 'phase', width: 100 },
                    { title: '액션', dataIndex: 'action', key: 'action', width: 80 },
                    { title: '사용자', dataIndex: 'user_id', key: 'user_id' },
                  ]}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                />
              </Collapse.Panel>
            </Collapse>
          )}
        </Card>
      )}

      {isFinished && participantStats && participantStats.length > 0 && (
        <Card title="👥 참여자 세션 통계" style={{ marginTop: 16 }}>
          <Table
            size="small"
            dataSource={participantStats}
            columns={[
              { title: '작업자', dataIndex: 'user_id', key: 'user_id' },
              { title: '첫 로그인', dataIndex: 'first_login', key: 'first_login', render: (v: string | null) => v || '-' },
              { title: '마지막 활동', dataIndex: 'last_activity', key: 'last_activity', render: (v: string | null) => v || '-' },
              {
                title: '총 체류시간', dataIndex: 'total_minutes', key: 'total_minutes',
                render: (m: number) => m > 0 ? `${m}분` : '-',
              },
              {
                title: '키워드건수', dataIndex: 'kw_count', key: 'kw_count', align: 'right' as const,
                render: (v: number) => v > 0 ? v.toLocaleString() : '-',
              },
              {
                title: '키워드건/h', dataIndex: 'kw_per_hour', key: 'kw_per_hour', align: 'right' as const,
                render: (v: number) => v > 0 ? `${v.toFixed(1)}/h` : '-',
              },
              {
                title: '사전등록건수', dataIndex: 'dict_count', key: 'dict_count', align: 'right' as const,
                render: (v: number) => v > 0 ? v.toLocaleString() : '-',
              },
              {
                title: '사전건/h', dataIndex: 'dict_per_hour', key: 'dict_per_hour', align: 'right' as const,
                render: (v: number) => v > 0 ? `${v.toFixed(1)}/h` : '-',
              },
            ]}
            rowKey="user_id"
            pagination={false}
          />
        </Card>
      )}

      </div>
    </div>
  )
}
