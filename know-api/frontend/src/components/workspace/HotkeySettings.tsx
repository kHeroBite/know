import { useState, useEffect, useCallback } from 'react'
import { Modal, Table, Button, Space, Tag, message } from 'antd'
import { workspaceAPI } from '../../api/workspace'

interface HotkeyConfig {
  id: string
  label: string
  key: string
}

const 기본핫키: HotkeyConfig[] = [
  { id: 'prevKeyword', label: '이전 키워드', key: 'ArrowUp' },
  { id: 'nextKeyword', label: '다음 키워드', key: 'ArrowDown' },
  { id: 'prevAnalysis', label: '이전 분석결과', key: 'ArrowLeft' },
  { id: 'nextAnalysis', label: '다음 분석결과', key: 'ArrowRight' },
  { id: 'registerUdic', label: '사용자사전 등록', key: '1' },
  { id: 'registerCndic', label: '복합명사 등록', key: '2' },
  { id: 'registerThesaurus', label: '유사어 등록', key: '3' },
  { id: 'analyzeKeyword', label: '키워드분석', key: '0' },
  { id: 'focusAnalysis', label: '분석결과 포커스', key: 'Home' },
  { id: 'tabUdic', label: '사용자사전탭', key: 'Alt+1' },
  { id: 'tabCndic', label: '복합명사탭', key: 'Alt+2' },
  { id: 'tabThesaurus', label: '유사어탭', key: 'Alt+3' },
  { id: 'tabMorpheme', label: '키워드분석탭', key: 'Alt+0' },
  { id: 'aiAnalysis', label: 'AI분석', key: '/' },
  { id: 'undoHistory', label: '작업취소', key: 'Escape' },
]

const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home',
}

function displayKey(key: string): string {
  if (key.includes('+')) {
    const parts = key.split('+')
    return parts.map(p => keyDisplayMap[p] || p).join('+')
  }
  return keyDisplayMap[key] || key
}

function encodeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.altKey) parts.push('Alt')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  const k = e.key === ' ' ? 'Space' : e.key
  if (!['Alt', 'Control', 'Shift', 'Meta'].includes(k)) parts.push(k)
  return parts.join('+')
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (hotkeys: Record<string, string>) => void
}

export default function HotkeySettings({ open, onClose, onSave }: Props) {
  const [hotkeys, setHotkeys] = useState<HotkeyConfig[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) { setEditingId(null); return }
    setLoading(true)
    workspaceAPI.getHotkeys()
      .then(({ data }) => {
        const merged = 기본핫키.map(h => ({
          ...h,
          key: data?.[h.id] || h.key,
        }))
        setHotkeys(merged)
      })
      .catch(() => setHotkeys([...기본핫키]))
      .finally(() => setLoading(false))
  }, [open])

  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!editingId) return
    e.preventDefault()
    e.stopPropagation()
    if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) return
    // Escape → 캡처 취소 (모달 닫기가 아닌 편집 취소)
    if (e.key === 'Escape') {
      setEditingId(null)
      return
    }
    const encoded = encodeKeyEvent(e)
    const conflict = hotkeys.find(h => h.id !== editingId && h.key === encoded)
    if (conflict) {
      message.warning(`"${conflict.label}"에서 이미 사용 중인 키입니다.`)
      return
    }
    setHotkeys(prev => prev.map(h => h.id === editingId ? { ...h, key: encoded } : h))
    setEditingId(null)
  }, [editingId, hotkeys])

  useEffect(() => {
    if (editingId) {
      window.addEventListener('keydown', handleKeyCapture, true)
      return () => window.removeEventListener('keydown', handleKeyCapture, true)
    }
  }, [editingId, handleKeyCapture])

  const handleSave = () => {
    const map: Record<string, string> = {}
    hotkeys.forEach(h => { map[h.id] = h.key })
    onSave(map)
    onClose()
  }

  const handleReset = () => {
    setHotkeys([...기본핫키])
    message.info('기본값으로 초기화되었습니다.')
  }

  const columns = [
    { title: '기능', dataIndex: 'label', key: 'label', width: 160 },
    {
      title: '단축키', dataIndex: 'key', key: 'key',
      render: (key: string, record: HotkeyConfig) =>
        editingId === record.id ? (
          <Tag color="processing">키 입력 대기...</Tag>
        ) : (
          <Tag style={{ cursor: 'pointer' }} onClick={() => setEditingId(record.id)}>
            {displayKey(key)}
          </Tag>
        ),
    },
  ]

  return (
    <Modal
      title="⚙ 단축키 설정"
      open={open}
      onCancel={onClose}
      width={420}
      footer={
        <Space>
          <Button onClick={handleReset}>기본값 초기화</Button>
          <Button onClick={onClose}>취소</Button>
          <Button type="primary" onClick={handleSave}>저장</Button>
        </Space>
      }
    >
      <Table
        dataSource={hotkeys}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        scroll={{ y: 400 }}
      />
    </Modal>
  )
}
