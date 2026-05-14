import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Space, Input, Select, Row, Col,
  Form, message, Modal, Tag, Typography, Popconfirm, Divider, Spin, Statistic,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ShareAltOutlined,
  FilePptOutlined, FileExcelOutlined, MailOutlined, CheckCircleOutlined, DeleteFilled,
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

// ─── BackupDicColumn (읽기전용 사전 컬럼) ──────────────────────────
type BackupDicType = 'udic' | 'cndic' | 'thesaurus'
interface BackupDicColProps { dicType: BackupDicType; backup: { name: string } }

function BackupDicColumn({ dicType, backup }: BackupDicColProps) {
  const [데이터, set데이터] = useState<any[]>([])
  const [검색어, set검색어] = useState('')
  const [로딩, set로딩] = useState(false)
  const [총건수, set총건수] = useState(0)
  const [현재페이지, set현재페이지] = useState(1)

  const title = dicType === 'udic' ? '사용자사전' : dicType === 'cndic' ? '복합명사사전' : '유사어사전'

  const 로드 = useCallback(async (search: string, page: number) => {
    set로딩(true)
    try {
      const res = await 클라이언트.get(`/backups/${backup.name}/dict/${dicType}`, {
        params: { search: search || undefined, page, size: 50 },
      })
      set데이터(res.data?.items || [])
      set총건수(res.data?.total || 0)
      set현재페이지(page)
    } catch (e: any) {
      message.error(`${title} 로드 실패`)
    } finally {
      set로딩(false)
    }
  }, [backup.name, dicType])

  useEffect(() => { 로드('', 1) }, [로드])

  const columns = dicType === 'thesaurus'
    ? [
        { title: '표제어', dataIndex: '_HEAD_WORD', key: '_HEAD_WORD' },
        { title: '관련어', dataIndex: '_TAIL_WORD', key: '_TAIL_WORD' },
      ]
    : [
        { title: '단어', dataIndex: '_WORD', key: '_WORD' },
      ]

  return (
    <Card title={`${title} (${총건수.toLocaleString()}건)`} size="small">
      <Input
        placeholder="검색..."
        value={검색어}
        onChange={e => { set검색어(e.target.value); 로드(e.target.value, 1) }}
        allowClear
        size="small"
        prefix={<SearchOutlined />}
        style={{ marginBottom: 8 }}
      />
      <Table
        dataSource={데이터}
        columns={columns}
        rowKey={(r: any, i: any) => dicType === 'thesaurus' ? `${r._HEAD_WORD}-${r._TAIL_WORD}-${i}` : `${r._WORD}-${i}`}
        loading={로딩}
        size="small"
        scroll={{ y: 400 }}
        pagination={{
          current: 현재페이지,
          pageSize: 50,
          total: 총건수,
          showTotal: (t) => `총 ${t.toLocaleString()}건`,
          showSizeChanger: false,
          size: 'small',
          onChange: (p) => 로드(검색어, p),
        }}
      />
    </Card>
  )
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

  // 사전확인 상태 (3컬럼 각자 관리 — 상위 상태 불필요)
  const [사전키, set사전키] = useState(0)

  // ─── 백업 목록 ─────────────────────────────────────────────────
  const [backups, setBackups] = useState<Backup[]>([])
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)

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
      // dict 모드 — 3컬럼 컴포넌트가 자체 로드
      set사전키(k => k + 1)
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
  const 형태소분석실행 = async () => {
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

  // ─── 선택 항목 일괄 삭제 ─────────────────────────────────────
  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    let successCount = 0
    let failCount = 0
    for (const name of selectedRowKeys) {
      const record = filteredBackups.find(b => b.name === name)
      const matched = domains.find(d =>
        record?.workspace_name?.toLowerCase().includes(d.id.toLowerCase()) ||
        record?.name?.toLowerCase().includes(d.id.toLowerCase())
      )
      const domainId = matched?.id || ''
      try {
        await backupAPI.deleteBackup(name, domainId)
        successCount++
      } catch {
        failCount++
      }
    }
    setBulkDeleting(false)
    setSelectedRowKeys([])
    if (successCount > 0) message.success(`${successCount}개 삭제 완료`)
    if (failCount > 0) message.error(`${failCount}개 삭제 실패`)
    await loadBackups()
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

  // ─── Excel 다운로드 ────────────────────────────────────────────
  const handleDownloadExcel = async (record: Backup) => {
    if (!record.workspace_name) {
      message.error('워크스페이스 정보가 없습니다')
      return
    }
    try {
      const response = await reportAPI.downloadExcelFile(record.workspace_name, record.name)
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${record.name}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      message.success('Excel 다운로드 완료')
    } catch (e: any) {
      message.error('Excel 다운로드 실패: ' + (e?.message || e))
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
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 8 } : {},
      render: (v: string | null, r: Backup) => {
        if (expandedRowKeys.includes(r.name)) return renderActionRow(r)
        return v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">-</Text>
      },
    },
    {
      title: '백업명', dataIndex: 'name', key: 'name', ellipsis: true,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '생성일', dataIndex: 'timestamp', key: 'timestamp', width: 100,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
      render: (v: string) => <Text style={{ fontSize: 12 }}>{formatDate(v)}</Text>,
    },
    {
      title: '사용자사전', key: 'udic', width: 100, align: 'right' as const,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{r.dict_counts?.udic ?? '-'}</Text>,
    },
    {
      title: '복합명사사전', key: 'cndic', width: 110, align: 'right' as const,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{r.dict_counts?.cndic ?? '-'}</Text>,
    },
    {
      title: '유사어사전', key: 'thesaurus', width: 100, align: 'right' as const,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
      render: (_: any, r: Backup) => <Text style={{ fontSize: 12 }}>{r.dict_counts?.thesaurus ?? '-'}</Text>,
    },
    {
      title: '용량',
      dataIndex: 'size_mb',
      key: 'size_mb',
      width: 80,
      align: 'right' as const,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
      render: (v: number) => <Text style={{ fontSize: 12 }}>{v != null ? `${v.toFixed(1)}MB` : '-'}</Text>,
    },
    {
      title: 'jiana',
      dataIndex: 'jiana_version',
      key: 'jiana_version',
      width: 80,
      onCell: (r: Backup) => expandedRowKeys.includes(r.name) ? { colSpan: 0 } : {},
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




  const renderActionRow = (r: Backup) => {
    const hasShareUrl = !!r.share_url
    const hasReport = !!r.has_report
    const canEmail = hasShareUrl && hasReport
    const hasDomain = !!getDomainCodeFromBackup(r)

    return (
      <div style={{ padding: 0 }}>
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
            onClick={(e) => { e.stopPropagation(); openPanel(r, 'dict') }}
          >
            사전확인
          </Button>
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            disabled={!hasShareUrl}
            onClick={(e) => { e.stopPropagation(); if (r.share_url) window.open(r.share_url, '_blank') }}
            title={hasShareUrl ? '완료 리포트 열기' : '공유 링크 없음'}
          >
            완료리포트
          </Button>
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            disabled={!r.workspace_name}
            onClick={(e) => { e.stopPropagation(); openShareModal(r) }}
          >
            공유
          </Button>
          <Button
            size="small"
            icon={<FilePptOutlined />}
            disabled={!r.workspace_name || !hasReport}
            onClick={(e) => { e.stopPropagation(); handleDownloadPpt(r) }}
            title={!r.workspace_name ? '워크스페이스 없음' : !hasReport ? '리포트가 아직 생성되지 않았습니다' : 'PPT 다운로드'}
          >
            PPT
          </Button>
          <Button
            size="small"
            icon={<FileExcelOutlined />}
            disabled={!r.workspace_name}
            onClick={(e) => { e.stopPropagation(); handleDownloadExcel(r) }}
            title={!r.workspace_name ? '워크스페이스 없음' : 'Excel 다운로드'}
          >
            Excel
          </Button>
          <Button
            size="small"
            icon={<MailOutlined />}
            disabled={!canEmail}
            onClick={(e) => { e.stopPropagation(); openEmailModal(r) }}
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
        <Card
          size="small"
          title="백업 목록"
          extra={
            selectedRowKeys.length > 0 && (
              <Popconfirm
                title={`선택한 백업 ${selectedRowKeys.length}개를 삭제하시겠습니까?`}
                onConfirm={handleBulkDelete}
                okText="삭제"
                cancelText="취소"
                okButtonProps={{ danger: true }}
              >
                <Button danger size="small" loading={bulkDeleting}>
                  선택 삭제 ({selectedRowKeys.length}개)
                </Button>
              </Popconfirm>
            )
          }
        >
          <Table
            size="small"
            columns={backupColumns}
            dataSource={filteredBackups}
            rowKey="name"
            loading={backupLoading}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: '백업 없음' }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
            }}
            expandable={{
              expandedRowKeys,
              onExpand: (expanded, record) => {
                setExpandedRowKeys(expanded ? [record.name] : [])
              },
              expandRowByClick: true,
              rowExpandable: () => true,
              expandIcon: () => null,
            }}
          />
        </Card>

        {/* ── 형태소분석 Modal ── */}
        <Modal
          title={<span>🔬 {activePanel?.backup.name} 형태소분석</span>}
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
        </Modal>

        {/* ── 사전확인 Modal ── */}
        <Modal
          title={<span>📚 {activePanel?.backup.name} 사전확인</span>}
          open={!!activePanel && activePanel.mode === 'dict'}
          onCancel={closePanel}
          footer={<Button onClick={closePanel}>닫기</Button>}
          width={1300}
          destroyOnClose
        >
          {activePanel?.mode === 'dict' && activePanel.backup && (
            <Row gutter={16} key={사전키}>
              <Col span={8}><BackupDicColumn dicType="udic" backup={activePanel.backup} /></Col>
              <Col span={8}><BackupDicColumn dicType="cndic" backup={activePanel.backup} /></Col>
              <Col span={8}><BackupDicColumn dicType="thesaurus" backup={activePanel.backup} /></Col>
            </Row>
          )}
        </Modal>

        {/* 공유 링크 모달 */}
        <Modal
          open={shareModalOpen}
          title={`공유 링크 — ${shareTarget?.name ?? ''}`}
          onCancel={() => setShareModalOpen(false)}
          footer={null}
          destroyOnClose
          width={600}
        >
          <p>워크스페이스: {shareTarget?.workspace_name}</p>
          {shareUrl ? (
            <>
              <Input.Group compact>
                <Input value={shareUrl} readOnly style={{ width: 'calc(100% - 80px)' }} />
                <Button onClick={() => copyToClipboard(shareUrl)}>복사</Button>
              </Input.Group>
              <p style={{ marginTop: 8, color: '#888' }}>공유 링크는 30일간 유효합니다.</p>
            </>
          ) : (
            <>
              <p>아직 공유 링크가 발급되지 않았습니다.</p>
              <Button type="primary" loading={shareGenerating} onClick={handleGenerateShare}>공유 링크 발급 (30일)</Button>
            </>
          )}
        </Modal>

        {/* 메일 발송 모달 */}
        <Modal
          open={emailModalOpen}
          title={`메일 발송 — ${emailTarget?.name ?? ''}`}
          onCancel={() => setEmailModalOpen(false)}
          onOk={handleSendEmail}
          okText="발송"
          cancelText="취소"
          okButtonProps={{ loading: emailSending, disabled: !emailSelectId }}
          destroyOnClose
          width={500}
        >
          <p>워크스페이스: {emailTarget?.workspace_name}</p>
          <p>수신자를 선택하세요. (연락처는 페이지 상단 &apos;메일 연락처&apos; 영역에서 등록/삭제할 수 있습니다.)</p>
          <Select
            style={{ width: '100%' }}
            placeholder="수신자 선택"
            value={emailSelectId}
            onChange={setEmailSelectId}
            options={contacts.map(c => ({ value: c.id, label: `${c.name} <${c.email}>` }))}
          />
        </Modal>

      </div>
    </div>

  )
}
