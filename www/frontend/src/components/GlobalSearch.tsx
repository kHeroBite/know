import { useState, useCallback } from 'react'
import { AutoComplete, Input, Tag, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import 클라이언트 from '../api/client'

const { Text } = Typography

interface 검색결과 {
  word: string
  type: 'thesaurus' | 'udic' | 'cndic'
  detail?: string
}

const 타입라벨: Record<검색결과['type'], string> = {
  thesaurus: '유사어',
  udic: '도메인사전',
  cndic: '전문용어',
}

const 타입색상: Record<검색결과['type'], string> = {
  thesaurus: 'blue',
  udic: 'green',
  cndic: 'purple',
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [옵션목록, set옵션목록] = useState<{ value: string; label: React.ReactNode; data: 검색결과 }[]>([])
  const [로딩, set로딩] = useState(false)

  const 검색 = useCallback(async (q: string) => {
    if (!q.trim()) {
      set옵션목록([])
      return
    }
    set로딩(true)
    try {
      const res = await 클라이언트.get('/dictionary/search', { params: { q } })
      const results: 검색결과[] = res.data || []
      set옵션목록(results.map(item => ({
        value: item.word,
        data: item,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13 }}>{item.word}</Text>
            <Tag color={타입색상[item.type]} style={{ margin: 0, fontSize: 11 }}>
              {타입라벨[item.type]}
            </Tag>
          </div>
        ),
      })))
    } catch {
      set옵션목록([])
    } finally {
      set로딩(false)
    }
  }, [])

  const 선택처리 = (_value: string, option: { data: 검색결과 }) => {
    const { type } = option.data
    // 해당 사전 탭으로 이동
    const 경로맵: Record<검색결과['type'], string> = {
      thesaurus: '/dictionary?tab=thesaurus',
      udic: '/dictionary?tab=udic',
      cndic: '/dictionary?tab=cndic',
    }
    navigate(경로맵[type] || '/dictionary')
  }

  return (
    <AutoComplete
      options={옵션목록}
      onSearch={검색}
      onSelect={선택처리}
      style={{ width: 260 }}
      popupMatchSelectWidth={320}
    >
      <Input
        prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.3)' }} />}
        placeholder="사전 검색..."
        size="small"
        style={{ borderRadius: 6 }}
        suffix={로딩 ? <span style={{ fontSize: 10, color: '#999' }}>검색 중</span> : null}
      />
    </AutoComplete>
  )
}
