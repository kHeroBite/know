import React from 'react'
import { Modal, Button, Spin, Tag, Space, Tooltip, Typography } from 'antd'
import { EditOutlined, LinkOutlined } from '@ant-design/icons'

const { Text } = Typography

// ─── 핫키 표시 유틸 ─────────────────────────────────────────────
const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home', End: 'End', Tab: 'Tab',
}
function displayKey(key: string): string {
  if (key.includes('+')) {
    return key.split('+').map(p => keyDisplayMap[p] || p).join('+')
  }
  return keyDisplayMap[key] || key
}
const KbdKey = ({ children }: { children: React.ReactNode }) => (
  <kbd style={{
    display: 'inline-block', padding: '1px 6px', fontSize: '11px', lineHeight: '1.4',
    color: '#444',
    background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)',
    border: '1px solid #adb5bd',
    borderBottom: '3px solid #adb5bd',
    borderRadius: 4,
    boxShadow: '0 1px 0 rgba(0,0,0,0.2), 0 2px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)',
    textShadow: '0 1px 0 rgba(255,255,255,0.8)',
    fontFamily: 'monospace', whiteSpace: 'nowrap',
    cursor: 'default', userSelect: 'none' as React.CSSProperties['userSelect'],
  }}>{children}</kbd>
)

// ─── 한↔영 키보드 변환 (오타추천용) ─────────────────────────────
const KO_MAP = 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ'
const EN_MAP = 'qwertyuiopasdfghjklzxcvbnm'
const KO_SHIFT = 'ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ'
const EN_SHIFT = 'QWERTYUIOPASDFGHJKLZXCVBNM'

function koToEn(text: string): string {
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

// ─── Props ───────────────────────────────────────────────────────

export interface ThesaurusRecommendModalProps {
  open: boolean
  onCancel: () => void
  afterClose: () => void
  keyword: string
  hotkeys: Record<string, string>
  // 등록 키워드셋
  등록키워드셋: any[]
  등록키워드Set: Set<string>
  // 추천 결과
  추천결과: any[]
  추천로딩: boolean
  // AI 추천
  llm모델별결과: any[]
  llm로딩: boolean
  LLM분석: () => void
  // 포커스
  추천포커스: { section: number; item: number }
  // 프롬프트 모달
  추천프롬프트모달: boolean
  set추천프롬프트모달: (v: boolean) => void
  // 유사어 외부 열기
  setThesaurusExternalOpen: (fn: (prev: any) => any) => void
}

export default function ThesaurusRecommendModal({
  open, onCancel, afterClose, keyword, hotkeys,
  등록키워드셋, 등록키워드Set,
  추천결과, 추천로딩,
  llm모델별결과, llm로딩, LLM분석,
  추천포커스,
  추천프롬프트모달, set추천프롬프트모달,
  setThesaurusExternalOpen,
}: ThesaurusRecommendModalProps) {
  const 등록있음 = 등록키워드셋.length > 0
  const dimStyle: React.CSSProperties = 등록있음 ? { opacity: 0.35, filter: 'grayscale(0.3)', transition: 'opacity 0.2s' } : {}
  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
          <span>{`유사어 추천 — ${keyword}`}</span>
          <Button size="small" icon={<EditOutlined />} onClick={() => set추천프롬프트모달(true)}>프롬프트</Button>
        </div>
      }
      open={open}
      onCancel={onCancel}
      afterClose={afterClose}
      footer={null}
      width={680}
      keyboard={!추천프롬프트모달}
      destroyOnClose
    >
      {/* 등록 키워드셋 */}
      <div style={{ marginBottom: 16, ...(등록있음 ? { padding: 8, border: '2px solid #EF5350', borderRadius: 6, background: '#FFF8E1', boxShadow: '0 2px 8px rgba(239,83,80,0.25)' } : {}) }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 등록있음 ? '#C62828' : '#999', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 3, height: 12, background: 등록있음 ? '#EF5350' : '#ddd', borderRadius: 2 }} />
          등록 키워드셋 <span style={{ fontSize: 10, color: '#999' }}>({등록키워드셋.length})</span>
        </div>
        {등록키워드셋.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>등록된 유사어 없음</Text>
        ) : (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, maxHeight: 150, overflowY: 'auto', background: '#FFEBEE' }}>
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
      <div style={{ marginBottom: 16, ...dimStyle }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#558B2F', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 3, height: 12, background: '#8BC34A', borderRadius: 2 }} />
          추천 키워드셋 <span style={{ fontSize: 10, color: '#999' }}>({추천결과.filter((i: any) => i.head_word !== keyword).length})</span>
        </div>
        <Spin spinning={추천로딩}>
          {추천결과.filter((i: any) => i.head_word !== keyword).length === 0 && !추천로딩 ? (
            <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>결과 없음</Text>
          ) : (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, maxHeight: 180, overflowY: 'auto' }}>
              {추천결과.filter((i: any) => i.head_word !== keyword).map((item: any, idx: number) => (
                <div key={idx} data-recommend-section={1} data-recommend-item={idx}
                  style={{ padding: '5px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 추천포커스.section === 1 && 추천포커스.item === idx ? '#E6F4FF' : undefined }}
                  onClick={() => setThesaurusExternalOpen(prev => ({ head_word: item.head_word, tail_word: keyword, n: (prev?.n || 0) + 1, editMode: true } as any))}
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
      <div style={{ marginBottom: 16, ...dimStyle }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0277BD', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 3, height: 12, background: '#29B6F6', borderRadius: 2 }} />
          한영오타 키워드 <span style={{ fontSize: 10, color: '#999' }}>({getTypoVariants(keyword).length})</span>
        </div>
        {getTypoVariants(keyword).length === 0 ? (
          <Text type="secondary" style={{ fontSize: 11, paddingLeft: 12 }}>변환 결과 없음</Text>
        ) : (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 4 }}>
            {getTypoVariants(keyword).map((v, idx) => (
              <div key={idx} data-recommend-section={2} data-recommend-item={idx}
                style={{ padding: '5px 10px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, background: 추천포커스.section === 2 && 추천포커스.item === idx ? '#E6F4FF' : undefined }}
                onClick={() => setThesaurusExternalOpen(prev => ({ head_word: keyword, tail_word: v.value, n: (prev?.n || 0) + 1, editMode: true } as any))}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 추천포커스.section === 2 && 추천포커스.item === idx ? '#E6F4FF' : '' }}
              >
                {등록키워드Set.has(v.value) && <LinkOutlined style={{ color: '#52c41a', marginRight: 2, fontSize: 10 }} />}
                <Text type="secondary" style={{ fontSize: 10 }}>{v.label}</Text>
                <Text>{keyword}</Text>
                <Text type="secondary">→</Text>
                <Text strong>{v.value}</Text>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI추천 키워드 */}
      <div style={{ marginBottom: 8, ...dimStyle }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#E65100', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 12, background: '#FF9800', borderRadius: 2 }} />
            AI추천 키워드 <span style={{ fontSize: 10, color: '#999' }}>({llm모델별결과.reduce((s: number, m: any) => s + (m.items || []).filter((i: any) => i.head_word !== keyword).length, 0)})</span>
          </span>
          <Button size="small" type="primary" loading={llm로딩} onClick={LLM분석}>분석 실행 <KbdKey>{displayKey(hotkeys.aiAnalysis || 'r')}</KbdKey></Button>
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
                      {(modelResult.items || []).filter((item: any) => item.head_word !== keyword).length === 0 ? (
                        <div style={{ padding: 8, textAlign: 'center' }}><Text type="secondary" style={{ fontSize: 11 }}>{modelResult.raw_response ? '결과 없음' : '오류'}</Text></div>
                      ) : (modelResult.items || []).filter((item: any) => item.head_word !== keyword).map((item: any, idx: number) => {
                        const gi = globalIdx++; return (
                        <div
                          key={idx}
                          data-recommend-section={3} data-recommend-item={gi}
                          style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', fontSize: 12, background: 추천포커스.section === 3 && 추천포커스.item === gi ? '#E6F4FF' : undefined }}
                          onClick={() => setThesaurusExternalOpen(prev => ({ head_word: keyword, tail_word: item.head_word, n: (prev?.n || 0) + 1, editMode: true } as any))}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 추천포커스.section === 3 && 추천포커스.item === gi ? '#E6F4FF' : '' }}
                        >
                          {등록키워드Set.has(item.head_word) && <LinkOutlined style={{ color: '#52c41a', marginRight: 4, fontSize: 10 }} />}{item.head_word}
                        </div>
                      );})}
                    </div>
                  </div>
                )); })()}
              </div>
            )}
          </Spin>
        </div>
      </div>
    </Modal>
  )
}
