import { useState, useEffect, useCallback } from 'react'
import { Table, Tag, Typography, Card } from 'antd'
import { assignmentApi, KeywordItem } from '../api/assignment'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title, Text } = Typography
const PAGE_SIZE = 20

export default function KnowledgeWork() {
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const [items, setItems] = useState<KeywordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const 목록조회 = useCallback(async (p = page) => {
    if (!selectedWorkspace || !selectedDomain) return
    setLoading(true)
    try {
      const { data } = await assignmentApi.목록(selectedWorkspace, selectedDomain, 'assigned', p, PAGE_SIZE)
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, page])

  useEffect(() => {
    목록조회(page)
  }, [selectedWorkspace, selectedDomain, page])

  const columns = [
    {
      title: '순번',
      key: 'index',
      width: 80,
      render: (_: unknown, __: unknown, index: number) => (page - 1) * PAGE_SIZE + index + 1,
    },
    {
      title: '키워드',
      dataIndex: 'keyword',
      key: 'keyword',
      ellipsis: true,
    },
    {
      title: '분석결과',
      dataIndex: 'analysis',
      key: 'analysis',
      ellipsis: true,
      render: (text: string) => {
        if (!text) return '-'
        const first = text.split('\n')[0]
        return first.length > 60 ? first.slice(0, 60) + '…' : first
      },
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        if (status === 'assigned') return <Tag color="blue">할당됨</Tag>
        if (status === 'completed') return <Tag color="green">완료</Tag>
        return <Tag>미완료</Tag>
      },
    },
  ]

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">워크스페이스와 도메인을 먼저 선택하세요.</Text>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Title level={3}>지식 작업실</Title>
      <Card size="small" style={{ flex: 1 }}>
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: t => `총 ${t}건`,
            showSizeChanger: false,
            onChange: p => setPage(p),
          }}
        />
      </Card>
    </div>
  )
}
