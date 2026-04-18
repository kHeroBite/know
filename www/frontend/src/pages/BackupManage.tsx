import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Space, Input, Select, Row, Col,
  Form, message, Modal, Tag, Typography, Popconfirm, Divider, Spin, Statistic, Tabs,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ShareAltOutlined,
  FilePptOutlined, MailOutlined, CheckCircleOutlined, DeleteFilled,
  ExperimentOutlined, SearchOutlined,
} from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import {
  backupAPI, getEmailContacts, createEmailContact, deleteEmailContact,
  type Backup,
} from '../api/backup'
import { shareAPI } from '../api/share'
import { reportAPI } from '../api/reports'
import { workspaceAPI } from '../api/workspace'
import { listSites } from '../api/site'
import 클라이언트 from '../api/client'

const { Text } = Typography

interface EmailContact {
  id: number
  name: string
  email: string
  created_at: string
}

interface Domain {
  id: string
  name: string | null
}

export default function BackupManage() {
  // ─── 메일 연락처 ───────────────────────────────────────────────
  const [contacts, setContacts] = useState<EmailContact[]>([])
  const [contactLoading, setContactLoading] = useState(false)
  const [contactForm] = Form.useForm<{ name: string; email: string }>()
  const [contactAdding, setContactAdding] = useState(false)

  // ─── 필터 ──────────────────────────────────────────────────────
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState<string>('all')
  const [sites, setSites] = useState<{ id: number; site_code: string; name: string; domain_code: string }[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('all')

  // ─── 인라인 패널 (형태소분석 / 사전확인 공통) ─────────────────
  const [activePanel, setActivePanel] = useState<{ backup: Backup; mode: 'morpheme' | 'dict' } | null>(null)

  // 형태소분석 상태
  const [형태소입력, set형태소입력] = useState('')
  const [형태소준비중, set형태소준비중] = useState(false)
  const [형태소세션, set형태소세션] = useState<string | null>(null)
  const [형태소로딩Lite, set형태소로딩Lite] = useState(false)
  const [형태소로딩Full, set형태소로딩Full] = useState(false)
  const [형태소로딩유사어, set형태소로딩유사어] = useState(false)
  const [형태소결과Lite, set형태소결과Lite] = useState<{keyword: string; result: string; tokens: string[]} | null>(null)
  const [형태소결과Full, set형태소결과Full] = useState<{keyword: string; result: string; tokens: string[]} | null>(null)
  const [형태소결과유사어, set형태소결과유사어] = useState<{head_word: string; tail_word: string}[] | null>(null)

  // 사전확인 상태
  const [사전탭, set사전탭] = useState<'udic' | 'cndic' | 'thesaurus'>('udic')
  const [사전검색어, set사전검색어] = useState('')
  const [사전데이터, set사전데이터] = useState<any[]>([])
  const [사전총건수, set사전총건수] = useState(0)
  const [사전페이지, set사전페이지] = useState(1)
  const [사전로딩, set사전로딩] = useState(false)

  // ─── 백업 목록 ─────────────────────────────────────────────────
  const [backups, setBackups] = useState<Backup[]>([])
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [backupLoading, setBackupLoading] = useState(false)

  // ─── 공유 모달 ─────────────────────────────────────────────────
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<Backup | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareGenerating, setShareGenerating] = useState(false)

  // ─── 메일 모달 ─────────────────────────────────────────────────
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTarget, setEmailTarget] = useState<Backup | null>(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSelectId, setEmailSelectId] = useState<number | undefined>(undefined)

  // ─── 초기 로드 ─────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    setContactLoading(true)
    try {
      const res = await getEmailContacts()
      setContacts(res.data || [])
    } catch (e: any) {
      message.error('연락처 로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setContactLoading(false)
    }
  }, [])

  const loadDomains = useCallback(async () => {
    try {
      const res = await workspaceAPI.도메인목록()
      setDomains(res.data || [])
    } catch {}
  }, [])

  const loadSites = useCallback(async () => {
    try {
      const data = await listSites()
      setSites(data)
    } catch {}
  }, [])

  useEffect(() => {
    loadContacts()
    loadDomains()
    loadSites()
  }, [loadContacts, loadDomains, loadSites])

  // ─── 백업 목록 조회 ────────────────────────────────────────────
  const loadBackups = useCallback(async () => {
    if (selectedDomain === 'all') {
      // 전체: 도메인 목록에서 각각 조회 후 합산
      if (domains.length === 0) {
        setBackups([])
        return
      }
      setBackupLoading(true)
      try {
        const results = await Promise.allSettled(
          domains.map(d => backupAPI.listBackups(d.id))
        )
        const all: Backup[] = []
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            all.push(...(r.value.data?.backups || []))
          }
        })
        setBackups(all)
      } catch {
        message.error('백업 목록 조회 실패')
      } finally {
        setBackupLoading(false)
      }
    } else {
      setBackupLoading(true)
      try {
        const res = await backupAPI.listBackups(selectedDomain)
        setBackups(res.data?.backups || [])
      } catch (e: any) {
        message.error('백업 목록 조회 실패: ' + (e?.response?.data?.detail || e?.message || ''))
      } finally {
        setBackupLoading(false)
      }
    }
  }, [selectedDomain, domains])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  // ─── 패널 열기 / 닫기 ─────────────────────────────────────
  const openPanel = async (backup: Backup, mode: 'morpheme' | 'dict') => {
    const prev = activePanel
    // 이전 형태소 세션 cleanup
    if (prev?.mode === 'morpheme' && 형태소세션) {
      클라이언트.delete(`/morpheme/release-backup/${형태소세션}`).catch(() => {})
      set형태소세션(null)
    }
    // 같은 백업 + 같은 mode 다시 클릭 → 토글 off
    if (prev && prev.backup.name === backup.name && prev.mode === mode) {
      setActivePanel(null)
      set형태소입력('')
      set형태소결과Lite(null)
      set형태소결과Full(null)
      set형태소결과유사어(null)
      return
    }
    setActivePanel({ backup, mode })
    set형태소입력('')
    set형태소결과Lite(null)
    set형태소결과Full(null)
    set형태소결과유사어(null)

    if (mode === 'morpheme') {
      const domainCode = getDomainCodeFromBackup(backup)
      if (!domainCode) { message.warning('해당 백업의 도메인을 찾을 수 없습니다'); setActivePanel(null); return }
      set형태소준비중(true)
      try {
        const res = await 클라이언트.post('/morpheme/prepare-backup', { backup_name: backup.name, domain: domainCode })
        set형태소세션(res.data.session_id)
      } catch (e: any) {
        message.error('준비 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        setActivePanel(null)
      } finally {
        set형태소준비중(false)
      }
    } else {
      // dict 모드
      set사전탭('udic')
      set사전검색어('')
      set사전데이터([])
      set사전총건수(0)
      set사전페이지(1)
      load사전데이터(backup, 'udic', '', 1)
    }
  }

  const closePanel = () => {
    if (형태소세션) {
      클라이언트.delete(`/morpheme/release-backup/${형태소세션}`).catch(() => {})
      set형태소세션(null)
    }
    setActivePanel(null)
  }

  // ─── 형태소분석 실행 ───────────────────────────────────────
  const 형태소분析실행 = async () => {
    const kw = 형태소입력.trim()
    if (!kw || !activePanel) return
    const domainCode = getDomainCodeFromBackup(activePanel.backup)
    if (!domainCode) return
    set형태소결과Lite(null)
    set형태소결과Full(null)
    set형태소결과유사어(null)
    set형태소로딩Lite(true)
    set형태소로딩Full(true)
    set형태소로딩유사어(true)
    const payload = 형태소세션
      ? { keyword: kw, domain: domainCode, session_id: 형태소세션 }
      : { keyword: kw, domain: domainCode, backup_name: activePanel.backup.name }
    const litePromise = 클라이언트.post('/morpheme/analyze', payload)
      .then(r => set형태소결과Lite(r.data))
      .catch(() => set형태소결과Lite({ keyword: kw, result: '분석 실패', tokens: [] }))
      .finally(() => set형태소로딩Lite(false))
    const fullPromise = 클라이언트.post('/morpheme/analyze-full', payload)
      .then(r => set형태소결과Full(r.data))
      .catch(() => set형태소결과Full({ keyword: kw, result: '분석 실패', tokens: [] }))
      .finally(() => set형태소로딩Full(false))
    const synPromise = 클라이언트.get(`/dictionaries/${domainCode}/thesaurus/list`, { params: { search: kw, size: 30 } })
      .then(r => set형태소결과유사어(r.data?.items || []))
      .catch(() => set형태소결과유사어([]))
      .finally(() => set형태소로딩유사어(false))
    await Promise.all([litePromise, fullPromise, synPromise])
  }

  // ─── 사이트 필터 적용 백업 목록 ────────────────────────────────
  const filteredBackups = backups.filter(b => {
    if (selectedSite === 'all') return true
    // site_code 기반 필터: 백업명 또는 workspace_name에서 매칭
    const matchedSite = sites.find(s => s.site_code === selectedSite)
    if (!matchedSite) return true
    return b.workspace_name?.toLowerCase().includes(matchedSite.domain_code.toLowerCase()) ||
      b.name?.toLowerCase().includes(matchedSite.site_code.toLowerCase())
  })

  // 도메인 선택 변경 시 사이트 필터 초기화
  const handleDomainChange = (val: string) => {
    setSelectedDomain(val)
    setSelectedSite('all')
  }

  // 도메인에 맞는 사이트 옵션
  const filteredSites = selectedDomain === 'all'
    ? sites
    : sites.filter(s => s.domain_code.toLowerCase() === selectedDomain.toLowerCase())

  // ─── 연락처 추가 ───────────────────────────────────────────────
  const handleAddContact = async () => {
    try {
      const values = await contactForm.validateFields()
      setContactAdding(true)
      await createEmailContact(values)
      message.success('연락처 추가 완료')
      contactForm.resetFields()
      await loadContacts()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('연락처 추가 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setContactAdding(false)
    }
  }

  // ─── 연락처 삭제 ───────────────────────────────────────────────
  const handleDeleteContact = async (id: number) => {
    try {
      await deleteEmailContact(id)
      message.success('연락처 삭제 완료')
      await loadContacts()
    } catch (e: any) {
      message.error('연락처 삭제 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  // ─── 백업 삭제 ────────────────────────────────────────────────
  const handleDeleteBackup = async (record: Backup) => {
    // domain 추출: workspace_name 또는 name에서 도메인 ID 매칭
    const matched = domains.find(d =>
      record.workspace_name?.toLowerCase().includes(d.id.toLowerCase()) ||
      record.name?.toLowerCase().includes(d.id.toLowerCase())
    )
    const domainId = matched?.id || ''
    try {
      await backupAPI.deleteBackup(record.name, domainId)
      message.success(`백업 삭제 완료: ${record.name}`)
      await loadBackups()
    } catch (e: any) {
      message.error('백업 삭제 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  // ─── PPT 다운로드 ──────────────────────────────────────────────
  const handleDownloadPpt = async (record: Backup) => {
    if (!record.workspace_name) {
      message.error('워크스페이스 정보가 없습니다')
      return
    }
    try {
      const res = await reportAPI.downloadPptFile(record.workspace_name, record.name)
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${record.name}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      message.error('PPT 다운로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  // ─── 공유 모달 ─────────────────────────────────────────────────
  const openShareModal = (record: Backup) => {
    setShareTarget(record)
    setShareUrl(record.share_url || null)
    setShareModalOpen(true)
  }

  const handleGenerateShare = async () => {
    if (!shareTarget?.workspace_name) return
    setShareGenerating(true)
    try {
      const res = await shareAPI.generateShare(shareTarget.workspace_name, shareTarget.name, 30)
      setShareUrl(res.data.url)
      message.success('공유 링크 발급 완료')
      await loadBackups()
    } catch (e: any) {
      message.error('공유 링크 발급 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setShareGenerating(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('클립보드에 복사됨')
    } catch {
      message.warning('복사 실패 — 수동으로 복사해주세요')
    }
  }

  // ─── 메일 모달 ─────────────────────────────────────────────────
  const openEmailModal = (record: Backup) => {
    setEmailTarget(record)
    setEmailSelectId(undefined)
    setEmailModalOpen(true)
  }

  const handleSendEmail = async () => {
    if (!emailTarget?.workspace_name) return
    const contact = contacts.find(c => c.id === emailSelectId)
    if (!contact) {
      message.error('수신자를 선택해주세요')
      return
    }
    setEmailSending(true)
    try {
      await backupAPI.sendBackupEmail(emailTarget.name, {
        to: contact.email,
        workspace: emailTarget.workspace_name,
      })
      message.success(`메일 전송 완료 (${contact.email})`)
      setEmailModalOpen(false)
    } catch (e: any) {
      message.error('메일 전송 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setEmailSending(false)
    }
  }

  // ─── 컬럼 정의 ─────────────────────────────────────────────────
  const contactColumns = [
    { title: '이름', dataIndex: 'name', key: 'name', width: 140 },
    { title: '이메일', dataIndex: 'email', key: 'email' },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, r: EmailContact) => (
        <Popconfirm
          title="삭제하시겠습니까?"
          onConfirm={() => handleDeleteContact(r.id)}
          okText="삭제"
          cancelText="취소"
          okButtonProps={{ danger: true }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  // ─── 백업 목록에 사이트/도메인 표시용 헬퍼 ────────────────────
  const getSiteLabel = (b: Backup) => {
    const matched = sites.find(s =>
      b.workspace_name?.toLowerCase().includes(s.site_code.toLowerCase()) ||
      b.name?.toLowerCase().includes(s.site_code.toLowerCase())
    )
    return matched ? `${matched.name}(${matched.site_code})` : '-'
  }

  const getDomainLabel = (b: Backup) => {
    const matched = domains.find(d =>
      b.workspace_name?.toLowerCase().includes(d.id.toLowerCase()) ||
      b.name?.toLowerCase().includes(d.id.toLowerCase())
    )
    return matched ? `${matched.name || matched.id}(${matched.id})` : '-'
  }

  const formatDate = (v: string) => {
    if (!v) return '-'
    // ISO 또는 "YYYY-MM-DD HH:MM:SS" → 날짜만
    return v.split('T')[0].split(' ')[0]
  }

  const backupColumns = [
    {
      title: '사이트', key: 'site', width: 130, ellipsis: true,
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{getSiteLabel(r)}</Text>,
    },
    {
      title: '도메인', key: 'domain', width: 130, ellipsis: true,
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{getDomainLabel(r)}</Text>,
    },
    {
      title: 'WS', dataIndex: 'workspace_name', key: 'workspace_name', width: 100, ellipsis: true,
      render: (v: string | null) => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '백업명', dataIndex: 'name', key: 'name', ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '생성일', dataIndex: 'timestamp', key: 'timestamp', width: 100,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{formatDate(v)}</Text>,
    },
    {
      title: '사용자사전', key: 'udic', width: 100, align: 'right' as const,
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{r.dict_counts?.udic ?? '-'}</Text>,
    },
    {
      title: '복합명사사전', key: 'cndic', width: 110, align: 'right' as const,
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{r.dict_counts?.cndic ?? '-'}</Text>,
    },
    {
      title: '유사어사전', key: 'thesaurus', width: 100, align: 'right' as const,
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{r.dict_counts?.thesaurus ?? '-'}</Text>,
    },
    {
      title: '용량',
      dataIndex: 'size_mb',
      key: 'size_mb',
      width: 80,
      align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{v != null ? `${v.toFixed(1)}MB` : '-'}</Text>,
    },
    {
      title: 'jiana',
      dataIndex: 'jiana_version',
      key: 'jiana_version',
      width: 80,
      render: (v: string | null | undefined) => v
        ? <Tag style={{ fontSize: 11 }}>{v}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
    },
  ]

  // 백업 row의 도메인 코드 추출 (workspace_name 또는 name에서)
  const getDomainCodeFromBackup = (b: Backup): string | null => {
    const matched = domains.find(d =>
      b.workspace_name?.toLowerCase().includes(d.id.toLowerCase()) ||
      b.name?.toLowerCase().includes(d.id.toLowerCase())
    )
    return matched ? matched.id : null
  }

  // ─── 사전확인 ─────────────────────────────────────────────────
  const load사전데이터 = async (backup: Backup, tab: 'udic' | 'cndic' | 'thesaurus', search: string, page: number) => {
    set사전로딩(true)
    try {
      const res = await 클라이언트.get(`/api/backups/${backup.name}/dict/${tab}`, {
        params: { search: search || undefined, page, size: 50 },
      })
      set사전데이터(res.data?.items || [])
      set사전총건수(res.data?.total || 0)
      set사전페이지(page)
    } catch (e: any) {
      message.error('사전 로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      set사전로딩(false)
    }
  }


  const renderActionRow = (r: Backup) => {
    const hasShareUrl = !!r.share_url
    const hasReport = !!r.has_report
    const canEmail = hasShareUrl && hasReport
    const hasDomain = !!getDomainCodeFromBackup(r)

    return (
      <div style={{ padding: '4px 0' }}>
        <Space size={4}>
          <Button
            size="small"
            type={activePanel?.backup.name === r.name && activePanel?.mode === 'morpheme' ? 'primary' : 'default'}
            disabled={!hasDomain}
            onClick={() => openPanel(r, 'morpheme')}
            title={hasDomain ? '형태소분석' : '도메인 정보 없음'}
          >
            형태소분석
          </Button>
          <Button
            size="small"
            type={activePanel?.backup.name === r.name && activePanel?.mode === 'dict' ? 'primary' : 'default'}
            icon={<SearchOutlined />}
            onClick={() => openPanel(r, 'dict')}
          >
            사전확인
          </Button>
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            disabled={!hasShareUrl}
            onClick={() => { if (r.share_url) window.open(r.share_url, '_blank') }}
            title={hasShareUrl ? '완료 리포트 열기' : '공유 링크 없음'}
          >
            완료리포트
          </Button>
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            disabled={!r.workspace_name}
            onClick={() => openShareModal(r)}
          >
            공유
          </Button>
          <Button
            size="small"
            icon={<FilePptOutlined />}
            disabled={!r.workspace_name}
            onClick={() => handleDownloadPpt(r)}
          >
            PPT
          </Button>
          <Button
            size="small"
            icon={<MailOutlined />}
            disabled={!canEmail}
            onClick={() => openEmailModal(r)}
            title={canEmail ? '메일 발송' : '공유 링크와 리포트가 모두 필요합니다'}
          >
            메일
          </Button>
          <Popconfirm
            title="백업 삭제"
            description={`"${r.name}" 백업을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
            onConfirm={() => handleDeleteBackup(r)}
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteFilled />}
            >
              삭제
            </Button>
          </Popconfirm>
        </Space>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="백업 관리" />
      <div style={{ padding: '0 24px 24px' }}>

        {/* ── 메일 관리 카드 ── */}
        <Card
          size="small"
          title="메일 관리"
          style={{ marginBottom: 16 }}
        >
          <Form form={contactForm} layout="inline" style={{ marginBottom: 12 }}>
            <Row gutter={8} style={{ width: '100%' }}>
              <Col flex="200px">
                <Form.Item
                  name="name"
                  rules={[{ required: true, message: '이름 필수' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="이름" />
                </Form.Item>
              </Col>
              <Col flex="260px">
                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: '이메일 필수' },
                    { type: 'email', message: '이메일 형식 확인' },
                  ]}
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="이메일" />
                </Form.Item>
              </Col>
              <Col>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  loading={contactAdding}
                  onClick={handleAddContact}
                >
                  추가
                </Button>
              </Col>
            </Row>
          </Form>
          <Table
            size="small"
            columns={contactColumns}
            dataSource={contacts}
            rowKey="id"
            loading={contactLoading}
            pagination={false}
            locale={{ emptyText: '등록된 연락처 없음' }}
          />
        </Card>

        {/* ── 필터 영역 ── */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <Select
              value={selectedDomain}
              onChange={handleDomainChange}
              style={{ width: 200 }}
              placeholder="도메인 선택"
            >
              <Select.Option value="all">전체 도메인</Select.Option>
              {domains.map(d => (
                <Select.Option key={d.id} value={d.id}>
                  {d.name || d.id}
                </Select.Option>
              ))}
            </Select>
            <Select
              value={selectedSite}
              onChange={setSelectedSite}
              style={{ width: 200 }}
              placeholder="사이트 선택"
            >
              <Select.Option value="all">전체 사이트</Select.Option>
              {filteredSites.map(s => (
                <Select.Option key={s.site_code} value={s.site_code}>
                  {s.name} ({s.site_code})
                </Select.Option>
              ))}
            </Select>
          </Space>
        </Card>

        {/* ── 용량 대시보드 ── */}
        {backups.length > 0 && (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col>
                <Statistic
                  title="전체 백업 용량"
                  value={backups.reduce((sum, b) => sum + (b.size_mb || 0), 0).toFixed(1)}
                  suffix="MB"
                />
              </Col>
              {domains.map(d => {
                const domainBackups = backups.filter(b =>
                  b.workspace_name?.toLowerCase().includes(d.id.toLowerCase()) ||
                  b.name?.toLowerCase().includes(d.id.toLowerCase())
                )
                const total = domainBackups.reduce((sum, b) => sum + (b.size_mb || 0), 0)
                if (domainBackups.length === 0) return null
                return (
                  <Col key={d.id}>
                    <Statistic
                      title={`${d.name || d.id} (${d.id})`}
                      value={total.toFixed(1)}
                      suffix="MB"
                    />
                  </Col>
                )
              })}
            </Row>
          </Card>
        )}

        {/* ── 백업 목록 테이블 ── */}
        <Card size="small" title="백업 목록">
          <Table
            size="small"
            columns={backupColumns}
            dataSource={filteredBackups}
            rowKey="name"
            loading={backupLoading}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: '백업 없음' }}
            expandable={{
              expandedRowRender: renderActionRow,
              expandedRowKeys,
              onExpand: (expanded, record) => {
                setExpandedRowKeys(expanded ? [record.name] : [])
              },
              expandRowByClick: true,
              rowExpandable: () => true,
            }}
          />
        </Card>

        {/* ── 형태소분析 Modal ── */}
        <Modal
          title={
            <Space>
              <ExperimentOutlined />
              <span>{activePanel?.backup.name}</span>
              <Tag color="orange" style={{ fontSize: 11 }}>형태소분析</Tag>
            </Space>
          }
          open={!!activePanel && activePanel.mode === 'morpheme'}
          onCancel={closePanel}
          footer={<Button onClick={closePanel}>닫기</Button>}
          width={1100}
          destroyOnClose
        >
          {형태소준비중 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: '#888' }}>jiana 사전 준비 중...</div>
            </div>
          ) : (
            <>
              <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                <Input
                  placeholder="分析할 키워드 입력"
                  value={형태소입력}
                  onChange={e => set형태소입력(e.target.value)}
                  onPressEnter={형태소분析실행}
                  allowClear
                  style={{ maxWidth: 400 }}
                />
                <Button
                  type="primary"
                  icon={<ExperimentOutlined />}
                  onClick={형태소분析실행}
                  loading={형태소로딩Lite || 형태소로딩Full || 형태소로딩유사어}
                  disabled={!형태소입력.trim()}
                >分析</Button>
              </Space.Compact>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Card title="Lite 형태소分析" size="small" style={{ minHeight: 200 }}>
                    {형태소로딩Lite ? (
                      <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : 형태소결과Lite ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>키워드: </Text>
                          <Text strong>{형태소결과Lite.keyword}</Text>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          {형태소결과Lite.tokens.length > 0
                            ? 형태소결과Lite.tokens.map((t, i) => (
                                <Tag key={i} color="blue" style={{ marginBottom: 4 }}>{t}</Tag>
                              ))
                            : <Text type="secondary">결과 없음</Text>
                          }
                        </div>
                        {형태소결과Lite.result && (
                          <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                            {형태소결과Lite.result}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 分析하세요</Text>
                    )}
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card title="Full 형태소分析 (품사 포함)" size="small" style={{ minHeight: 200 }}>
                    {형태소로딩Full ? (
                      <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : 형태소결과Full ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>키워드: </Text>
                          <Text strong>{형태소결과Full.keyword}</Text>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          {형태소결과Full.tokens.length > 0
                            ? 형태소결과Full.tokens.map((t, i) => (
                                <Tag key={i} color="purple" style={{ marginBottom: 4 }}>{t}</Tag>
                              ))
                            : <Text type="secondary">결과 없음</Text>
                          }
                        </div>
                        {형태소결과Full.result && (
                          <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                            {형태소결과Full.result}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 分析하세요</Text>
                    )}
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card title="유사어 확장 (사전 기반)" size="small" style={{ minHeight: 200 }}>
                    {형태소로딩유사어 ? (
                      <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : 형태소결과유사어 ? (
                      형태소결과유사어.length > 0 ? (
                        <div>
                          {형태소결과유사어.map((s, i) => (
                            <div key={i} style={{ marginBottom: 4, fontSize: 13 }}>
                              <Tag color="green">{s.head_word}</Tag>
                              <Text type="secondary" style={{ fontSize: 12 }}>→ {s.tail_word}</Text>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>유사어 없음 (사전에 등록된 항목 없음)</Text>
                      )
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 分析하세요</Text>
                    )}
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Modal>

        {/* ── 사전확인 Modal ── */}
        <Modal
          title={
            <Space>
              <SearchOutlined />
              <span>{activePanel?.backup.name}</span>
              <Tag color="blue" style={{ fontSize: 11 }}>사전확인</Tag>
            </Space>
          }
          open={!!activePanel && activePanel.mode === 'dict'}
          onCancel={closePanel}
          footer={<Button onClick={closePanel}>닫기</Button>}
          width={900}
          destroyOnClose
        >
          <Tabs
            activeKey={사전탭}
            onChange={(key) => {
              const tab = key as 'udic' | 'cndic' | 'thesaurus'
              set사전탭(tab)
              set사전검색어('')
              set사전페이지(1)
              if (activePanel) load사전데이터(activePanel.backup, tab, '', 1)
            }}
            items={[
              { key: 'udic', label: `사용자사전 (${사전탭 === 'udic' ? 사전총건수 : '?'})` },
              { key: 'cndic', label: `복합명사사전 (${사전탭 === 'cndic' ? 사전총건수 : '?'})` },
              { key: 'thesaurus', label: `유사어사전 (${사전탭 === 'thesaurus' ? 사전총건수 : '?'})` },
            ]}
          />
          <Input.Search
            placeholder="검색어 입력"
            value={사전검색어}
            onChange={e => set사전검색어(e.target.value)}
            onSearch={(val) => {
              set사전페이지(1)
              if (activePanel) load사전데이터(activePanel.backup, 사전탭, val, 1)
            }}
            allowClear
            style={{ marginBottom: 12, maxWidth: 320 }}
          />
          {사전탭 === 'thesaurus' ? (
            <Table
              size="small"
              loading={사전로딩}
              dataSource={사전데이터}
              rowKey={(r, i) => `${r._HEAD_WORD}_${r._TAIL_WORD}_${i}`}
              columns={[
                { title: '표제어', dataIndex: '_HEAD_WORD', key: '_HEAD_WORD', width: 160 },
                { title: '관련어', dataIndex: '_TAIL_WORD', key: '_TAIL_WORD', width: 160 },
                { title: '메모', dataIndex: '_MEMO', key: '_MEMO', ellipsis: true },
                { title: '수정일', dataIndex: '_UPDATED', key: '_UPDATED', width: 110, render: (v: string) => v?.split('T')[0] || v || '-' },
              ]}
              pagination={{
                current: 사전페이지,
                pageSize: 50,
                total: 사전총건수,
                showTotal: (t) => `총 ${t}건`,
                onChange: (p) => { if (activePanel) load사전데이터(activePanel.backup, 사전탭, 사전검색어, p) },
              }}
            />
          ) : (
            <Table
              size="small"
              loading={사전로딩}
              dataSource={사전데이터}
              rowKey={(r, i) => `${r._WORD}_${i}`}
              columns={[
                { title: '단어', dataIndex: '_WORD', key: '_WORD', width: 200 },
                { title: '메모', dataIndex: '_MEMO', key: '_MEMO', ellipsis: true },
                { title: '수정일', dataIndex: '_UPDATED', key: '_UPDATED', width: 110, render: (v: string) => v?.split('T')[0] || v || '-' },
              ]}
              pagination={{
                current: 사전페이지,
                pageSize: 50,
                total: 사전총건수,
                showTotal: (t) => `총 ${t}건`,
                onChange: (p) => { if (activePanel) load사전데이터(activePanel.backup, 사전탭, 사전검색어, p) },
              }}
            />
          )}
        </Modal>
      </div>
    </div>

  )
}
