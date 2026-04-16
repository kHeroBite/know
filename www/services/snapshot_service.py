from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text


def _safe_ws_name(workspace_name: str) -> str:
    """워크스페이스명을 테이블명 접미사로 변환 (알파넘/언더스코어만 허용)."""
    return "".join(ch if (ch.isalnum() or ch == "_") else "_" for ch in workspace_name)


def _count_table(db: Session, table_name: str) -> int:
    """테이블이 존재하면 COUNT(*), 없으면 0."""
    try:
        row = db.execute(text(f"SELECT COUNT(*) AS c FROM `{table_name}`")).mappings().first()
        return int(row["c"]) if row else 0
    except Exception:
        return 0


def _collect_counts_before(db: Session, workspace_name: str, domain_code: str) -> dict:
    """Before 스냅샷용 count 수집 — WS 테이블 우선, 없으면 도메인 원본 fallback.

    연결 직후(WS 테이블에 초기 복사된 데이터)를 기준으로 Before를 산출.
    """
    safe_ws = _safe_ws_name(workspace_name)
    dom = domain_code.upper()
    prefix_ws = f"WS_{safe_ws}_{dom}"
    prefix_dom = dom

    counts = {}
    for key, suffix in (
        ("udic_count", "UDIC"),
        ("cndic_count", "CNDIC"),
        ("thesaurus_count", "THESAURUS"),
        ("category_count", "CATEGORY"),
    ):
        ws_table = f"{prefix_ws}_{suffix}"
        dom_table = f"{prefix_dom}_{suffix}"
        val = _count_table(db, ws_table)
        if val == 0:
            val = _count_table(db, dom_table)
        counts[key] = val
    return counts


def _collect_counts_after(db: Session, domain_code: str) -> dict:
    """After 스냅샷용 count 수집 — 도메인 원본 테이블 직접 조회.

    finalize_complete에서 역방향 복사(WS→도메인) 완료 후 찍히므로
    도메인 원본 테이블이 최종 확정 결과다.
    """
    dom = domain_code.upper()

    counts = {}
    for key, suffix in (
        ("udic_count", "UDIC"),
        ("cndic_count", "CNDIC"),
        ("thesaurus_count", "THESAURUS"),
        ("category_count", "CATEGORY"),
    ):
        dom_table = f"{dom}_{suffix}"
        counts[key] = _count_table(db, dom_table)
    return counts


def take_snapshot(
    workspace_name: str,
    domain_code: str,
    snapshot_type: str,
    db: Session,
) -> dict:
    """워크스페이스 사전 테이블 count를 수집하여 workspace_snapshots에 기록.

    snapshot_type: 'before' | 'after'
    - before: WS 테이블 기준 (연결 시 복사된 초기값)
    - after:  도메인 원본 테이블 기준 (역방향 복사 완료 후 최종값)
    """
    if snapshot_type not in ("before", "after"):
        raise ValueError(f"snapshot_type must be 'before' or 'after', got: {snapshot_type}")

    if snapshot_type == "after":
        counts = _collect_counts_after(db, domain_code.upper())
    else:
        counts = _collect_counts_before(db, workspace_name, domain_code.upper())
    taken_at = datetime.now().isoformat(sep=" ", timespec="seconds")

    result = db.execute(
        text("INSERT INTO workspace_snapshots "
             "(workspace_name, domain_code, snapshot_type, "
             "udic_count, cndic_count, thesaurus_count, category_count, taken_at) "
             "VALUES (:ws, :dom, :st, :udic, :cndic, :thes, :cat, :taken)"),
        {
            "ws": workspace_name,
            "dom": domain_code.upper(),
            "st": snapshot_type,
            "udic": counts["udic_count"],
            "cndic": counts["cndic_count"],
            "thes": counts["thesaurus_count"],
            "cat": counts["category_count"],
            "taken": taken_at,
        },
    )
    db.commit()

    return {
        "id": result.lastrowid,
        "workspace_name": workspace_name,
        "domain_code": domain_code.upper(),
        "snapshot_type": snapshot_type,
        **counts,
        "taken_at": taken_at,
    }


def get_snapshot(
    workspace_name: str,
    snapshot_type: str,
    db: Session,
    domain_code: Optional[str] = None,
) -> Optional[dict]:
    """특정 워크스페이스의 before 또는 after 스냅샷 최신 1건 조회.

    domain_code 지정 시 해당 도메인 스냅샷만 조회 (다른 도메인과 혼용 방지).
    """
    if domain_code:
        row = db.execute(
            text("SELECT id, workspace_name, domain_code, snapshot_type, "
                 "udic_count, cndic_count, thesaurus_count, category_count, taken_at "
                 "FROM workspace_snapshots "
                 "WHERE workspace_name = :ws AND snapshot_type = :st AND domain_code = :dom "
                 "ORDER BY id DESC LIMIT 1"),
            {"ws": workspace_name, "st": snapshot_type, "dom": domain_code.upper()},
        ).mappings().first()
    else:
        row = db.execute(
            text("SELECT id, workspace_name, domain_code, snapshot_type, "
                 "udic_count, cndic_count, thesaurus_count, category_count, taken_at "
                 "FROM workspace_snapshots "
                 "WHERE workspace_name = :ws AND snapshot_type = :st "
                 "ORDER BY id DESC LIMIT 1"),
            {"ws": workspace_name, "st": snapshot_type},
        ).mappings().first()
    if not row:
        return None
    return dict(row)


def get_snapshots_pair(
    workspace_name: str,
    db: Session,
    domain_code: Optional[str] = None,
) -> tuple[Optional[dict], Optional[dict]]:
    """(before, after) 스냅샷 쌍 조회. domain_code 지정 시 해당 도메인만."""
    before = get_snapshot(workspace_name, "before", db, domain_code=domain_code)
    after = get_snapshot(workspace_name, "after", db, domain_code=domain_code)
    return before, after
