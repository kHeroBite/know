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
  { id: 'focusKeywordSearch', label: '키워드 검색', key: 'q' },
  { id: 'analyzeKeyword', label: '키워드분석', key: 'e' },
  { id: 'aiAnalysis', label: 'AI분석', key: 'r' },
  { id: 'registerUdic', label: '사용자사전 등록', key: 'a' },
  { id: 'registerCndic', label: '복합명사 등록', key: 's' },
  { id: 'registerThesaurus', label: '유사어 등록', key: 'd' },
  { id: 'prevAnalysis', label: '← 이전 워드', key: 'ArrowLeft' },
  { id: 'nextAnalysis', label: '→ 다음 워드', key: 'ArrowRight' },
  { id: 'prevLine', label: '↑ 윗줄 이동', key: 'ArrowUp' },
  { id: 'nextLine', label: '↓ 아랫줄 이동', key: 'ArrowDown' },
  { id: 'focusAnalysisSimple', label: '분석결과>심플', key: 'Home' },
  { id: 'focusAnalysisFull', label: '분석결과>풀', key: 'End' },
  { id: 'toggleAnalysisTab', label: '심플↔풀 전환', key: 'Tab' },
  { id: 'undoHistory', label: '작업취소', key: 'Escape' },
  { id: 'prevKeyword', label: '이전 키워드', key: 'Alt+ArrowUp' },
  { id: 'nextKeyword', label: '다음 키워드', key: 'Alt+ArrowDown' },
  { id: 'aiTabAI', label: 'AI분석>AI', key: 'PageUp' },
  { id: 'aiTabWikipedia', label: 'AI분석>Wikipedia', key: 'PageDown' },
  { id: 'thesaurusLlm', label: '유사어추천>AI분석', key: '.' },
]

// 고정 단축키 설명서
const 고정단축키설명 = [
  { category: '탐색', items: [
    { label: 'Alt+↑ / Alt+↓', desc: '이전/다음 키워드 이동' },
    { label: 'Alt+← / Alt+→', desc: '현재 줄의 첫/끝 워드로 이동' },
  ]},
  { category: '사전탭', items: [
    { label: 'Alt+{등록키}', desc: '해당 사전탭 열기 (등록키 변경 시 자동 반영)' },
  ]},
]

const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home', End: 'End', Tab: 'Tab', PageUp: 'PgUp', PageDown: 'PgDn',
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
  const [helpOpen, setHelpOpen] = useState(false)

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
      {/* 편집 가능한 단축키 */}
      <Table
        dataSource={hotkeys}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        scroll={{ y: 340 }}
      />

      {/* 고정 단축키 설명서 (토글) */}
      <div style={{ marginTop: 8 }}>
        <div
          onClick={() => setHelpOpen(!helpOpen)}
          style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', background: '#fafafa', borderRadius: 6,
            border: '1px solid #f0f0f0', userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 10, color: '#999', transition: 'transform 0.2s', transform: helpOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
          <Text style={{ fontSize: 11, fontWeight: 500, color: '#666' }}>고정 단축키 안내</Text>
        </div>
        {helpOpen && (
          <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: '0 0 6px 6px', borderTop: 0, border: '1px solid #f0f0f0', borderTopColor: 'transparent' }}>
            {고정단축키설명.map((group, gi) => (
              <div key={gi} style={{ marginBottom: gi < 고정단축키설명.length - 1 ? 8 : 0 }}>
                <Text style={{ fontSize: 10, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{group.category}</Text>
                {group.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
                    <Text style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: 11 }}>{item.label}</Text>
                    <Text type="secondary">{item.desc}</Text>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
