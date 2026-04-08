import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table, Typography, Input, Button, Form, Modal, Space, Tooltip, Switch, Popconfirm,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, EditOutlined, SwapOutlined,
} from '@ant-design/icons'
import { message } from 'antd'
import 클라이언트 from '../../api/client'

const { Text } = Typography

// ─── 사전 타입 ───────────────────────────────────────────────────

export type DicType = 'udic' | 'cndic' | 'thesaurus'

const 사전설정: Record<DicType, { title: string; label: string }> = {
  udic: { title: '사용자사전', label: '사용자사전(udic)' },
  cndic: { title: '복합명사사전', label: '복합명사사전(cndic)' },
  thesaurus: { title: '유사어사전', label: '유사어사전(thesaurus)' },
}

function 사전컬럼(dicType: DicType) {
  return (삭제버튼: (r: any) => React.ReactNode, 편집버튼?: (r: any) => React.ReactNode) => {
    if (dicType === 'thesaurus') {
      return [
        { title: '키워드', dataIndex: 'head_word', key: 'head_word', ellipsis: true },
        { title: '유사어', dataIndex: 'tail_word', key: 'tail_word', ellipsis: true },
        { title: '', key: 'action', width: 80, render: (_: unknown, r: any) => (
          <Space size={0}>
            {편집버튼?.(r)}
            {삭제버튼(r)}
          </Space>
        )},
      ]
    }
    return [
      { title: '단어', dataIndex: 'word', key: 'word', ellipsis: true },
      { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true },
      { title: '', key: 'action', width: 50, render: (_: unknown, r: any) => 삭제버튼(r) },
    ]
  }
}

export interface DicTabProps {
  dicType: DicType
  domain: string
  workspace?: string
  refreshKey?: number
  externalSearch?: string
  autoFocusTrigger?: number
  thesaurusExternalOpen?: { head_word: string; tail_word: string; n: number; editMode?: boolean } | null
  onModalClose?: () => void
}

export default function DicTab({
  dicType, domain, workspace, refreshKey, externalSearch, autoFocusTrigger,
  thesaurusExternalOpen, onModalClose,
}: DicTabProps) {
  // workspace가 있으면 모든 사전 API에 ?workspace= 추가하는 래퍼
  const wsParam = workspace ? { workspace } : {}
  const dicGet = (url: string, params?: any) => 클라이언트.get(url, { params: { ...params, ...wsParam } })
  const dicPost = (url: string, data?: any) => 클라이언트.post(url + (workspace ? `?workspace=${workspace}` : ''), data)
  const dicPut = (url: string, data?: any) => 클라이언트.put(url + (workspace ? `?workspace=${workspace}` : ''), data)
  const dicDel = (url: string) => 클라이언트.delete(url, { params: wsParam })
  const 컨테이너Ref = useRef<HTMLDivElement>(null)
  const [테이블높이, set테이블높이] = useState(160)
  const 검색입력Ref = useRef<any>(null)
  const [데이터, set데이터] = useState<any[]>([])
  const [검색어, set검색어] = useState('')
  const [검색쿼리, set검색쿼리] = useState('')
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [총건수, set총건수] = useState(0)
  const [현재페이지, set현재페이지] = useState(1)
  const [form] = Form.useForm()
  const cfg = 사전설정[dicType]

  // 유사어 통합 모달 상태 (등록/편집 공용)
  const [유사어모달열림, set유사어모달열림] = useState(false)
  const [유사어키워드, set유사어키워드] = useState('')
  const [유사어키워드확정, set유사어키워드확정] = useState(false)
  const [편집유사어목록, set편집유사어목록] = useState<string[]>([])
  const [새유사어, set새유사어] = useState('')
  const [신규추가항목, set신규추가항목] = useState<string[]>([])
  const 유사어목록Ref = useRef<HTMLDivElement>(null)
  const [양방향, set양방향] = useState(false)
  const [편집저장중, set편집저장중] = useState(false)

  const 데이터조회 = useCallback(async () => {
    if (domain === null || domain === undefined) return
    set로딩(true)
    try {
      const 경로 = dicType === 'thesaurus' ? 'thesaurus/list' : dicType
      const res = await dicGet(`/dictionaries/${domain}/${경로}`, {
        page: 현재페이지, size: 5, ...(검색쿼리 ? { search: 검색쿼리 } : {}),
      })
      set데이터(res.data?.items || [])
      set총건수(res.data?.total || 0)
    } catch {
      message.error(`${cfg.title} 조회 실패`)
    } finally {
      set로딩(false)
    }
  }, [domain, dicType, 현재페이지, 검색쿼리])

  useEffect(() => {
    const timer = setTimeout(() => { set검색쿼리(검색어); set현재페이지(1) }, 100)
    return () => clearTimeout(timer)
  }, [검색어])

  useEffect(() => { if (domain != null) 데이터조회() }, [domain, 데이터조회])

  // 컨테이너 높이 감지 → 테이블 스크롤 높이 자동 조절
  useEffect(() => {
    const el = 컨테이너Ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      // 검색바(~40) + 페이지네이션(~40) + 여유(8) 제외
      const h = el.clientHeight - 88
      set테이블높이(Math.max(80, h))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // refreshKey 변경 시 강제 리로드
  useEffect(() => {
    if (refreshKey && refreshKey > 0 && domain != null) 데이터조회()
  }, [refreshKey])

  // externalSearch: 외부에서 검색어 주입
  useEffect(() => {
    if (externalSearch !== undefined && externalSearch !== '') {
      set검색어(externalSearch)
    }
  }, [externalSearch])

  // autoFocusTrigger: 탭 전환 시 검색 입력 자동 포커스
  useEffect(() => {
    if (autoFocusTrigger && autoFocusTrigger > 0) {
      setTimeout(() => 검색입력Ref.current?.focus(), 50)
    }
  }, [autoFocusTrigger])

  // 외부 트리거: 추천 모달에서 선택 시 유사어 모달 열기
  useEffect(() => {
    if (thesaurusExternalOpen && dicType === 'thesaurus') {
      유사어모달열기(thesaurusExternalOpen)
    }
  }, [thesaurusExternalOpen?.n])

  const 삭제 = async (record: any) => {
    try {
      const word = dicType === 'thesaurus' ? record.head_word : record.word
      await dicDel(`/dictionaries/${domain}/${dicType}/${encodeURIComponent(word)}`)
      message.success('삭제 완료')
      데이터조회()
    } catch { message.error('삭제 실패') }
  }

  // tail_word 콤마 구분 문자열 → 개별 배열로 분리
  const 유사어분리 = (tailWord: string): string[] =>
    (tailWord || '').split(',').map(s => s.trim()).filter(Boolean)

  // 양방향 자동 감지: 모든 키워드가 양방향 pair로 존재하는지 확인
  const 양방향자동감지 = async (headWord: string, tailWords: string[]) => {
    if (tailWords.length === 0) { set양방향(false); return }
    try {
      const allWords = [headWord, ...tailWords]
      let isBidirectional = true
      for (const tw of tailWords) {
        const res = await dicGet(`/dictionaries/${domain}/thesaurus/list`, { search: tw, size: 100 })
        const matched = (res.data?.items || []).find((i: any) => i.head_word === tw)
        if (!matched) { isBidirectional = false; break }
        const existingTails = 유사어분리(matched.tail_word)
        const others = allWords.filter(w => w !== tw)
        if (!others.every(o => existingTails.includes(o))) { isBidirectional = false; break }
      }
      set양방향(isBidirectional)
    } catch { set양방향(false) }
  }

  // 유사어 모달 열기 (등록/편집 통합)
  const 유사어모달열기 = async (record?: any) => {
    set양방향(false)
    set새유사어('')
    set신규추가항목([])
    if (record && record.head_word) {
      const isEdit = record.editMode === true || !record.n  // 편집 모드 판정
      if (isEdit) {
        // 편집 모드: 기존 유사어 확정 로드
        set유사어키워드(record.head_word)
        set유사어키워드확정(true)
        try {
          const res = await dicGet(`/dictionaries/${domain}/thesaurus/list`, { search: record.head_word, size: 100 })
          const matched = (res.data?.items || []).find((i: any) => i.head_word === record.head_word)
          const tails = matched ? 유사어분리(matched.tail_word) : []
          // 양방향 감지: 추가 전 기존 목록 기준
          양방향자동감지(record.head_word, tails)
          // tail_word 추가 요청 — 단일 키워드만 추가 (쉼표 포함 원본 문자열 제외)
          if (record.tail_word && !record.tail_word.includes(',') && !tails.includes(record.tail_word)) {
            tails.push(record.tail_word)
            set신규추가항목([record.tail_word])
            setTimeout(() => 유사어목록Ref.current?.scrollTo({ top: 유사어목록Ref.current.scrollHeight, behavior: 'smooth' }), 100)
          }
          set편집유사어목록(tails)
        } catch {
          set편집유사어목록(record.tail_word ? [record.tail_word] : [])
        }
      } else {
        // 등록 모드: 키워드 pre-fill + 미확정
        set유사어키워드(record.head_word)
        set유사어키워드확정(false)
        set편집유사어목록([])
        if (record.tail_word) set새유사어(record.tail_word)
      }
    } else {
      // 등록 모드: 빈 상태
      set유사어키워드('')
      set유사어키워드확정(false)
      set편집유사어목록([])
    }
    set유사어모달열림(true)
  }

  // 키워드 확정 시 기존 유사어 로드
  const 유사어키워드확정하기 = async () => {
    const kw = 유사어키워드.trim()
    if (!kw) return
    set유사어키워드확정(true)
    try {
      const res = await dicGet(`/dictionaries/${domain}/thesaurus/list`, { search: kw, size: 100 })
      const matched = (res.data?.items || []).find((i: any) => i.head_word === kw)
      set편집유사어목록(matched ? 유사어분리(matched.tail_word) : [])
    } catch {
      set편집유사어목록([])
    }
  }

  // 로컬 상태만 변경 (DB 저장은 일괄저장에서)
  const 유사어개별삭제 = (tailWord: string) => {
    set편집유사어목록(prev => prev.filter(w => w !== tailWord))
  }

  const 유사어개별추가 = () => {
    const word = 새유사어.trim()
    if (!word) return
    if (편집유사어목록.includes(word)) {
      message.warning(`"${word}" 이미 등록됨`)
      return
    }
    const 새목록 = [...편집유사어목록, word]
    set편집유사어목록(새목록)
    set신규추가항목(prev => [...prev, word])
    set새유사어('')
    if (유사어키워드.trim()) 양방향자동감지(유사어키워드.trim(), 새목록)
    setTimeout(() => 유사어목록Ref.current?.scrollTo({ top: 유사어목록Ref.current.scrollHeight, behavior: 'smooth' }), 100)
  }

  // DB 일괄 저장
  const 유사어일괄저장 = async () => {
    const headWord = 유사어키워드.trim()
    if (!headWord) { message.warning('키워드를 입력하세요'); return }
    let currentList = [...편집유사어목록]
    const pendingWord = 새유사어.trim()
    if (pendingWord && !currentList.includes(pendingWord)) {
      currentList = [...currentList, pendingWord]
      set편집유사어목록(currentList)
      set신규추가항목(prev => [...prev, pendingWord])
      set새유사어('')
    }
    set편집저장중(true)
    try {
      if (currentList.length === 0) {
        try {
          await dicDel(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(headWord)}`)
        } catch { /* 미존재 무시 */ }
        message.success(`"${headWord}" 유사어 세트 삭제됨`)
      } else {
        try {
          await dicPut(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(headWord)}`, {
            tail_word: currentList.join(','),
          })
        } catch (e: any) {
          if (e?.response?.status === 404) {
            await dicPost(`/dictionaries/${domain}/thesaurus`, {
              head_word: headWord, tail_word: currentList.join(','), memo: '',
            })
          } else throw e
        }
        if (양방향) {
          for (const word of currentList) {
            try {
              const others = [headWord, ...currentList.filter(w => w !== word)]
              try {
                await dicPost(`/dictionaries/${domain}/thesaurus`, {
                  head_word: word, tail_word: others.join(','), memo: '',
                })
              } catch {
                await dicPut(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(word)}`, {
                  tail_word: others.join(','),
                })
              }
            } catch { /* 역방향 실패 무시 */ }
          }
        }
        message.success(`"${headWord}" 유사어 저장 완료${양방향 ? ' (양방향)' : ''}`)
      }
      데이터조회()
      set유사어모달열림(false)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '저장 실패')
    } finally { set편집저장중(false) }
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      set저장중(true)
      await dicPost(`/dictionaries/${domain}/${dicType}`, values)
      message.success('추가 완료')
      set모달열림(false)
      form.resetFields()
      데이터조회()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('추가 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally { set저장중(false) }
  }

  const 삭제버튼 = (record: any) => {
    if (dicType === 'thesaurus') {
      return (
        <Button size="small" icon={<DeleteOutlined />} danger type="text" onClick={() => {
          const headWord = record.head_word
          const tailWords = 유사어분리(record.tail_word)
          Modal.confirm({
            title: `"${headWord}" 유사어 삭제`,
            content: tailWords.length > 0
              ? '양방향으로 연결된 유사어도 모두 삭제하시겠습니까?'
              : '삭제하시겠습니까?',
            okText: tailWords.length > 0 ? '양방향 삭제' : '삭제',
            cancelText: tailWords.length > 0 ? '단방향만 삭제' : '취소',
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                await dicDel(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(headWord)}`)
                for (const tw of tailWords) {
                  try { await dicDel(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(tw)}`) } catch {}
                }
                message.success('양방향 삭제 완료')
                데이터조회()
              } catch { message.error('삭제 실패') }
            },
            onCancel: async () => {
              if (tailWords.length > 0) {
                try {
                  await dicDel(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(headWord)}`)
                  message.success('단방향 삭제 완료')
                  데이터조회()
                } catch { message.error('삭제 실패') }
              }
            },
          })
        }} />
      )
    }
    return (
      <Popconfirm title="삭제?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
        <Button size="small" icon={<DeleteOutlined />} danger type="text" />
      </Popconfirm>
    )
  }

  const 편집버튼렌더 = dicType === 'thesaurus' ? (record: any) => (
    <Tooltip title="편집">
      <Button size="small" icon={<EditOutlined />} type="text" onClick={() => 유사어모달열기(record)} />
    </Tooltip>
  ) : undefined

  const columns = 사전컬럼(dicType)(삭제버튼, 편집버튼렌더)

  const 모달폼내용 = () => {
    if (dicType === 'thesaurus') {
      return (<>
        <Form.Item name="head_word" label="키워드" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="tail_word" label="유사어" rules={[{ required: true }]}><Input /></Form.Item>
      </>)
    }
    return (<>
      <Form.Item name="word" label="단어" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="memo" label="메모"><Input /></Form.Item>
    </>)
  }

  return (
    <div ref={컨테이너Ref} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
        <Input
          ref={검색입력Ref}
          placeholder="검색..." value={검색어} onChange={e => set검색어(e.target.value)}
          allowClear size="small" prefix={<SearchOutlined />} style={{ width: 200 }}
        />
        <Button size="small" type="primary" icon={<PlusOutlined />}
          onClick={() => {
            const kw = 검색어.trim()
            if (kw) {
              const cfg = { udic: '사용자사전', cndic: '복합명사사전', thesaurus: '유사어사전', category: '카테고리' } as any
              if (dicType === 'thesaurus') {
                Modal.confirm({
                  title: `"${kw}" 키워드를 ${cfg[dicType]}에 등록하시겠습니까?`,
                  okText: '확인', cancelText: '취소',
                  onOk: () => { 유사어모달열기({ head_word: kw, tail_word: '', n: Date.now() }) },
                })
              } else {
                Modal.confirm({
                  title: `"${kw}" 키워드를 ${cfg[dicType]}에 등록하시겠습니까?`,
                  okText: '확인', cancelText: '취소',
                  onOk: async () => {
                    try {
                      await dicPost(`/dictionaries/${domain}/${dicType}`, { word: kw, memo: '' })
                      message.success(`"${kw}" 등록 완료`)
                      데이터조회()
                    } catch (e: any) {
                      message.error(e?.response?.data?.detail || '등록 실패')
                    }
                  },
                })
              }
            } else {
              if (dicType === 'thesaurus') { 유사어모달열기() }
              else { form.resetFields(); set모달열림(true) }
            }
          }}>추가</Button>
      </div>
      <Table
        dataSource={데이터} columns={columns}
        rowKey={dicType === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'}
        loading={로딩} size="small" scroll={{ y: 테이블높이 }}
        pagination={{
          current: 현재페이지, pageSize: 5, total: 총건수,
          showTotal: (total) => `총 ${total.toLocaleString()}건`,
          showSizeChanger: false, size: 'small',
          onChange: (page) => set현재페이지(page),
        }}
      />
      {/* udic/cndic 등록 모달 */}
      {dicType !== 'thesaurus' && (
        <Modal title={`${cfg.label} 추가`} open={모달열림} onOk={저장}
          onCancel={() => set모달열림(false)} confirmLoading={저장중} okText="저장" cancelText="취소">
          <Form form={form} layout="vertical">{모달폼내용()}</Form>
        </Modal>
      )}

      {/* 유사어 통합 모달 (등록/편집 공용) */}
      {dicType === 'thesaurus' && (
        <Modal
          title={유사어키워드확정 ? `유사어 편집: ${유사어키워드}` : '유사어 등록/편집'}
          open={유사어모달열림}
          onCancel={() => set유사어모달열림(false)}
          afterClose={() => setTimeout(() => onModalClose?.(), 50)}
          zIndex={1060}
          footer={<Space><Button onClick={() => set유사어모달열림(false)}>닫기</Button><Button type="primary" loading={편집저장중} onClick={유사어일괄저장}>저장</Button></Space>}
          width={420}
        >
          {/* 키워드 입력 (등록 모드: 편집 가능, 편집 모드: 고정) */}
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>키워드</Text>
            {!유사어키워드확정 ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  placeholder="키워드를 입력하세요"
                  value={유사어키워드}
                  onChange={e => set유사어키워드(e.target.value)}
                  onPressEnter={유사어키워드확정하기}
                  size="small"
                  style={{ flex: 1 }}
                  autoFocus
                />
                <Button size="small" type="primary" onClick={유사어키워드확정하기}
                  disabled={!유사어키워드.trim()}>확인</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: 600 }}>{유사어키워드}</Text>
                <Button size="small" type="link" onClick={() => set유사어키워드확정(false)}>변경</Button>
              </div>
            )}
          </div>
          {true && (
            <>
              {/* 등록된 유사어 목록 */}
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  등록된 유사어 ({편집유사어목록.length}건):
                </Text>
                <div ref={유사어목록Ref} style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 4 }}>
                  {편집유사어목록.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center' }}>
                      <Text type="secondary">등록된 유사어가 없습니다.</Text>
                    </div>
                  ) : 편집유사어목록.map(w => (
                    <div key={w} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '4px 8px', borderBottom: '1px solid #f0f0f0',
                      background: 신규추가항목.includes(w) ? '#FFF9C4' : undefined,
                      transition: 'background 0.3s',
                    }}>
                      <span style={{ fontSize: 13 }}>{w}</span>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />}
                        onClick={() => 유사어개별삭제(w)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* 새 유사어 추가 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <Input
                  placeholder="새 유사어 입력"
                  value={새유사어}
                  onChange={e => set새유사어(e.target.value)}
                  onPressEnter={유사어개별추가}
                  size="small"
                  style={{ flex: 1 }}
                  autoFocus
                />
                <Button size="small" type="primary" onClick={유사어개별추가}>추가</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch size="small" checked={양방향} onChange={set양방향} />
                <Text style={{ fontSize: 12 }}>
                  {양방향 ? (
                    <><SwapOutlined /> 양방향 (A↔B 모두 등록)</>
                  ) : (
                    <>단방향 (A→B만 등록)</>
                  )}
                </Text>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
