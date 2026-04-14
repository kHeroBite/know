import { useEffect, useState, useCallback } from 'react'
import { Modal, Table, Button, Space, message, Tag } from 'antd'
import { ReloadOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons'
import { backupAPI, Backup } from '../api/backup'

interface Props {
  open: boolean
  onClose: () => void
  domain: string
}

export default function BackupManager({ open, onClose, domain }: Props) {
  const [목록, set목록] = useState<Backup[]>([])
  const [로딩, set로딩] = useState(false)
  const [작업중, set작업중] = useState(false)

  const 목록조회 = useCallback(async () => {
    if (!domain) return
    set로딩(true)
    try {
      const res = await backupAPI.listBackups(domain)
      set목록(res.data || [])
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

  const columns = [
    {
      title: '백업명',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      ellipsis: true,
    },
    {
      title: '생성일',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (v: string) => v || '-',
    },
    {
      title: 'UDIC',
      key: 'udic',
      width: 80,
      align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.udic ?? '-',
    },
    {
      title: 'CNDIC',
      key: 'cndic',
      width: 80,
      align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.cndic ?? '-',
    },
    {
      title: 'THESAURUS',
      key: 'thesaurus',
      width: 100,
      align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.thesaurus ?? '-',
    },
    {
      title: 'CATEGORY',
      key: 'category',
      width: 90,
      align: 'right' as const,
      render: (_: any, r: Backup) => r.dict_counts?.category ?? '-',
    },
    {
      title: 'DB',
      key: 'db',
      width: 70,
      render: (_: any, r: Backup) =>
        r.has_db_backup ? <Tag color="blue">있음</Tag> : <Tag>없음</Tag>,
    },
    {
      title: '액션',
      key: 'action',
      width: 160,
      render: (_: any, r: Backup) => (
        <Space size={4}>
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
  ]

  return (
    <Modal
      title={`백업 관리 — ${domain || '(도메인 미선택)'}`}
      open={open}
      onCancel={onClose}
      width={1000}
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
      />
    </Modal>
  )
}
