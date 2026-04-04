import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Typography, Card, Tabs, Input, Button, Form, Modal, Dropdown,
  Popconfirm, message, Spin, Switch, Tag, Space, Tooltip, Divider,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, SettingOutlined, EditOutlined,
  SwapOutlined, CheckCircleOutlined, LinkOutlined,
} from '@ant-design/icons'
import { assignmentApi, KeywordItem } from '../api/assignment'
import { workspaceAPI } from '../api/workspace'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import 클라이언트 from '../api/client'
import AIAnalysis from '../components/workspace/AIAnalysis'
import WorkHistory, { WorkHistoryRef, WorkHistoryItem } from '../components/workspace/WorkHistory'
import HotkeySettings from '../components/workspace/HotkeySettings'

const { Text, Title } = Typography
const PAGE_SIZE = 100

// ─── 핫키 기본값 ────────────────────────────────────────────────

const 기본핫키맵: Record<string, string> = {
  prevKeyword: 'Alt+ArrowUp',
  nextKeyword: 'Alt+ArrowDown',
  prevAnalysis: 'ArrowLeft',
  nextAnalysis: 'ArrowRight',
  registerUdic: '1',
  registerCndic: '2',
  registerThesaurus: '3',
  analyzeKeyword: '0',
  focusAnalysis: 'Home',
  aiAnalysis: '/',
  undoHistory: 'Escape',
  aiTabAI: 'PageUp',
  aiTabWikipedia: 'PageDown',
  thesaurusLlm: '.',
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

// ─── 한↔영 키보드 변환 (오타추천용) ─────────────────────────────
const KO_MAP = 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ'
const EN_MAP = 'qwertyuiopasdfghjklzxcvbnm'
const KO_SHIFT = 'ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ'
const EN_SHIFT = 'QWERTYUIOPASDFGHJKLZXCVBNM'

function koToEn(text: string): string {
  // 한글 자모 → 영문 키보드
  const 초성 = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
  const 중성 = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
  const 종성 = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
  const 종성분해: Record<string, string[]> = {
    'ㄳ':['ㄱ','ㅅ'],'ㄵ':['ㄴ','ㅈ'],'ㄶ':['ㄴ','ㅎ'],'ㄺ':['ㄹ','ㄱ'],'ㄻ':['ㄹ','ㅁ'],
    'ㄼ':['ㄹ','ㅂ'],'ㄽ':['ㄹ','ㅅ'],'ㄾ':['ㄹ','ㅌ'],'ㄿ':['ㄹ','ㅍ'],'ㅀ':['ㄹ','ㅎ'],
    'ㅄ':['ㅂ','ㅅ'],'ㄲ':['ㄱ','ㄱ'],'ㅆ':['ㅅ','ㅅ']
  }
  const 중성분해: Record<string, string[]> = {
    'ㅘ':['ㅗ','ㅏ'],'ㅙ':['ㅗ','ㅐ'],'ㅚ':['ㅗ','ㅣ'],'ㅝ':['ㅜ','ㅓ'],'ㅞ':['ㅜ','ㅔ'],
    'ㅟ':['ㅜ','ㅣ'],'ㅢ':['ㅡ','ㅣ'],'ㅒ':['ㅑ','ㅣ'],'ㅖ':['ㅕ','ㅣ']
  }
  const jamoToEn = (c: string): string => {
    let i = KO_MAP.indexOf(c)
    if (i >= 0) return EN_MAP[i] || c
    i = KO_SHIFT.indexOf(c)
    if (i >= 0) return EN_SHIFT[i] || c
    return c
  }
  let result = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const offset = code - 0xAC00
      const cho = Math.floor(offset / (21 * 28))
      const jung = Math.floor((offset % (21 * 28)) / 28)
      const jong = offset % 28
      result += jamoToEn(초성[cho])
      const jungChar = 중성[jung]
      if (중성분해[jungChar]) 중성분해[jungChar].forEach(j => result += jamoToEn(j))
      else result += jamoToEn(jungChar)
      if (jong > 0) {
        const jongChar = 종성[jong]
        if (종성분해[jongChar]) 종성분해[jongChar].forEach(j => result += jamoToEn(j))
        else result += jamoToEn(jongChar)
      }
    } else {
      const ki = KO_MAP.indexOf(ch)
      if (ki >= 0) result += EN_MAP[ki] || ch
      else result += ch
    }
  }
  return result
}

function enToKo(text: string): string {
  // 영문 키보드 → 한글 자모 (조합 없이 자모 나열)
  let result = ''
  for (const ch of text) {
    const lower = ch.toLowerCase()
    const i = EN_MAP.indexOf(lower)
    if (i >= 0) result += (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) ? (KO_SHIFT[i] || KO_MAP[i]) : KO_MAP[i]
    else result += ch
  }
  return result
}

function getTypoVariants(keyword: string): { label: string; value: string }[] {
  if (!keyword) return []
  const results: { label: string; value: string }[] = []
  const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(keyword)
  const hasEnglish = /[a-zA-Z]/.test(keyword)
  if (hasKorean) results.push({ label: '한→영', value: koToEn(keyword) })
  if (hasEnglish) results.push({ label: '영→한', value: enToKo(keyword) })
  return results
}

// ─── 분석결과 토큰 파싱 ─────────────────────────────────────────

interface Token {
  text: string
  index: number
  lineBreak?: boolean
}

function parseAnalysisText(text: string): Token[] {
  if (!text) return []
  const tokens: Token[] = []
  let idx = 0
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const words = line.split(/\s+/).filter(Boolean)
    words.forEach(w => {
      // <<, >> 를 별도 토큰으로 분리 (표시는 그대로, 네비게이션 시 스킵)
      const parts = w.split(/(<<|>>|,)/).filter(Boolean)
      parts.forEach(part => {
        tokens.push({ text: part, index: idx })
        idx++
      })
    })
    if (li < lines.length - 1) {
      tokens.push({ text: '\n', index: -1, lineBreak: true })
    }
  })
  return tokens
}

// ─── 토큰 필터 + 핫키 표시 ──────────────────────────────────────
const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home',
}
function displayKey(key: string): string {
  if (key.includes('+')) {
    return key.split('+').map(p => keyDisplayMap[p] || p).join('+')
  }
  return keyDisplayMap[key] || key
}
function isWordToken(text: string): boolean {
  return /[가-힣a-zA-Z]/.test(text)
}
function isNavigableToken(toks: Token[], idx: number): boolean {
  const t = toks[idx]
  if (!isWordToken(t.text)) return false
  if (t.text === 'comp' && toks[idx + 1]?.text === ':') return false
  // 동일 텍스트의 첫 번째 토큰만 네비게이션 가능 (중복 skip)
  for (let i = 0; i < idx; i++) {
    if (toks[i].text === t.text && isWordToken(toks[i].text)) return false
  }
  return true
}
function displayTabKey(key: string): string {
  return key.replace(/^Alt\+/, '')
}
const KbdKey = ({ children }: { children: React.ReactNode }) => {
  const [pressed, setPressed] = useState(false)
  return (
    <kbd
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: 'inline-block', padding: '1px 6px', fontSize: '11px', lineHeight: '1.4',
        color: '#444',
        background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)',
        border: '1px solid #adb5bd',
        borderBottom: pressed ? '1px solid #adb5bd' : '3px solid #adb5bd',
        borderRadius: 4,
        boxShadow: pressed
          ? '0 0px 1px rgba(0,0,0,0.1)'
          : '0 1px 0 rgba(0,0,0,0.2), 0 2px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)',
        textShadow: '0 1px 0 rgba(255,255,255,0.8)',
        fontFamily: 'monospace', whiteSpace: 'nowrap',
        cursor: 'default',
        transform: pressed ? 'translateY(1px)' : 'none',
        transition: 'transform 0.05s, box-shadow 0.05s',
        userSelect: 'none' as React.CSSProperties['userSelect'],
      }}
    >{children}</kbd>
  )
}

// ─── 사전 컴포넌트 (DomainManage.tsx DicColumn 패턴 재사용) ────────

type DicType = 'udic' | 'cndic' | 'thesaurus'

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

function DicTab({ dicType, domain, refreshKey, externalSearch, autoFocusTrigger, thesaurusExternalOpen, onModalClose }: {
  dicType: DicType; domain: string; refreshKey?: number; externalSearch?: string; autoFocusTrigger?: number
  thesaurusExternalOpen?: { head_word: string; tail_word: string; n: number; editMode?: boolean } | null
  onModalClose?: () => void
}) {
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
    if (!domain) return
    set로딩(true)
    try {
      const 경로 = dicType === 'thesaurus' ? 'thesaurus/list' : dicType
      const res = await 클라이언트.get(`/dictionaries/${domain}/${경로}`, {
        params: { page: 현재페이지, size: 5, ...(검색쿼리 ? { search: 검색쿼리 } : {}) },
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

  useEffect(() => { if (domain) 데이터조회() }, [domain, 데이터조회])

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
    if (refreshKey && refreshKey > 0 && domain) 데이터조회()
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
      await 클라이언트.delete(`/dictionaries/${domain}/${dicType}/${encodeURIComponent(word)}`)
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
        const res = await 클라이언트.get(`/dictionaries/${domain}/thesaurus/list`, {
          params: { search: tw, size: 100 },
        })
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
  // record.editMode=true → 편집모드 (기존 유사어 로드), false/undefined → 등록모드 (tail_word pre-fill)
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
          const res = await 클라이언트.get(`/dictionaries/${domain}/thesaurus/list`, {
            params: { search: record.head_word, size: 100 },
          })
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
      const res = await 클라이언트.get(`/dictionaries/${domain}/thesaurus/list`, {
        params: { search: kw, size: 100 },
      })
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
    // 추가 후 양방향 state 업데이트 (비동기, 추가 자체는 이미 진행됨)
    if (유사어키워드.trim()) 양방향자동감지(유사어키워드.trim(), 새목록)
    setTimeout(() => 유사어목록Ref.current?.scrollTo({ top: 유사어목록Ref.current.scrollHeight, behavior: 'smooth' }), 100)
  }

  // DB 일괄 저장
  const 유사어일괄저장 = async () => {
    const headWord = 유사어키워드.trim()
    if (!headWord) { message.warning('키워드를 입력하세요'); return }
    // 새유사어 입력란에 텍스트가 있으면 먼저 목록에 추가 후 저장
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
        // 값이 모두 삭제됨 → 키(head)도 삭제
        try {
          await 클라이언트.delete(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(headWord)}`)
        } catch { /* 미존재 무시 */ }
        message.success(`"${headWord}" 유사어 세트 삭제됨`)
      } else {
        // PUT 우선 시도 (기존 항목 갱신), 404면 POST (신규 등록)
        try {
          await 클라이언트.put(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(headWord)}`, {
            tail_word: currentList.join(','),
          })
        } catch (e: any) {
          if (e?.response?.status === 404) {
            await 클라이언트.post(`/dictionaries/${domain}/thesaurus`, {
              head_word: headWord, tail_word: currentList.join(','), memo: '',
            })
          } else throw e
        }
        // 양방향 처리
        if (양방향) {
          for (const word of currentList) {
            try {
              const others = [headWord, ...currentList.filter(w => w !== word)]
              try {
                await 클라이언트.post(`/dictionaries/${domain}/thesaurus`, {
                  head_word: word, tail_word: others.join(','), memo: '',
                })
              } catch {
                await 클라이언트.put(`/dictionaries/${domain}/thesaurus/${encodeURIComponent(word)}`, {
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
      await 클라이언트.post(`/dictionaries/${domain}/${dicType}`, values)
      message.success('추가 완료')
      set모달열림(false)
      form.resetFields()
      데이터조회()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('추가 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally { set저장중(false) }
  }

  const 삭제버튼 = (record: any) => (
    <Popconfirm title="삭제?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
      <Button size="small" icon={<DeleteOutlined />} danger type="text" />
    </Popconfirm>
  )

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
            if (dicType === 'thesaurus') { 유사어모달열기() }
            else { form.resetFields(); set모달열림(true) }
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

// ─── 형태소분석 탭 ───────────────────────────────────────────────

function MorphemeTab({ domain, prefillKeyword, prefillTrigger, autoFocusTrigger }: {
  domain: string; prefillKeyword?: string; prefillTrigger?: number; autoFocusTrigger?: number
}) {
  const [keyword, setKeyword] = useState('')
  const morphInputRef = useRef<any>(null)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const 분석실행 = async (value: string) => {
    const kw = value.trim()
    if (!kw) return
    setLoading(true)
    try {
      const { data } = await 클라이언트.post('/morpheme/analyze', { keyword: kw, domain })
      setResult(data.result || '결과 없음')
    } catch {
      message.error('형태소분석 실패')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // 외부에서 키워드 주입 + 자동 분석
  useEffect(() => {
    if (prefillTrigger && prefillTrigger > 0 && prefillKeyword) {
      setKeyword(prefillKeyword)
      분석실행(prefillKeyword)
    }
  }, [prefillTrigger])

  // autoFocusTrigger: 탭 전환 시 입력 자동 포커스
  useEffect(() => {
    if (autoFocusTrigger && autoFocusTrigger > 0) {
      setTimeout(() => morphInputRef.current?.focus(), 50)
    }
  }, [autoFocusTrigger])

  return (
    <div>
      <Input.Search
        ref={morphInputRef}
        enterButton="분석"
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        onSearch={분석실행}
        loading={loading}
        style={{ maxWidth: 400, marginBottom: 12 }}
      />
      {result !== null && (
        <pre style={{
          maxHeight: 260, overflow: 'auto', padding: 12,
          background: '#f5f5f5', borderRadius: 6, fontSize: 13,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {result}
        </pre>
      )}
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────

const 기본추천프롬프트 = `[필수] 반드시 한국어로 응답하라. 영어 설명/사고과정 절대 금지.

키워드: {keyword}

이 키워드의 유사어를 콤마로 구분하여 단어만 나열하라.
한영변환, 동의어, 유의어, 관련어, 오타변형을 포함하여 최대 20개.
설명/번호/카테고리/사고과정 출력 절대 금지. 단어,단어,단어 형식만 허용.

예시입력: 나이키
예시출력: nike, 나이크, 나이커, nikey, 운동화, 스포츠브랜드, 나이끼
/no_think`

export default function KnowledgeWork() {
  const navigate = useNavigate()
  const { selectedWorkspace, selectedDomain, selectedColor, setAssigned } = useWorkspaceStore()
  const user = useAuthStore(s => s.user)

  // 키워드 목록
  const [items, setItems] = useState<KeywordItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [키워드필터, set키워드필터] = useState('')
  const [minPage, setMinPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const [selected, setSelected] = useState<KeywordItem | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<{[key: number]: HTMLDivElement | null}>({})

  // 포커스/토큰
  const [isCenterFocused, setIsCenterFocused] = useState(false)
  const [컨텍스트메뉴, set컨텍스트메뉴] = useState<{ open: boolean; x: number; y: number; word: string; tokenIdx: number; ts: number }>({ open: false, x: 0, y: 0, word: '', tokenIdx: -1, ts: 0 })
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(-1)

  // 핫키
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(기본핫키맵)
  const [hotkeyModalOpen, setHotkeyModalOpen] = useState(false)

  // 하단 탭
  const [activeTab, setActiveTab] = useState('morpheme')
  const [dicRefreshKey, setDicRefreshKey] = useState(0)
  const [thesaurusSearch, setThesaurusSearch] = useState('')
  const [udicSearch, setUdicSearch] = useState('')
  const [cndicSearch, setCndicSearch] = useState('')
  const [morphPrefillKw, setMorphPrefillKw] = useState('')
  const [morphTrigger, setMorphTrigger] = useState(0)
  const [udicFocusTrigger, setUdicFocusTrigger] = useState(0)
  const [cndicFocusTrigger, setCndicFocusTrigger] = useState(0)
  const [thesaurusFocusTrigger, setThesaurusFocusTrigger] = useState(0)
  const [morphFocusTrigger, setMorphFocusTrigger] = useState(0)
  const [escKeyword, setEscKeyword] = useState<string | null>(null)
  const [escCount, setEscCount] = useState<number>(0)

  // 추천 모달
  const [추천모달열림, set추천모달열림] = useState(false)
  const [추천포커스, set추천포커스] = useState<{ section: number; item: number }>({ section: 0, item: 0 })
  const [추천키워드, set추천키워드] = useState('')
  const [추천결과, set추천결과] = useState<any[]>([])
  const [등록키워드셋, set등록키워드셋] = useState<any[]>([])
  // 이미 유사어에 등록된 키워드 Set (head + 모든 tail 포함)
  const 등록키워드Set = useMemo(() => {
    const s = new Set<string>()
    등록키워드셋.forEach((item: any) => {
      if (item.head_word) s.add(item.head_word)
      if (item.tail_word) item.tail_word.split(',').forEach((t: string) => { const v = t.trim(); if (v) s.add(v) })
    })
    return s
  }, [등록키워드셋])
  const [추천로딩, set추천로딩] = useState(false)
  const [llm결과, setLlm결과] = useState<any[]>([])
  const [llm모델별결과, setLlm모델별결과] = useState<any[]>([])
  const [llm로딩, setLlm로딩] = useState(false)
  const [llm프롬프트, setLlm프롬프트] = useState(기본추천프롬프트)
  const [프롬프트접힘, set프롬프트접힘] = useState(true)
  const [추천프롬프트모달, set추천프롬프트모달] = useState(false)
  // DB에서 공유 프롬프트 로드
  useEffect(() => {
    클라이언트.get('/llm-settings/thesaurus-prompt').then(({ data }) => {
      if (data.prompt) setLlm프롬프트(data.prompt)
    }).catch(() => {})
  }, [])
  const [thesaurusExternalOpen, setThesaurusExternalOpen] = useState<{ head_word: string; tail_word: string; n: number; editMode?: boolean } | null>(null)

  // AI분석
  const [aiKeyword, setAiKeyword] = useState('')
  const [aiForcedTab, setAiForcedTab] = useState<{ tab: string; n: number } | undefined>(undefined)

  // 작업완료 모달
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)

  // 키워드 카운트
  const [workedCount, setWorkedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // 작업이력
  const historyRef = useRef<WorkHistoryRef>(null)
  const selectLastTokenRef = useRef(false)
  const selectLastLineFirstRef = useRef(false)  // ↑로 이전 키워드: 마지막 줄의 첫 워드

  // ─── 키워드 목록 ────────────────────────────────────────────

  const 목록초기화 = useCallback(async () => {
    if (!selectedWorkspace || !selectedDomain || !user) return
    setLoading(true)
    try {
      // 1. 마지막 읽은 키워드 위치 조회
      let startPage = 1
      let targetKeywordId: number | null = null
      try {
        const { data: pos } = await assignmentApi.마지막읽은위치(selectedWorkspace, selectedDomain, PAGE_SIZE)
        if (pos.keyword_id) {
          startPage = pos.page
          targetKeywordId = pos.keyword_id
        }
      } catch { /* fallback to page 1 */ }

      // 2. 해당 페이지 로드
      const { data } = await assignmentApi.목록(
        selectedWorkspace, selectedDomain, 'assigned', startPage, PAGE_SIZE, user.user_id,
      )
      setItems(data.items || [])
      setTotal(data.total || 0)
      setWorkedCount(data.worked_count || 0)
      setTotalCount(data.total_count || data.total || 0)
      setMinPage(startPage)
      setMaxPage(startPage)

      // 3. 마지막 읽은 키워드 자동 선택
      const allItems = data.items || []
      let target = targetKeywordId
        ? allItems.find((i: KeywordItem) => i.id === targetKeywordId)
        : null
      if (!target) {
        const lastWorked = [...allItems].reverse().find((i: KeywordItem) => i.flag === 'W' || i.flag === 'R')
        target = lastWorked || allItems[0]
      }
      if (target) {
        setSelected(target)
        setIsCenterFocused(true)
        if (!target.flag) {
          assignmentApi.updateFlag(target.id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === target!.id ? { ...i, flag: 'R' } : i))
        }
      }
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, user])

  const 다음페이지로드 = useCallback(async () => {
    if (loadingMore || loading) return
    if (items.length >= total) return
    const nextPage = maxPage + 1
    setLoadingMore(true)
    try {
      const { data } = await assignmentApi.목록(
        selectedWorkspace!, selectedDomain!, 'assigned', nextPage, PAGE_SIZE, user!.user_id,
      )
      if ((data.items || []).length > 0) {
        setItems(prev => [...prev, ...(data.items || [])])
        setMaxPage(nextPage)
        setTotal(data.total || 0)
      }
    } catch { /* 무시 */ } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, items.length, total, maxPage, selectedWorkspace, selectedDomain, user])

  const 이전페이지로드 = useCallback(async () => {
    if (loadingPrev || loading || minPage <= 1) return
    const prevPage = minPage - 1
    const prevScrollHeight = listRef.current?.scrollHeight || 0
    setLoadingPrev(true)
    try {
      const { data } = await assignmentApi.목록(
        selectedWorkspace!, selectedDomain!, 'assigned', prevPage, PAGE_SIZE, user!.user_id,
      )
      if ((data.items || []).length > 0) {
        setItems(prev => [...(data.items || []), ...prev])
        setMinPage(prevPage)
        requestAnimationFrame(() => {
          if (listRef.current) {
            const newScrollHeight = listRef.current.scrollHeight
            listRef.current.scrollTop += newScrollHeight - prevScrollHeight
          }
        })
      }
    } catch { /* 무시 */ } finally {
      setLoadingPrev(false)
    }
  }, [loadingPrev, loading, minPage, selectedWorkspace, selectedDomain, user])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 80) 다음페이지로드()
    if (scrollTop < 80 && minPage > 1) 이전페이지로드()
  }, [다음페이지로드, 이전페이지로드, minPage])

  useEffect(() => {
    목록초기화()
    setSelected(null)
    setSelectedTokenIdx(-1)
  }, [selectedWorkspace, selectedDomain])

  // REQ-20: 키워드 선택 시 자동포커스 + 첫/마지막 단어 선택
  useEffect(() => {
    if (selected?.analysis) {
      const toks = parseAnalysisText(selected.analysis).filter(t => !t.lineBreak)
      if (selectLastTokenRef.current) {
        // ←방향키: 마지막 워드 선택
        let lastIdx = toks.length - 1
        while (lastIdx >= 0 && !isNavigableToken(toks, lastIdx)) lastIdx--
        setSelectedTokenIdx(lastIdx >= 0 ? lastIdx : 0)
        selectLastTokenRef.current = false
      } else if (selectLastLineFirstRef.current) {
        // ↑방향키: 마지막 줄의 첫 워드 선택
        const allTokens = parseAnalysisText(selected.analysis)
        const lines: number[][] = [[]]
        allTokens.forEach(t => {
          if (t.lineBreak) { lines.push([]) } else {
            const si = toks.indexOf(t)
            if (si >= 0 && isNavigableToken(toks, si)) lines[lines.length - 1].push(si)
          }
        })
        const validLines = lines.filter(l => l.length > 0)
        if (validLines.length > 0) {
          setSelectedTokenIdx(validLines[validLines.length - 1][0])
        } else {
          setSelectedTokenIdx(0)
        }
        selectLastLineFirstRef.current = false
      } else {
        // 기본: 첫 줄의 첫 워드
        const firstWord = toks.findIndex((_, idx) => isNavigableToken(toks, idx))
        setSelectedTokenIdx(firstWord >= 0 ? firstWord : 0)
      }
    } else {
      setSelectedTokenIdx(-1)
    }
  }, [selected])

  // 선택 키워드 자동 중앙 스크롤 (필터 해제 시에도 유지)
  useEffect(() => {
    if (selected) {
      // DOM 렌더 완료 대기 후 스크롤
      requestAnimationFrame(() => {
        setTimeout(() => {
          itemRefs.current[selected.id]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }, 100)
      })
    }
  }, [selected, 키워드필터])

  // ─── 필터링된 키워드 목록 (검색 + 네비게이션) ─────────────
  const filteredItems = 키워드필터 ? items.filter(r => r.keyword.includes(키워드필터)) : items

  // ─── 토큰 ───────────────────────────────────────────────────

  const tokens = selected?.analysis ? parseAnalysisText(selected.analysis) : []
  const selectableTokens = tokens.filter(t => !t.lineBreak)
  const selectedWordRaw = selectedTokenIdx >= 0 && selectedTokenIdx < selectableTokens.length
    ? selectableTokens[selectedTokenIdx].text : ''
  // <<, >>, 쉼표 제거 (표시는 그대로, 선택 시 정제)
  const selectedWord = selectedWordRaw.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')

  // 선택 키워드 자동 클립보드 복사 (HTTP 환경: navigator.clipboard 없을 수 있음)
  useEffect(() => {
    if (selectedWord) {
      navigator.clipboard?.writeText(selectedWord).catch(() => {})
    }
  }, [selectedWord])

  // ─── 핫키 로드 ──────────────────────────────────────────────

  useEffect(() => {
    workspaceAPI.getHotkeys()
      .then(({ data }) => {
        if (data?.hotkeys && typeof data.hotkeys === 'object') {
          setHotkeys(prev => ({ ...prev, ...data.hotkeys }))
        }
      })
      .catch(() => { /* 기본값 사용 */ })
  }, [])

  // ─── derivedHotkeys: 등록키 기반 탭 단축키 ─────────────────
  const derivedHotkeys = useMemo(() => ({
    tabUdic: 'Alt+' + (hotkeys.registerUdic || '1'),
    tabCndic: 'Alt+' + (hotkeys.registerCndic || '2'),
    tabThesaurus: 'Alt+' + (hotkeys.registerThesaurus || '3'),
    tabMorpheme: 'Alt+' + (hotkeys.analyzeKeyword || '0'),
  }), [hotkeys.registerUdic, hotkeys.registerCndic, hotkeys.registerThesaurus, hotkeys.analyzeKeyword])

  // ─── 줄별 navigable 토큰 인덱스 ─────────────────────────────
  const lineTokens = useMemo(() => {
    if (!tokens.length) return []
    const lines: number[][] = [[]]
    tokens.forEach(t => {
      if (t.lineBreak) {
        lines.push([])
      } else {
        const si = selectableTokens.indexOf(t)
        if (si >= 0 && isNavigableToken(selectableTokens, si)) {
          lines[lines.length - 1].push(si)
        }
      }
    })
    return lines.filter(line => line.length > 0)
  }, [tokens, selectableTokens])

  // ─── 추천 검색 ───────────────────────────────────────────────

  const 추천검색 = useCallback(async (keyword: string) => {
    if (!selectedDomain) return
    set추천로딩(true)
    setLlm결과([])
    setLlm모델별결과([])
    try {
      const { data } = await 클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/recommend`, {
        params: { keyword, limit: 50 },
      })
      set추천결과(data.items || [])
    } catch { set추천결과([]) }
    finally { set추천로딩(false) }
  }, [selectedDomain])

  const LLM분석 = useCallback(async () => {
    if (!selectedDomain || !추천키워드) return
    setLlm로딩(true)
    setLlm모델별결과([])
    try {
      const { data } = await 클라이언트.post(`/dictionaries/${selectedDomain}/thesaurus/recommend/llm`, {
        keyword: 추천키워드,
        candidates: [],
        context: selected?.analysis || '',
        prompt: llm프롬프트,
      })
      // 모델별 결과
      const byModel = data.results_by_model || []
      setLlm모델별결과(byModel)
      // 하위 호환: 전체 items
      setLlm결과(data.items || [])
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'LLM 분석 실패')
    } finally { setLlm로딩(false) }
  }, [selectedDomain, 추천키워드, selected, llm프롬프트])

  // ─── 핫키 핸들러 ────────────────────────────────────────────

  // 추천모달 파티션별 항목 수 계산
  const 추천섹션목록 = useMemo(() => {
    if (!추천모달열림) return []
    const s0 = 등록키워드셋.length
    const s1 = 추천결과.filter((i: any) => i.head_word !== 추천키워드).length
    const s2 = getTypoVariants(추천키워드).length
    const s3 = llm모델별결과.reduce((sum: number, m: any) => sum + (m.items || []).filter((i: any) => i.head_word !== 추천키워드).length, 0)
    return [s0, s1, s2, s3].map((count, idx) => ({ section: idx, count }))
  }, [추천모달열림, 등록키워드셋, 추천결과, 추천키워드, llm모델별결과])

  // AI추천 모델별 글로벌 인덱스 경계 (ArrowDown/Up 모델 간 이동용)
  const llmModelBoundaries = useMemo(() => {
    let start = 0
    return llm모델별결과.map((m: any) => {
      const count = (m.items || []).filter((i: any) => i.head_word !== 추천키워드).length
      const b = { start, count }
      start += count
      return b
    })
  }, [llm모델별결과, 추천키워드])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    // Alt+숫자 탭 전환은 INPUT 포커스 상태에서도 통과
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !e.altKey) return

    // Alt+↑↓ 키워드 이동 — 최우선 가로채기 (브라우저 기본 동작 차단)
    if (e.altKey && e.key === 'ArrowUp' && !추천모달열림) {
      e.preventDefault(); e.stopPropagation()
      if (!filteredItems.length) return
      setIsCenterFocused(true)
      const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
      const newIdx = curIdx > 0 ? curIdx - 1 : 0
      setSelected(filteredItems[newIdx])
      // Alt+↑: 첫 줄 첫 워드 (기본 동작 — ref 설정 안 함)
      if (!filteredItems[newIdx].flag) {
        assignmentApi.updateFlag(filteredItems[newIdx].id, 'R').catch(() => {})
        setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
      }
      return
    }
    if (e.altKey && e.key === 'ArrowDown' && !추천모달열림) {
      e.preventDefault(); e.stopPropagation()
      if (!filteredItems.length) return
      setIsCenterFocused(true)
      const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
      const newIdx = curIdx < filteredItems.length - 1 ? curIdx + 1 : filteredItems.length - 1
      setSelected(filteredItems[newIdx])
      if (!filteredItems[newIdx].flag) {
        assignmentApi.updateFlag(filteredItems[newIdx].id, 'R').catch(() => {})
        setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
      }
      return
    }

    // Alt+←/→ 줄 내 첫/마지막 워드 이동
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !추천모달열림 && isCenterFocused) {
      e.preventDefault(); e.stopPropagation()
      if (!selectableTokens.length || !lineTokens.length) return
      const curLine = lineTokens.findIndex(line => line.includes(selectedTokenIdx))
      if (curLine < 0) return
      const line = lineTokens[curLine]
      if (e.key === 'ArrowLeft') {
        setSelectedTokenIdx(line[0])
      } else {
        setSelectedTokenIdx(line[line.length - 1])
      }
      return
    }

    // 추천모달 키보드 네비게이션
    if (추천모달열림) {
      const key = e.key
      const isAlt = e.altKey
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', '.'].includes(key)) {
        e.preventDefault(); e.stopPropagation()

        // 다음 항목 (현재 섹션 끝이면 다음 섹션 첫 항목)
        const moveNext = () => set추천포커스(prev => {
          const maxItems = 추천섹션목록[prev.section]?.count || 0
          if (prev.item < maxItems - 1) return { ...prev, item: prev.item + 1 }
          let next = prev.section + 1
          while (next < 추천섹션목록.length && 추천섹션목록[next].count === 0) next++
          return next < 추천섹션목록.length ? { section: next, item: 0 } : prev
        })

        // 이전 항목 (현재 섹션 첫이면 이전 섹션 마지막 항목)
        const movePrev = () => set추천포커스(prev => {
          if (prev.item > 0) return { ...prev, item: prev.item - 1 }
          let next = prev.section - 1
          while (next >= 0 && 추천섹션목록[next].count === 0) next--
          return next >= 0 ? { section: next, item: 추천섹션목록[next].count - 1 } : prev
        })

        // 다음 파티션 강제 이동 (Alt+↓)
        const moveNextSection = () => set추천포커스(prev => {
          if (prev.section === 3 && llmModelBoundaries.length > 0) {
            const curModelIdx = llmModelBoundaries.findIndex((b, i) =>
              prev.item >= b.start && (i === llmModelBoundaries.length - 1 || prev.item < llmModelBoundaries[i + 1].start)
            )
            for (let nm = curModelIdx + 1; nm < llmModelBoundaries.length; nm++) {
              if (llmModelBoundaries[nm].count > 0) return { section: 3, item: llmModelBoundaries[nm].start }
            }
            return prev
          }
          let next = prev.section + 1
          while (next < 추천섹션목록.length && 추천섹션목록[next].count === 0) next++
          return next < 추천섹션목록.length ? { section: next, item: 0 } : prev
        })

        // 이전 파티션 강제 이동 (Alt+↑)
        const movePrevSection = () => set추천포커스(prev => {
          if (prev.section === 3 && llmModelBoundaries.length > 0) {
            const curModelIdx = llmModelBoundaries.findIndex((b, i) =>
              prev.item >= b.start && (i === llmModelBoundaries.length - 1 || prev.item < llmModelBoundaries[i + 1].start)
            )
            if (curModelIdx > 0) {
              for (let nm = curModelIdx - 1; nm >= 0; nm--) {
                if (llmModelBoundaries[nm].count > 0) return { section: 3, item: llmModelBoundaries[nm].start }
              }
            }
            let next = 2
            while (next >= 0 && 추천섹션목록[next].count === 0) next--
            return next >= 0 ? { section: next, item: 0 } : prev
          }
          let next = prev.section - 1
          while (next >= 0 && 추천섹션목록[next].count === 0) next--
          return next >= 0 ? { section: next, item: 0 } : prev
        })

        if (key === 'ArrowDown') {
          if (isAlt) moveNextSection(); else moveNext()
        } else if (key === 'ArrowUp') {
          if (isAlt) movePrevSection(); else movePrev()
        } else if (key === 'ArrowRight') {
          moveNext()
        } else if (key === 'ArrowLeft') {
          movePrev()
        } else if (key === 'Enter') {
          const el = document.querySelector(`[data-recommend-section="${추천포커스.section}"][data-recommend-item="${추천포커스.item}"]`) as HTMLElement
          el?.click()
        } else if (key === '.') {
          LLM분석()
        }
        return
      }
      if (key === 'Escape') return // ESC는 모달 닫기 — 기본 동작
    }

    const encoded = encodeKeyEvent(e)
    const actionMap = Object.entries(hotkeys).reduce<Record<string, string>>(
      (acc, [action, key]) => { acc[key] = action; return acc },
      {},
    )
    const action = actionMap[encoded]

    // Home(focusAnalysis)는 항상 동작
    if (action === 'focusAnalysis') {
      e.preventDefault()
      setIsCenterFocused(true)
      return
    }

    // Alt+N 탭 전환은 항상 동작 (포커스 모드 무관) + 자동 포커스
    if (encoded === derivedHotkeys.tabUdic) {
      e.preventDefault(); setActiveTab('udic'); setUdicFocusTrigger(prev => prev + 1); return
    }
    if (encoded === derivedHotkeys.tabCndic) {
      e.preventDefault(); setActiveTab('cndic'); setCndicFocusTrigger(prev => prev + 1); return
    }
    if (encoded === derivedHotkeys.tabThesaurus) {
      e.preventDefault(); setActiveTab('thesaurus'); setThesaurusFocusTrigger(prev => prev + 1); return
    }
    if (encoded === derivedHotkeys.tabMorpheme) {
      e.preventDefault(); setActiveTab('morpheme'); setMorphFocusTrigger(prev => prev + 1); return
    }

    // 나머지 핫키는 포커스 모드에서만
    if (!isCenterFocused) return
    e.preventDefault()

    // 줄바꿈 이동: ArrowUp/ArrowDown (Alt 없이)
    if (e.key === 'ArrowUp' && !e.altKey) {
      if (!selectableTokens.length) return
      const curLine = lineTokens.findIndex(line => line.includes(selectedTokenIdx))
      if (curLine <= 0) {
        // 첫 줄 → 이전 키워드 (마지막 줄의 첫 워드 선택)
        if (!filteredItems.length) return
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        if (curIdx <= 0) return
        const newIdx = curIdx - 1
        selectLastLineFirstRef.current = true
        setSelected(filteredItems[newIdx])
        if (!filteredItems[newIdx].flag) {
          assignmentApi.updateFlag(filteredItems[newIdx].id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
        }
      } else {
        const curPosInLine = lineTokens[curLine].indexOf(selectedTokenIdx)
        const prevLine = lineTokens[curLine - 1]
        const targetPos = Math.min(curPosInLine, prevLine.length - 1)
        setSelectedTokenIdx(prevLine[targetPos])
      }
      return
    }
    if (e.key === 'ArrowDown' && !e.altKey) {
      if (!selectableTokens.length) return
      const curLine = lineTokens.findIndex(line => line.includes(selectedTokenIdx))
      if (curLine < 0 || curLine >= lineTokens.length - 1) {
        // 마지막 줄 → 다음 키워드
        if (!filteredItems.length) return
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx < filteredItems.length - 1 ? curIdx + 1 : filteredItems.length - 1
        setSelected(filteredItems[newIdx])
        if (!filteredItems[newIdx].flag) {
          assignmentApi.updateFlag(filteredItems[newIdx].id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
        }
      } else {
        const curPosInLine = lineTokens[curLine].indexOf(selectedTokenIdx)
        const nextLine = lineTokens[curLine + 1]
        const targetPos = Math.min(curPosInLine, nextLine.length - 1)
        setSelectedTokenIdx(nextLine[targetPos])
      }
      return
    }

    if (!action) return

    switch (action) {
      case 'prevKeyword': {
        if (!filteredItems.length) break
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx > 0 ? curIdx - 1 : 0
        setSelected(filteredItems[newIdx])
        if (!filteredItems[newIdx].flag) {
          assignmentApi.updateFlag(filteredItems[newIdx].id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
        }
        break
      }
      case 'nextKeyword': {
        if (!filteredItems.length) break
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx < filteredItems.length - 1 ? curIdx + 1 : filteredItems.length - 1
        setSelected(filteredItems[newIdx])
        if (!filteredItems[newIdx].flag) {
          assignmentApi.updateFlag(filteredItems[newIdx].id, 'R').catch(() => {})
          setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
        }
        break
      }
      case 'prevAnalysis': {
        if (!selectableTokens.length) break
        let prevIdx = selectedTokenIdx - 1
        while (prevIdx >= 0 && !isNavigableToken(selectableTokens, prevIdx)) prevIdx--
        if (prevIdx >= 0) {
          setSelectedTokenIdx(prevIdx)
        } else {
          const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
          if (curIdx > 0) {
            selectLastTokenRef.current = true
            setSelected(filteredItems[curIdx - 1])
            if (!filteredItems[curIdx - 1].flag) {
              assignmentApi.updateFlag(filteredItems[curIdx - 1].id, 'R').catch(() => {})
              setItems(prev => prev.map(i => i.id === filteredItems[curIdx - 1].id ? { ...i, flag: 'R' } : i))
            }
          }
        }
        break
      }
      case 'nextAnalysis': {
        if (!selectableTokens.length) break
        let nextIdx = selectedTokenIdx + 1
        while (nextIdx < selectableTokens.length && !isNavigableToken(selectableTokens, nextIdx)) nextIdx++
        if (nextIdx >= selectableTokens.length) {
          // REQ-21: 마지막 토큰 → 다음 키워드 자동 이동
          const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
          if (curIdx >= 0 && curIdx < filteredItems.length - 1) {
            setSelected(filteredItems[curIdx + 1])
            if (!filteredItems[curIdx + 1].flag) {
              assignmentApi.updateFlag(filteredItems[curIdx + 1].id, 'R').catch(() => {})
              setItems(prev => prev.map(i => i.id === filteredItems[curIdx + 1].id ? { ...i, flag: 'R' } : i))
            }
          } else {
            message.info('모든 키워드를 완료했습니다')
          }
        } else {
          setSelectedTokenIdx(nextIdx)
        }
        break
      }
      case 'registerUdic':
      case 'registerCndic':
      case 'registerThesaurus': {
        if (!selectedWord || !selectedDomain) break
        const dicType: DicType = action === 'registerUdic' ? 'udic'
          : action === 'registerCndic' ? 'cndic' : 'thesaurus'
        if (dicType === 'thesaurus') {
          set추천키워드(selectedWord)
          set추천결과([])
          setLlm결과([])
          set등록키워드셋([])
          set추천포커스({ section: 0, item: 0 })
          set추천모달열림(true)
          추천검색(selectedWord)
          setActiveTab('thesaurus')
          // 등록 키워드셋 조회 (head/tail 정확일치)
          클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/list`, { params: { search: selectedWord, size: 100 } })
            .then(({ data }) => {
              const items = (data?.items || []).filter((i: any) => i.head_word === selectedWord)
              set등록키워드셋(items)
              if (items.length === 0) set추천포커스({ section: 1, item: 0 })
            }).catch(() => {})
        } else {
          클라이언트.post(`/dictionaries/${selectedDomain}/${dicType}`, { word: selectedWord, memo: '' })
            .then(() => {
              message.success(`${사전설정[dicType].title}에 "${selectedWord}" 등록`)
              setEscKeyword(selectedWord)
              setEscCount(0)
              setDicRefreshKey(prev => prev + 1)
              setActiveTab(dicType)
              if (dicType === 'udic') setUdicSearch(selectedWord)
              else if (dicType === 'cndic') setCndicSearch(selectedWord)
              if (selected) {
                assignmentApi.updateFlag(selected.id, 'W').catch(() => {})
                setItems(prev => prev.map(i => i.id === selected.id ? { ...i, flag: 'W' } : i))
              }
              if (selectedWorkspace && selectedDomain) {
                workspaceAPI.addWorkHistory({
                  workspace: selectedWorkspace, domain: selectedDomain,
                  action_type: 'add', dic_type: dicType, head_word: selectedWord, word: selectedWord,
                }).then(() => { historyRef.current?.reload() }).catch(() => { historyRef.current?.reload() })
              }
            })
            .catch((err: any) => {
              const detail = typeof err?.response?.data?.detail === 'string'
                ? err.response.data.detail
                : Array.isArray(err?.response?.data?.detail)
                  ? err.response.data.detail.map((d: any) => d.msg || d).join(', ')
                  : err?.response?.data?.message || err?.message || '등록 실패'
              message.error(detail)
            })
        }
        break
      }
      case 'thesaurusLlm': {
        if (!selectedWord || !selectedDomain) break
        set추천키워드(selectedWord)
        set추천결과([]); setLlm결과([]); setLlm모델별결과([]); set등록키워드셋([])
        set추천포커스({ section: 0, item: 0 })
        set추천모달열림(true)
        추천검색(selectedWord)
        setActiveTab('thesaurus')
        클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/list`, { params: { search: selectedWord, size: 100 } })
          .then(({ data }) => {
            const items = (data?.items || []).filter((i: any) => i.head_word === selectedWord)
            set등록키워드셋(items)
            if (items.length === 0) set추천포커스({ section: 1, item: 0 })
          }).catch(() => {})
        // AI분석 자동 실행
        setTimeout(() => LLM분석(), 100)
        break
      }
      case 'analyzeKeyword': {
        const kw = selectedWord || selected?.keyword
        if (kw) {
          setActiveTab('morpheme')
          setMorphPrefillKw(kw)
          setMorphTrigger(prev => prev + 1)
        }
        break
      }
      case 'aiAnalysis': {
        const kw = selectedWord || selected?.keyword
        if (kw) setAiKeyword(kw)
        break
      }
      case 'undoHistory': {
        if (escKeyword && escCount < 3) {
          historyRef.current?.undoLatestForKeyword(escKeyword || '')
          setEscCount(prev => prev + 1)
        }
        break
      }
      case 'aiTabAI': {
        setAiForcedTab(prev => ({ tab: 'llm', n: (prev?.n || 0) + 1 }))
        break
      }
      case 'aiTabWikipedia': {
        setAiForcedTab(prev => ({ tab: 'wikipedia', n: (prev?.n || 0) + 1 }))
        break
      }
    }
  }, [hotkeys, derivedHotkeys, isCenterFocused, items, filteredItems, selected, selectableTokens, selectedTokenIdx, selectedWord, selectedDomain, selectedWorkspace, escKeyword, escCount, 추천검색, 추천모달열림, 추천섹션목록, 추천포커스, LLM분석, llmModelBoundaries, lineTokens])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // 추천모달 키보드 포커스 이동 시 선택된 항목 자동 스크롤
  useEffect(() => {
    if (!추천모달열림) return
    const el = document.querySelector(
      `[data-recommend-section="${추천포커스.section}"][data-recommend-item="${추천포커스.item}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [추천포커스, 추천모달열림])

  // ─── 핫키 저장 ──────────────────────────────────────────────

  const handleSaveHotkeys = useCallback((newHotkeys: Record<string, string>) => {
    setHotkeys(prev => ({ ...prev, ...newHotkeys }))
    workspaceAPI.saveHotkeys(newHotkeys)
      .then(() => message.success('핫키 설정 저장 완료'))
      .catch(() => message.error('핫키 설정 저장 실패'))
  }, [])

  // ─── Undo 콜백 ───────────────────────────────────────────────
  const handleUndoDone = useCallback((item: WorkHistoryItem) => {
    const tabMap: Record<string, string> = { udic: 'udic', cndic: 'cndic', thesaurus: 'thesaurus' }
    const tab = tabMap[item.dic_type] || 'udic'
    setActiveTab(tab)
    const word = item.word || item.head_word || ''
    if (tab === 'udic') setUdicSearch(word)
    else if (tab === 'cndic') setCndicSearch(word)
    else if (tab === 'thesaurus') setThesaurusSearch(word)
    setDicRefreshKey(prev => prev + 1)
  }, [])

  // ─── 작업완료 처리 ────────────────────────────────────────────
  const handleCompleteWithMode = useCallback(async (mode: 'all_complete' | 'all_incomplete' | 'by_history') => {
    if (!selectedWorkspace || !selectedDomain) return
    setCompleteLoading(true)
    try {
      await assignmentApi.완료모드(selectedWorkspace, selectedDomain, mode)
      message.success('작업이 완료 처리되었습니다.')
      setAssigned(false)
      setCompleteModalOpen(false)
      navigate('/assignment')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '완료 처리 실패')
    } finally {
      setCompleteLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, setAssigned, navigate])

  // ─── Guard ──────────────────────────────────────────────────

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">워크스페이스와 도메인을 먼저 선택하세요.</Text>
      </div>
    )
  }

  // ─── 렌더링 ─────────────────────────────────────────────────

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', gap: 0 }}
      onClick={() => {
        // 방금(100ms 이내) 열린 메뉴는 닫지 않음
        set컨텍스트메뉴(prev => (Date.now() - prev.ts < 100) ? prev : { ...prev, open: false })
        if (!추천모달열림) setIsCenterFocused(false)
      }}
    >
      {/* 배너 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', marginBottom: 8,
        background: '#fafafa', borderBottom: '1px solid #f0f0f0', borderRadius: 6,
      }}>
        <Title level={4} style={{ margin: 0 }}>📋 작업실</Title>
        <Space>
          <Button
            icon={<SettingOutlined />}
            onClick={(e) => { e.stopPropagation(); setHotkeyModalOpen(true) }}
          >
            단축키설정
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            type="primary"
            onClick={(e) => { e.stopPropagation(); setCompleteModalOpen(true) }}
          >
            작업완료
          </Button>
        </Space>
      </div>

      {/* 3컬럼 메인 */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* 좌측열: 키워드목록 + 키워드분석 */}
        <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={`작업키워드(${workedCount}/${totalCount})`}
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
          >
            <div style={{ padding: '4px 8px', flexShrink: 0 }}>
              <Input
                placeholder="키워드 검색..." value={키워드필터} onChange={e => set키워드필터(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); set키워드필터(''); (e.target as HTMLElement).blur() } }}
                allowClear size="small" style={{ width: '100%' }}
              />
            </div>
            <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto' }}>
              {loadingPrev && (
                <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
              )}
              {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              ) : items.filter(r => !키워드필터 || r.keyword.includes(키워드필터)).map((record, index) => (
                <div
                  key={record.id}
                  ref={(el) => { itemRefs.current[record.id] = el }}
                  onClick={(e) => {
                    e.stopPropagation(); setSelected(record); setIsCenterFocused(true)
                    if (!record.flag) {
                      assignmentApi.updateFlag(record.id, 'R').catch(() => {})
                      setItems(prev => prev.map(i => i.id === record.id ? { ...i, flag: 'R' } : i))
                    }
                  }}
                  style={{
                    padding: '6px 12px', cursor: 'pointer',
                    background: record.flag === 'W' ? '#FCE4EC' : record.flag === 'R' ? '#FFF9C4' : 'white',
                    boxShadow: selected?.id === record.id ? 'inset 0 0 0 1px #000' : undefined,
                    borderBottom: selected?.id === record.id ? undefined : '1px solid #f0f0f0',
                    fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: selected?.id === record.id ? 600 : 'normal',
                    color: record.status === 'completed' ? '#999' : '#333',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
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
        </div>

        {/* 중앙열: 분석결과 + 사전탭 */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={<span>분석결과 <KbdKey>{displayKey(hotkeys.focusAnalysis)}</KbdKey></span>}
            size="small"
            style={{
              flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
              cursor: 'default', transition: 'all 0.3s ease',
              ...(isCenterFocused ? {
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                outline: `2px solid ${selectedColor || '#faad14'}`,
                transform: 'translateY(-2px)',
              } : {}),
            }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
            onClick={(e) => { e.stopPropagation(); setIsCenterFocused(true) }}
          >
            <div style={{
              padding: 16, minHeight: '100%', transition: 'background-color 0.3s ease',
              backgroundColor: isCenterFocused ? '#FFFDE7' : undefined,
            }}>
            {selected ? (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                {tokens.map((token, i) => {
                  if (token.lineBreak) return <br key={`br-${i}`} />
                  const selIdx = selectableTokens.findIndex(t => t === token)
                  const isSelected = selIdx === selectedTokenIdx
                  return (
                    <span
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation(); e.preventDefault()
                        setSelectedTokenIdx(selIdx); setIsCenterFocused(true)
                        if (isWordToken(token.text)) {
                          const cleaned = token.text.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')
                          const rect = (e.target as HTMLElement).getBoundingClientRect()
                          set컨텍스트메뉴({ open: true, x: rect.left, y: rect.bottom + 4, word: cleaned, tokenIdx: selIdx, ts: Date.now() })
                        } else {
                          set컨텍스트메뉴(prev => ({ ...prev, open: false }))
                        }
                      }}
                      onContextMenu={(e) => {
                        if (!isWordToken(token.text)) return
                        e.preventDefault(); e.stopPropagation()
                        setSelectedTokenIdx(selIdx); setIsCenterFocused(true)
                        const cleaned = token.text.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')
                        set컨텍스트메뉴({ open: true, x: e.clientX, y: e.clientY, word: cleaned, tokenIdx: selIdx, ts: Date.now() })
                      }}
                      style={{
                        cursor: 'pointer', padding: '1px 2px', borderRadius: 3, marginRight: 4,
                        transition: 'background 0.15s',
                        ...(isSelected ? { background: '#FCE4EC' } : {}),
                      }}
                    >
                      {token.text}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Text type="secondary">좌측에서 키워드를 선택하세요.</Text>
              </div>
            )}
            </div>
          </Card>

          {/* 토큰 우클릭 컨텍스트 메뉴 */}
          {컨텍스트메뉴.open && (
            <div
              style={{
                position: 'fixed', left: 컨텍스트메뉴.x, top: 컨텍스트메뉴.y, zIndex: 1050,
                background: '#fff', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                padding: '3px 0', minWidth: 160, fontSize: 11,
              }}
              onClick={() => set컨텍스트메뉴(prev => ({ ...prev, open: false }))}
            >
              <div style={{ padding: '4px 10px', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #f0f0f0', color: '#1677ff' }}>
                "{컨텍스트메뉴.word}"
              </div>
              {[
                { label: '키워드 분석', key: hotkeys.analyzeKeyword || '0', action: () => { setMorphPrefillKw(컨텍스트메뉴.word); setMorphTrigger(p => p + 1) } },
                { label: 'AI 분석', key: hotkeys.aiAnalysis || 'F2', action: () => setAiKeyword(컨텍스트메뉴.word) },
                { divider: true },
                { label: '사용자사전 등록', key: hotkeys.registerUdic || '1', action: () => {
                  클라이언트.post(`/dictionaries/${selectedDomain}/udic`, { word: 컨텍스트메뉴.word, memo: '' })
                    .then(() => { message.success(`사용자사전에 "${컨텍스트메뉴.word}" 등록`); setDicRefreshKey(p => p + 1) })
                    .catch(() => message.error('등록 실패'))
                }},
                { label: '복합명사사전 등록', key: hotkeys.registerCndic || '2', action: () => {
                  클라이언트.post(`/dictionaries/${selectedDomain}/cndic`, { word: 컨텍스트메뉴.word, memo: '' })
                    .then(() => { message.success(`복합명사사전에 "${컨텍스트메뉴.word}" 등록`); setDicRefreshKey(p => p + 1) })
                    .catch(() => message.error('등록 실패'))
                }},
                { label: '유사어 추천', key: hotkeys.registerThesaurus || '3', action: () => {
                  set추천키워드(컨텍스트메뉴.word); set추천결과([]); setLlm결과([]); setLlm모델별결과([]); set등록키워드셋([])
                  set추천포커스({ section: 0, item: 0 })
                  set추천모달열림(true); 추천검색(컨텍스트메뉴.word); setActiveTab('thesaurus')
                  클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/list`, { params: { search: 컨텍스트메뉴.word, size: 100 } })
                    .then(({ data }) => {
                      const items = (data?.items || []).filter((i: any) => i.head_word === 컨텍스트메뉴.word)
                      set등록키워드셋(items)
                      if (items.length === 0) set추천포커스({ section: 1, item: 0 })
                    }).catch(() => {})
                }},
              ].map((item: any, idx) => item.divider ? (
                <div key={idx} style={{ borderTop: '1px solid #f0f0f0', margin: '2px 0' }} />
              ) : (
                <div
                  key={idx}
                  style={{ padding: '3px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}
                  onClick={item.action}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <span>{item.label}</span>
                  <span style={{ transform: 'scale(0.85)', transformOrigin: 'right center', display: 'inline-block' }}><KbdKey>{displayKey(item.key)}</KbdKey></span>
                </div>
              ))}
            </div>
          )}

          <Card
            size="small"
            style={{ height: 390, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'hidden', padding: '4px 12px 12px' } }}
          >
            <Tabs
              activeKey={['udic', 'cndic', 'thesaurus'].includes(activeTab) ? activeTab : 'udic'}
              onChange={(key) => {
                setActiveTab(key)
                if (key === 'udic') setUdicFocusTrigger(prev => prev + 1)
                else if (key === 'cndic') setCndicFocusTrigger(prev => prev + 1)
                else if (key === 'thesaurus') setThesaurusFocusTrigger(prev => prev + 1)
              }}
              items={[
                {
                  key: 'udic',
                  label: <span>사용자사전 <KbdKey>{displayTabKey(derivedHotkeys.tabUdic)}</KbdKey></span>,
                  children: <DicTab dicType="udic" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={udicSearch} autoFocusTrigger={udicFocusTrigger} />,
                },
                {
                  key: 'cndic',
                  label: <span>복합명사사전 <KbdKey>{displayTabKey(derivedHotkeys.tabCndic)}</KbdKey></span>,
                  children: <DicTab dicType="cndic" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={cndicSearch} autoFocusTrigger={cndicFocusTrigger} />,
                },
                {
                  key: 'thesaurus',
                  label: <span>유사어사전 <KbdKey>{displayTabKey(derivedHotkeys.tabThesaurus)}</KbdKey></span>,
                  children: <DicTab dicType="thesaurus" domain={selectedDomain} refreshKey={dicRefreshKey} externalSearch={thesaurusSearch} autoFocusTrigger={thesaurusFocusTrigger} thesaurusExternalOpen={thesaurusExternalOpen} onModalClose={() => setIsCenterFocused(true)} />,
                },
              ]}
            />
          </Card>
        </div>

        {/* 우측열: 키워드분석 + AI분석 + 작업이력 (3등분) */}
        <div style={{ width: 450, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={<span>키워드 분석 <KbdKey>{displayTabKey(derivedHotkeys.tabMorpheme)}</KbdKey></span>}
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: '4px 12px 12px' } }}
          >
            <MorphemeTab domain={selectedDomain} prefillKeyword={morphPrefillKw} prefillTrigger={morphTrigger} autoFocusTrigger={morphFocusTrigger} />
          </Card>
          <Card
            title={<span>AI 분석 <KbdKey>{displayKey(hotkeys.aiAnalysis)}</KbdKey></span>}
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 8 } }}
          >
            <AIAnalysis initialKeyword={aiKeyword} isAdmin={user?.auth === 'A'} forcedTab={aiForcedTab} />
          </Card>
          <Card
            title={<span>작업이력 <KbdKey>{displayKey(hotkeys.undoHistory)}</KbdKey></span>}
            size="small"
            style={{ height: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 8 } }}
          >
            <WorkHistory
              ref={historyRef}
              workspace={selectedWorkspace}
              domain={selectedDomain}
              onUndo={handleUndoDone}
              onItemClick={handleUndoDone}
            />
          </Card>
        </div>
      </div>

      {/* 유사어 추천 모달 */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
            <span>{`유사어 추천 — ${추천키워드}`}</span>
            <Button size="small" icon={<EditOutlined />} onClick={() => set추천프롬프트모달(true)}>프롬프트</Button>
          </div>
        }
        open={추천모달열림}
        onCancel={() => { if (!추천프롬프트모달) set추천모달열림(false) }}
        afterClose={() => setTimeout(() => setIsCenterFocused(true), 50)}
        footer={null}
        width={680}
        keyboard={!추천프롬프트모달}
        destroyOnClose
      >

        {/* 등록 키워드셋 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 등록키워드셋.length > 0 ? '#C62828' : '#999', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 12, background: 등록키워드셋.length > 0 ? '#EF5350' : '#ddd', borderRadius: 2 }} />
            등록 키워드셋 <span style={{ fontSize: 10, color: '#999' }}>({등록키워드셋.length})</span>
          </div>
          {등록키워드셋.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>등록된 유사어 없음</Text>
          ) : (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, maxHeight: 150, overflowY: 'auto', background: 등록키워드셋.length > 0 ? '#FFEBEE' : undefined }}>
              {등록키워드셋.map((item: any, idx: number) => (
                <div key={idx} data-recommend-section={0} data-recommend-item={idx}
                  style={{ padding: '5px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 추천포커스.section === 0 && 추천포커스.item === idx ? '#E6F4FF' : undefined }}
                  onClick={() => setThesaurusExternalOpen(prev => ({ head_word: item.head_word, tail_word: '', n: (prev?.n || 0) + 1, editMode: true } as any))}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 추천포커스.section === 0 && 추천포커스.item === idx ? '#E6F4FF' : '' }}
                >
                  <span style={{ fontSize: 12 }}>
                    <Text strong>{item.head_word}</Text>
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{(item.tail_word || '').split(',').map((s: string) => s.trim()).filter(Boolean).join(', ')}</Text>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 추천 키워드셋 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#558B2F', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 12, background: '#8BC34A', borderRadius: 2 }} />
            추천 키워드셋 <span style={{ fontSize: 10, color: '#999' }}>({추천결과.filter((i: any) => i.head_word !== 추천키워드).length})</span>
          </div>
          <Spin spinning={추천로딩}>
            {추천결과.filter((i: any) => i.head_word !== 추천키워드).length === 0 && !추천로딩 ? (
              <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>결과 없음</Text>
            ) : (
              <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, maxHeight: 180, overflowY: 'auto' }}>
                {추천결과.filter((i: any) => i.head_word !== 추천키워드).map((item: any, idx: number) => (
                  <div key={idx} data-recommend-section={1} data-recommend-item={idx}
                    style={{ padding: '5px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 추천포커스.section === 1 && 추천포커스.item === idx ? '#E6F4FF' : undefined }}
                    onClick={() => setThesaurusExternalOpen(prev => ({ head_word: item.head_word, tail_word: 추천키워드, n: (prev?.n || 0) + 1, editMode: true } as any))}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 추천포커스.section === 1 && 추천포커스.item === idx ? '#E6F4FF' : '' }}
                  >
                    <span style={{ fontSize: 12 }}>
                      {등록키워드Set.has(item.head_word) && <LinkOutlined style={{ color: '#52c41a', marginRight: 4, fontSize: 10 }} />}
                      <Text strong>{item.head_word}</Text>
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{((item.tail_words || []) as string[]).slice(0, 5).join(', ')}</Text>
                    </span>
                    <Text type="secondary" style={{ fontSize: 10 }}>{item.score}</Text>
                  </div>
                ))}
              </div>
            )}
          </Spin>
        </div>

        {/* 한영오타 키워드 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0277BD', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 12, background: '#29B6F6', borderRadius: 2 }} />
            한영오타 키워드 <span style={{ fontSize: 10, color: '#999' }}>({getTypoVariants(추천키워드).length})</span>
          </div>
          {getTypoVariants(추천키워드).length === 0 ? (
            <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>변환 결과 없음</Text>
          ) : (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 4 }}>
              {getTypoVariants(추천키워드).map((v, idx) => (
                <div key={idx} data-recommend-section={2} data-recommend-item={idx}
                  style={{ padding: '5px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, background: 추천포커스.section === 2 && 추천포커스.item === idx ? '#E6F4FF' : undefined }}
                  onClick={() => setThesaurusExternalOpen(prev => ({ head_word: 추천키워드, tail_word: v.value, n: (prev?.n || 0) + 1, editMode: true } as any))}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 추천포커스.section === 2 && 추천포커스.item === idx ? '#E6F4FF' : '' }}
                >
                  {등록키워드Set.has(v.value) && <LinkOutlined style={{ color: '#52c41a', marginRight: 2, fontSize: 10 }} />}
                  <Text type="secondary" style={{ fontSize: 10 }}>{v.label}</Text>
                  <Text>{추천키워드}</Text>
                  <Text type="secondary">→</Text>
                  <Text strong>{v.value}</Text>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI추천 키워드 */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#E65100', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 3, height: 12, background: '#FF9800', borderRadius: 2 }} />
              AI추천 키워드 <span style={{ fontSize: 10, color: '#999' }}>({llm모델별결과.reduce((s: number, m: any) => s + (m.items || []).filter((i: any) => i.head_word !== 추천키워드).length, 0)})</span>
            </span>
            <Button size="small" type="primary" loading={llm로딩} onClick={LLM분석}>분석 실행 <KbdKey>{displayKey(hotkeys.thesaurusLlm || '.')}</KbdKey></Button>
          </div>
          <div>
        <Spin spinning={llm로딩}>
          {llm모델별결과.length === 0 && !llm로딩 && <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>분석 실행 버튼을 클릭하세요</Text>}
          {llm모델별결과.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(() => { let globalIdx = 0; return llm모델별결과.map((modelResult: any, mIdx: number) => (
                <div key={mIdx} style={{ flex: 1, minWidth: 0, border: '1px solid #f0f0f0', borderRadius: 4 }}>
                  <div style={{ padding: '3px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(modelResult.model || '').split('/').pop()}
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {(modelResult.items || []).filter((item: any) => item.head_word !== 추천키워드).length === 0 ? (
                      <div style={{ padding: 8, textAlign: 'center' }}><Text type="secondary" style={{ fontSize: 11 }}>{modelResult.raw_response ? '결과 없음' : '오류'}</Text></div>
                    ) : (modelResult.items || []).filter((item: any) => item.head_word !== 추천키워드).map((item: any, idx: number) => {
                      const gi = globalIdx++; return (
                      <div
                        key={idx}
                        data-recommend-section={3} data-recommend-item={gi}
                        style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', fontSize: 12, background: 추천포커스.section === 3 && 추천포커스.item === gi ? '#E6F4FF' : undefined }}
                        onClick={() => setThesaurusExternalOpen(prev => ({ head_word: 추천키워드, tail_word: item.head_word, n: (prev?.n || 0) + 1, editMode: true } as any))}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 추천포커스.section === 3 && 추천포커스.item === gi ? '#E6F4FF' : '' }}
                      >
                        {등록키워드Set.has(item.head_word) && <LinkOutlined style={{ color: '#52c41a', marginRight: 4, fontSize: 10 }} />}{item.head_word}
                      </div>
                    )})}
                  </div>
                </div>
              )); })()}
            </div>
          )}
        </Spin>
        </div></div>
      </Modal>

      {/* 유사어 LLM 프롬프트 편집 모달 */}
      <Modal
        title="유사어 추천 LLM 프롬프트"
        open={추천프롬프트모달}
        onCancel={() => set추천프롬프트모달(false)}
        onOk={() => {
          클라이언트.put('/llm-settings/thesaurus-prompt', { prompt: llm프롬프트 })
            .then(() => message.success('프롬프트 저장 완료'))
            .catch(() => message.error('프롬프트 저장 실패'))
          set추천프롬프트모달(false)
        }}
        okText="저장"
        cancelText="취소"
        width={600}
        zIndex={1100}
      >
        <Input.TextArea
          value={llm프롬프트}
          onChange={e => setLlm프롬프트(e.target.value)}
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <Button size="small" onClick={() => setLlm프롬프트(기본추천프롬프트)}>기본값 복원</Button>
        </div>
      </Modal>

      {/* 작업완료 모달 */}
      <Modal
        title="작업 완료 처리"
        open={completeModalOpen}
        onCancel={() => setCompleteModalOpen(false)}
        footer={null}
        width={420}
      >
        <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
          처리 대상: <strong>{workedCount}</strong> / {totalCount} 키워드 작업됨
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            block
            type="primary"
            loading={completeLoading}
            onClick={() => handleCompleteWithMode('all_complete')}
          >
            전체 완료 처리
          </Button>
          <Button
            block
            loading={completeLoading}
            onClick={() => handleCompleteWithMode('all_incomplete')}
          >
            전체 미완료 처리
          </Button>
          <Button
            block
            loading={completeLoading}
            onClick={() => handleCompleteWithMode('by_history')}
          >
            작업이력 기준 처리
          </Button>
          <Button block onClick={() => setCompleteModalOpen(false)}>
            취소
          </Button>
        </div>
      </Modal>

      {/* 핫키 설정 모달 */}
      <HotkeySettings
        open={hotkeyModalOpen}
        onClose={() => setHotkeyModalOpen(false)}
        onSave={handleSaveHotkeys}
      />
    </div>
  )
}
