import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Typography, Card, Tabs, Input, Button, Modal,
  message, Spin, Space, Checkbox, Alert,
} from 'antd'
import {
  SettingOutlined, CheckCircleOutlined, DeleteOutlined, PlusCircleOutlined, CloseOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { assignmentApi, KeywordItem } from '../api/assignment'
import { workspaceAPI } from '../api/workspace'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAuthStore } from '../stores/authStore'
import { useGlobalTaskStore } from '../stores/globalTaskStore'
import 클라이언트 from '../api/client'
import AIAnalysis from '../components/workspace/AIAnalysis'
import WorkHistory, { WorkHistoryRef, WorkHistoryItem } from '../components/workspace/WorkHistory'
import HotkeySettings from '../components/workspace/HotkeySettings'
import ThesaurusRecommendModal from '../components/workspace/ThesaurusRecommendModal'
import LLMPromptModal from '../components/workspace/LLMPromptModal'
import CompleteModal from '../components/workspace/CompleteModal'
import DicTab, { DicType } from '../components/workspace/DicTab'
import MorphemeTab from '../components/workspace/MorphemeTab'
import { 기본핫키맵, encodeKeyEvent, displayKey, displayTabKey, KbdKey } from '../utils/keyboard'
import { getTypoVariants } from '../utils/hangul'
import {
  Token, FullToken,
  parseAnalysisText, parseFullTestText,
  isWordToken, isNavigableToken, isFullNavigableToken,
} from '../utils/analysis'

const { Text } = Typography
const PAGE_SIZE = 100

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
  const { selectedWorkspace, selectedDomain, selectedColor } = useWorkspaceStore()
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
  const keywordSearchRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<{[key: number]: HTMLDivElement | null}>({})

  // 포커스/토큰
  const [isCenterFocused, setIsCenterFocused] = useState(false)
  const [컨텍스트메뉴, set컨텍스트메뉴] = useState<{ open: boolean; x: number; y: number; word: string; tokenIdx: number; ts: number }>({ open: false, x: 0, y: 0, word: '', tokenIdx: -1, ts: 0 })
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(-1)

  // 분석결과 탭 (LITE/FULL)
  const [analysisTab, setAnalysisTab] = useState<'simple' | 'full'>('simple')
  const [analysisRightTab, setAnalysisRightTab] = useState<'morpheme' | 'ai'>('morpheme')
  const [fullTokenIdx, setFullTokenIdx] = useState(-1)

  // 사전 빌드 — globalTaskStore
  const { executeBuild, isBlocked } = useGlobalTaskStore()

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

  // 일괄 작업 선택
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<number[]>([])

  // 작업이력
  const historyRef = useRef<WorkHistoryRef>(null)
  const selectLastTokenRef = useRef(false)
  const selectLastLineFirstRef = useRef(false)  // ↑로 이전 키워드: 마지막 줄의 첫 워드
  const saveLastSelectedRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveLastSelected = useCallback((keywordId: number) => {
    if (saveLastSelectedRef.current) clearTimeout(saveLastSelectedRef.current)
    saveLastSelectedRef.current = setTimeout(() => {
      if (!selectedWorkspace || !selectedDomain) return
      assignmentApi.마지막선택저장(keywordId, selectedWorkspace, selectedDomain).catch(() => {})
    }, 300)
  }, [selectedWorkspace, selectedDomain])

  // ─── 키워드 목록 ────────────────────────────────────────────

  const 목록초기화 = useCallback(async () => {
    if (!selectedWorkspace || !selectedDomain || !user) return
    setLoading(true)
    try {
      // 1. 마지막 선택 키워드 조회 (우선) → fallback: 마지막 읽은 위치
      let startPage = 1
      let targetKeywordId: number | null = null
      try {
        const { data: lastSel } = await assignmentApi.마지막선택조회(selectedWorkspace, selectedDomain)
        if (lastSel.keyword_id) {
          targetKeywordId = lastSel.keyword_id
          // keyword_id 기반으로 페이지 계산
          const { data: pos } = await assignmentApi.마지막읽은위치(selectedWorkspace, selectedDomain, PAGE_SIZE)
          if (pos.keyword_id === lastSel.keyword_id && pos.page) {
            startPage = pos.page
          }
        } else {
          // fallback: 마지막 읽은 위치
          const { data: pos } = await assignmentApi.마지막읽은위치(selectedWorkspace, selectedDomain, PAGE_SIZE)
          if (pos.keyword_id) {
            startPage = pos.page
            targetKeywordId = pos.keyword_id
          }
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
          assignmentApi.updateFlag(target.id, 'R', selectedWorkspace ?? '').catch(() => {})
          setItems(prev => prev.map(i => i.id === target!.id ? { ...i, flag: 'R' } : i))
        }
      }
      return target ?? null
    } catch {
      setItems([])
      setTotal(0)
      return null
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

  // REQ-20: 키워드 선택 시 자동포커스 + 첫/마지막 단어 선택 (LITE 탭)
  useEffect(() => {
    const analysisText = selected?.analysis || null
    if (analysisText) {
      const allTokens = parseAnalysisText(analysisText)
      const toks = allTokens.filter(t => !t.lineBreak)
      if (selectLastTokenRef.current) {
        // ←방향키: 마지막 워드 선택
        let lastIdx = toks.length - 1
        while (lastIdx >= 0 && !isNavigableToken(toks, lastIdx)) lastIdx--
        setSelectedTokenIdx(lastIdx >= 0 ? lastIdx : 0)
        selectLastTokenRef.current = false
      } else if (selectLastLineFirstRef.current && analysisTab === 'simple') {
        // ↑방향키: 마지막 줄의 첫 워드 선택 (LITE 탭에서만 처리, FULL 탭은 별도 useEffect)
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
      } else if (!selectLastLineFirstRef.current) {
        // 기본: 첫 줄의 첫 워드 (FULL 탭에서 ref가 살아있으면 건드리지 않음)
        const firstWord = toks.findIndex((_, idx) => isNavigableToken(toks, idx))
        setSelectedTokenIdx(firstWord >= 0 ? firstWord : 0)
      }
    } else {
      setSelectedTokenIdx(-1)
    }
  }, [selected, analysisTab])

  // 키워드 선택 해제 시 FULL 토큰 인덱스 초기화
  useEffect(() => {
    if (!selected) setFullTokenIdx(-1)
  }, [selected?.id])

  // FullTest 결과 로드 완료 시 첫/마지막 워드 자동 선택
  // FullTest 결과 로드 완료 시 첫/마지막 워드 자동 선택
  useEffect(() => {
    if (selected?.full_analysis && analysisTab === 'full') {
      const allTokens = parseFullTestText(selected.full_analysis)
      const ftoks = allTokens.filter(t => !t.lineBreak)
      if (selectLastLineFirstRef.current) {
        // ↑방향키: 마지막 줄의 첫 워드 선택
        const lines: number[][] = [[]]
        allTokens.forEach(t => {
          if (t.lineBreak) { lines.push([]) } else {
            const si = ftoks.indexOf(t)
            if (si >= 0 && isFullNavigableToken(ftoks, si)) lines[lines.length - 1].push(si)
          }
        })
        const validLines = lines.filter(l => l.length > 0)
        if (validLines.length > 0) {
          setFullTokenIdx(validLines[validLines.length - 1][0])
        } else {
          setFullTokenIdx(0)
        }
        selectLastLineFirstRef.current = false
      } else {
        const firstWord = ftoks.findIndex((_, idx) => isFullNavigableToken(ftoks, idx))
        setFullTokenIdx(firstWord >= 0 ? firstWord : 0)
      }
    }
  }, [selected?.full_analysis, analysisTab])

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

  // FullTest 토큰
  const fullTokens = selected?.full_analysis ? parseFullTestText(selected.full_analysis) : []
  const fullSelectableTokens = fullTokens.filter(t => !t.lineBreak)

  // 현재 탭에 따라 활성 토큰 결정
  const activeTokenIdx = analysisTab === 'full' ? fullTokenIdx : selectedTokenIdx
  const activeSelectableTokens = analysisTab === 'full' ? fullSelectableTokens : selectableTokens

  const selectedWordRaw = activeTokenIdx >= 0 && activeTokenIdx < activeSelectableTokens.length
    ? activeSelectableTokens[activeTokenIdx].text : ''
  // <<, >>, 쉼표 제거 (표시는 그대로, 선택 시 정제)
  const selectedWord = selectedWordRaw.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')

  // 클립보드 복사 헬퍼 (HTTP 환경 fallback 포함)
  const copyToClipboard = useCallback((text: string) => {
    if (!text) return
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {})
    } else {
      // HTTP 환경 fallback: textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }, [])

  // 선택 키워드 자동 클립보드 복사
  useEffect(() => {
    if (selectedWord) copyToClipboard(selectedWord)
  }, [selectedWord, copyToClipboard])

  // ─── 핫키 로드 ──────────────────────────────────────────────

  useEffect(() => {
    workspaceAPI.getHotkeys()
      .then(({ data }) => {
        if (data?.hotkeys && typeof data.hotkeys === 'object') {
          const h = { ...data.hotkeys }
          // 구버전 focusAnalysis → focusAnalysisSimple 마이그레이션
          if (h.focusAnalysis && !h.focusAnalysisSimple) {
            h.focusAnalysisSimple = h.focusAnalysis
            delete h.focusAnalysis
          }
          // 구버전 prevKeyword/nextKeyword → prevLine/nextLine 마이그레이션
          if (h.prevKeyword && !h.prevLine) {
            h.prevLine = h.prevKeyword
          }
          delete h.prevKeyword
          if (h.nextKeyword && !h.nextLine) {
            h.nextLine = h.nextKeyword
          }
          delete h.nextKeyword
          setHotkeys(prev => ({ ...prev, ...h }))
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
    if (analysisTab === 'full') {
      if (!fullTokens.length) return []
      const lines: number[][] = [[]]
      fullTokens.forEach(t => {
        if (t.lineBreak) {
          lines.push([])
        } else {
          const si = fullSelectableTokens.indexOf(t)
          if (si >= 0 && isFullNavigableToken(fullSelectableTokens, si)) {
            lines[lines.length - 1].push(si)
          }
        }
      })
      return lines.filter(line => line.length > 0)
    }
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
  }, [tokens, selectableTokens, fullTokens, fullSelectableTokens, analysisTab])

  // ─── 사전 빌드 ──────────────────────────────────────────────

  const 키워드새로고침 = useCallback(async () => {
    const target = await 목록초기화()
    if (target) {
      setMorphPrefillKw(target.keyword)
      setMorphTrigger(prev => prev + 1)
    }
  }, [목록초기화, setMorphPrefillKw, setMorphTrigger])

  const 사전빌드실행 = useCallback(() => {
    if (!selectedDomain || isBlocked) return
    executeBuild(selectedDomain, selectedWorkspace, {
      onDone: () => {
        message.success('사전 빌드 완료 — 분석결과를 갱신합니다.')
        키워드새로고침()
      },
      onError: (msg) => {
        message.error(msg || '빌드 실패')
      },
    })
  }, [selectedDomain, selectedWorkspace, isBlocked, executeBuild, 키워드새로고침])

  // ─── 추천 검색 ───────────────────────────────────────────────

  const 추천검색 = useCallback(async (keyword: string) => {
    if (!selectedDomain) return
    set추천로딩(true)
    setLlm결과([])
    setLlm모델별결과([])
    try {
      const { data } = await 클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/recommend`, {
        params: { keyword, limit: 50, ...(selectedWorkspace ? { workspace: selectedWorkspace } : {}) },
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

  // 탭별 토큰 setter/navigable 래퍼
  const setActiveTokenIdx = useCallback((idx: number | ((prev: number) => number)) => {
    if (analysisTab === 'full') {
      setFullTokenIdx(idx as any)
    } else {
      setSelectedTokenIdx(idx as any)
    }
  }, [analysisTab])

  const isActiveNavigable = useCallback((toks: any[], idx: number) => {
    if (analysisTab === 'full') return isFullNavigableToken(toks as FullToken[], idx)
    return isNavigableToken(toks as Token[], idx)
  }, [analysisTab])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName

    // ESC — 컨텍스트 메뉴 닫기 (최우선)
    if (e.key === 'Escape' && 컨텍스트메뉴.open) {
      e.preventDefault(); e.stopPropagation()
      set컨텍스트메뉴(prev => ({ ...prev, open: false }))
      return
    }

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
      saveLastSelected(filteredItems[newIdx].id)
      // Alt+↑: 첫 줄 첫 워드 (기본 동작 — ref 설정 안 함)
      if (!filteredItems[newIdx].flag) {
        assignmentApi.updateFlag(filteredItems[newIdx].id, 'R', selectedWorkspace ?? '').catch(() => {})
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
      saveLastSelected(filteredItems[newIdx].id)
      if (!filteredItems[newIdx].flag) {
        assignmentApi.updateFlag(filteredItems[newIdx].id, 'R', selectedWorkspace ?? '').catch(() => {})
        setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
      }
      return
    }

    // Alt+←/→ 줄 내 첫/마지막 워드 이동
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !추천모달열림 && isCenterFocused) {
      e.preventDefault(); e.stopPropagation()
      if (!activeSelectableTokens.length || !lineTokens.length) return
      const curLine = lineTokens.findIndex(line => line.includes(activeTokenIdx))
      if (curLine < 0) return
      const line = lineTokens[curLine]
      if (e.key === 'ArrowLeft') {
        setActiveTokenIdx(line[0])
      } else {
        setActiveTokenIdx(line[line.length - 1])
      }
      return
    }

    // 추천모달 키보드 네비게이션
    if (추천모달열림) {
      const key = e.key
      const isAlt = e.altKey
      const aiKey = hotkeys.aiAnalysis || 'r'
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', aiKey].includes(key)) {
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
        } else if (key === aiKey) {
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

    // Home/End → 분석결과 LITE/FULL 포커스 (항상 동작)
    if (action === 'focusAnalysisSimple') {
      e.preventDefault()
      setAnalysisTab('simple'); setIsCenterFocused(true)
      return
    }
    if (action === 'focusAnalysisFull') {
      e.preventDefault()
      setAnalysisTab('full'); setIsCenterFocused(true)
      return
    }
    // Tab(toggleAnalysisTab): 어디서든 분석결과 포커스 + LITE↔FULL 토글
    if (action === 'toggleAnalysisTab') {
      e.preventDefault()
      setIsCenterFocused(true)
      setAnalysisTab(prev => prev === 'simple' ? 'full' : 'simple')
      return
    }
    // q(focusKeywordSearch): 키워드검색 포커스
    if (action === 'focusKeywordSearch') {
      e.preventDefault()
      keywordSearchRef.current?.focus()
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

    // 방향키(prevLine/nextLine/prevAnalysis/nextAnalysis)는 키워드 선택 상태면 항상 동작 (포커스 모드 자동 진입)
    if ((action === 'prevLine' || action === 'nextLine' || action === 'prevAnalysis' || action === 'nextAnalysis') && selected) {
      // 분析결과 로딩 중에는 방향키 모두 차단
      if (!selected) { e.preventDefault(); return }
      if (!isCenterFocused) setIsCenterFocused(true)
      e.preventDefault()
    } else {
      // 나머지 핫키는 포커스 모드에서만
      if (!isCenterFocused) return
      e.preventDefault()
    }

    // 줄바꿈 이동: prevLine/nextLine (설정 가능)
    if (action === 'prevLine') {
      if (!activeSelectableTokens.length) {
        // 토큰 없어도 이전 키워드로 이동
        if (!filteredItems.length) return
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        if (curIdx > 0) {
          setSelected(filteredItems[curIdx - 1])
          saveLastSelected(filteredItems[curIdx - 1].id)
          if (!filteredItems[curIdx - 1].flag) {
            assignmentApi.updateFlag(filteredItems[curIdx - 1].id, 'R', selectedWorkspace ?? '').catch(() => {})
            setItems(prev => prev.map(i => i.id === filteredItems[curIdx - 1].id ? { ...i, flag: 'R' } : i))
          }
        }
        return
      }
      const curLine = lineTokens.findIndex(line => line.includes(activeTokenIdx))
      if (curLine <= 0) {
        // 첫 줄 → 이전 키워드 (마지막 줄의 첫 워드 선택)
        if (!filteredItems.length) return
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        if (curIdx <= 0) return
        const newIdx = curIdx - 1
        selectLastLineFirstRef.current = true
        setSelected(filteredItems[newIdx])
        saveLastSelected(filteredItems[newIdx].id)
        if (!filteredItems[newIdx].flag) {
          assignmentApi.updateFlag(filteredItems[newIdx].id, 'R', selectedWorkspace ?? '').catch(() => {})
          setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
        }
      } else {
        const curPosInLine = lineTokens[curLine].indexOf(activeTokenIdx)
        const prevLine = lineTokens[curLine - 1]
        const targetPos = Math.min(curPosInLine, prevLine.length - 1)
        setActiveTokenIdx(prevLine[targetPos])
      }
      return
    }
    if (action === 'nextLine') {
      if (!activeSelectableTokens.length) {
        // 토큰 없어도 다음 키워드로 이동
        if (!filteredItems.length) return
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        if (curIdx < filteredItems.length - 1) {
          setSelected(filteredItems[curIdx + 1])
          saveLastSelected(filteredItems[curIdx + 1].id)
          if (!filteredItems[curIdx + 1].flag) {
            assignmentApi.updateFlag(filteredItems[curIdx + 1].id, 'R', selectedWorkspace ?? '').catch(() => {})
            setItems(prev => prev.map(i => i.id === filteredItems[curIdx + 1].id ? { ...i, flag: 'R' } : i))
          }
        }
        return
      }
      const curLine = lineTokens.findIndex(line => line.includes(activeTokenIdx))
      if (curLine < 0 || curLine >= lineTokens.length - 1) {
        // 마지막 줄 → 다음 키워드
        if (!filteredItems.length) return
        const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
        const newIdx = curIdx < filteredItems.length - 1 ? curIdx + 1 : filteredItems.length - 1
        setSelected(filteredItems[newIdx])
        saveLastSelected(filteredItems[newIdx].id)
        if (!filteredItems[newIdx].flag) {
          assignmentApi.updateFlag(filteredItems[newIdx].id, 'R', selectedWorkspace ?? '').catch(() => {})
          setItems(prev => prev.map(i => i.id === filteredItems[newIdx].id ? { ...i, flag: 'R' } : i))
        }
      } else {
        const curPosInLine = lineTokens[curLine].indexOf(activeTokenIdx)
        const nextLine = lineTokens[curLine + 1]
        const targetPos = Math.min(curPosInLine, nextLine.length - 1)
        setActiveTokenIdx(nextLine[targetPos])
      }
      return
    }

    if (!action) return

    switch (action) {
      case 'prevAnalysis': {
        if (!activeSelectableTokens.length) break
        let prevIdx = activeTokenIdx - 1
        while (prevIdx >= 0 && !isActiveNavigable(activeSelectableTokens, prevIdx)) prevIdx--
        if (prevIdx >= 0) {
          setActiveTokenIdx(prevIdx)
        } else {
          const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
          if (curIdx > 0) {
            selectLastTokenRef.current = true
            setSelected(filteredItems[curIdx - 1])
            saveLastSelected(filteredItems[curIdx - 1].id)
            if (!filteredItems[curIdx - 1].flag) {
              assignmentApi.updateFlag(filteredItems[curIdx - 1].id, 'R', selectedWorkspace ?? '').catch(() => {})
              setItems(prev => prev.map(i => i.id === filteredItems[curIdx - 1].id ? { ...i, flag: 'R' } : i))
            }
          }
        }
        break
      }
      case 'nextAnalysis': {
        if (!activeSelectableTokens.length) break
        let nextIdx = activeTokenIdx + 1
        while (nextIdx < activeSelectableTokens.length && !isActiveNavigable(activeSelectableTokens, nextIdx)) nextIdx++
        if (nextIdx >= activeSelectableTokens.length) {
          // REQ-21: 마지막 토큰 → 다음 키워드 자동 이동
          const curIdx = selected ? filteredItems.findIndex(i => i.id === selected.id) : -1
          if (curIdx >= 0 && curIdx < filteredItems.length - 1) {
            setSelected(filteredItems[curIdx + 1])
            saveLastSelected(filteredItems[curIdx + 1].id)
            if (!filteredItems[curIdx + 1].flag) {
              assignmentApi.updateFlag(filteredItems[curIdx + 1].id, 'R', selectedWorkspace ?? '').catch(() => {})
              setItems(prev => prev.map(i => i.id === filteredItems[curIdx + 1].id ? { ...i, flag: 'R' } : i))
            }
          } else {
            message.info('모든 키워드를 완료했습니다')
          }
        } else {
          setActiveTokenIdx(nextIdx)
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
          클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/list`, { params: { search: selectedWord, size: 100, ...(selectedWorkspace ? { workspace: selectedWorkspace } : {}) } })
            .then(({ data }) => {
              const items = (data?.items || []).filter((i: any) => i.head_word === selectedWord)
              set등록키워드셋(items)
              if (items.length === 0) set추천포커스({ section: 1, item: 0 })
            }).catch(() => {})
        } else {
          클라이언트.post(`/dictionaries/${selectedDomain}/${dicType}${selectedWorkspace ? `?workspace=${selectedWorkspace}` : ''}`, { word: selectedWord, memo: '' })
            .then(() => {
              const 사전명 = dicType === 'udic' ? '사용자사전' : dicType === 'cndic' ? '복합명사사전' : '유사어사전'
              message.success(`${사전명}에 "${selectedWord}" 등록`)
              setEscKeyword(selectedWord)
              setEscCount(0)
              setDicRefreshKey(prev => prev + 1)
              setActiveTab(dicType)
              if (dicType === 'udic') setUdicSearch(selectedWord)
              else if (dicType === 'cndic') setCndicSearch(selectedWord)
              if (selected) {
                assignmentApi.updateFlag(selected.id, 'W', selectedWorkspace ?? '').catch(() => {})
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
      case 'analyzeKeyword': {
        const kw = selectedWord || selected?.keyword
        if (kw) {
          setActiveTab('morpheme')
          setAnalysisRightTab('morpheme')
          setMorphPrefillKw(kw)
          setMorphTrigger(prev => prev + 1)
        }
        break
      }
      case 'aiAnalysis': {
        const kw = selectedWord || selected?.keyword
        if (kw) {
          setAnalysisRightTab('ai')
          setAiKeyword(kw)
        }
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
  }, [hotkeys, derivedHotkeys, isCenterFocused, items, filteredItems, selected, selectableTokens, selectedTokenIdx, selectedWord, selectedDomain, selectedWorkspace, escKeyword, escCount, 추천검색, 추천모달열림, 추천섹션목록, 추천포커스, LLM분석, llmModelBoundaries, lineTokens, analysisTab, activeTokenIdx, activeSelectableTokens, setActiveTokenIdx, isActiveNavigable, fullTokenIdx, 컨텍스트메뉴.open])

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
      // myPhase를 idle로 변경 → 데이터할당 메뉴 활성화
      await workspaceAPI.setMyPhase(selectedWorkspace, selectedDomain, 'idle')
      message.success('작업이 완료 처리되었습니다.')
      await useWorkspaceStore.getState().loadWorkspaceStatus()
      setCompleteModalOpen(false)
      navigate('/assignment')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '완료 처리 실패')
    } finally {
      setCompleteLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, navigate])

  // ─── 일괄 작업 ──────────────────────────────────────────────

  const bulkRegisterKeywords = useCallback(async (keywords: string[], dicType: string) => {
    if (!selectedWorkspace || !selectedDomain) return
    try {
      await 클라이언트.post('/assignment/bulk-register', {
        workspace_id: selectedWorkspace,
        domain_id: selectedDomain,
        keywords,
        dic_type: dicType,
      })
      message.success(`${keywords.length}개 키워드를 ${dicType} 사전에 등록했습니다.`)
      setBulkSelectedKeys([])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '일괄 등록 실패')
    }
  }, [selectedWorkspace, selectedDomain])

  const bulkDeleteKeywords = useCallback(async () => {
    if (!selectedWorkspace || !selectedDomain || bulkSelectedKeys.length === 0) return
    const selectedItems = items.filter(i => bulkSelectedKeys.includes(i.id))
    const keywords = selectedItems.map(i => i.keyword)
    try {
      await 클라이언트.post('/assignment/bulk-delete', {
        workspace_id: selectedWorkspace,
        domain_id: selectedDomain,
        keywords,
      })
      message.success(`${keywords.length}개 키워드를 삭제했습니다.`)
      setItems(prev => prev.filter(i => !bulkSelectedKeys.includes(i.id)))
      setBulkSelectedKeys([])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '일괄 삭제 실패')
    }
  }, [selectedWorkspace, selectedDomain, bulkSelectedKeys, items])

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
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', gap: 0, overflow: 'hidden' }}
      onClick={() => {
        // 방금(100ms 이내) 열린 메뉴는 닫지 않음
        set컨텍스트메뉴(prev => (Date.now() - prev.ts < 100) ? prev : { ...prev, open: false })
        if (!추천모달열림) setIsCenterFocused(false)
      }}
    >
      {/* 배너 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px',
        background: '#fafafa', borderBottom: '1px solid #f0f0f0', borderRadius: 6,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>작업실</span>
        <Space wrap>
          {bulkSelectedKeys.length > 0 && (
            <>
              <Button
                icon={<PlusCircleOutlined />}
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  const selectedItems = items.filter(i => bulkSelectedKeys.includes(i.id))
                  bulkRegisterKeywords(selectedItems.map(i => i.keyword), 'udic')
                }}
              >
                사전 일괄 등록 ({bulkSelectedKeys.length})
              </Button>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                onClick={(e) => { e.stopPropagation(); bulkDeleteKeywords() }}
              >
                일괄 삭제 ({bulkSelectedKeys.length})
              </Button>
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={(e) => { e.stopPropagation(); setBulkSelectedKeys([]) }}
              >
                선택 해제
              </Button>
            </>
          )}
          <Button
            loading={isBlocked}
            disabled={!selectedDomain || isBlocked}
            onClick={(e) => { e.stopPropagation(); 사전빌드실행() }}
          >
            {isBlocked ? '빌드 중...' : '사전 빌드'}
          </Button>
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
            다음단계로
          </Button>
        </Space>
      </div>

      {/* 3컬럼 메인 */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* 좌측열: 키워드목록 + 키워드분석 */}
        <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{`작업키워드(${workedCount}/${totalCount})`}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  disabled={loading}
                  onClick={키워드새로고침}
                  style={{ marginRight: 4 }}
                />
              </div>
            }
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
          >
            <div style={{ padding: '4px 8px', flexShrink: 0 }}>
              <Input
                ref={keywordSearchRef as any}
                placeholder="키워드 검색..." value={키워드필터} onChange={e => set키워드필터(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); set키워드필터(''); (e.target as HTMLElement).blur() } }}
                allowClear size="small" style={{ width: '100%' }}
              />
            </div>
            {/* 전체 선택 체크박스 */}
            {(() => {
              const filtered = items.filter(r => !키워드필터 || r.keyword.includes(키워드필터))
              const filteredIds = filtered.map(i => i.id)
              const allChecked = filteredIds.length > 0 && filteredIds.every(id => bulkSelectedKeys.includes(id))
              const indeterminate = filteredIds.some(id => bulkSelectedKeys.includes(id)) && !allChecked
              return (
                <div style={{ padding: '2px 8px', flexShrink: 0, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={allChecked}
                    indeterminate={indeterminate}
                    onChange={() => {
                      if (allChecked) {
                        setBulkSelectedKeys(prev => prev.filter(k => !filteredIds.includes(k)))
                      } else {
                        setBulkSelectedKeys(prev => [...new Set([...prev, ...filteredIds])])
                      }
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#666' }}>
                      전체 선택{bulkSelectedKeys.length > 0 ? ` (${bulkSelectedKeys.length})` : ''}
                    </span>
                  </Checkbox>
                </div>
              )
            })()}
            <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto' }}>
              {loadingPrev && (
                <div style={{ textAlign: 'center', padding: 8 }}><Spin size="small" /></div>
              )}
              {loading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              ) : items.filter(r => !키워드필터 || r.keyword.includes(키워드필터)).map((record) => (
                <div
                  key={record.id}
                  ref={(el) => { itemRefs.current[record.id] = el }}
                  onClick={(e) => {
                    e.stopPropagation(); setSelected(record); setIsCenterFocused(true)
                    saveLastSelected(record.id)
                    if (!record.flag) {
                      assignmentApi.updateFlag(record.id, 'R', selectedWorkspace ?? '').catch(() => {})
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
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span onClick={(e) => {
                      e.stopPropagation()
                      setBulkSelectedKeys(prev =>
                        prev.includes(record.id) ? prev.filter(k => k !== record.id) : [...prev, record.id]
                      )
                    }} style={{ flexShrink: 0 }}>
                      <Checkbox checked={bulkSelectedKeys.includes(record.id)} onChange={() => {}} />
                    </span>
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
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <span style={{ marginRight: 12, fontSize: 13, fontWeight: 600 }}>분석결과</span>
                <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #f0f0f0' }}>
                  {([
                    { key: 'simple' as const, label: 'LITE', hotkey: hotkeys.focusAnalysisSimple || 'Home' },
                    { key: 'full' as const, label: 'FULL', hotkey: hotkeys.focusAnalysisFull || 'End' },
                  ]).map(tab => {
                    const active = analysisTab === tab.key
                    return (
                      <span
                        key={tab.key}
                        onClick={(e) => { e.stopPropagation(); setAnalysisTab(tab.key); setIsCenterFocused(true) }}
                        style={{
                          width: 72, textAlign: 'center',
                          padding: '3px 0 4px', fontSize: 11.5, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          color: active ? (selectedColor || '#1677ff') : '#999',
                          fontWeight: active ? 600 : 400,
                          borderBottom: active ? `2px solid ${selectedColor || '#1677ff'}` : '2px solid transparent',
                          marginBottom: -2,
                          transition: 'color 0.2s, border-color 0.2s',
                        }}
                      >
                        {tab.label}
                        <span style={{ transform: 'scale(0.85)', transformOrigin: 'center', display: 'inline-block' }}><KbdKey>{displayKey(tab.hotkey)}</KbdKey></span>
                      </span>
                    )
                  })}
                </div>
              </div>
            }
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
            onClick={(e) => {
              e.stopPropagation(); setIsCenterFocused(true)
              set컨텍스트메뉴(prev => (Date.now() - prev.ts < 100) ? prev : { ...prev, open: false })
            }}
          >
            <div style={{
              padding: 16, minHeight: '100%', transition: 'background-color 0.3s ease',
              backgroundColor: isCenterFocused ? '#FFFDE7' : undefined,
            }}>
            {analysisTab === 'simple' ? (
              /* ── LITE 탭 ── */
              selected ? (
                <div style={{ fontSize: 13, lineHeight: 2.0 }}>
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
                            copyToClipboard(cleaned)
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
                          copyToClipboard(cleaned)
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
              )
            ) : (
              /* ── FULL 탭 (FullTest) ── */
              selected?.full_analysis ? (
                <div style={{ fontSize: 13, lineHeight: 2.0 }}>
                  {fullTokens.map((token, i) => {
                    if (token.lineBreak) return <br key={`fbr-${i}`} />
                    const selIdx = fullSelectableTokens.findIndex(t => t === token)
                    const isSelected = selIdx === fullTokenIdx
                    const isPosTag = (token as FullToken).isPosTag
                    return (
                      <span
                        key={i}
                        onClick={(e) => {
                          if (isPosTag) return
                          e.stopPropagation(); e.preventDefault()
                          setFullTokenIdx(selIdx); setIsCenterFocused(true)
                          if (isWordToken(token.text)) {
                            const cleaned = token.text.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')
                            copyToClipboard(cleaned)
                            const rect = (e.target as HTMLElement).getBoundingClientRect()
                            set컨텍스트메뉴({ open: true, x: rect.left, y: rect.bottom + 4, word: cleaned, tokenIdx: selIdx, ts: Date.now() })
                          } else {
                            set컨텍스트메뉴(prev => ({ ...prev, open: false }))
                          }
                        }}
                        onContextMenu={(e) => {
                          if (isPosTag || !isWordToken(token.text)) return
                          e.preventDefault(); e.stopPropagation()
                          setFullTokenIdx(selIdx); setIsCenterFocused(true)
                          const cleaned = token.text.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')
                          copyToClipboard(cleaned)
                          set컨텍스트메뉴({ open: true, x: e.clientX, y: e.clientY, word: cleaned, tokenIdx: selIdx, ts: Date.now() })
                        }}
                        style={{
                          cursor: isPosTag ? 'default' : 'pointer',
                          padding: '1px 2px', borderRadius: 3,
                          marginRight: isPosTag ? 8 : 4,
                          transition: 'background 0.15s',
                          ...(isPosTag ? { color: '#999', fontSize: 11, fontStyle: 'italic' } : {}),
                          ...(isSelected && !isPosTag ? { background: '#FCE4EC' } : {}),
                        }}
                      >
                        {token.text}
                      </span>
                    )
                  })}
                </div>
              ) : selected ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Text type="secondary">FULL 분석 결과 없음</Text>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Text type="secondary">좌측에서 키워드를 선택하세요.</Text>
                </div>
              )
            )}
            </div>
          </Card>

          {/* 토큰 우클릭 컨텍스트 메뉴 */}
          {컨텍스트메뉴.open && (<>
            {/* 투명 오버레이 — 바깥 클릭 시 메뉴 닫기 */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 1049 }}
              onClick={() => set컨텍스트메뉴(prev => ({ ...prev, open: false }))}
              onContextMenu={(e) => { e.preventDefault(); set컨텍스트메뉴(prev => ({ ...prev, open: false })) }}
            />
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
                { label: '키워드 분석', key: hotkeys.analyzeKeyword || '0', action: () => { setAnalysisRightTab('morpheme'); setMorphPrefillKw(컨텍스트메뉴.word); setMorphTrigger(p => p + 1) } },
                { label: 'AI 분석', key: hotkeys.aiAnalysis || '/', action: () => { setAnalysisRightTab('ai'); setAiKeyword(컨텍스트메뉴.word) } },
                { divider: true },
                { label: '사용자사전 등록', key: hotkeys.registerUdic || '1', action: () => {
                  클라이언트.post(`/dictionaries/${selectedDomain}/udic${selectedWorkspace ? `?workspace=${selectedWorkspace}` : ''}`, { word: 컨텍스트메뉴.word, memo: '' })
                    .then(() => { message.success(`사용자사전에 "${컨텍스트메뉴.word}" 등록`); setDicRefreshKey(p => p + 1) })
                    .catch(() => message.error('등록 실패'))
                }},
                { label: '복합명사사전 등록', key: hotkeys.registerCndic || '2', action: () => {
                  클라이언트.post(`/dictionaries/${selectedDomain}/cndic${selectedWorkspace ? `?workspace=${selectedWorkspace}` : ''}`, { word: 컨텍스트메뉴.word, memo: '' })
                    .then(() => { message.success(`복합명사사전에 "${컨텍스트메뉴.word}" 등록`); setDicRefreshKey(p => p + 1) })
                    .catch(() => message.error('등록 실패'))
                }},
                { label: '유사어 추천', key: hotkeys.registerThesaurus || '3', action: () => {
                  set추천키워드(컨텍스트메뉴.word); set추천결과([]); setLlm결과([]); setLlm모델별결과([]); set등록키워드셋([])
                  set추천포커스({ section: 0, item: 0 })
                  set추천모달열림(true); 추천검색(컨텍스트메뉴.word); setActiveTab('thesaurus')
                  클라이언트.get(`/dictionaries/${selectedDomain}/thesaurus/list`, { params: { search: 컨텍스트메뉴.word, size: 100, ...(selectedWorkspace ? { workspace: selectedWorkspace } : {}) } })
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
          </>)}

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
                  children: <DicTab dicType="udic" domain={selectedDomain ?? ''} workspace={selectedWorkspace || undefined} refreshKey={dicRefreshKey} externalSearch={udicSearch} autoFocusTrigger={udicFocusTrigger} />,
                },
                {
                  key: 'cndic',
                  label: <span>복합명사사전 <KbdKey>{displayTabKey(derivedHotkeys.tabCndic)}</KbdKey></span>,
                  children: <DicTab dicType="cndic" domain={selectedDomain ?? ''} workspace={selectedWorkspace || undefined} refreshKey={dicRefreshKey} externalSearch={cndicSearch} autoFocusTrigger={cndicFocusTrigger} />,
                },
                {
                  key: 'thesaurus',
                  label: <span>유사어사전 <KbdKey>{displayTabKey(derivedHotkeys.tabThesaurus)}</KbdKey></span>,
                  children: <DicTab dicType="thesaurus" domain={selectedDomain ?? ''} workspace={selectedWorkspace || undefined} refreshKey={dicRefreshKey} externalSearch={thesaurusSearch} autoFocusTrigger={thesaurusFocusTrigger} thesaurusExternalOpen={thesaurusExternalOpen} onModalClose={() => setIsCenterFocused(true)} />,
                },
              ]}
            />
          </Card>
        </div>

        {/* 우측열: 키워드분석/AI분석(탭) + 작업이력 */}
        <div style={{ width: 450, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Card
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
          >
            <Tabs
              size="small"
              activeKey={analysisRightTab}
              onChange={(key) => setAnalysisRightTab(key as 'morpheme' | 'ai')}
              style={{ height: '100%' }}
              tabBarStyle={{ margin: '0 12px' }}
              items={[
                {
                  key: 'morpheme',
                  label: <span>키워드 분석 <KbdKey>{displayTabKey(derivedHotkeys.tabMorpheme)}</KbdKey></span>,
                  children: <div style={{ padding: '4px 12px 12px' }}><MorphemeTab domain={selectedDomain} workspace={selectedWorkspace || undefined} prefillKeyword={morphPrefillKw} prefillTrigger={morphTrigger} autoFocusTrigger={morphFocusTrigger} onAnalysisDone={목록초기화} /></div>,
                },
                {
                  key: 'ai',
                  label: <span>AI 분석 <KbdKey>{displayKey(hotkeys.aiAnalysis)}</KbdKey></span>,
                  children: <div style={{ padding: 8 }}><AIAnalysis initialKeyword={aiKeyword} isAdmin={user?.auth === 'A'} forcedTab={aiForcedTab} /></div>,
                },
              ]}
            />
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
      <ThesaurusRecommendModal
        open={추천모달열림}
        onCancel={() => { if (!추천프롬프트모달) set추천모달열림(false) }}
        afterClose={() => setTimeout(() => setIsCenterFocused(true), 50)}
        keyword={추천키워드}
        hotkeys={hotkeys}
        등록키워드셋={등록키워드셋}
        등록키워드Set={등록키워드Set}
        추천결과={추천결과}
        추천로딩={추천로딩}
        llm모델별결과={llm모델별결과}
        llm로딩={llm로딩}
        LLM분석={LLM분석}
        추천포커스={추천포커스}
        추천프롬프트모달={추천프롬프트모달}
        set추천프롬프트모달={set추천프롬프트모달}
        setThesaurusExternalOpen={setThesaurusExternalOpen}
      />

      {/* 유사어 LLM 프롬프트 편집 모달 */}
      <LLMPromptModal
        open={추천프롬프트모달}
        onCancel={() => set추천프롬프트모달(false)}
        llm프롬프트={llm프롬프트}
        setLlm프롬프트={setLlm프롬프트}
        기본추천프롬프트={기본추천프롬프트}
      />

      {/* 작업완료 모달 */}
      <CompleteModal
        open={completeModalOpen}
        onCancel={() => setCompleteModalOpen(false)}
        workedCount={workedCount}
        totalCount={totalCount}
        loading={completeLoading}
        onComplete={handleCompleteWithMode}
      />

      {/* 핫키 설정 모달 */}
      <HotkeySettings
        open={hotkeyModalOpen}
        onClose={() => setHotkeyModalOpen(false)}
        onSave={handleSaveHotkeys}
      />
    </div>
  )
}
