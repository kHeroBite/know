import React, { useState } from 'react'

// ─── 핫키 기본값 ────────────────────────────────────────────────

export const 기본핫키맵: Record<string, string> = {
  prevAnalysis: 'ArrowLeft',
  nextAnalysis: 'ArrowRight',
  prevLine: 'ArrowUp',
  nextLine: 'ArrowDown',
  registerUdic: 'a',
  registerCndic: 's',
  registerThesaurus: 'd',
  analyzeKeyword: 'e',
  focusAnalysisSimple: 'Home',
  focusAnalysisFull: 'End',
  toggleAnalysisTab: 'Tab',
  focusKeywordSearch: 'q',
  aiAnalysis: 'r',
  undoHistory: 'Escape',
  aiTabAI: 'PageUp',
  aiTabWikipedia: 'PageDown',
}

// ─── 키 이벤트 인코딩 ───────────────────────────────────────────

export function encodeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.altKey) parts.push('Alt')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  const k = e.key === ' ' ? 'Space' : e.key
  if (!['Alt', 'Control', 'Shift', 'Meta'].includes(k)) parts.push(k)
  return parts.join('+')
}

// ─── 키 표시 유틸 ───────────────────────────────────────────────

export const keyDisplayMap: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Home: 'Home', End: 'End', Tab: 'Tab',
}

export function displayKey(key: string): string {
  if (key.includes('+')) {
    return key.split('+').map(p => keyDisplayMap[p] || p).join('+')
  }
  return keyDisplayMap[key] || key
}

export function displayTabKey(key: string): string {
  return key.replace(/^Alt\+/, '')
}

// ─── KbdKey 컴포넌트 ────────────────────────────────────────────

export const KbdKey = ({ children }: { children: React.ReactNode }) => {
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
