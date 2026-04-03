import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from 'react'
import { Table, Button, Empty, Spin, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UndoOutlined } from '@ant-design/icons'
import { workspaceAPI } from '../../api/workspace'

export interface WorkHistoryItem {
  id: number
  action_type: string
  dic_type: string
  word?: string
  head_word?: string
  tail_word?: string
  memo?: string
  created_at: string
  undone: boolean
}

export interface WorkHistoryRef {
  reload: () => void
  undoLatest: () => void
  undoLatestForKeyword: (keyword: string) => void
}

interface Props {
  workspace: string
  domain: string
  onUndo?: (item: WorkHistoryItem) => void
}

const DIC_LABEL: Record<string, string> = { udic: '사용자사전', cndic: '복합명사사전', thesaurus: '유사어사전' }
const ACT_LABEL: Record<string, string> = { add: '+', delete: '-' }

export default forwardRef<WorkHistoryRef, Props>(function WorkHistory({ workspace, domain, onUndo }, ref) {
  const [items, setItems] = useState<WorkHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const 컨테이너Ref = useRef<HTMLDivElement>(null)
  const [테이블높이, set테이블높이] = useState(200)

  useEffect(() => {
    const el = 컨테이너Ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const h = el.clientHeight - 8
      set테이블높이(Math.max(80, h))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const load = useCallback(async () => {
    if (!workspace || !domain) return
    setLoading(true)
    try {
      const { data } = await workspaceAPI.fetchWorkHistory(workspace, domain)
      setItems(data?.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [workspace, domain])

  useEffect(() => { load() }, [load])

  const handleUndo = async (item: WorkHistoryItem) => {
    try {
      await workspaceAPI.undoWorkHistory(item.id)
      message.success('되돌리기 완료')
      onUndo?.(item)
      load()
    } catch {
      message.error('되돌리기 실패')
    }
  }

  const undoLatest = async () => {
    const latest = items.find(i => !i.undone)
    if (latest) await handleUndo(latest)
    else message.info('되돌릴 작업이 없습니다')
  }

  const undoLatestForKeyword = async (keyword: string) => {
    if (!keyword) { message.info('되돌릴 키워드가 없습니다'); return }
    const match = items.find(i => !i.undone && (i.word === keyword || i.head_word === keyword))
    if (match) await handleUndo(match)
    else message.info(`"${keyword}" 키워드의 되돌릴 작업이 없습니다`)
  }

  useImperativeHandle(ref, () => ({ reload: load, undoLatest, undoLatestForKeyword }))

  const columns: ColumnsType<WorkHistoryItem> = [
    {
      title: '사전',
      dataIndex: 'dic_type',
      width: 100,
      render: (v: string) => <span style={{ fontSize: 11 }}>{DIC_LABEL[v] || v}</span>,
    },
    {
      dataIndex: 'action_type',
      width: 50,
      align: 'center' as const,
      render: (v: string) => ACT_LABEL[v] || v,
    },
    {
      title: '키워드',
      key: 'keyword',
      ellipsis: true,
      render: (_: unknown, record: WorkHistoryItem) => record.word || record.head_word || '-',
    },
    {
      key: 'undo',
      width: 32,
      align: 'center' as const,
      render: (_: unknown, record: WorkHistoryItem) => !record.undone ? (
        <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => handleUndo(record)} />
      ) : null,
    },
  ]

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin size="small" /></div>
  }

  if (items.length === 0) {
    return <Empty description="작업이력 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '20px 0' }} />
  }

  return (
    <div ref={컨테이너Ref} style={{ height: '100%' }}>
      <Table
        size="small"
        dataSource={items}
        columns={columns}
        rowKey="id"
        pagination={false}
        scroll={{ y: 120 }}
        onRow={(record) => ({
          style: record.undone ? { textDecoration: 'line-through', opacity: 0.5 } : {},
        })}
      />
    </div>
  )
})
