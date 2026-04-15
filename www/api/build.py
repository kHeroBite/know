"""api/build.py — 사전 빌드 REST API 라우터"""
from __future__ import annotations

import os
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from services.build_service import build_service

라우터 = APIRouter(prefix="/api/build", tags=["빌드"])


# ──────────────────────────────────────────────
# 빌드
# ──────────────────────────────────────────────

@라우터.post("/{domain}")
def start_build_service(
    domain: str,
    background_tasks: BackgroundTasks,
    workspace: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """사전 빌드 시작 (백그라운드 run_phase1_service). 워크스페이스의 jiana 폴더 자동 사용."""
    from fastapi import HTTPException
    from services.workspace_service import get_jiana_home_path
    from services.build_service import ws_export_dict_file
    triggered_by = current_user.get("id") or current_user.get("user_id")
    jiana_home = None
    if workspace:
        jiana_home = get_jiana_home_path(workspace)
        if not os.path.isdir(jiana_home):
            raise HTTPException(400, detail=f"워크스페이스 jiana 경로 없음: {jiana_home}")
        # 빌드 전 WS_ 사전 DB → txt_resrc 파일 export
        ws_export_dict_file(db, workspace, domain, jiana_home)
    return build_service.start_build_service(db, background_tasks, domain, triggered_by=triggered_by, jiana_home=jiana_home, workspace=workspace or None)


@라우터.get("/{build_id}/download/{filename}")
def download_build_file(
    build_id: int,
    filename: str,
    token: str = Query(default=""),
    db: Session = Depends(db_session),
):
    """빌드 결과 파일 다운로드 (data.tar, synonym.UTF-8). 토큰은 쿼리파라미터로 전달."""
    from fastapi import HTTPException
    from models.pipeline import BuildHistory
    # 토큰 검증 (쿼리 파라미터)
    if not token:
        raise HTTPException(401, detail="토큰이 필요합니다")
    from core.security import verify_token
    if not verify_token(token):
        raise HTTPException(401, detail="유효하지 않은 토큰")
    bh = db.query(BuildHistory).filter_by(id=build_id).first()
    if not bh or bh.status != "completed":
        raise HTTPException(404, detail="완료된 빌드를 찾을 수 없습니다")
    if bh.output_path:
        jiana_dir = os.path.dirname(bh.output_path)
    else:
        from core.constants import DEFAULT_JIANA_HOME
        jiana_dir = DEFAULT_JIANA_HOME  # fallback: output_path 없는 레거시 빌드
    allowed = {"data.tar", "synonym.UTF-8"}
    if filename not in allowed:
        raise HTTPException(400, detail=f"허용되지 않는 파일: {filename}")
    filepath = os.path.join(jiana_dir, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, detail=f"파일 없음: {filepath}")
    return FileResponse(filepath, filename=filename, media_type="application/octet-stream")


@라우터.get("/jiana-versions")
def list_jiana_versions_legacy(
    current_user: dict = Depends(get_current_user),
):
    """jiana 폴더 list_tasks 조회 (레거시 — /workspaces/jiana-versions 사용 권장)"""
    from services.workspace_service import list_jiana_versions_service as _jiana목록
    return {"versions": _jiana목록()}


@라우터.post("/{domain}/cancel")
def cancel_build(
    domain: str,
    current_user: dict = Depends(get_current_user),
):
    """진행 중인 빌드 취소"""
    from pipeline.build_wrapper import cancel_build
    cancelled = cancel_build()
    if cancelled:
        return {"success": True, "message": "빌드가 중지되었습니다."}
    return {"success": False, "message": "진행 중인 빌드가 없습니다."}


@라우터.get("/{domain}/status")
def get_build_status(
    domain: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """현재 빌드 상태 (최신 BuildHistory)"""
    return build_service.get_build_status_service(db, domain)


@라우터.get("/history-all")
def get_all_build_history_service(
    current_user: dict = Depends(get_current_user),
):
    """전체 도메인 빌드 이력 통합 조회 (SQLite 직접)"""
    import sqlite3
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "know.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        # 계정 이름 매핑
        accts = {}
        try:
            for a in conn.execute("SELECT _USER_ID, _NAME FROM accounts").fetchall():
                accts[a[0]] = a[1]
        except Exception:
            pass
        rows = conn.execute(
            "SELECT id, domain, workspace, site_code, build_type, status, started_at, completed_at, "
            "started_by, output_path, file_size, entry_count "
            "FROM build_history ORDER BY id DESC LIMIT 50"
        ).fetchall()
        items = [dict(r) for r in rows]
        # 사이트 목록 캐시 (site_code 역매핑용)
        _site_map = {}
        try:
            for s in conn.execute("SELECT site_code, domain_code FROM sites").fetchall():
                _site_map[s[1].lower() if s[1] else ''] = s[0]
        except Exception:
            pass
        for it in items:
            it["row_count"] = it.pop("entry_count", 0) or 0
            uid = it.get("started_by") or ""
            name = accts.get(uid, "")
            it["started_by_display"] = f"{name}({uid})" if name else uid
            # site_code가 비어있으면 domain_code로 역매핑
            if not it.get("site_code") and it.get("domain"):
                it["site_code"] = _site_map.get(it["domain"].lower(), None)
        agg = {}
        for it in items:
            d = it.get("domain", "unknown")
            if d not in agg:
                agg[d] = {"total": 0, "success": 0, "failed": 0}
            agg[d]["total"] += 1
            if it["status"] in ("success", "completed"):
                agg[d]["success"] += 1
            elif it["status"] == "failed":
                agg[d]["failed"] += 1
        domain_stats = [{"domain": k, **v} for k, v in agg.items()]
        return {"items": items, "domain_stats": domain_stats}
    finally:
        conn.close()


@라우터.get("/{domain}/history")
def get_build_history(
    domain: str,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """빌드 이력 페이지네이션"""
    return build_service.get_build_history_service(db, domain, page=page, size=size)


# ──────────────────────────────────────────────
# 사전 관리
# ──────────────────────────────────────────────

@라우터.post("/api/dictionaries/{domain}/sync")
def sync_dict_service(
    domain: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """사전 파일 동기화"""
    return build_service.sync_dict_service(db, domain)


@라우터.post("/api/dictionaries/{domain}/init")
def reset_dict_service(
    domain: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(db_session),
):
    """사전 파일 initialize"""
    return build_service.reset_dict_service(db, domain)
