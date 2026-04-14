"""api/reports.py — 완료 리포트 PPT 생성/다운로드/diff 엔드포인트"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from services.report_service import REPORTS_DIR, generate_pptx, get_diff

logger = logging.getLogger(__name__)

라우터 = APIRouter(prefix="/api/reports", tags=["리포트"])


@라우터.post("/generate")
def generate_report(
    body: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """PPT 리포트 생성. body: {workspace, current_backup, prev_backup?}."""
    workspace = body.get("workspace", "").strip()
    current_backup = body.get("current_backup", "").strip()
    prev_backup = body.get("prev_backup") or None
    if not workspace or not current_backup:
        raise HTTPException(status_code=400, detail="workspace, current_backup 필수")
    try:
        out_path = generate_pptx(workspace, current_backup, prev_backup, db)
    except Exception as e:
        logger.exception("PPT 생성 실패")
        raise HTTPException(status_code=500, detail=f"PPT 생성 실패: {e}")
    return {
        "path": str(out_path),
        "filename": out_path.name,
        "download_url": f"/api/reports/download/{workspace}/{current_backup}",
    }


@라우터.get("/download/{workspace}/{backup_folder}")
def download_report(
    workspace: str,
    backup_folder: str,
    current_user: dict = Depends(get_current_user),
):
    """PPT 파일 다운로드."""
    file_path = REPORTS_DIR / f"{workspace}_{backup_folder}.pptx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="리포트를 찾을 수 없습니다 (먼저 생성 필요)")
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@라우터.get("/diff")
def get_report_diff(
    workspace: str = Query(...),
    current_backup: str = Query(...),
    prev_backup: Optional[str] = Query(None),
    category: Optional[str] = Query(None, description="udic|cndic|thesaurus|category|null(요약)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """공유/UI용 페이지네이션 diff."""
    try:
        return get_diff(
            workspace=workspace,
            current_backup=current_backup,
            prev_backup=prev_backup,
            category=category,
            page=page,
            page_size=page_size,
            db=db,
        )
    except Exception as e:
        logger.exception("diff 계산 실패")
        raise HTTPException(status_code=500, detail=f"diff 계산 실패: {e}")
