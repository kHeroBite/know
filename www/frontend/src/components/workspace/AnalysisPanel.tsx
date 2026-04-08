import React, { useState } from 'react'
import { Card, Typography } from 'antd'

const { Text } = Typography

// ─── 토큰 타입 ─────────────────────────────────────────────────

export interface Token {
  text: string
  index: number
  lineBreak?: boolean
}

export interface FullToken {
  text: string
  index: number
  lineBreak?: boolean
  isPosTag?: boolean
  eojeol?: string
}

// ─── 키보드키 표시 컴포넌트 ─────────────────────────────────────

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

// ─── 워드토큰 판별 ──────────────────────────────────────────────

const POS_TAG_SET = new Set([
  'ncn','ncp','ncpa','nq','nq_per','nq_loc','nq_tmp','nq_unt','nq_etc',
  'np','npd','npp','nbu','nbn',
  'pv','pvd','pvg','pa','pad','pag','px','pxm',
  'ec','ef','ep','etn','etm','ecs','ecx',
  'jc','jca','jcj','jcs','jcv','jco','jcr','jp','jxt','jxc',
  'mm','mmd','mmn','mag','maj',
  'ii','xp','xpn','xsn','xsv','xsa','xsm',
  'sf','sp','ss','se','so','sl','sw','sh','sn',
  'f','un','uv','uu','uf',
  'ukall','eng','j','chn','jpn','sy',
])

export function isWordToken(text: string): boolean {
  if (!/[가-힣a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) return false
  if (text.startsWith('<<') && text.endsWith('>>')) return false
  if (text.includes('<') || text.includes('>')) return false
  if (POS_TAG_SET.has(text.toLowerCase())) return false
  return true
}

// ─── Props ──────────────────────────────────────────────────────

export interface AnalysisPanelProps {
  /** 현재 탭 ('simple' | 'full') */
  analysisTab: 'simple' | 'full'
  onTabChange: (tab: 'simple' | 'full') => void
  /** 포커스 상태 */
  isFocused: boolean
  onFocus: () => void
  /** 색상 */
  selectedColor?: string
  /** 핫키 */
  hotkeySimple: string
  hotkeyFull: string

  // LITE 탭 데이터
  tokens: Token[]
  selectableTokens: Token[]
  selectedTokenIdx: number
  onTokenSelect: (idx: number) => void

  // FULL 탭 데이터
  fullTokens: FullToken[]
  fullSelectableTokens: FullToken[]
  fullTokenIdx: number
  onFullTokenSelect: (idx: number) => void

  /** 선택된 키워드 존재 여부 */
  hasSelected: boolean
  hasFullAnalysis: boolean

  /** 토큰 클릭 시 컨텍스트 메뉴 열기 */
  onContextMenu?: (word: string, tokenIdx: number, x: number, y: number) => void
  /** 클립보드 복사 */
  copyToClipboard?: (text: string) => void
}

/**
 * 중앙 분석결과 패널
 * - LITE/FULL 탭 전환
 * - 토큰 렌더링 + 선택 하이라이트
 * - 컨텍스트 메뉴 트리거
 */
export default function AnalysisPanel({
  analysisTab,
  onTabChange,
  isFocused,
  onFocus,
  selectedColor,
  hotkeySimple,
  hotkeyFull,
  tokens,
  selectableTokens,
  selectedTokenIdx,
  onTokenSelect,
  fullTokens,
  fullSelectableTokens,
  fullTokenIdx,
  onFullTokenSelect,
  hasSelected,
  hasFullAnalysis,
  onContextMenu,
  copyToClipboard,
}: AnalysisPanelProps) {

  const handleTokenClick = (
    e: React.MouseEvent,
    token: Token | FullToken,
    selIdx: number,
    isFull: boolean,
  ) => {
    e.stopPropagation()
    e.preventDefault()
    if (isFull) onFullTokenSelect(selIdx)
    else onTokenSelect(selIdx)
    onFocus()
    if (isWordToken(token.text)) {
      const cleaned = token.text.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')
      copyToClipboard?.(cleaned)
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      onContextMenu?.(cleaned, selIdx, rect.left, rect.bottom + 4)
    }
  }

  const handleTokenContextMenu = (
    e: React.MouseEvent,
    token: Token | FullToken,
    selIdx: number,
    isFull: boolean,
  ) => {
    if (!isWordToken(token.text)) return
    if ((token as FullToken).isPosTag) return
    e.preventDefault()
    e.stopPropagation()
    if (isFull) onFullTokenSelect(selIdx)
    else onTokenSelect(selIdx)
    onFocus()
    const cleaned = token.text.replace(/^<<|>>$/g, '').replace(/,$/g, '').replace(/^,/g, '')
    copyToClipboard?.(cleaned)
    onContextMenu?.(cleaned, selIdx, e.clientX, e.clientY)
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={{ marginRight: 12, fontSize: 13, fontWeight: 600 }}>분석결과</span>
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #f0f0f0' }}>
            {([
              { key: 'simple' as const, label: 'LITE', hotkey: hotkeySimple },
              { key: 'full' as const, label: 'FULL', hotkey: hotkeyFull },
            ]).map(tab => {
              const active = analysisTab === tab.key
              return (
                <span
                  key={tab.key}
                  onClick={(e) => { e.stopPropagation(); onTabChange(tab.key); onFocus() }}
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
                  <span style={{ transform: 'scale(0.85)', transformOrigin: 'center', display: 'inline-block' }}>
                    <KbdKey>{displayKey(tab.hotkey)}</KbdKey>
                  </span>
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
        ...(isFocused ? {
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          outline: `2px solid ${selectedColor || '#faad14'}`,
          transform: 'translateY(-2px)',
        } : {}),
      }}
      styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
      onClick={(e) => { e.stopPropagation(); onFocus() }}
    >
      <div style={{
        padding: 16, minHeight: '100%', transition: 'background-color 0.3s ease',
        backgroundColor: isFocused ? '#FFFDE7' : undefined,
      }}>
        {analysisTab === 'simple' ? (
          /* LITE 탭 */
          hasSelected ? (
            <div style={{ fontSize: 13, lineHeight: 2.0 }}>
              {tokens.map((token, i) => {
                if (token.lineBreak) return <br key={`br-${i}`} />
                const selIdx = selectableTokens.findIndex(t => t === token)
                const isSelected = selIdx === selectedTokenIdx
                return (
                  <span
                    key={i}
                    onClick={(e) => handleTokenClick(e, token, selIdx, false)}
                    onContextMenu={(e) => handleTokenContextMenu(e, token, selIdx, false)}
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
          /* FULL 탭 */
          hasFullAnalysis ? (
            <div style={{ fontSize: 13, lineHeight: 2.0 }}>
              {fullTokens.map((token, i) => {
                if (token.lineBreak) return <br key={`fbr-${i}`} />
                const selIdx = fullSelectableTokens.findIndex(t => t === token)
                const isSelected = selIdx === fullTokenIdx
                const isPosTag = (token as FullToken).isPosTag
                return (
                  <span
                    key={i}
                    onClick={(e) => { if (!isPosTag) handleTokenClick(e, token, selIdx, true) }}
                    onContextMenu={(e) => handleTokenContextMenu(e, token, selIdx, true)}
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
          ) : hasSelected ? (
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
  )
}
