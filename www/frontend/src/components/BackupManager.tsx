import { useEffect, useState, useCallback } from 'react'
import {
  Modal, Table, Button, Space, message, Tag, Input, Form, Select, Typography,
} from 'antd'
import {
  ReloadOutlined, DeleteOutlined, UndoOutlined, FilePptOutlined,
  MailOutlined, ShareAltOutlined, CopyOutlined, DownloadOutlined,
} from '@ant-design/icons'
import { backupAPI, type Backup } from '../api/backup'
import { shareAPI } from '../api/share'
import { reportAPI } from '../api/reports'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
  domain: string
}

interface EmailForm {
  to: string
}

export default function BackupManager({ open, onClose, domain }: Props) {
  const [목록, set목록] = useState<Backup[]>([])
  const [로딩, set로딩] = useState(false)
  const [작업중, set작업중] = useState(false)

  // 리포트 생성 Modal
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<Backup | null>(null)
  const [reportPrev, setReportPrev] = useState<string | null>(null)
  const [reportGenerating, setReportGenerating] = useState(false)

  // 메일 전송 Modal
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTarget, setEmailTarget] = useState<Backup | null>(null)
  const [emailForm] = Form.useForm<EmailForm>()
  const [emailSending, setEmailSending] = useState(false)

  // 공유 링크 Modal
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<Backup | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareGenerating, setShareGenerating] = useState(false)

  const 목록조회 = useCallback(async () => {
    if (!domain) return
    set로딩(true)
    try {
      const res = await backupAPI.listBackups(domain)
      set목록(res.data?.backups || [])
    } catch (e: any) {
      message.error('백업 목록 조회 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      set로딩(false)
    }
  }, [domain])

  useEffect(() => {
    if (open && domain) {
      목록조회()
    }
  }, [open, domain, 목록조회])

  const handleRestore = (record: Backup) => {
    Modal.confirm({
      title: '백업하시겠습니까?',
      content: `"${record.name}" 백업으로 복원합니다. 복원 전에 현재 상태를 백업할 수 있습니다.`,
      okText: '예 (백업하고 복원)',
      cancelText: '아니오 (바로 복원)',
      onOk: async () => {
        set작업중(true)
        try {
          await backupAPI.restoreBackup(record.name, domain, false)
          message.success('복원 완료 (백업 포함)')
          await 목록조회()
        } catch (e: any) {
          message.error('복원 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        } finally {
          set작업중(false)
        }
      },
      onCancel: async () => {
        set작업중(true)
        try {
          await backupAPI.restoreBackup(record.name, domain, true)
          message.success('복원 완료 (백업 생략)')
          await 목록조회()
        } catch (e: any) {
          message.error('복원 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        } finally {
          set작업중(false)
        }
      },
    })
  }

  const handleDelete = (record: Backup) => {
    Modal.confirm({
      title: '백업을 삭제하시겠습니까?',
      content: `"${record.name}" 백업을 영구 삭제합니다. 되돌릴 수 없습니다.`,
      okText: '삭제',
      cancelText: '취소',
      okButtonProps: { danger: true },
      onOk: async () => {
        set작업중(true)
        try {
          await backupAPI.deleteBackup(record.name, domain)
          message.success('삭제 완료')
          await 목록조회()
        } catch (e: any) {
          message.error('삭제 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        } finally {
          set작업중(false)
        }
      },
    })
  }

  const openReportModal = (record: Backup) => {
    setReportTarget(record)
    setReportPrev(null)
    setReportModalOpen(true)
  }

  const handleGenerateReport = async () => {
    if (!reportTarget || !reportTarget.workspace_name) {
      message.error('해당 백업에 연결된 워크스페이스 정보가 없습니다')
      return
    }
    setReportGenerating(true)
    try {
      await backupAPI.generateBackupReport(
        reportTarget.name,
        reportTarget.workspace_name,
        reportPrev
      )
      message.success('리포트 생성 완료')
      setReportModalOpen(false)
      await 목록조회()
    } catch (e: any) {
      message.error('리포트 생성 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setReportGenerating(false)
    }
  }

  const handleDownloadReport = (record: Backup) => {
    if (!record.workspace_name) {
      message.error('워크스페이스 정보 없음')
      return
    }
    const url = reportAPI.downloadReportUrl(record.workspace_name, record.name)
    window.open(url, '_blank')
  }

  const openEmailModal = (record: Backup) => {
    if (!record.workspace_name) {
      message.error('해당 백업에 연결된 워크스페이스 정보가 없습니다')
      return
    }
    setEmailTarget(record)
    emailForm.resetFields()
    setEmailModalOpen(true)
  }

  const handleSendEmail = async () => {
    if (!emailTarget || !emailTarget.workspace_name) return
    try {
      const values = await emailForm.validateFields()
      setEmailSending(true)
      const res = await backupAPI.sendBackupEmail(emailTarget.name, {
        to: values.to,
        workspace: emailTarget.workspace_name,
      })
      message.success(`메일 전송 완료 (공유 URL: ${res.data.share_url})`)
      setEmailModalOpen(false)
      await 목록조회()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('메일 전송 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setEmailSending(false)
    }
  }

  const openShareModal = async (record: Backup) => {
    if (!record.workspace_name) {
      message.error('해당 백업에 연결된 워크스페이스 정보가 없습니다')
      return
    }
    setShareTarget(record)
    setShareUrl(record.share_url || null)
    setShareModalOpen(true)
  }

  const handleGenerateShare = async () => {
    if (!shareTarget || !shareTarget.workspace_name) return
    setShareGenerating(true)
    try {
      const res = await shareAPI.generateShare(shareTarget.workspace_name, shareTarget.name, 30)
      setShareUrl(res.data.url)
      message.success('공유 링크 발급 완료')
      await 목록조회()
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

  const columns = [
    { title: '백업명', dataIndex: 'name', key: 'name', width: 220, ellipsis: true },
    {
      title: 'WS', dataIndex: 'workspace_name', key: 'workspace_name', width: 100, ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '생성일', dataIndex: 'timestamp', key: 'timestamp', width: 150,
      render: (v: string) => v || '-',
    },
    {
      title: 'UDIC', key: 'udic', width: 70, align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.udic ?? '-',
    },
    {
      title: 'CNDIC', key: 'cndic', width: 70, align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.cndic ?? '-',
    },
    {
      title: 'THES', key: 'thesaurus', width: 70, align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.thesaurus ?? '-',
    },
    {
      title: 'CAT', key: 'category', width: 60, align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.category ?? '-',
    },
    {
      title: '공유 URL', key: 'share_url', width: 120,
      render: (_: any, r: Backup) =>
        r.share_url
          ? (
            <Space size={2}>
              <Button
                size="small"
                type="link"
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(r.share_url!)}
                title={r.share_url}
              >복사</Button>
              <Button
                size="small"
                type="link"
                onClick={() => window.open(r.share_url!, '_blank')}
              >열기</Button>
            </Space>
          )
          : <Text type="secondary">-</Text>,
    },
    {
      title: '리포트/공유/메일',
      key: 'actions2',
      width: 240,
      render: (_: any, r: Backup) => (
        <Space size={2}>
          {r.has_report
            ? (
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadReport(r)}
                disabled={작업중}
              >PPT</Button>
            )
            : (
              <Button
                size="small"
                icon={<FilePptOutlined />}
                onClick={() => openReportModal(r)}
                disabled={작업중}
              >리포트</Button>
            )}
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            onClick={() => openShareModal(r)}
            disabled={작업중}
          >공유</Button>
          <Button
            size="small"
            icon={<MailOutlined />}
            onClick={() => openEmailModal(r)}
            disabled={작업중}
          >메일</Button>
        </Space>
      ),
    },
    {
      title: '액션', key: 'action', width: 160,
      render: (_: any, r: Backup) => (
        <Space size={2}>
          <Button
            size="small"
            icon={<UndoOutlined />}
            onClick={() => handleRestore(r)}
            disabled={작업중}
          >복원</Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(r)}
            disabled={작업중}
          >삭제</Button>
        </Space>
      ),
    },
    {
      title: 'DB', key: 'db', width: 60,
      render: (_: any, r: Backup) =>
        r.has_db_backup ? <Tag color="blue">O</Tag> : <Tag>-</Tag>,
    },
  ]

  return (
    <>
      <Modal
        title={`백업 관리 — ${domain || '(도메인 미선택)'}`}
        open={open}
        onCancel={onClose}
        width={1400}
        footer={[
          <Button key="refresh" icon={<ReloadOutlined />} onClick={목록조회} loading={로딩}>새로고침</Button>,
          <Button key="close" onClick={onClose}>닫기</Button>,
        ]}
      >
        <Table
          rowKey="name"
          dataSource={목록}
          columns={columns}
          loading={로딩}
          size="small"
          pagination={{ pageSize: 10, showTotal: (t) => `${t}건` }}
          scroll={{ x: 1350 }}
        />
      </Modal>

      <Modal
        title={`리포트 생성 — ${reportTarget?.name || ''}`}
        open={reportModalOpen}
        onCancel={() => setReportModalOpen(false)}
        onOk={handleGenerateReport}
        okText="생성"
        confirmLoading={reportGenerating}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text>이전 백업 선택 (선택사항)</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="선택 안 함 — 전체 항목이 '추가'로 집계"
              allowClear
              value={reportPrev ?? undefined}
              onChange={(v) => setReportPrev(v ?? null)}
              options={목록
                .filter((b) => b.name !== reportTarget?.name)
                .map((b) => ({ value: b.name, label: b.name }))}
            />
          </div>
          <Text type="secondary">
            워크스페이스: <Tag>{reportTarget?.workspace_name || '정보 없음'}</Tag>
          </Text>
        </Space>
      </Modal>

      <Modal
        title={`메일 전송 — ${emailTarget?.name || ''}`}
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
            첨부: PPT 리포트 + data.tar (있는 경우). 공유 URL이 본문에 포함됩니다.
          </Text>
        </Form>
      </Modal>

      <Modal
        title={`공유 링크 — ${shareTarget?.name || ''}`}
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setShareModalOpen(false)}>닫기</Button>,
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {shareUrl
            ? (
              <>
                <Text>공유 URL (TTL 30일)</Text>
                <Input.TextArea value={shareUrl} readOnly rows={2} />
                <Space>
                  <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(shareUrl)}>
                    복사
                  </Button>
                  <Button onClick={() => window.open(shareUrl, '_blank')}>새 탭에서 열기</Button>
                  <Button
                    type="primary"
                    loading={shareGenerating}
                    onClick={handleGenerateShare}
                  >
                    새 링크 발급
                  </Button>
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
    </>
  )
}
