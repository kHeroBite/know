import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Card, Alert, Typography, Space, Row, Col, Statistic, Table, Tag,
  Checkbox, Input, Button, Modal, message, Descriptions, Spin, Form, Collapse,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, TeamOutlined, DatabaseOutlined,
  ShareAltOutlined, MailOutlined, CopyOutlined, ExclamationCircleFilled,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { workspaceAPI, type StepReportResponse, type ParticipantStat } from '../api/workspace'
import { formatWorkspace } from '../utils/displayFormat'

import { backupAPI, type Backup } from '../api/backup'
import { shareAPI } from '../api/share'
import ReportPanel from '../components/ReportPanel'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography

interface Snapshot {
  workspace: string
  domain: string | null
  before: Record<string, number> | null
  after: Record<string, number> | null
  prepared_at: string | null
  finished_at: string | null
  created_at: string | null
}

interface Participant {
  user_id: string
  name: string
  r_count: number
  w_count: number
}

const DICT_KEYS: { key: string; label: string }[] = [
  { key: 'UDIC', label: 'UDIC (사용자사전)' },
  { key: 'CNDIC', label: 'CNDIC (복합명사)' },
  { key: 'THESAURUS', label: 'THESAURUS (동의어)' },
  { key: 'CATEGORY', label: 'CATEGORY (카테고리)' },
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
  const [doBackup, setDoBackup] = useState(true)
  const [backupSuffix, setBackupSuffix] = useState('')
  const [finalizing, setFinalizing] = useState(false)

  // finished 뷰 전용
  const [latestBackup, setLatestBackup] = useState<Backup | null>(null)
  const [prevBackupName, setPrevBackupName] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareGenerating, setShareGenerating] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailForm] = Form.useForm<{ to: string }>()
  const [emailSending, setEmailSending] = useState(false)

  // 단계별 리포트 (isFinished 후 조회)
  const [stepReport, setStepReport] = useState<StepReportResponse | null>(null)
  const [participantStats, setParticipantStats] = useState<ParticipantStat[] | null>(null)

  const loadAll = useCallback(async () => {
    if (!selectedWorkspace) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [snapRes, partRes, wsList] = await Promise.all([
        workspaceAPI.getWorkspaceSnapshots(selectedWorkspace).catch(() => ({ data: null as any })),
        workspaceAPI.getParticipantsStats(selectedWorkspace).catch(() => ({ data: { participants: [] } })),
        workspaceAPI.워크스페이스목록().catch(() => ({ data: [] as any[] })),
      ])
      if (snapRes.data) setSnapshot(snapRes.data)
      setParticipants(partRes.data?.participants || [])
      // 현재 워크스페이스의 site_code 추출
      const wsInfo = (wsList.data || []).find((w: any) => w.name === selectedWorkspace)
      setSiteCode(wsInfo?.site_code || null)

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
    const fixedPrefix = `${selectedDomain}_${siteCode ? siteCode.toUpperCase() : selectedDomain}_`
    const fullBackupFolder = fixedPrefix + backupSuffix
    Modal.confirm({
      title: '정말 완료 처리하시겠습니까?',
      content: (
        <div>
          <p>이 작업은 되돌릴 수 없습니다.</p>
          {doBackup
            ? <p>백업 폴더: <code>{fullBackupFolder}</code></p>
            : <p>⚠️ 백업 없이 바로 적용됩니다.</p>}
          {siteCode && <p>사이트: {siteCode.toUpperCase()}</p>}
        </div>
      ),
      okText: '모든 작업 완료',
      cancelText: '취소',
      okButtonProps: { danger: !doBackup },
      onOk: async () => {
        setFinalizing(true)
        try {
          await useWorkspaceStore.getState().finalizeComplete(selectedWorkspace, {
            backup_folder: doBackup ? fullBackupFolder : undefined,
            skip_backup: !doBackup,
            site_id: null,
          })
          message.success('워크스페이스가 완료 처리되었습니다.')
          await loadAll()
        } catch (e: any) {
          message.error('완료 처리 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        } finally {
          setFinalizing(false)
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

  const goBackToVerify = async () => {
    if (!selectedWorkspace) return
    try {
      await useWorkspaceStore.getState().revertPhase('verify')
      navigate('/dict-verify')
    } catch (e: any) {
      message.error('되돌리기 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  const dictRows = useMemo(() => {
    const before = snapshot?.before || {}
    const after = snapshot?.after || {}
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
        title={`작업 완료 대시보드 — ${formatWorkspace(selectedWorkspace, selectedDomain, selectedDomainLabel)}`}
        showPrev={isComplete}
        prevLabel="이전단계로"
        onPrev={goBackToVerify}
      />
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
        <Col xs={24} lg={14}>
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

        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={<><ClockCircleOutlined /> 시간</>}
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="접속/시작">{formatDateTime(snapshot?.created_at)}</Descriptions.Item>
              <Descriptions.Item label="완료 준비(prepared)">{formatDateTime(snapshot?.prepared_at)}</Descriptions.Item>
              <Descriptions.Item label="완료(finished)">{formatDateTime(snapshot?.finished_at)}</Descriptions.Item>
              <Descriptions.Item label="경과 시간">
                {formatDuration(snapshot?.created_at, snapshot?.finished_at)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

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

      {isComplete && (
        <>
          <Card size="small" title="최종 완료 처리">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Checkbox checked={doBackup} onChange={e => setDoBackup(e.target.checked)}>
                  백업 생성 (권장)
                </Checkbox>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>백업 폴더명</Text>
                <div style={{ marginTop: 4, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4, fontFamily: 'monospace', fontSize: 14 }}>
                  <Text strong>{selectedDomain}_{siteCode ? siteCode.toUpperCase() : selectedDomain}_</Text>
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
      )}

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
                      icon={<ShareAltOutlined />}
                      onClick={() => setShareModalOpen(true)}
                    >
                      {shareUrl ? '공유 링크 보기' : '공유 링크 생성'}
                    </Button>
                    <Button
                      icon={<MailOutlined />}
                      onClick={() => { emailForm.resetFields(); setEmailModalOpen(true) }}
                    >
                      메일 발송
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
            title="메일 전송"
            open={emailModalOpen}
            onCancel={() => setEmailModalOpen(false)}
            onOk={handleSendEmail}
            okText="전송"
            confirmLoading={emailSending}
          >
            <Form form={emailForm} layout="vertical">
              <Form.Item
                name="to"
                label="받는 사람 (이메일)"
                rules={[
                  { required: true, message: '이메일 주소를 입력하세요' },
                  { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
                ]}
              >
                <Input placeholder="example@domain.com" />
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
                title: '건/h', dataIndex: 'items_per_hour', key: 'items_per_hour',
                render: (v: number) => v > 0 ? `${v.toFixed(1)}건/h` : '-',
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
