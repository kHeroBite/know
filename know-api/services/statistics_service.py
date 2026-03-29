from __future__ import annotations
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text, MetaData
from models.domain import 도메인테이블
from models.dictionary import 사이트명검증, 사전테이블가져오기


def _테이블존재확인(db: Session, table_name: str) -> bool:
    """테이블 존재 여부 확인 (sqlite_master)."""
    try:
        result = db.execute(
            text("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=:t"),
            {"t": table_name},
        ).scalar()
        return bool(result)
    except Exception:
        return False


def _사전카운트(db: Session, site: str, dic_type: str) -> int:
    """특정 사전 타입의 항목 수 반환. 테이블 미존재 시 -1."""
    suffix_map = {
        "udic": "_UDIC",
        "cndic": "_CNDIC",
        "thesaurus": "_THESAURUS",
        "category": "_CATEGORY",
    }
    table_name = f"{site.upper()}{suffix_map[dic_type]}"
    if not _테이블존재확인(db, table_name):
        return -1
    try:
        meta = MetaData()
        tbl = 사전테이블가져오기(site.upper(), dic_type, meta)
        return db.execute(select(func.count()).select_from(tbl)).scalar() or 0
    except Exception:
        return -1


def 도메인별사전통계(db: Session, site: str) -> dict:
    """사이트의 각 사전 유형별 항목 수 반환."""
    사이트명검증(site)
    return {
        "site": site.upper(),
        "udic": _사전카운트(db, site, "udic"),
        "cndic": _사전카운트(db, site, "cndic"),
        "thesaurus": _사전카운트(db, site, "thesaurus"),
        "category": _사전카운트(db, site, "category"),
    }


def 전체도메인통계(db: Session) -> List[dict]:
    """모든 도메인의 사전 현황 반환."""
    rows = db.execute(select(도메인테이블.c._SITE)).scalars().all()
    return [도메인별사전통계(db, site) for site in rows]
