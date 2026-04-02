import { useState, useEffect, useCallback } from 'react'
import { Modal, Table, Button, Space, Tag, message, Typography } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { workspaceAPI } from '../../api/workspace'

const { Text } = Typography

interface HotkeyConfig {
  id: string
  label: string
  key: string
}

// Alt+N 고정 단축키 (편집 불가)
const 고정탭단축키 = [
  { id: 'tabUdic', label: '사용자사전탭', key: 'Alt+1' },
  { id: 'tabCndic', label: '복합명사탭', key: 'Alt+2' },
  { id: 'tabThesaurus', label: '유사어탭', key: 'Alt+3' },
  { id: 'tabMorpheme', label: '키워드분석탭', key: 'Alt+0' },
]

// 편집 가능한 단축키
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
          key: data?.hotkeys?.[h.id] || h.key,
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
    if (e.key === 'Escape') {
      setEditingId(null)
      return
    }
    const encoded = encodeKeyEvent(e)
    // 고정 탭 단축키와 충돌 체크
    const fixedConflict = 고정탭단축키.find(h => h.key === encoded)
    if (fixedConflict) {
      message.warning(`"${fixedConflict.label}"에서 사용 중인 고정 단축키입니다.`)
      return
    }
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
    // 고정 탭 단축키도 포함
    고정탭단축키.forEach(h => { map[h.id] = h.key })
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
      title={<span><SettingOutlined /> 단축키 설정</span>}
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
      {/* 고정 탭 단축키 (Alt 기반, 변경 불가) */}
      <div style={{
        background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', marginBottom: 12,
      }}>
        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          Alt 탭 전환 (고정)
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {고정탭단축키.map(h => (
            <span key={h.id} style={{ fontSize: 12 }}>
              <Tag>{displayKey(h.key)}</Tag> {h.label}
            </span>
          ))}
        </div>
      </div>

      {/* 편집 가능한 단축키 */}
      <Table
        dataSource={hotkeys}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        scroll={{ y: 350 }}
      />
    </Modal>
  )
}
