from __future__ import annotations
import glob
import os
import re
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func, MetaData
from sqlalchemy.exc import OperationalError, ProgrammingError
from fastapi import HTTPException
from models.dictionary import 사이트명검증, 사전테이블가져오기

DOMAIN_DIR = "/home/know/apps/know-ops/domain"

# 사전 타입 허용 목록
_허용사전타입 = {"udic", "cndic"}


def 단어정규화(word: str) -> str:
    """Java modifyWord() 동일 로직: 대문자 + BOM/쉼표/공백 제거."""
    if not word:
        return word
    result = word.upper()
    result = result.replace('\ufeff', '')   # BOM 제거
    result = result.replace(',', '')        # 쉼표 제거
    result = re.sub(r'\s', '', result)      # 공백/탭/줄바꿈 제거
    return result


def _사전테이블(db: Session, site: str, dic_type: str):
    """세션 바인드 엔진의 메타데이터로 사전 테이블 반환."""
    meta = MetaData()
    return 사전테이블가져오기(site.upper(), dic_type, meta)


def _타입검증(dic_type: str) -> None:
    if dic_type not in _허용사전타입:
        raise HTTPException(status_code=400, detail=f"알 수 없는 사전 타입: {dic_type} (허용: {_허용사전타입})")


# ─── UDIC / CNDIC ──────────────────────────────────────────────────

def 사전목록조회(
    db: Session,
    site: str,
    dic_type: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = None,
) -> dict:
    """사전 항목 목록 페이지네이션 조회 (udic/cndic)."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    offset = (page - 1) * size

    where_clause = []
    if search:
        키워드 = 단어정규화(search)
        where_clause.append(tbl.c._WORD.like(f"%{키워드}%"))

    cnt_stmt = select(func.count()).select_from(tbl)
    lst_stmt = select(tbl).offset(offset).limit(size)
    if where_clause:
        cnt_stmt = cnt_stmt.where(*where_clause)
        lst_stmt = lst_stmt.where(*where_clause)

    try:
        total = db.execute(cnt_stmt).scalar() or 0
        rows = db.execute(lst_stmt).mappings().all()
        items = [{"word": r["_WORD"], "memo": r.get("_MEMO")} for r in rows]
    except (OperationalError, ProgrammingError):
        return {"items": [], "total": 0, "page": page, "size": size}
    return {"items": items, "total": total, "page": page, "size": size}


def 사전항목추가(db: Session, site: str, dic_type: str, word: str, memo: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """사전 항목 추가 (단어정규화 적용)."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    정규화단어 = 단어정규화(word)

    # 중복 확인
    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 단어: {정규화단어}")

    db.execute(insert(tbl).values(_WORD=정규화단어, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now()))
    db.commit()
    return {"word": 정규화단어, "memo": memo}


def 사전항목수정(db: Session, site: str, dic_type: str, word: str, memo: Optional[str] = None) -> dict:
    """사전 항목 메모 수정."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    정규화단어 = 단어정규화(word)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"단어를 찾을 수 없음: {정규화단어}")

    db.execute(update(tbl).where(tbl.c._WORD == 정규화단어).values(_MEMO=memo, _UPDATED=datetime.now()))
    db.commit()
    return {"word": 정규화단어, "memo": memo}


def 사전항목삭제(db: Session, site: str, dic_type: str, word: str) -> None:
    """사전 항목 삭제."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    정규화단어 = 단어정규화(word)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"단어를 찾을 수 없음: {정규화단어}")

    db.execute(delete(tbl).where(tbl.c._WORD == 정규화단어))
    db.commit()


def 일괄항목추가(
    db: Session,
    site: str,
    dic_type: str,
    items: List[dict],
    user_id: Optional[str] = None,
) -> dict:
    """사전 항목 일괄 등록 (각 word 정규화 후 INSERT, 중복은 건너뜀)."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    성공 = 0
    건너뜀 = 0
    for item in items:
        정규화단어 = 단어정규화(item.get("word", ""))
        if not 정규화단어:
            건너뜀 += 1
            continue
        존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
        if 존재:
            건너뜀 += 1
            continue
        db.execute(insert(tbl).values(
            _WORD=정규화단어,
            _MEMO=item.get("memo"),
            _USER_ID=user_id,
            _UPDATED=datetime.now(),
        ))
        성공 += 1
    db.commit()
    return {"inserted": 성공, "skipped": 건너뜀}


# ─── THESAURUS (_HEAD_WORD PK, _TAIL_WORD = 쉼표 구분 목록) ────────

def 유의어목록조회(db: Session, site: str, page: int = 1, size: int = 50) -> dict:
    """유의어 목록 페이지네이션 조회."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    offset = (page - 1) * size
    try:
        total = db.execute(select(func.count()).select_from(tbl)).scalar() or 0
        rows = db.execute(select(tbl).offset(offset).limit(size)).mappings().all()
        items = [{"head_word": r["_HEAD_WORD"], "tail_word": r["_TAIL_WORD"], "memo": r.get("_MEMO")} for r in rows]
    except (OperationalError, ProgrammingError):
        return {"items": [], "total": 0, "page": page, "size": size}
    return {"items": items, "total": total, "page": page, "size": size}


def 유의어추가(db: Session, site: str, head_word: str, tail_word: str, memo: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """유의어 추가."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    정규화head = 단어정규화(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 유의어 헤드: {정규화head}")
    db.execute(insert(tbl).values(_HEAD_WORD=정규화head, _TAIL_WORD=tail_word, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now()))
    db.commit()
    return {"head_word": 정규화head, "tail_word": tail_word, "memo": memo}


def 유의어수정(db: Session, site: str, head_word: str, tail_word: str, memo: Optional[str] = None) -> dict:
    """유의어 수정."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    정규화head = 단어정규화(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"유의어를 찾을 수 없음: {정규화head}")
    db.execute(update(tbl).where(tbl.c._HEAD_WORD == 정규화head).values(_TAIL_WORD=tail_word, _MEMO=memo, _UPDATED=datetime.now()))
    db.commit()
    return {"head_word": 정규화head, "tail_word": tail_word, "memo": memo}


def 유의어삭제(db: Session, site: str, head_word: str) -> None:
    """유의어 삭제."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    정규화head = 단어정규화(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"유의어를 찾을 수 없음: {정규화head}")
    db.execute(delete(tbl).where(tbl.c._HEAD_WORD == 정규화head))
    db.commit()


def 유의어일괄추가(db: Session, site: str, items: List[dict], user_id: Optional[str] = None) -> dict:
    """유의어 일괄 등록."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    성공 = 0
    건너뜀 = 0
    for item in items:
        정규화head = 단어정규화(item.get("head_word", ""))
        if not 정규화head:
            건너뜀 += 1
            continue
        존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
        if 존재:
            건너뜀 += 1
            continue
        db.execute(insert(tbl).values(
            _HEAD_WORD=정규화head,
            _TAIL_WORD=item.get("tail_word", ""),
            _MEMO=item.get("memo"),
            _USER_ID=user_id,
            _UPDATED=datetime.now(),
        ))
        성공 += 1
    db.commit()
    return {"inserted": 성공, "skipped": 건너뜀}


# ─── 파일에서 사전 임포트 ─────────────────────────────────────────

def _사전파일찾기(도메인경로: str, patterns: List[str]) -> Optional[str]:
    """도메인 디렉토리에서 패턴에 맞는 사전 파일 찾기."""
    for pattern in patterns:
        # 루트에서 먼저 탐색
        matches = glob.glob(os.path.join(도메인경로, pattern))
        if matches:
            return sorted(matches)[-1]  # 가장 최신 파일
        # 1단계 하위 디렉토리에서 탐색
        matches = glob.glob(os.path.join(도메인경로, "*", pattern))
        if matches:
            return sorted(matches)[-1]
    return None


def _파일읽기(파일경로: str) -> List[str]:
    """파일을 읽어 줄 목록 반환 (빈줄 제거, BOM/CR 처리)."""
    줄목록 = []
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(파일경로, "r", encoding=enc) as f:
                for line in f:
                    줄 = line.rstrip("\r\n").strip()
                    if 줄:
                        줄목록.append(줄)
            return 줄목록
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 줄목록


def _udic_cndic_파일임포트(db: Session, site: str, dic_type: str, 파일경로: str, user_id: Optional[str] = None) -> int:
    """udic/cndic .ks 파일을 읽어 DB에 INSERT (기존 데이터 DELETE 후)."""
    tbl = _사전테이블(db, site, dic_type)
    db.execute(delete(tbl))

    줄목록 = _파일읽기(파일경로)
    삽입수 = 0
    중복set: set = set()
    for 줄 in 줄목록:
        parts = 줄.split("\t", 1)
        word = 단어정규화(parts[0].strip())
        memo = parts[1].strip() if len(parts) > 1 else None
        if not word or word in 중복set:
            continue
        중복set.add(word)
        db.execute(insert(tbl).values(
            _WORD=word, _MEMO=memo,
            _USER_ID=user_id, _UPDATED=datetime.now(),
        ))
        삽입수 += 1
    db.commit()
    return 삽입수


def _thesaurus_파일임포트(db: Session, site: str, 파일경로: str, user_id: Optional[str] = None) -> int:
    """addedsyn 파일을 읽어 thesaurus DB에 INSERT (기존 데이터 DELETE 후).

    지원 형식:
    1) 탭 구분: head_word\\ttail_word[\\tmemo]
    2) 그룹 형식: 빈줄로 구분된 단어 그룹 (첫 단어=head, 나머지=tail 쉼표 결합)
    """
    tbl = _사전테이블(db, site, "thesaurus")
    db.execute(delete(tbl))

    줄목록 = []
    빈줄포함목록 = []
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(파일경로, "r", encoding=enc) as f:
                for line in f:
                    stripped = line.rstrip("\r\n")
                    빈줄포함목록.append(stripped.strip())
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    # 탭 구분 형식 감지 (첫 10줄 중 탭이 있는지)
    비공백줄 = [l for l in 빈줄포함목록 if l]
    탭형식 = any("\t" in l for l in 비공백줄[:10])

    삽입수 = 0
    중복set: set = set()

    if 탭형식:
        for 줄 in 비공백줄:
            parts = 줄.split("\t")
            if len(parts) < 2:
                continue
            head = 단어정규화(parts[0].strip())
            tail = parts[1].strip()
            memo = parts[2].strip() if len(parts) > 2 else None
            if not head or not tail or head in 중복set:
                continue
            중복set.add(head)
            db.execute(insert(tbl).values(
                _HEAD_WORD=head, _TAIL_WORD=tail,
                _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now(),
            ))
            삽입수 += 1
    else:
        # 그룹 형식: 빈줄로 구분
        빈줄있음 = any(l == "" for l in 빈줄포함목록)
        if 빈줄있음:
            groups: List[List[str]] = []
            현재그룹: List[str] = []
            for 줄 in 빈줄포함목록:
                if 줄:
                    현재그룹.append(줄)
                else:
                    if 현재그룹:
                        groups.append(현재그룹)
                        현재그룹 = []
            if 현재그룹:
                groups.append(현재그룹)
            for grp in groups:
                head = 단어정규화(grp[0])
                tail_words = [단어정규화(w) for w in grp[1:] if w.strip()]
                if not head or head in 중복set:
                    continue
                중복set.add(head)
                db.execute(insert(tbl).values(
                    _HEAD_WORD=head,
                    _TAIL_WORD=",".join(tail_words) if tail_words else "",
                    _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                삽입수 += 1
        else:
            # 빈줄 없는 그룹 형식: 각 단어를 개별 head_word로 등록
            for 줄 in 비공백줄:
                word = 단어정규화(줄)
                if not word or word in 중복set:
                    continue
                중복set.add(word)
                db.execute(insert(tbl).values(
                    _HEAD_WORD=word, _TAIL_WORD="",
                    _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                삽입수 += 1

    db.commit()
    return 삽입수


def 파일에서사전임포트(db: Session, site: str, user_id: Optional[str] = None) -> dict:
    """도메인 디렉토리에서 사전 파일을 읽어 DB에 임포트.

    기존 DB 데이터 전체 DELETE 후 새로 INSERT.
    반환: {"udic": N, "cndic": N, "thesaurus": N}
    """
    사이트명검증(site)
    도메인경로 = os.path.join(DOMAIN_DIR, site.lower())
    if not os.path.isdir(도메인경로):
        raise HTTPException(status_code=404, detail=f"도메인 디렉토리를 찾을 수 없음: {site}")

    결과 = {"udic": 0, "cndic": 0, "thesaurus": 0}

    # UDIC: user.ks 또는 user*.ks
    udic파일 = _사전파일찾기(도메인경로, ["user.ks", "user*.ks"])
    if udic파일:
        결과["udic"] = _udic_cndic_파일임포트(db, site, "udic", udic파일, user_id)

    # CNDIC: cnlist.ks 또는 cnlist*.ks
    cndic파일 = _사전파일찾기(도메인경로, ["cnlist.ks", "cnlist*.ks"])
    if cndic파일:
        결과["cndic"] = _udic_cndic_파일임포트(db, site, "cndic", cndic파일, user_id)

    # THESAURUS: addedsyn 또는 addsyn*
    thesaurus파일 = _사전파일찾기(도메인경로, ["addedsyn", "addsyn*"])
    if thesaurus파일:
        결과["thesaurus"] = _thesaurus_파일임포트(db, site, thesaurus파일, user_id)

    return 결과
