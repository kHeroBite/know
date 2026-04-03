"""유사어 추천 — 후보 검색 + 점수 + 중복 제거 + LLM 재순위."""
from __future__ import annotations

import logging
from sqlalchemy.orm import Session
from sqlalchemy import MetaData, select

from models.dictionary import 사전테이블가져오기, 사이트명검증
from services.typo_matcher import 검색변형생성
from services.llm_settings_service import LLM질의

logger = logging.getLogger(__name__)

# ─── 기본 LLM 프롬프트 ─────────────────────────────────────────────────────────

_기본프롬프트 = """당신은 검색엔진 유사어 사전 전문가입니다.
아래 키워드가 의미적으로 가장 잘 어울리는 유사어 그룹을 상위 5개 선택하세요.
키워드: {keyword}
분석 컨텍스트: {context}
유사어 그룹 후보:
{candidates}
응답 형식: 번호만 쉼표로 구분. 예: 3,7,12,1,45"""


# ─── 유틸 ──────────────────────────────────────────────────────────────────────

def 세트정규화키(head: str, tail: str) -> frozenset:
    """양방향 중복 제거용 키: (head, tail 단어들)의 집합 → 순서 무관 비교."""
    tail_set = frozenset(w.strip() for w in tail.split(',') if w.strip())
    return frozenset({head.strip()} | tail_set)


def _매칭점수(
    변형어: str,
    keyword: str,
    유형: str,
    is_완전: bool,
    is_head: bool,
) -> int:
    """매칭 유형별 점수 반환.

    완전일치: 원본 head=100, 원본 tail=90, 한영=40, 모음오타=30, 인접키=20
    부분일치: 원본=60, 한영=15, 모음오타/인접키=10
    """
    is_원본 = (변형어 == keyword)
    is_한영 = '한영변환' in 유형
    is_모음 = '모음오타' in 유형
    is_인접 = '인접키' in 유형

    if is_완전:
        if is_원본:
            return 100 if is_head else 90
        if is_한영:
            return 40
        if is_모음:
            return 30
        if is_인접:
            return 20
        return 0
    else:
        if is_원본:
            return 60
        if is_한영:
            return 15
        if is_모음 or is_인접:
            return 10
        return 0


# ─── 후보 검색 ─────────────────────────────────────────────────────────────────

def 유사어추천후보검색(
    db: Session,
    site: str,
    keyword: str,
    limit: int = 50,
) -> list[dict]:
    """유사어 추천 후보 검색 후 점수 순 반환.

    1. 검색변형생성(keyword) 변형 목록 생성
    2. DB thesaurus 전체 로드
    3. 각 행 변형 매칭 → 점수 계산
    4. 양방향 중복 제거 (정규화키)
    5. 상위 limit개 반환: [{"head_word", "tail_words", "score", "match_type", "members"}]
    """
    사이트명검증(site)

    # 1. 변형 목록
    변형들 = 검색변형생성(keyword)  # [(변형어, 유형, 감산), ...]
    변형맵: dict[str, tuple[str, int]] = {v[0]: (v[1], v[2]) for v in 변형들}

    # 2. thesaurus 전체 로드
    meta = MetaData()
    tbl = 사전테이블가져오기(site.upper(), 'thesaurus', meta)

    try:
        rows = db.execute(select(tbl)).mappings().all()
    except Exception:
        return []

    # 3. 매칭 + 점수 계산
    후보들: list[dict] = []
    seen_keys: dict[frozenset, int] = {}  # 정규화키 → 후보들 인덱스

    for row in rows:
        head = (row['_HEAD_WORD'] or '').strip()
        tail_raw = (row['_TAIL_WORD'] or '').strip()
        tail_words = [w.strip() for w in tail_raw.split(',') if w.strip()]
        모든멤버 = [head] + tail_words

        best_score = -1
        best_match_type = ''

        for 변형어, (유형, 감산) in 변형맵.items():
            변형_upper = 변형어.upper()
            head_upper = head.upper()
            tail_upper_list = [w.upper() for w in tail_words]

            # head 완전 일치
            if head_upper == 변형_upper:
                점수 = _매칭점수(변형어, keyword, 유형, True, True) + 감산
                if 점수 > best_score:
                    best_score = 점수
                    best_match_type = f'head완전' if 변형어 == keyword else f'head완전_{유형}'
                continue

            # tail 완전 일치
            if 변형_upper in tail_upper_list:
                점수 = _매칭점수(변형어, keyword, 유형, True, False) + 감산
                if 점수 > best_score:
                    best_score = 점수
                    best_match_type = f'tail완전' if 변형어 == keyword else f'tail완전_{유형}'
                continue

            # head 부분 일치
            if 변형_upper in head_upper or head_upper in 변형_upper:
                점수 = _매칭점수(변형어, keyword, 유형, False, True) + 감산
                if 점수 > best_score:
                    best_score = 점수
                    best_match_type = f'head부분' if 변형어 == keyword else f'head부분_{유형}'
                continue

            # tail 부분 일치
            if any(변형_upper in w or w in 변형_upper for w in tail_upper_list):
                점수 = _매칭점수(변형어, keyword, 유형, False, False) + 감산
                if 점수 > best_score:
                    best_score = 점수
                    best_match_type = f'tail부분' if 변형어 == keyword else f'tail부분_{유형}'

        if best_score < 0:
            continue

        # 양방향 중복 제거 (동일 세트 중 최고 점수 유지)
        정규화키 = 세트정규화키(head, tail_raw)
        if 정규화키 in seen_keys:
            # 기존 항목보다 점수가 높으면 교체
            기존idx = seen_keys[정규화키]
            if best_score > 후보들[기존idx]['score']:
                후보들[기존idx] = {
                    'head_word': head,
                    'tail_words': tail_words,
                    'score': best_score,
                    'match_type': best_match_type,
                    'members': 모든멤버,
                }
            continue
        seen_keys[정규화키] = len(후보들)

        후보들.append({
            'head_word': head,
            'tail_words': tail_words,
            'score': best_score,
            'match_type': best_match_type,
            'members': 모든멤버,
        })

    # 점수 내림차순 정렬 → 상위 limit개 반환
    후보들.sort(key=lambda x: x['score'], reverse=True)
    return 후보들[:limit]


# ─── LLM 재순위 ────────────────────────────────────────────────────────────────

async def LLM재순위(
    keyword: str,
    candidates: list[dict],
    context: str = '',
    prompt: str = '',
    user_id: str = '',
) -> dict:
    """LLM에 후보 전달 → 상위 5개 선택.

    반환: {"items": [...], "provider": str, "raw_response": str}
    LLM 실패 시 점수 기준 상위 5개로 폴백.
    head완전/tail완전 항목은 LLM에 전달하지 않고 결과에 그대로 포함.
    """
    if not candidates:
        return {'items': [], 'provider': None, 'raw_response': ''}

    # head완전/tail완전 분리 — 이미 확정적 매칭이므로 LLM 불필요
    def _is_exact(c: dict) -> bool:
        mt = c.get('match_type', '')
        return mt.startswith('head완전') or mt.startswith('tail완전')

    exact_items = [c for c in candidates if _is_exact(c)]
    llm_candidates = [c for c in candidates if not _is_exact(c)]

    # LLM 후보가 없으면 호출 자체 스킵
    if not llm_candidates:
        return {'items': candidates, 'provider': None, 'raw_response': ''}

    사용프롬프트 = prompt or _기본프롬프트

    # 후보 목록 포맷 (번호 1-based, LLM 후보만)
    후보텍스트 = '\n'.join(
        f"{i + 1}. [{c['head_word']}] → {', '.join(c['tail_words'][:5])}"
        for i, c in enumerate(llm_candidates)
    )

    # {context}, {candidates} 치환 — {keyword}는 LLM질의 내부에서 처리
    최종프롬프트 = (사용프롬프트
                  .replace('{context}', context or '없음')
                  .replace('{candidates}', 후보텍스트))

    try:
        llm결과 = await LLM질의(keyword, 최종프롬프트, user_id=user_id, usage_type='thesaurus_recommend')
        raw = llm결과.get('result') or ''
        provider = llm결과.get('provider')
        error = llm결과.get('error')

        if error or not raw:
            logger.warning('[LLM재순위] LLM 응답 없음, 점수 기준 폴백: %s', error)
            return {'items': exact_items + llm_candidates[:5], 'provider': provider, 'raw_response': raw or error or ''}

        # 응답에서 번호 파싱 (쉼표/공백/줄바꿈 구분)
        import re
        번호들: list[int] = []
        for token in re.split(r'[,\s]+', raw.strip()):
            token = token.strip()
            if not token:
                continue
            try:
                idx = int(token) - 1
                if 0 <= idx < len(llm_candidates) and idx not in 번호들:
                    번호들.append(idx)
            except ValueError:
                continue

        선택항목 = [llm_candidates[i] for i in 번호들[:5]]
        if not 선택항목:
            선택항목 = llm_candidates[:5]

        # exact 항목을 앞에 포함
        return {'items': exact_items + 선택항목, 'provider': provider, 'raw_response': raw}

    except Exception as e:
        logger.error('[LLM재순위] 예외 발생: %s', e)
        return {'items': exact_items + llm_candidates[:5], 'provider': None, 'raw_response': str(e)}
