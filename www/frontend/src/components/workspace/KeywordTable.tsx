import React, { useRef, useEffect } from 'react'
import { Card, Input, Spin, Checkbox } from 'antd'

export interface KeywordItem {
  id: number
  keyword: string
  line_num?: number
  flag?: string | null
  status?: string
  analysis?: string | null
  full_analysis?: string | null
}

export interface KeywordTableProps {
  items: KeywordItem[]
  loading: boolean
  loadingMore: boolean
  loadingPrev: boolean
  selected: KeywordItem | null
  workedCount: number
  totalCount: number
  키워드필터: string
  onFilterChange: (value: string) => void
  onSelect: (item: KeywordItem) => void
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  /** 검색 입력 ref (외부 핫키용) */
  searchRef?: React.Ref<HTMLInputElement>
  /** 체크박스 선택 관련 */
  selectedKeys?: number[]
  onSelectionChange?: (keys: number[]) => void
}

/**
 * 좌측 키워드 목록 패널
 * - 검색 필터
 * - 무한스크롤 (위/아래)
 * - 선택 하이라이트 (flag: W=핑크, R=노랑)
 * - 체크박스 다중 선택 (일괄 작업용)
 */
export default function KeywordTable({
  items,
  loading,
  loadingMore,
  loadingPrev,
  selected,
  workedCount,
  totalCount,
  키워드필터,
  onFilterChange,
  onSelect,
  onScroll,
  searchRef,
  selectedKeys = [],
  onSelectionChange,
}: KeywordTableProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})

  const filteredItems = 키워드필터
    ? items.filter(r => r.keyword.includes(키워드필터))
    : items

  const filteredIds = filteredItems.map(i => i.id)
  const allChecked = filteredIds.length > 0 && filteredIds.every(id => selectedKeys.includes(id))
  const indeterminate = filteredIds.some(id => selectedKeys.includes(id)) && !allChecked

  const toggleItem = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onSelectionChange) return
    if (selectedKeys.includes(id)) {
      onSelectionChange(selectedKeys.filter(k => k !== id))
    } else {
      onSelectionChange([...selectedKeys, id])
    }
  }

  const toggleAll = () => {
    if (!onSelectionChange) return
    if (allChecked) {
      onSelectionChange(selectedKeys.filter(k => !filteredIds.includes(k)))
    } else {
      const merged = [...new Set([...selectedKeys, ...filteredIds])]
      onSelectionChange(merged)
    }
  }

  // 선택 키워드 자동 중앙 스크롤
  useEffect(() => {
    if (selected) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          itemRefs.current[selected.id]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }, 100)
      })
    }
  }, [selected, 키워드필터])

  return (
    <Card
      title={`작업키워드(${workedCount}/${totalCount})`}
      size="small"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
    >
      <div style={{ padding: '4px 8px', flexShrink: 0 }}>
        <Input
          ref={searchRef as any}
          placeholder="키워드 검색..."
          value={키워드필터}
          onChange={e => onFilterChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onFilterChange('')
              ;(e.target as HTMLElement).blur()
            }
          }}
          allowClear
          size="small"
          style={{ width: '100%' }}
        />
      </div>
      {onSelectionChange && (
        <div style={{ padding: '2px 8px', flexShrink: 0, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox
            checked={allChecked}
            indeterminate={indeterminate}
            onChange={toggleAll}
          >
            <span style={{ fontSize: 11, color: '#666' }}>
              전체 선택
              {selectedKeys.length > 0 && ` (${selectedKeys.length}개 선택됨)`}
            </span>
          </Checkbox>
        </div>
      )}
      <div
        ref={listRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {loadingPrev && (
          <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
        ) : filteredItems.map((record) => (
          <div
            key={record.id}
            ref={(el) => { itemRefs.current[record.id] = el }}
            onClick={(e) => { e.stopPropagation(); onSelect(record) }}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              background: record.flag === 'W' ? '#FCE4EC' : record.flag === 'R' ? '#FFF9C4' : 'white',
              boxShadow: selected?.id === record.id ? 'inset 0 0 0 1px #000' : undefined,
              borderBottom: selected?.id === record.id ? undefined : '1px solid #f0f0f0',
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: selected?.id === record.id ? 600 : 'normal',
              color: record.status === 'completed' ? '#999' : '#333',
            }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {onSelectionChange && (
                <span onClick={(e) => toggleItem(record.id, e)} style={{ flexShrink: 0 }}>
                  <Checkbox checked={selectedKeys.includes(record.id)} onChange={() => {}} />
                </span>
              )}
              <span style={{ width: 28, flexShrink: 0, textAlign: 'right', color: '#999', fontSize: 12 }}>
                {record.line_num}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {record.keyword}
              </span>
            </div>
          </div>
        ))}
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
        )}
      </div>
    </Card>
  )
}
