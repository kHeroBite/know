import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Card, Alert, Typography, Space, Row, Col, Statistic, Table, Tag,
  Checkbox, Input, Select, Button, Modal, message, Descriptions, Spin, Form,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, TeamOutlined, DatabaseOutlined,
  ShareAltOutlined, MailOutlined, CopyOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { workspaceAPI } from '../api/workspace'
import { formatWorkspace } from '../utils/displayFormat'
import { listSites, type Site } from '../api/site'
import { backupAPI, type Backup } from '../api/backup'
import { shareAPI } from '../api/share'
import ReportPanel from '../components/ReportPanel'

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

function defaultBackupFolder(domain: string, siteName: string | null): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const site = siteName ? siteName.replace(/\s+/g, '_') : 'site'
  return `${domain}_${site}_${ts}`
}

export default function WorkComplete() {
  const navigate = useNavigate()
  const { selectedWorkspace, selectedDomain, selectedDomainLabel, phase } = useWorkspaceStore()

  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState<number | null>(null)
  const [doBackup, setDoBackup] = useState(true)
  const [backupFolder, setBackupFolder] = useState('')
  const [folderTouched, setFolderTouched] = useState(false)
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

  const loadAll = useCallback(async () => {
    if (!selectedWorkspace) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [snapRes, partRes, siteList] = await Promise.all([
        workspaceAPI.getWorkspaceSnapshots(selectedWorkspace).catch(() => ({ data: null as any })),
        workspaceAPI.getParticipantsStats(selectedWorkspace).catch(() => ({ data: { participants: [] } })),
        listSites().catch(() => [] as Site[]),
      ])
      if (snapRes.data) setSnapshot(snapRes.data)
      setParticipants(partRes.data?.participants || [])
      setSites(siteList)

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

  useEffect(() => {
    if (!folderTouched && selectedDomain) {
      const siteName = siteId ? sites.find(s => s.id === siteId)?.name || null : null
      setBackupFolder(defaultBackupFolder(selectedDomain, siteName))
    }
  }, [siteId, sites, selectedDomain, folderTouched])

  const isFinished = phase === 'finished'
  const isComplete = phase === 'complete'

  const handleFinalize = () => {
    if (!selectedWorkspace) return
    Modal.confirm({
      title: '정말 완료 처리하시겠습니까?',
      content: (
        <div>
          <p>이 작업은 되돌릴 수 없습니다.</p>
          {doBackup
            ? <p>백업 폴더: <code>{backupFolder}</code></p>
            : <p>⚠️ 백업 없이 바로 적용됩니다.</p>}
          {siteId && <p>사이트: {sites.find(s => s.id === siteId)?.name}</p>}
        </div>
      ),
      okText: '완료 처리',
      cancelText: '취소',
      okButtonProps: { danger: !doBackup },
      onOk: async () => {
        setFinalizing(true)
        try {
          await useWorkspaceStore.getState().finalizeComplete(selectedWorkspace, {
            backup_folder: doBackup ? backupFolder : undefined,
            skip_backup: !doBackup,
            site_id: siteId,
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
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <CheckCircleOutlined style={{ marginRight: 8 }} />
        작업 완료 대시보드 — {formatWorkspace(selectedWorkspace, selectedDomain, selectedDomainLabel)}
      </Title>

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
          action={<Button size="small" onClick={goBackToVerify}>이전단계로</Button>}
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
        <Card size="small" title="최종 완료 처리">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Checkbox checked={doBackup} onChange={e => setDoBackup(e.target.checked)}>
                백업 생성 (권장)
              </Checkbox>
            </div>
            <Row gutter={16}>
              <Col xs={24} md={14}>
                <Text type="secondary" style={{ fontSize: 12 }}>백업 폴더명</Text>
                <Input
                  value={backupFolder}
                  disabled={!doBackup}
                  onChange={e => { setBackupFolder(e.target.value); setFolderTouched(true) }}
                  placeholder={`${selectedDomain}_site_YYYYMMDD_HHMMSS`}
                />
              </Col>
              <Col xs={24} md={10}>
                <Text type="secondary" style={{ fontSize: 12 }}>사이트 선택 (선택사항)</Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder="사이트를 선택하세요"
                  allowClear
                  value={siteId ?? undefined}
                  onChange={v => setSiteId(v ?? null)}
                  options={sites.map(s => ({ value: s.id, label: `${s.name} (${s.domain_code})` }))}
                />
              </Col>
            </Row>
            <div style={{ textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                size="large"
                loading={finalizing}
                onClick={handleFinalize}
                disabled={doBackup && !backupFolder.trim()}
              >
                완료 처리
              </Button>
            </div>
          </Space>
        </Card>
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
    </div>
  )
}
