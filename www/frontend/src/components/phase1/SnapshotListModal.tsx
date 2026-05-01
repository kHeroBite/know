import { useEffect, useState } from 'react'
import { Modal, Table, Tag, Button, Space, message, Spin, Typography } from 'antd'
import { phase1API } from '../../api/phase1'

const { Text } = Typography

interface SnapshotRow {
  snapshot_id: string
  method: string
  created_at: string
  kw_count: number
}

interface SnapshotListModalProps {
  open: boolean
  workspace: string
  onClose: () => void
  onRestored: () => void
}

function formatDateTime(dt: string): string {
  try {
    const d = new Date(dt)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return dt
  }
}

export default function SnapshotListModal({
  open,
  workspace,
  onClose,
  onRestored,
}: SnapshotListModalProps) {
  const [로딩, set로딩] = useState(false)
  const [스냅샷목록, set스냅샷목록] = useState<SnapshotRow[]>([])
  const [복원중ID, set복원중ID] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const 목록로드 = async () => {
      set로딩(true)
      try {
        const { data } = await phase1API.snapshotList(workspace)
        set스냅샷목록(data.snapshots || [])
      } catch (e: any) {
        message.error('스냅샷 목록 로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        set스냅샷목록([])
      } finally {
        set로딩(false)
      }
    }
    목록로드()
  }, [open, workspace])

  const handleRestore = (row: SnapshotRow) => {
    Modal.confirm({
      title: '스냅샷 복원',
      content: '현재 활성 결과는 새 스냅샷으로 자동 보존되고 선택 스냅샷이 활성으로 복원됩니다. 계속하시겠습니까?',
      okText: '복원',
      cancelText: '취소',
      onOk: async () => {
        set복원중ID(row.snapshot_id)
        try {
          await phase1API.snapshotRestore(workspace, row.snapshot_id)
          message.success('스냅샷이 복원되었습니다.')
          onRestored()
          onClose()
        } catch (e: any) {
          message.error('복원 실패: ' + (e?.response?.data?.detail || e?.message || ''))
        } finally {
          set복원중ID(null)
        }
      },
    })
  }

  const 컬럼정의 = [
    {
      title: '스냅샷 ID',
      dataIndex: 'snapshot_id',
      key: 'snapshot_id',
      width: 140,
      render: (id: string) => (
        <Text code style={{ fontSize: 12 }}>
          {id.length > 12 ? id.slice(0, 8) + '…' : id}
        </Text>
      ),
    },
    {
      title: '방식',
      dataIndex: 'method',
      key: 'method',
      width: 100,
      render: (m: string) => (
        <Tag color={m === 'log' ? 'blue' : 'green'}>
          {m === 'log' ? '로그기반' : '데이터기반'}
        </Tag>
      ),
    },
    {
      title: '생성일시',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (dt: string) => formatDateTime(dt),
    },
    {
      title: '키워드 수',
      dataIndex: 'kw_count',
      key: 'kw_count',
      width: 100,
      align: 'right' as const,
      render: (n: number) => n.toLocaleString(),
    },
    {
      title: '복원',
      key: 'action',
      width: 80,
      render: (_: any, row: SnapshotRow) => (
        <Button
          size="small"
          type="primary"
          loading={복원중ID === row.snapshot_id}
          onClick={() => handleRestore(row)}
        >
          복원
        </Button>
      ),
    },
  ]

  return (
    <Modal
      title="이전 스냅샷 목록"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          닫기
        </Button>,
      ]}
      width={700}
      destroyOnClose
    >
      <Spin spinning={로딩}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            최대 5개의 스냅샷이 보관됩니다. 복원 시 현재 결과는 자동으로 새 스냅샷으로 보존됩니다.
          </Text>
          <Table
            rowKey="snapshot_id"
            dataSource={스냅샷목록}
            columns={컬럼정의}
            size="small"
            pagination={false}
            locale={{ emptyText: 로딩 ? '불러오는 중...' : '저장된 스냅샷이 없습니다.' }}
          />
        </Space>
      </Spin>
    </Modal>
  )
}
