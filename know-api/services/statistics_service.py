from __future__ import annotations
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text, MetaData
from models.domain import 도메인테이블
from models.dictionary import 사이트명검증, 사전테이블가져오기
from models.account import 계정테이블
from core.database import 엔진


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


def LLM사용통계조회(year: int, month: int) -> dict:
    """연월별 LLM 사용 통계: 사용자별 + 월별 집계."""
    with 엔진.connect() as conn:
        # 사용자별 (특정 년월)
        user_rows = conn.execute(text("""
            SELECT user_id, COUNT(*) as count
            FROM llm_usage_log
            WHERE strftime('%Y', created_at) = :year
              AND strftime('%m', created_at) = :month
            GROUP BY user_id
            ORDER BY count DESC
        """), {
            "year": str(year),
            "month": f"{month:02d}",
        }).fetchall()

        # 월별 (해당 연도 전체)
        monthly_rows = conn.execute(text("""
            SELECT strftime('%m', created_at) as month, COUNT(*) as count
            FROM llm_usage_log
            WHERE strftime('%Y', created_at) = :year
            GROUP BY strftime('%m', created_at)
            ORDER BY month
        """), {
            "year": str(year),
        }).fetchall()

    return {
        "users": [{"user_id": r.user_id, "count": r.count} for r in user_rows],
        "monthly": [{"month": f"{int(r.month)}월", "count": r.count} for r in monthly_rows],
    }


def LLM월별사용자추이() -> dict:
    """최근 12개월 사용자별 월별 LLM 사용 추이 (라인차트용)."""
    from datetime import datetime

    # 최근 12개월 목록 생성
    now = datetime.now()
    months_list = []
    for i in range(11, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12
            y -= 1
        months_list.append(f"{y:04d}-{m:02d}")

    start_month = months_list[0]

    with 엔진.connect() as conn:
        rows = conn.execute(text("""
            SELECT strftime('%Y-%m', created_at) as month,
                   user_id,
                   COUNT(*) as count
            FROM llm_usage_log
            WHERE strftime('%Y-%m', created_at) >= :start
            GROUP BY strftime('%Y-%m', created_at), user_id
            ORDER BY month
        """), {"start": start_month}).fetchall()

    # 사용자 목록
    user_ids = sorted(set(r.user_id for r in rows))

    # 사용자 이름 매핑 (accounts 테이블)
    with 엔진.connect() as conn2:
        name_rows = conn2.execute(
            select(계정테이블.c._USER_ID, 계정테이블.c._NAME)
            .where(계정테이블.c._USER_ID.in_(user_ids))
        ).fetchall()
    name_map = {r._USER_ID: r._NAME for r in name_rows}

    # 표시용 라벨: "이름(id)"
    label_map = {}
    for uid in user_ids:
        name = name_map.get(uid)
        label_map[uid] = f"{name}({uid})" if name else uid

    # 피벗: [{month: "2025-05", "관리자(admin)": 10, ...}, ...]
    lookup: dict[tuple[str, str], int] = {}
    for r in rows:
        lookup[(r.month, r.user_id)] = r.count

    monthly = []
    for m in months_list:
        entry: dict = {"month": m}
        for uid in user_ids:
            entry[label_map[uid]] = lookup.get((m, uid), 0)
        monthly.append(entry)

    return {"users": [label_map[uid] for uid in user_ids], "monthly": monthly}
