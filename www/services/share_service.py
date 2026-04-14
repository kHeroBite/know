"""share_service.py — 공유 페이지 토큰 발급/검증/폐기.

share_tokens 테이블 (init_db.py 정의):
  token TEXT PRIMARY KEY,
  workspace_name TEXT NOT NULL,
  backup_folder TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)

DEFAULT_TTL_DAYS = 30


def generate_token(
    workspace: str,
    backup_folder: str,
    db,
    ttl_days: int = DEFAULT_TTL_DAYS,
) -> dict[str, Any]:
    """신규 공유 토큰 발급 → {token, expires_at} 반환."""
    token = secrets.token_urlsafe(16)
    expires_at = (datetime.now() + timedelta(days=ttl_days)).isoformat(sep=" ", timespec="seconds")
    db.execute(
        text(
            "INSERT INTO share_tokens (token, workspace_name, backup_folder, expires_at) "
            "VALUES (:token, :ws, :bf, :exp)"
        ),
        {"token": token, "ws": workspace, "bf": backup_folder, "exp": expires_at},
    )
    db.commit()
    return {
        "token": token,
        "workspace_name": workspace,
        "backup_folder": backup_folder,
        "expires_at": expires_at,
    }


def verify_token(token: str, db) -> Optional[dict[str, Any]]:
    """토큰 유효성 검증 → {workspace, backup_folder} or None."""
    row = db.execute(
        text(
            "SELECT token, workspace_name, backup_folder, created_at, expires_at "
            "FROM share_tokens WHERE token=:t"
        ),
        {"t": token},
    ).mappings().first()
    if not row:
        return None
    expires_at = row.get("expires_at")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(expires_at)
            if datetime.now() > exp_dt:
                return None
        except Exception:
            pass
    return dict(row)


def revoke_token(token: str, db) -> bool:
    """토큰 삭제."""
    res = db.execute(text("DELETE FROM share_tokens WHERE token=:t"), {"t": token})
    db.commit()
    return (res.rowcount or 0) > 0


def list_tokens(workspace: str, db) -> list[dict[str, Any]]:
    """워크스페이스별 발급된 토큰 목록."""
    rows = db.execute(
        text(
            "SELECT token, workspace_name, backup_folder, created_at, expires_at "
            "FROM share_tokens WHERE workspace_name=:ws ORDER BY created_at DESC"
        ),
        {"ws": workspace},
    ).mappings().all()
    return [dict(r) for r in rows]


def get_token_for_backup(workspace: str, backup_folder: str, db) -> Optional[dict[str, Any]]:
    """특정 백업 폴더에 대해 유효한 토큰 1건 조회 (list_backups 조인용)."""
    now_iso = datetime.now().isoformat(sep=" ", timespec="seconds")
    row = db.execute(
        text(
            "SELECT token, expires_at FROM share_tokens "
            "WHERE workspace_name=:ws AND backup_folder=:bf "
            "  AND (expires_at IS NULL OR expires_at > :now) "
            "ORDER BY created_at DESC LIMIT 1"
        ),
        {"ws": workspace, "bf": backup_folder, "now": now_iso},
    ).mappings().first()
    return dict(row) if row else None
