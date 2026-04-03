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


def LLM월별사용자추이(mode: str = "monthly", start: str = "", end: str = "") -> dict:
    """기간별 사용자+모델별 LLM 사용 추이. mode: daily/monthly."""
    from datetime import datetime, timedelta

    now = datetime.now()
    is_daily = mode == "daily"

    if is_daily:
        # 일간: 기본 30일
        fmt = '%Y-%m-%d'
        strftime_fmt = '%Y-%m-%d'
        end_dt = datetime.strptime(end, fmt) if end else now
        start_dt = datetime.strptime(start, fmt) if start else end_dt - timedelta(days=29)
        period_list = []
        d = start_dt
        while d <= end_dt:
            period_list.append(d.strftime(fmt))
            d += timedelta(days=1)
        start_str = period_list[0]
    else:
        # 월간: 기본 12개월
        strftime_fmt = '%Y-%m'
        if start and end:
            # 사용자 지정 기간
            sy, sm = int(start[:4]), int(start[5:7])
            ey, em = int(end[:4]), int(end[5:7])
            period_list = []
            y, m = sy, sm
            while (y, m) <= (ey, em):
                period_list.append(f"{y:04d}-{m:02d}")
                m += 1
                if m > 12:
                    m = 1; y += 1
        else:
            period_list = []
            for i in range(11, -1, -1):
                y, m = now.year, now.month - i
                while m <= 0:
                    m += 12; y -= 1
                period_list.append(f"{y:04d}-{m:02d}")
        start_str = period_list[0]

    with 엔진.connect() as conn:
        user_rows = conn.execute(text(f"""
            SELECT strftime('{strftime_fmt}', created_at) as period, user_id, COUNT(*) as count
            FROM llm_usage_log WHERE strftime('{strftime_fmt}', created_at) >= :start
              AND strftime('{strftime_fmt}', created_at) <= :end
            GROUP BY period, user_id ORDER BY period
        """), {"start": start_str, "end": period_list[-1]}).fetchall()

        model_rows = conn.execute(text(f"""
            SELECT strftime('{strftime_fmt}', created_at) as period, model, COUNT(*) as count
            FROM llm_usage_log WHERE strftime('{strftime_fmt}', created_at) >= :start
              AND strftime('{strftime_fmt}', created_at) <= :end
            GROUP BY period, model ORDER BY period
        """), {"start": start_str, "end": period_list[-1]}).fetchall()

    # 사용자 라벨
    user_ids = sorted(set(r.user_id for r in user_rows))
    with 엔진.connect() as conn2:
        name_rows = conn2.execute(
            select(계정테이블.c._USER_ID, 계정테이블.c._NAME)
            .where(계정테이블.c._USER_ID.in_(user_ids))
        ).fetchall()
    name_map = {r._USER_ID: r._NAME for r in name_rows}
    user_label = {}
    for uid in user_ids:
        name = name_map.get(uid)
        user_label[uid] = f"{name}({uid})" if name else uid

    # 모델 목록
    models = sorted(set(r.model for r in model_rows if r.model))

    # 사용자별 피벗
    user_lookup: dict[tuple[str, str], int] = {}
    for r in user_rows:
        user_lookup[(r.period, r.user_id)] = r.count
    user_data = []
    for p in period_list:
        entry: dict = {"period": p}
        for uid in user_ids:
            entry[user_label[uid]] = user_lookup.get((p, uid), 0)
        user_data.append(entry)

    # 모델별 피벗
    model_lookup: dict[tuple[str, str], int] = {}
    for r in model_rows:
        model_lookup[(r.period, r.model)] = r.count
    model_data = []
    for p in period_list:
        entry: dict = {"period": p}
        for mdl in models:
            entry[mdl] = model_lookup.get((p, mdl), 0)
        model_data.append(entry)

    return {
        "mode": mode,
        "users": [user_label[uid] for uid in user_ids],
        "models": models,
        "user_monthly": user_data,
        "model_monthly": model_data,
        "monthly": user_data,
    }
