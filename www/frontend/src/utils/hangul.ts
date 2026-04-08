// ─── 한↔영 키보드 변환 (오타추천용) ─────────────────────────────

const KO_MAP = 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ'
const EN_MAP = 'qwertyuiopasdfghjklzxcvbnm'
const KO_SHIFT = 'ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ'
const EN_SHIFT = 'QWERTYUIOPASDFGHJKLZXCVBNM'

export function koToEn(text: string): string {
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

export function enToKo(text: string): string {
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

export function getTypoVariants(keyword: string): { label: string; value: string }[] {
  if (!keyword) return []
  const results: { label: string; value: string }[] = []
  const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(keyword)
  const hasEnglish = /[a-zA-Z]/.test(keyword)
  if (hasKorean) results.push({ label: '한→영', value: koToEn(keyword) })
  if (hasEnglish) results.push({ label: '영→한', value: enToKo(keyword) })
  return results
}
