"""api/share.py — 공유 토큰 발급/조회/폐기 + 공개 대시보드 엔드포인트.

/api/share/*         : 관리자 인증 필요
/api/public/share/*  : 인증 불필요 (토큰 자체가 인증)
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from core.constants import DICT_BACKUP_DIR
from services.report_service import REPORTS_DIR
from services.share_service import (
    generate_token,
    verify_token,
    revoke_token,
    list_tokens,
)
from services.snapshot_service import get_snapshots_pair
from services.workspace_service import get_participants_stats
from services.backup_service import list_backups

logger = logging.getLogger(__name__)

라우터 = APIRouter(tags=["공유"])


# ──────────────────────────────────────────────
# 관리자용 — 토큰 발급/폐기/목록
# ──────────────────────────────────────────────

@라우터.post("/api/share/generate")
def share_generate(
    body: Dict[str, Any],
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """토큰 발급 — body: {workspace, backup_folder, ttl_days?}."""
    workspace = (body.get("workspace") or "").strip()
    backup_folder = (body.get("backup_folder") or "").strip()
    ttl_days = int(body.get("ttl_days") or 30)
    if not workspace or not backup_folder:
        raise HTTPException(status_code=400, detail="workspace, backup_folder 필수")

    result = generate_token(workspace, backup_folder, db, ttl_days=ttl_days)
    # 공유 URL 구성
    base = str(request.base_url).rstrip("/")
    share_url = f"{base}/public/share/{result['token']}"
    result["url"] = share_url
    return result


@라우터.post("/api/share/revoke/{token}")
def share_revoke(
    token: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    ok = revoke_token(token, db)
    if not ok:
        raise HTTPException(status_code=404, detail="토큰을 찾을 수 없습니다")
    return {"status": "ok", "token": token}


@라우터.get("/api/share/list")
def share_list(
    workspace: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    return {"workspace": workspace, "tokens": list_tokens(workspace, db)}


# ──────────────────────────────────────────────
# 공개용 — 인증 불필요 (/api/public/*)
# ──────────────────────────────────────────────

@라우터.get("/api/public/share/{token}")
def public_share_data(token: str, db: Session = Depends(db_session)):
    """공유 페이지 대시보드 데이터 반환."""
    rec = verify_token(token, db)
    if not rec:
        raise HTTPException(status_code=404, detail="유효하지 않거나 만료된 토큰입니다")
    ws = rec["workspace_name"]
    backup_folder = rec["backup_folder"]

    before, after = get_snapshots_pair(ws, db)
    participants = get_participants_stats(ws, db)

    # 현재 백업의 메타 + 직전 백업 찾기
    backups = list_backups(_domain_from_backup(backup_folder))
    prev_backup = None
    for i, b in enumerate(backups):
        if b["name"] == backup_folder and i + 1 < len(backups):
            prev_backup = backups[i + 1]["name"]
            break
    current_meta = next((b for b in backups if b["name"] == backup_folder), {})

    return {
        "workspace": ws,
        "backup_folder": backup_folder,
        "prev_backup": prev_backup,
        "metadata": current_meta,
        "snapshot": {"before": before, "after": after},
        "participants": participants,
    }


@라우터.get("/api/public/share/{token}/report")
def public_share_report(token: str, db: Session = Depends(db_session)):
    """공개 PPT 다운로드."""
    rec = verify_token(token, db)
    if not rec:
        raise HTTPException(status_code=404, detail="유효하지 않거나 만료된 토큰입니다")
    ws = rec["workspace_name"]
    backup_folder = rec["backup_folder"]
    file_path = REPORTS_DIR / f"{ws}_{backup_folder}.pptx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="리포트가 아직 생성되지 않았습니다")
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@라우터.get("/api/public/share/{token}/data-tar")
def public_share_data_tar(token: str, db: Session = Depends(db_session)):
    """공개 data.tar 다운로드 (백업 디렉토리 내 data.tar 파일)."""
    rec = verify_token(token, db)
    if not rec:
        raise HTTPException(status_code=404, detail="유효하지 않거나 만료된 토큰입니다")
    backup_folder = rec["backup_folder"]
    tar_path = Path(DICT_BACKUP_DIR) / backup_folder / "data.tar"
    if not tar_path.exists():
        raise HTTPException(status_code=404, detail="data.tar 파일이 없습니다")
    return FileResponse(
        path=str(tar_path),
        filename=f"{backup_folder}_data.tar",
        media_type="application/x-tar",
    )


# ──────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────

def _domain_from_backup(backup_folder: str) -> str:
    """'{domain}_YYYYMMDD_HHMMSS[_NNN]' → '{domain}' 추출."""
    parts = backup_folder.split("_")
    return parts[0] if parts else ""
