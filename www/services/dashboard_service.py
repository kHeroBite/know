from __future__ import annotations
from sqlalchemy.orm import Session
from sqlalchemy import text


def get_dashboard_summary(db: Session, user_id: str) -> dict:
    """대시보드 요약 - 워크스페이스 현황."""
    # 전체 키워드 수
    total = db.execute(text("SELECT COUNT(*) FROM keyword_assignments")).scalar() or 0

    # 상태별 카운트
    status_rows = db.execute(text(
        "SELECT status, COUNT(*) as cnt FROM keyword_assignments GROUP BY status"
    )).fetchall()
    status_map = {r[0]: r[1] for r in status_rows}

    pending = status_map.get("pending", 0)
    assigned = status_map.get("assigned", 0)
    completed = status_map.get("completed", 0)

    # 오늘 처리 건수 (work_history 기준)
    today_count = db.execute(text(
        "SELECT COUNT(*) FROM work_history "
        "WHERE user_id = :uid AND DATE(created_at) = DATE('now')"
    ), {"uid": user_id}).scalar() or 0

    # 워크스페이스별 집계
    ws_rows = db.execute(text(
        "SELECT workspace, domain, COUNT(*) as total, "
        "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed "
        "FROM keyword_assignments GROUP BY workspace, domain"
    )).fetchall()
    workspaces = [
        {
            "workspace": r[0],
            "domain": r[1],
            "total": r[2],
            "completed": r[3],
            "progress": round(r[3] / r[2] * 100, 1) if r[2] > 0 else 0,
        }
        for r in ws_rows
    ]

    return {
        "total": total,
        "pending": pending,
        "assigned": assigned,
        "completed": completed,
        "today_processed": today_count,
        "workspaces": workspaces,
    }


def get_recent_activities(db: Session, user_id: str, limit: int = 10) -> list:
    """최근 작업 이력."""
    rows = db.execute(text(
        "SELECT id, workspace, domain, user_id, action_type, dic_type, word, created_at "
        "FROM work_history "
        "WHERE undone = 0 "
        "ORDER BY created_at DESC LIMIT :lim"
    ), {"lim": limit}).fetchall()

    return [
        {
            "id": r[0],
            "workspace": r[1],
            "domain": r[2],
            "user_id": r[3],
            "action_type": r[4],
            "dic_type": r[5],
            "word": r[6],
            "created_at": r[7],
        }
        for r in rows
    ]


def get_domain_stats(db: Session) -> list:
    """도메인별 키워드 통계."""
    rows = db.execute(text(
        "SELECT domain, COUNT(*) as total, "
        "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, "
        "SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending "
        "FROM keyword_assignments GROUP BY domain ORDER BY domain"
    )).fetchall()

    return [
        {
            "domain": r[0],
            "total": r[1],
            "completed": r[2],
            "pending": r[3],
            "completion_rate": round(r[2] / r[1] * 100, 1) if r[1] > 0 else 0,
        }
        for r in rows
    ]
