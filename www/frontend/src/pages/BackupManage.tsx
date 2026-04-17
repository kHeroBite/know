import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Space, Input, Select, Row, Col,
  Form, message, Modal, Tag, Typography, Popconfirm, Divider, Spin, Statistic,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ShareAltOutlined,
  FilePptOutlined, MailOutlined, CheckCircleOutlined, DeleteFilled,
  ExperimentOutlined,
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

  // ─── 형태소분석 ────────────────────────────────────────────────
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null)
  const [형태소입력, set형태소입력] = useState('')
  const [형태소로딩Lite, set형태소로딩Lite] = useState(false)
  const [형태소로딩Full, set형태소로딩Full] = useState(false)
  const [형태소로딩유사어, set형태소로딩유사어] = useState(false)
  const [형태소결과Lite, set형태소결과Lite] = useState<{keyword: string; result: string; tokens: string[]} | null>(null)
  const [형태소결과Full, set형태소결과Full] = useState<{keyword: string; result: string; tokens: string[]} | null>(null)
  const [형태소결과유사어, set형태소결과유사어] = useState<{head_word: string; tail_word: string}[] | null>(null)

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

  // ─── 형태소분석 실행 ───────────────────────────────────────────
  const 형태소분석실행 = async () => {
    const kw = 형태소입력.trim()
    if (!kw || !selectedDomain || selectedDomain === 'all') return
    set형태소결과Lite(null)
    set형태소결과Full(null)
    set형태소결과유사어(null)
    set형태소로딩Lite(true)
    set형태소로딩Full(true)
    set형태소로딩유사어(true)
    const payload = selectedBackup
      ? { keyword: kw, domain: selectedDomain, backup_name: selectedBackup.name }
      : { keyword: kw, domain: selectedDomain, skip_workspace: true }
    const litePromise = 클라이언트.post('/morpheme/analyze', payload)
      .then(r => set형태소결과Lite(r.data))
      .catch(() => set형태소결과Lite({ keyword: kw, result: '분석 실패', tokens: [] }))
      .finally(() => set형태소로딩Lite(false))
    const fullPromise = 클라이언트.post('/morpheme/analyze-full', payload)
      .then(r => set형태소결과Full(r.data))
      .catch(() => set형태소결과Full({ keyword: kw, result: '분석 실패', tokens: [] }))
      .finally(() => set형태소로딩Full(false))
    const synPromise = 클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/list`, { params: { search: kw, size: 30 } })
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

  const handleOpenMorpheme = (r: Backup) => {
    const domainCode = getDomainCodeFromBackup(r)
    if (domainCode) {
      setSelectedDomain(domainCode)
      setSelectedBackup(r)
      setTimeout(() => {
        document.getElementById('morpheme-panel')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } else {
      message.warning('해당 백업의 도메인을 찾을 수 없습니다')
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
            icon={<ExperimentOutlined />}
            disabled={!hasDomain}
            onClick={() => handleOpenMorpheme(r)}
            title={hasDomain ? '형태소분석' : '도메인 정보 없음'}
          >
            형태소분석
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

        {/* ── 형태소분석 패널 ── */}
        {selectedDomain && selectedDomain !== 'all' && (
          <>
            <Divider />
            <div id="morpheme-panel" style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 15 }}>
                <ExperimentOutlined /> {selectedDomain} 형태소분석
              </Text>
              {selectedBackup && (
                <>
                  <Tag color="orange" style={{ marginLeft: 8, fontSize: 11 }}>
                    백업: {selectedBackup.name}
                  </Tag>
                  <Button size="small" onClick={() => setSelectedBackup(null)} style={{ marginLeft: 8 }}>
                    도메인 현재 사전으로
                  </Button>
                </>
              )}
            </div>
            <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
              <Input
                placeholder="분석할 키워드 입력"
                value={형태소입력}
                onChange={e => set형태소입력(e.target.value)}
                onPressEnter={형태소분석실행}
                allowClear
                style={{ maxWidth: 400 }}
              />
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                onClick={형태소분석실행}
                loading={형태소로딩Lite || 형태소로딩Full || 형태소로딩유사어}
                disabled={!형태소입력.trim()}
              >분석</Button>
            </Space.Compact>
            <Row gutter={[16, 16]}>
              {/* Lite 분석 */}
              <Col xs={24} md={8}>
                <Card title="Lite 형태소분석" size="small" style={{ minHeight: 200 }}>
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
                    <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 분석하세요</Text>
                  )}
                </Card>
              </Col>
              {/* Full 분석 */}
              <Col xs={24} md={8}>
                <Card title="Full 형태소분석 (품사 포함)" size="small" style={{ minHeight: 200 }}>
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
                    <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 분석하세요</Text>
                  )}
                </Card>
              </Col>
              {/* 유사어 확장 */}
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
                    <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 분석하세요</Text>
                  )}
                </Card>
              </Col>
            </Row>
          </>
        )}

      </div>

      {/* ── 공유 모달 ── */}
      <Modal
        title={`공유 링크 — ${shareTarget?.name || ''}`}
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setShareModalOpen(false)}>닫기</Button>,
          <Button
            key="generate"
            type="primary"
            loading={shareGenerating}
            onClick={handleGenerateShare}
          >
            {shareUrl ? '재발급' : '링크 발급'}
          </Button>,
        ]}
      >
        {shareUrl ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>현재 공유 링크:</Text>
            <Space>
              <Text code style={{ wordBreak: 'break-all' }}>{shareUrl}</Text>
              <Button size="small" onClick={() => copyToClipboard(shareUrl)}>복사</Button>
              <Button size="small" onClick={() => window.open(shareUrl, '_blank')}>열기</Button>
            </Space>
          </Space>
        ) : (
          <Text type="secondary">공유 링크가 없습니다. 발급 버튼을 클릭하세요.</Text>
        )}
      </Modal>

      {/* ── 메일 수신자 선택 모달 ── */}
      <Modal
        title={`메일 발송 — ${emailTarget?.name || ''}`}
        open={emailModalOpen}
        onCancel={() => setEmailModalOpen(false)}
        onOk={handleSendEmail}
        okText="발송"
        cancelText="취소"
        confirmLoading={emailSending}
      >
        <div style={{ marginBottom: 12 }}>
          <Text>수신자를 선택하세요:</Text>
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder="연락처 선택"
          value={emailSelectId}
          onChange={setEmailSelectId}
        >
          {contacts.map(c => (
            <Select.Option key={c.id} value={c.id}>
              {c.name} &lt;{c.email}&gt;
            </Select.Option>
          ))}
        </Select>
        {contacts.length === 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            등록된 연락처가 없습니다. 메일 관리에서 먼저 추가해주세요.
          </Text>
        )}
      </Modal>
    </div>
  )
}
