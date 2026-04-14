"""api/backup.py — 도메인 사전 백업 관리 엔드포인트"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.constants import DICT_BACKUP_DIR
from core.database import db_session
from services.backup_service import (
    list_backups,
    restore_backup,
    delete_backup,
)
from services.report_service import REPORTS_DIR, generate_pptx
from services.share_service import get_token_for_backup
from services.email_service import send_backup_email

logger = logging.getLogger(__name__)

라우터 = APIRouter(prefix="/api/backups", tags=["백업관리"])


def _attach_share_urls(request: Request, domain: str, items: list[dict], db: Session) -> list[dict]:
    """list_backups 결과에 share_url + has_report 필드 부착."""
    base = str(request.base_url).rstrip("/")
    for b in items:
        name = b["name"]
        # 워크스페이스명 복원: metadata.ws_name 우선, 없으면 도메인+타임스탬프라 None
        ws_name = None
        try:
            meta_path = Path(b["path"]) / "metadata.json"
            if meta_path.exists():
                import json as _json
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta_obj = _json.load(f)
                ws_name = meta_obj.get("ws_name") or meta_obj.get("workspace_name")
        except Exception:
            pass
        share_url = None
        if ws_name:
            tok_row = get_token_for_backup(ws_name, name, db)
            if tok_row:
                share_url = f"{base}/public/share/{tok_row['token']}"
        pptx_path = REPORTS_DIR / f"{ws_name}_{name}.pptx" if ws_name else None
        b["workspace_name"] = ws_name
        b["share_url"] = share_url
        b["has_report"] = bool(pptx_path and pptx_path.exists())
    return items


@라우터.get("/")
def list_backups_api(
    request: Request,
    domain: str = Query(..., description="도메인 ID"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
) -> Dict[str, Any]:
    """도메인 백업 목록 조회."""
    items = list_backups(domain)
    items = _attach_share_urls(request, domain, items, db)
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


@라우터.post("/{name}/report")
def generate_backup_report_api(
    name: str,
    body: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
) -> Dict[str, Any]:
    """백업에 대한 PPT 리포트 생성 — body: {workspace, prev_backup?}."""
    workspace = (body.get("workspace") or "").strip()
    prev_backup = body.get("prev_backup") or None
    if not workspace:
        raise HTTPException(status_code=400, detail="workspace 필수")
    try:
        out_path = generate_pptx(workspace, name, prev_backup, db)
    except Exception as e:
        logger.exception("리포트 생성 실패")
        raise HTTPException(status_code=500, detail=f"리포트 생성 실패: {e}")
    return {
        "status": "ok",
        "path": str(out_path),
        "filename": out_path.name,
        "download_url": f"/api/reports/download/{workspace}/{name}",
    }


@라우터.post("/{name}/email")
def email_backup_api(
    name: str,
    body: Dict[str, Any],
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
) -> Dict[str, Any]:
    """백업 리포트 + 공유 URL 이메일 전송.

    body: {to: str, workspace: str, share_token?: str}
    공유 토큰이 없으면 신규 발급 후 URL 생성.
    """
    to = (body.get("to") or "").strip()
    workspace = (body.get("workspace") or "").strip()
    share_token = (body.get("share_token") or "").strip() or None
    if not to or not workspace:
        raise HTTPException(status_code=400, detail="to, workspace 필수")

    # 공유 토큰 확보
    if not share_token:
        from services.share_service import generate_token as _gen_token
        tok = _gen_token(workspace, name, db)
        share_token = tok["token"]
    base = str(request.base_url).rstrip("/")
    share_url = f"{base}/public/share/{share_token}"

    # 첨부 파일 수집
    attachments = []
    pptx = REPORTS_DIR / f"{workspace}_{name}.pptx"
    if pptx.exists():
        attachments.append(pptx)
    data_tar = Path(DICT_BACKUP_DIR) / name / "data.tar"
    if data_tar.exists():
        attachments.append(data_tar)

    try:
        result = send_backup_email(
            to=to,
            workspace=workspace,
            backup_folder=name,
            share_url=share_url,
            attachments=attachments,
        )
    except Exception as e:
        logger.exception("메일 전송 실패")
        raise HTTPException(status_code=500, detail=f"메일 전송 실패: {e}")

    return {
        "status": "ok",
        "share_url": share_url,
        "share_token": share_token,
        **result,
    }


@라우터.get("/{name}/data-tar")
def download_backup_data_tar(
    name: str,
    current_user: dict = Depends(get_current_user),
):
    """백업 디렉토리 내 data.tar 파일 다운로드."""
    tar_path = Path(DICT_BACKUP_DIR) / name / "data.tar"
    if not tar_path.exists():
        raise HTTPException(status_code=404, detail="data.tar 파일이 없습니다")
    return FileResponse(
        path=str(tar_path),
        filename=f"{name}_data.tar",
        media_type="application/x-tar",
    )
