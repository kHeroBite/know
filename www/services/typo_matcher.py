"""한영 자판 변환 + 오타 변형 생성 엔진."""
from __future__ import annotations

# ─── 한글 자모 상수 ──────────────────────────────────────────────────────────────

_초성목록 = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'   # 19개
_중성목록 = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'  # 21개
_종성목록 = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'  # 28개 (첫 문자 공백=종성없음)

_종성자음: frozenset[str] = frozenset(_종성목록.replace(' ', ''))

_복합종성분리: dict[str, tuple[str, str]] = {
    'ㄳ': ('ㄱ', 'ㅅ'), 'ㄵ': ('ㄴ', 'ㅈ'), 'ㄶ': ('ㄴ', 'ㅎ'),
    'ㄺ': ('ㄹ', 'ㄱ'), 'ㄻ': ('ㄹ', 'ㅁ'), 'ㄼ': ('ㄹ', 'ㅂ'),
    'ㄽ': ('ㄹ', 'ㅅ'), 'ㄾ': ('ㄹ', 'ㅌ'), 'ㄿ': ('ㄹ', 'ㅍ'),
    'ㅀ': ('ㄹ', 'ㅎ'), 'ㅄ': ('ㅂ', 'ㅅ'),
}
_복합종성조합: dict[tuple[str, str], str] = {v: k for k, v in _복합종성분리.items()}

# ─── 한영/영한 매핑 ──────────────────────────────────────────────────────────────

_한영_자모: dict[str, str] = {
    'ㅂ': 'q', 'ㅈ': 'w', 'ㄷ': 'e', 'ㄱ': 'r', 'ㅅ': 't',
    'ㅛ': 'y', 'ㅕ': 'u', 'ㅑ': 'i', 'ㅐ': 'o', 'ㅔ': 'p',
    'ㅁ': 'a', 'ㄴ': 's', 'ㅇ': 'd', 'ㄹ': 'f', 'ㅎ': 'g',
    'ㅗ': 'h', 'ㅓ': 'j', 'ㅏ': 'k', 'ㅣ': 'l',
    'ㅋ': 'z', 'ㅌ': 'x', 'ㅊ': 'c', 'ㅍ': 'v',
    'ㅠ': 'b', 'ㅜ': 'n', 'ㅡ': 'm',
    'ㅃ': 'Q', 'ㅉ': 'W', 'ㄸ': 'E', 'ㄲ': 'R', 'ㅆ': 'T',
}
_영한_자모: dict[str, str] = {v: k for k, v in _한영_자모.items()}

# ─── 오타 그룹 ────────────────────────────────────────────────────────────────────

_모음오타그룹: list[frozenset[str]] = [
    frozenset({'ㅐ', 'ㅔ'}),
    frozenset({'ㅒ', 'ㅖ'}),
    frozenset({'ㅚ', 'ㅙ', 'ㅞ'}),
    frozenset({'ㅏ', 'ㅐ'}),
    frozenset({'ㅓ', 'ㅔ'}),
]

_인접키: dict[str, list[str]] = {
    'ㅂ': ['ㅈ'],
    'ㅈ': ['ㅂ', 'ㄷ'],
    'ㄷ': ['ㅈ', 'ㄱ'],
    'ㄱ': ['ㄷ', 'ㅅ'],
    'ㅅ': ['ㄱ', 'ㅛ'],
    'ㅁ': ['ㄴ'],
    'ㄴ': ['ㅁ', 'ㅇ'],
    'ㅇ': ['ㄴ', 'ㄹ'],
    'ㄹ': ['ㅇ', 'ㅎ'],
    'ㅋ': ['ㅌ'],
    'ㅌ': ['ㅋ', 'ㅊ'],
    'ㅊ': ['ㅌ', 'ㅍ'],
}


# ─── 내부 함수 ────────────────────────────────────────────────────────────────────

def _자모분리(text: str) -> list[str]:
    """완성형 한글 + 자모 → 자모 리스트. 복합 종성은 개별 자모로 분리."""
    result: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            offset = code - 0xAC00
            종성_idx = offset % 28
            중성_idx = (offset // 28) % 21
            초성_idx = offset // (28 * 21)
            result.append(_초성목록[초성_idx])
            result.append(_중성목록[중성_idx])
            if 종성_idx > 0:
                종성 = _종성목록[종성_idx]
                if 종성 in _복합종성분리:
                    result.extend(_복합종성분리[종성])
                else:
                    result.append(종성)
        else:
            result.append(ch)
    return result


def _자모조합(자모들: list[str]) -> str:
    """자모 리스트 → 완성형 한글. 불가 조합은 자모 그대로."""

    def _글자(초: str, 중: str, 종: str = '') -> str:
        초_idx = _초성목록.find(초)
        중_idx = _중성목록.find(중)
        종_idx = _종성목록.find(종) if 종 else 0
        if 초_idx < 0 or 중_idx < 0:
            return 초 + 중 + 종
        return chr(0xAC00 + 초_idx * 21 * 28 + 중_idx * 28 + max(종_idx, 0))

    결과: list[str] = []
    # 상태: 0=빈, 1=초성, 2=초+중, 3=초+중+종1, 4=초+중+종1+종2후보
    state = 0
    초 = 중 = 종1 = 종2 = ''

    for jamo in 자모들:
        is_중 = jamo in _중성목록
        is_초 = jamo in _초성목록
        is_종 = jamo in _종성자음

        if state == 0:
            if is_초:
                초 = jamo; state = 1
            else:
                결과.append(jamo)

        elif state == 1:
            if is_중:
                중 = jamo; state = 2
            elif is_초:
                결과.append(초); 초 = jamo
            else:
                결과.append(초); 결과.append(jamo)
                초 = ''; state = 0

        elif state == 2:
            if is_종:
                종1 = jamo; state = 3
            elif is_중:
                결과.append(_글자(초, 중)); 결과.append(jamo)
                초 = 중 = ''; state = 0
            elif is_초:
                결과.append(_글자(초, 중)); 초 = jamo; 중 = ''; state = 1
            else:
                결과.append(_글자(초, 중)); 결과.append(jamo)
                초 = 중 = ''; state = 0

        elif state == 3:
            if is_중:
                # 종1이 새 글자 초성으로 이동
                결과.append(_글자(초, 중))
                if 종1 in _초성목록:
                    초 = 종1; 중 = jamo; 종1 = ''; state = 2
                else:
                    결과.append(종1); 결과.append(jamo)
                    초 = 중 = 종1 = ''; state = 0
            elif is_종 and (종1, jamo) in _복합종성조합:
                종2 = jamo; state = 4
            elif is_초 or is_종:
                # 복합 종성 불가 → 현재 글자 완성, 새 초성
                결과.append(_글자(초, 중, 종1))
                초 = 중 = 종1 = ''
                if jamo in _초성목록:
                    초 = jamo; state = 1
                else:
                    결과.append(jamo); state = 0
            else:
                결과.append(_글자(초, 중, 종1)); 결과.append(jamo)
                초 = 중 = 종1 = ''; state = 0

        elif state == 4:
            if is_중:
                # 종1만 종성으로, 종2가 새 글자 초성으로 이동
                결과.append(_글자(초, 중, 종1))
                if 종2 in _초성목록:
                    초 = 종2; 중 = jamo; 종1 = 종2 = ''; state = 2
                else:
                    결과.append(종2); 결과.append(jamo)
                    초 = 중 = 종1 = 종2 = ''; state = 0
            else:
                복합 = _복합종성조합.get((종1, 종2), '')
                결과.append(_글자(초, 중, 복합 if 복합 else 종1))
                if not 복합:
                    결과.append(종2)
                초 = 중 = 종1 = 종2 = ''; state = 0
                if is_초:
                    초 = jamo; state = 1
                else:
                    결과.append(jamo)

    # 마지막 상태 처리
    if state == 1:
        결과.append(초)
    elif state == 2:
        결과.append(_글자(초, 중))
    elif state == 3:
        결과.append(_글자(초, 중, 종1))
    elif state == 4:
        복합 = _복합종성조합.get((종1, 종2), '')
        결과.append(_글자(초, 중, 복합 if 복합 else 종1))
        if not 복합:
            결과.append(종2)

    return ''.join(결과)


def _한영변환(text: str) -> str:
    """한글 → 영문 자판 변환 (한글 입력을 영문 키로 변환)."""
    자모들 = _자모분리(text)
    return ''.join(_한영_자모.get(j, j) for j in 자모들)


def _영한변환(text: str) -> str:
    """영문 → 한글 자판 변환 (영문 키를 한글로 변환)."""
    자모들 = [_영한_자모.get(ch, ch) for ch in text]
    return _자모조합(자모들)


def _모음오타변형(text: str) -> list[str]:
    """모음 오타 변형 목록 생성 (모음을 유사 모음으로 교체)."""
    자모들 = _자모분리(text)
    변형들: list[str] = []

    for i, jamo in enumerate(자모들):
        for 그룹 in _모음오타그룹:
            if jamo in 그룹:
                for 대안 in 그룹:
                    if 대안 == jamo:
                        continue
                    새자모 = 자모들[:i] + [대안] + 자모들[i + 1:]
                    변형어 = _자모조합(새자모)
                    if 변형어 != text and 변형어 not in 변형들:
                        변형들.append(변형어)

    return 변형들


def _인접키변형(text: str) -> list[str]:
    """인접키 오타 변형 목록 생성 (인접한 키로 교체)."""
    자모들 = _자모분리(text)
    변형들: list[str] = []

    for i, jamo in enumerate(자모들):
        for 인접 in _인접키.get(jamo, []):
            새자모 = 자모들[:i] + [인접] + 자모들[i + 1:]
            변형어 = _자모조합(새자모)
            if 변형어 != text and 변형어 not in 변형들:
                변형들.append(변형어)

    return 변형들


# ─── 공개 API ─────────────────────────────────────────────────────────────────────

def 검색변형생성(keyword: str) -> list[tuple[str, str, int]]:
    """(변형어, 변형유형, 점수감산) 리스트 반환.

    점수감산: 원본=0, 한영변환=-60, 모음오타=-70, 인접키=-80
    변형 수 제한: 키워드 길이 1→최대 10개, 2이상→최대 20개
    """
    if not keyword:
        return []

    최대 = 10 if len(keyword) == 1 else 20
    결과: list[tuple[str, str, int]] = [(keyword, '원본', 0)]
    seen: set[str] = {keyword}

    def _추가(변형들: list[str], 유형: str, 감산: int) -> None:
        for v in 변형들:
            if len(결과) >= 최대:
                return
            if v and v not in seen:
                seen.add(v)
                결과.append((v, 유형, 감산))

    # 한→영 변환 (한글 입력이 있는 경우)
    if any('\uAC00' <= ch <= '\uD7A3' or ch in _한영_자모 for ch in keyword):
        한영 = _한영변환(keyword)
        if 한영 != keyword:
            _추가([한영], '한영변환', -60)

    # 영→한 변환 (영문 입력인 경우)
    if all(ch.isascii() for ch in keyword) and keyword.isalpha():
        영한 = _영한변환(keyword)
        if 영한 != keyword:
            _추가([영한], '한영변환', -60)

    # 모음 오타 변형
    _추가(_모음오타변형(keyword), '모음오타', -70)

    # 인접키 오타 변형
    _추가(_인접키변형(keyword), '인접키', -80)

    return 결과[:최대]
