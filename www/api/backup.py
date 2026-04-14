"""api/backup.py — 도메인 사전 백업 관리 엔드포인트"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from services.backup_service import (
    list_backups,
    restore_backup,
    delete_backup,
)

라우터 = APIRouter(prefix="/api/backups", tags=["백업관리"])


@라우터.get("/")
def list_backups_api(
    domain: str = Query(..., description="도메인 ID"),
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """도메인 백업 목록 조회."""
    items = list_backups(domain)
    return {"domain": domain, "backups": items, "count": len(items)}


@라우터.post("/{name}/restore")
def restore_backup_api(
    name: str,
    body: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
) -> Dict[str, Any]:
    """백업 복원 — body: {domain, skip_backup}."""
    domain = body.get("domain", "")
    if not domain:
        raise HTTPException(status_code=400, detail="domain 필수")
    skip_backup = bool(body.get("skip_backup", False))
    result = restore_backup(domain, name, skip_backup, db)
    return {"status": "ok", **result}


@라우터.delete("/{name}")
def delete_backup_api(
    name: str,
    domain: str = Query(..., description="도메인 ID"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
) -> Dict[str, Any]:
    """백업 삭제 — 디렉토리 + BAK_ 테이블."""
    result = delete_backup(domain, name, db)
    return {"status": "ok", **result}
