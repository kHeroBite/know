// ─── 분석결과 토큰 파싱 유틸 ─────────────────────────────────────

export interface Token {
  text: string
  index: number
  lineBreak?: boolean
}

export interface FullToken {
  text: string
  index: number
  lineBreak?: boolean
  isPosTag?: boolean   // 품사태그 여부 (ncn, ncp, jp, ef 등)
  eojeol?: string      // 원래 어절 (첫 탭 앞 부분)
}

export const POS_TAG_SET = new Set([
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

export function parseAnalysisText(text: string): Token[] {
  if (!text) return []
  const tokens: Token[] = []
  let idx = 0
  let prevLineWasSynList = false  // 직전 줄이 <<유사어목록>>이었는지
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const trimmed = line.trim()
    // <<유사어목록>> 라인은 하나의 토큰으로 처리 (워드 추출 제외 대상)
    if (trimmed.startsWith('<<') && trimmed.endsWith('>>')) {
      tokens.push({ text: trimmed, index: idx })
      idx++
      prevLineWasSynList = true
    } else {
      // 탭 구분 데이터
      const tabParts = trimmed.split('\t')
      const isSynDetail = prevLineWasSynList  // 유사어목록 직후 줄은 유사어별 줄바꿈
      // 일반 줄: 어절=분석결과 동일하면 어절(ti=0) 생략
      const skipEojeol = !isSynDetail && tabParts.length > 1 && tabParts[0].trim() === tabParts[1].trim()
      tabParts.forEach((tabPart, ti) => {
        const seg = tabPart.trim()
        if (!seg) return
        // <<유사어목록>> 직후 줄의 첫 번째 탭 세그먼트는 유사어 중복 → 스킵
        if (ti === 0 && isSynDetail) return
        // 일반 줄: 어절=분석결과 동일 → 어절 생략
        if (ti === 0 && skipEojeol) return
        // 유사어 상세 줄: 각 유사어별 줄바꿈 (두 번째 유사어부터)
        if (isSynDetail && ti > 1) {
          tokens.push({ text: '\n', index: -1, lineBreak: true })
        }
        // <유사어> 패턴 내부 개별 워드도 분리: "워드 <SYN1 SYN2>" → ["워드", "SYN1", "SYN2"]
        const segments = seg.match(/(<[^<>]+>|[^\s<>]+)/g) || []
        segments.forEach(part => {
          if (part.startsWith('<') && part.endsWith('>')) {
            const inner = part.slice(1, -1).trim()
            inner.split(/\s+/).filter(Boolean).forEach(w => {
              tokens.push({ text: w, index: idx })
              idx++
            })
          } else {
            // 꺽쇠(<<,>>)는 별도 토큰, 콤마(,)로 분리된 각 단어를 깔끔한 토큰으로
            const bracketSplit = part.split(/(<<|>>)/).filter(Boolean)
            bracketSplit.forEach(bp => {
              if (bp === '<<' || bp === '>>') {
                tokens.push({ text: bp, index: idx })
                idx++
                return
              }
              // 콤마 분리: STEEL,STILL → ['STEEL', 'STILL'] 각 단어를 깔끔한 별도 토큰으로
              const commaParts = bp.split(',').filter(Boolean)
              commaParts.forEach(cp => {
                tokens.push({ text: cp, index: idx })
                idx++
              })
            })
          }
        })
      })
      prevLineWasSynList = false
    }
    if (li < lines.length - 1) {
      tokens.push({ text: '\n', index: -1, lineBreak: true })
    }
  })
  return tokens
}

export function parseFullTestText(text: string): FullToken[] {
  if (!text) return []
  const tokens: FullToken[] = []
  let idx = 0
  let prevLineWasSynList = false  // 직전 줄이 <<유사어목록>>이었는지
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const trimmed = line.trim()
    if (!trimmed) {
      prevLineWasSynList = false
      if (li < lines.length - 1) tokens.push({ text: '\n', index: -1, lineBreak: true })
      return
    }
    // <<유사어목록>> 라인 — 하나의 토큰 (네비게이션 스킵됨)
    if (trimmed.startsWith('<<') && trimmed.endsWith('>>')) {
      tokens.push({ text: trimmed, index: idx })
      idx++
      prevLineWasSynList = true
      if (li < lines.length - 1) tokens.push({ text: '\n', index: -1, lineBreak: true })
      return
    }
    // <<유사어목록>> 직후 줄: 유사어 상세 (첫 탭 스킵, 각 탭별 줄바꿈)
    if (prevLineWasSynList) {
      prevLineWasSynList = false
      const tabParts = trimmed.split('\t')
      tabParts.forEach((tabPart, ti) => {
        if (ti === 0) return  // 첫 탭 세그먼트 스킵 (유사어 중복 나열)
        const seg = tabPart.trim()
        if (!seg) return
        if (ti > 1) {
          tokens.push({ text: '\n', index: -1, lineBreak: true })
        }
        // 콤마 분리: STEEL,STILL → ['STEEL', 'STILL'] 각 단어를 깔끔한 별도 토큰으로
        const commaParts = seg.split(',').filter(Boolean)
        commaParts.forEach(cp => {
          const t = cp.trim()
          if (t) {
            tokens.push({ text: t, index: idx })
            idx++
          }
        })
      })
      if (li < lines.length - 1) tokens.push({ text: '\n', index: -1, lineBreak: true })
      return
    }
    prevLineWasSynList = false
    // "워드 <유사어>" 패턴 (부분 유사어) — 탭 없음
    if (!trimmed.includes('\t') && /<[^<>]+>/.test(trimmed)) {
      // "워드 <SYN1 SYN2>" → 워드와 개별 유사어로 분리
      const segments = trimmed.match(/(<[^<>]+>|[^\s<>]+)/g) || []
      segments.forEach(seg => {
        if (seg.startsWith('<') && seg.endsWith('>')) {
          // <SYN1 SYN2> → 꺽쇠 제거 후 개별 워드로 분리
          const inner = seg.slice(1, -1).trim()
          inner.split(/\s+/).filter(Boolean).forEach(w => {
            tokens.push({ text: w, index: idx })
            idx++
          })
        } else {
          tokens.push({ text: seg, index: idx })
          idx++
        }
      })
      if (li < lines.length - 1) tokens.push({ text: '\n', index: -1, lineBreak: true })
      return
    }
    // 형태소 분석 결과 라인 (탭 구분) — 어절 + 형태소쌍을 같은 줄에 표시
    const parts = line.split('\t')
    const eojeol = parts[0]?.trim() || ''
    // 어절 표시
    tokens.push({ text: eojeol, index: idx, eojeol })
    idx++
    // 탭 이후: "형태소 품사" 쌍들 — 어절과 같은 줄에 표시
    const morphParts = parts.slice(1).map(s => s.trim()).filter(Boolean)
    if (morphParts.length > 0) {
      const isSingleSame = morphParts.length === 1 && morphParts[0].split(' ')[0] === eojeol
      morphParts.forEach(segment => {
        const lastSpace = segment.lastIndexOf(' ')
        if (lastSpace > 0) {
          const morpheme = segment.substring(0, lastSpace)
          const posTag = segment.substring(lastSpace + 1)
          if (!(isSingleSame && morpheme === eojeol)) {
            tokens.push({ text: morpheme, index: idx, eojeol })
            idx++
          }
          tokens.push({ text: posTag, index: idx, isPosTag: POS_TAG_SET.has(posTag.toLowerCase()), eojeol })
          idx++
        } else {
          tokens.push({ text: segment, index: idx, isPosTag: POS_TAG_SET.has(segment.toLowerCase()), eojeol })
          idx++
        }
      })
    }
    if (li < lines.length - 1) {
      tokens.push({ text: '\n', index: -1, lineBreak: true })
    }
  })
  return tokens
}

export function isWordToken(text: string): boolean {
  // 한글, 영문, 일본어(히라가나/카타카나), 한자
  if (!/[가-힣a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) return false
  // <<유사어목록>> 토큰, 꺽쇠 잔여 조각, 품사태그는 워드가 아님
  if (text.startsWith('<<') && text.endsWith('>>')) return false
  if (text.includes('<') || text.includes('>')) return false
  if (POS_TAG_SET.has(text.toLowerCase())) return false
  return true
}

export function isNavigableToken(toks: Token[], idx: number): boolean {
  const t = toks[idx]
  if (!isWordToken(t.text)) return false
  if (t.text === 'comp' && toks[idx + 1]?.text === ':') return false
  // 동일 텍스트의 첫 번째 토큰만 네비게이션 가능 (중복 skip)
  for (let i = 0; i < idx; i++) {
    if (toks[i].text === t.text && isWordToken(toks[i].text)) return false
  }
  return true
}

export function isFullNavigableToken(toks: FullToken[], idx: number): boolean {
  const t = toks[idx]
  if (t.lineBreak || t.isPosTag) return false
  if (!isWordToken(t.text)) return false
  // 동일 텍스트의 첫 번째만 네비게이션 가능 (중복 skip)
  for (let i = 0; i < idx; i++) {
    if (!toks[i].lineBreak && !toks[i].isPosTag && toks[i].text === t.text && isWordToken(toks[i].text)) return false
  }
  return true
}
