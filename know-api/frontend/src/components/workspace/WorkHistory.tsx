import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { List, Button, Typography, Empty, Spin, message } from 'antd'
import { UndoOutlined } from '@ant-design/icons'
import { workspaceAPI } from '../../api/workspace'

const { Text } = Typography

export interface WorkHistoryItem {
  id: number
  action: string
  keyword: string
  detail?: string
  created_at: string
  undone: boolean
}

export interface WorkHistoryRef {
  reload: () => void
  undoLatest: () => void
}

interface Props {
  workspace: string
  domain: string
  onUndo?: (item: WorkHistoryItem) => void
}

export default forwardRef<WorkHistoryRef, Props>(function WorkHistory({ workspace, domain, onUndo }, ref) {
  const [items, setItems] = useState<WorkHistoryItem[]>([])
  const [loading, setLoading] = useState(false)

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

  useImperativeHandle(ref, () => ({ reload: load, undoLatest }))

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin size="small" /></div>
  }

  if (items.length === 0) {
    return <Empty description="작업이력 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '20px 0' }} />
  }

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      <List
        size="small"
        dataSource={items}
        renderItem={(item) => (
          <List.Item
            style={{
              padding: '4px 8px',
              ...(item.undone ? { textDecoration: 'line-through', opacity: 0.5 } : {}),
            }}
            extra={!item.undone ? (
              <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => handleUndo(item)} />
            ) : undefined}
          >
            <Text style={{ fontSize: 12 }}>{item.action}: {item.keyword}</Text>
          </List.Item>
        )}
      />
    </div>
  )
})
