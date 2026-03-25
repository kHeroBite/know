from __future__ import annotations
import re
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func, MetaData
from fastapi import HTTPException
from models.dictionary import 사이트명검증, 사전테이블가져오기


# 사전 타입 허용 목록
_허용사전타입 = {"udic", "cndic", "thesaurus"}


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

    total = db.execute(cnt_stmt).scalar() or 0
    rows = db.execute(lst_stmt).mappings().all()
    items = [{"word": r["_WORD"], "memo": r.get("_MEMO")} for r in rows]
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
    total = db.execute(select(func.count()).select_from(tbl)).scalar() or 0
    rows = db.execute(select(tbl).offset(offset).limit(size)).mappings().all()
    items = [{"head_word": r["_HEAD_WORD"], "tail_word": r["_TAIL_WORD"], "memo": r.get("_MEMO")} for r in rows]
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
