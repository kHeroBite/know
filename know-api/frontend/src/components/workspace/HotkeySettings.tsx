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

// 편집 가능한 단축키
const 기본핫키: HotkeyConfig[] = [
  { id: 'prevAnalysis', label: '← 이전 워드', key: 'ArrowLeft' },
  { id: 'nextAnalysis', label: '→ 다음 워드', key: 'ArrowRight' },
  { id: 'registerUdic', label: '사용자사전 등록', key: '1' },
  { id: 'registerCndic', label: '복합명사 등록', key: '2' },
  { id: 'registerThesaurus', label: '유사어 등록', key: '3' },
  { id: 'analyzeKeyword', label: '키워드분석', key: '0' },
  { id: 'focusAnalysis', label: '분석결과 포커스', key: 'Home' },
  { id: 'aiAnalysis', label: 'AI분석', key: '/' },
  { id: 'undoHistory', label: '작업취소', key: 'Escape' },
  { id: 'aiTabAI', label: 'AI분석>AI', key: 'PageUp' },
  { id: 'aiTabWikipedia', label: 'AI분석>Wikipedia', key: 'PageDown' },
  { id: 'thesaurusLlm', label: '유사어추천>AI분석', key: '.' },
  { id: 'prevKeyword', label: 'Alt+↑ 이전 키워드', key: 'Alt+ArrowUp' },
  { id: 'nextKeyword', label: 'Alt+↓ 다음 키워드', key: 'Alt+ArrowDown' },
]

// 고정 단축키 (설정 불가, 설명만 표시)
const 고정단축키 = [
  { label: '↑ 윗줄 이동', desc: '분석결과 내 윗줄 워드로 이동 (첫줄→이전키워드 마지막줄)' },
  { label: '↓ 아랫줄 이동', desc: '분석결과 내 아랫줄 워드로 이동 (마지막줄→다음키워드)' },
  { label: 'Alt+← 줄 첫 워드', desc: '현재 줄의 첫 번째 워드로 이동' },
  { label: 'Alt+→ 줄 끝 워드', desc: '현재 줄의 마지막 워드로 이동' },
]

const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home', PageUp: 'PgUp', PageDown: 'PgDn',
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
      {/* 탭 전환 안내 */}
      <div style={{
        background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', marginBottom: 12,
      }}>
        <Text style={{ fontSize: 12 }}>
          Alt+{'{등록키}'} = 해당 사전탭 열기 (등록키 변경 시 자동 반영)
        </Text>
      </div>

      {/* 편집 가능한 단축키 */}
      <Table
        dataSource={hotkeys}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        scroll={{ y: 280 }}
      />

      {/* 고정 단축키 안내 */}
      <div style={{ marginTop: 12, background: '#fafafa', borderRadius: 6, padding: '8px 12px' }}>
        <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>방향키 (고정)</Text>
        {고정단축키.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
            <Text style={{ fontWeight: 500 }}>{item.label}</Text>
            <Text type="secondary">{item.desc}</Text>
          </div>
        ))}
      </div>
    </Modal>
  )
}
