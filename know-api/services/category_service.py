from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func, MetaData
from fastapi import HTTPException
from models.dictionary import 사이트명검증, 사전테이블가져오기


def _카테고리테이블(db: Session, site: str):
    """카테고리 테이블 반환."""
    meta = MetaData()
    return 사전테이블가져오기(site.upper(), "category", meta)


def 카테고리목록조회(db: Session, site: str, page: int = 1, size: int = 100) -> dict:
    """카테고리 목록 페이지네이션 조회."""
    사이트명검증(site)
    tbl = _카테고리테이블(db, site)
    offset = (page - 1) * size
    total = db.execute(select(func.count()).select_from(tbl)).scalar() or 0
    rows = db.execute(select(tbl).offset(offset).limit(size)).mappings().all()
    items = [{"word": r["_WORD"], "display_category": r["_DISPLAY_CATEGORY"]} for r in rows]
    return {"items": items, "total": total, "page": page, "size": size}


def 카테고리추가(
    db: Session,
    site: str,
    word: str,
    display_category: str,
    user_id: Optional[str] = None,
) -> dict:
    """카테고리 항목 추가 (_WORD PK 기준)."""
    사이트명검증(site)
    tbl = _카테고리테이블(db, site)

    # 중복 확인 (_WORD PK)
    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == word)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 카테고리 단어: {word}")

    db.execute(insert(tbl).values(
        _WORD=word,
        _DISPLAY_CATEGORY=display_category,
        _USER_ID=user_id,
        _UPDATED=datetime.now(),
    ))
    db.commit()
    return {"word": word, "display_category": display_category}


def 카테고리수정(
    db: Session,
    site: str,
    word: str,
    new_display_category: str,
) -> dict:
    """카테고리 항목 수정 (display_category 변경)."""
    사이트명검증(site)
    tbl = _카테고리테이블(db, site)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == word)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"카테고리 단어를 찾을 수 없음: {word}")

    db.execute(update(tbl).where(tbl.c._WORD == word).values(
        _DISPLAY_CATEGORY=new_display_category,
        _UPDATED=datetime.now(),
    ))
    db.commit()
    return {"word": word, "display_category": new_display_category}


def 카테고리삭제(db: Session, site: str, word: str) -> None:
    """카테고리 항목 삭제."""
    사이트명검증(site)
    tbl = _카테고리테이블(db, site)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == word)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"카테고리 단어를 찾을 수 없음: {word}")

    db.execute(delete(tbl).where(tbl.c._WORD == word))
    db.commit()


def 카테고리일괄추가(
    db: Session,
    site: str,
    items: List[dict],
    user_id: Optional[str] = None,
) -> dict:
    """카테고리 항목 일괄 등록."""
    사이트명검증(site)
    tbl = _카테고리테이블(db, site)
    성공 = 0
    건너뜀 = 0
    for item in items:
        word = item.get("word", "")
        display_category = item.get("display_category", "")
        if not word or not display_category:
            건너뜀 += 1
            continue
        존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == word)).first()
        if 존재:
            건너뜀 += 1
            continue
        db.execute(insert(tbl).values(
            _WORD=word,
            _DISPLAY_CATEGORY=display_category,
            _USER_ID=user_id,
            _UPDATED=datetime.now(),
        ))
        성공 += 1
    db.commit()
    return {"inserted": 성공, "skipped": 건너뜀}
