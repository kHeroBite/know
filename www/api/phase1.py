"""Phase 1 파이프라인 API — REST + WebSocket (realtime.py 무수정)"""
import os
import logging
import uuid
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from typing import Optional
from pydantic import BaseModel

from api.auth import get_current_user
from core.exceptions import ValidationError, NotFoundError

라우터 = APIRouter()
ws라우터 = APIRouter()  # WebSocket 전용 (prefix 없이 등록)

logger = logging.getLogger(__name__)

ALLOWED_FOLDERS = {"popular", "fails"}
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))

REDIS_HOST = os.environ.get("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))

def _redis_url() -> str:
    return f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"

class Phase1실행요청(BaseModel):
    domain: Optional[str] = None
    category: str
    filename: Optional[str] = None
    start_step: int = 0
    end_step: int = 4
    workspace: Optional[str] = None
    filter_mode: str = "rank"    # rank=상위N개, count=최소N회이상, both_and=교집합, both_or=합집합
    filter_value: int = 150000   # 단일 모드용 (하위 호환)
    sort_by: str = "count"       # count=검색횟수순, rank=등수순/원본순서
    rank_value: int = 150000     # both 모드: 상위 N개
    count_value: int = 5         # both 모드: 최소 N회
    method: Optional[str] = "log"  # 'log' | 'data' — method 마커 기록용

@라우터.get("/preprocess/files/{folder}")
async def list_phase1_files(folder: str, workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {folder}")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.list_phase1_files(folder, workspace)

@라우터.post("/preprocess/files/{folder}")
async def upload_file_service(folder: str, file: UploadFile = File(...), workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {folder}")
    safe_name = os.path.basename(file.filename or "")
    ct = file.content_type or ""
    if ct.startswith(("image/", "audio/", "video/")):
        raise ValidationError(f"텍스트 파일만 허용됩니다: {ct}")
    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError(f"파일 크기 초과 (최대 {MAX_UPLOAD_MB}MB)")
    logger.info(f"파일 업로드: name={safe_name}, size={len(content)}, content_type={ct}, workspace={workspace}")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.save_file(folder, safe_name, content, workspace)

@라우터.delete("/preprocess/files/{folder}/{filename}")
async def delete_phase1_file(folder: str, filename: str, workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {folder}")
    safe_name = os.path.basename(filename)
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.delete_phase1_file(folder, safe_name, workspace)

@라우터.post("/preprocess/run")
async def start_execution(요청: Phase1실행요청, background_tasks: BackgroundTasks):
    if 요청.category not in ALLOWED_FOLDERS:
        raise ValidationError(f"카테고리 오류: {요청.category}")
    run_id = str(uuid.uuid4())
    from services.phase1_service import Phase1서비스
    await Phase1서비스.register_execution_db(run_id, 요청)
    background_tasks.add_task(Phase1서비스.run_phase1_service, run_id, 요청)
    return {"run_id": run_id}

@라우터.get("/preprocess/view-file")
async def view_file(path: str = Query("")):
    """서버 파일 내용 읽기 (work 디렉토리 내 파일만)"""
    if not path or "work" not in path:
        raise ValidationError("work 디렉토리 파일만 조회 가능")
    # 상대경로(workspace명/build/work/...) 처리
    if not path.startswith("/"):
        from core.constants import WORKSPACE_BASE
        abs_path = os.path.join(WORKSPACE_BASE, path)
    else:
        abs_path = path
    try:
        with open(abs_path, "r", encoding="utf-8-sig", errors="replace") as f:
            content = f.read(500000)  # 최대 500KB
        return {"content": content, "path": abs_path}
    except FileNotFoundError:
        raise NotFoundError(f"파일: {abs_path}")


@라우터.get("/preprocess/step-status")
async def check_step_status(workspace: str = Query("")):
    """각 단계별 결과 파일 존재 여부 반환."""
    from core.constants import WORKSPACE_BASE
    work_dir = os.path.join(WORKSPACE_BASE, workspace, "build", "work")
    return {
        "keywords": os.path.isfile(os.path.join(work_dir, "keywords.txt")),
        "refine": os.path.isfile(os.path.join(work_dir, "refine.txt")),
        "analyzed": os.path.isfile(os.path.join(work_dir, "analyzed.txt")),
        "transform": os.path.isfile(os.path.join(work_dir, "transform.txt")),
        "synonym": os.path.isfile(os.path.join(work_dir, "synonym.txt")),
    }


@라우터.get("/preprocess/logs/{run_id}")
async def get_execution_log(run_id: str):
    """과거 run_phase1_service 로그 DB에서 조회"""
    from core.database import 세션팩토리
    from sqlalchemy import text
    db = 세션팩토리()
    try:
        rows = db.execute(text(
            "SELECT step_num, step_name, percent, message, status, elapsed_sec, ts "
            "FROM phase1_logs WHERE run_id = :run_id ORDER BY id ASC"
        ), {"run_id": run_id}).fetchall()
        return [
            {"run_id": run_id, "step_num": r[0], "step_name": r[1], "percent": r[2],
             "message": r[3], "status": r[4], "elapsed_sec": r[5], "ts": str(r[6])}
            for r in rows
        ]
    finally:
        db.close()


@라우터.get("/preprocess/latest-run")
async def get_recent_execution(workspace: str = Query("")):
    """워크스페이스의 가장 최근 run_phase1_service 정보 조회"""
    from core.database import 세션팩토리
    from services.workspace_service import _read_state
    from sqlalchemy import text
    db = 세션팩토리()
    try:
        # workspace의 현재 domain으로 필터링 (다른 workspace/domain 로그 혼입 방지)
        domain = None
        if workspace:
            상태 = _read_state()
            domain = 상태.get(workspace, {}).get("domain")

        if domain:
            row = db.execute(text(
                "SELECT run_id, status, domain, category, start_step, end_step "
                "FROM phase1_runs WHERE domain=:dom ORDER BY id DESC LIMIT 1"
            ), {"dom": domain}).fetchone()
        else:
            row = db.execute(text(
                "SELECT run_id, status, domain, category, start_step, end_step "
                "FROM phase1_runs ORDER BY id DESC LIMIT 1"
            )).fetchone()

        if row:
            return {"run_id": row[0], "status": row[1], "domain": row[2],
                    "category": row[3], "start_step": row[4], "end_step": row[5]}
        return {"run_id": None}
    finally:
        db.close()


@라우터.post("/preprocess/cleanup-results")
async def cleanup_preprocess_results(workspace: str = Query("")):
    """전처리 결과 파일 삭제 (재시작 전 초기화)."""
    import shutil
    from core.constants import WORKSPACE_BASE
    from core.database import 세션팩토리
    from services.workspace_service import _read_state
    from sqlalchemy import text

    if not workspace:
        raise ValidationError("workspace 파라미터 필요")

    work_dir = os.path.join(WORKSPACE_BASE, workspace, "build", "work")
    deleted = []
    for fname in ["keywords.txt", "refine.txt", "analyzed.txt", "transform.txt", "synonym.txt"]:
        fpath = os.path.join(work_dir, fname)
        if os.path.isfile(fpath):
            os.remove(fpath)
            deleted.append(fname)

    # DB phase1_runs / phase1_logs 도 정리
    상태 = _read_state()
    domain = 상태.get(workspace, {}).get("domain")
    if domain:
        db = 세션팩토리()
        try:
            db.execute(text(
                "DELETE FROM phase1_logs WHERE run_id IN "
                "(SELECT run_id FROM phase1_runs WHERE domain=:dom)"
            ), {"dom": domain})
            db.execute(text("DELETE FROM phase1_runs WHERE domain=:dom"), {"dom": domain})
            db.commit()
        finally:
            db.close()

    return {"deleted": deleted, "workspace": workspace}


@라우터.post("/preprocess/snapshot-archive")
async def snapshot_archive(
    workspace: str = Query(""),
    method: str = Query("log"),
    _current: dict = Depends(get_current_user),
):
    """현재 전처리 결과를 스냅샷으로 보존."""
    if not workspace:
        raise ValidationError("workspace 파라미터 필요")
    from services.workspace_service import _read_state
    상태 = _read_state()
    domain = 상태.get(workspace, {}).get("domain", "")
    from services.phase1_snapshot_service import archive_snapshot
    result = archive_snapshot(workspace, method, domain)
    return result


@라우터.get("/preprocess/snapshots")
async def get_snapshots(
    workspace: str = Query(""),
    _current: dict = Depends(get_current_user),
):
    """워크스페이스의 최근 스냅샷 목록 조회."""
    if not workspace:
        raise ValidationError("workspace 파라미터 필요")
    from services.phase1_snapshot_service import list_snapshots
    return list_snapshots(workspace)


@라우터.post("/preprocess/snapshot-restore")
async def snapshot_restore(
    workspace: str = Query(""),
    snapshot_id: str = Query(""),
    _current: dict = Depends(get_current_user),
):
    """선택한 스냅샷을 활성 상태로 복원."""
    if not workspace or not snapshot_id:
        raise ValidationError("workspace, snapshot_id 파라미터 필요")
    from services.phase1_snapshot_service import restore_snapshot
    try:
        result = restore_snapshot(workspace, snapshot_id)
    except ValueError as e:
        raise NotFoundError(str(e))
    return result


@ws라우터.websocket("/ws/preprocess/{run_id}")
async def phase1_ws(websocket: WebSocket, run_id: str):
    await websocket.accept()
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(_redis_url(), encoding="utf-8", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"phase1:{run_id}")
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                await websocket.send_text(msg["data"])
                try:
                    data = json.loads(msg["data"])
                    if data.get("step_num") == -1 or data.get("status") == "failed":
                        break
                except Exception:
                    pass
        await pubsub.unsubscribe(f"phase1:{run_id}")
        await r.close()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"status": "failed", "message": str(e)}))
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
