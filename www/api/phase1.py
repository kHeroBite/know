"""Phase 1 파이프라인 API — REST + WebSocket (realtime.py 무수정)"""
import os
import logging
import uuid
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Query, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from typing import Optional
from pydantic import BaseModel

from api.auth import get_current_user

라우터 = APIRouter()
ws라우터 = APIRouter()  # WebSocket 전용 (prefix 없이 등록)

logger = logging.getLogger(__name__)

ALLOWED_FOLDERS = {"popular", "fails"}
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

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

@라우터.get("/preprocess/files/{folder}")
async def list_phase1_files(folder: str, workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"폴더 오류: {folder}")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.list_phase1_files(folder, workspace)

@라우터.post("/preprocess/files/{folder}")
async def upload_file_service(folder: str, file: UploadFile = File(...), workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"폴더 오류: {folder}")
    safe_name = os.path.basename(file.filename or "")
    ct = file.content_type or ""
    if ct.startswith(("image/", "audio/", "video/")):
        raise HTTPException(status_code=422, detail=f"텍스트 파일만 허용됩니다: {ct}")
    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=422, detail=f"파일 크기 초과 (최대 {MAX_UPLOAD_MB}MB)")
    logger.info(f"파일 업로드: name={safe_name}, size={len(content)}, content_type={ct}, workspace={workspace}")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.save_file(folder, safe_name, content, workspace)

@라우터.delete("/preprocess/files/{folder}/{filename}")
async def delete_phase1_file(folder: str, filename: str, workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"폴더 오류: {folder}")
    safe_name = os.path.basename(filename)
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.delete_phase1_file(folder, safe_name, workspace)

@라우터.post("/preprocess/run")
async def start_execution(요청: Phase1실행요청, background_tasks: BackgroundTasks):
    if 요청.category not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"카테고리 오류: {요청.category}")
    run_id = str(uuid.uuid4())
    from services.phase1_service import Phase1서비스
    await Phase1서비스.register_execution_db(run_id, 요청)
    background_tasks.add_task(Phase1서비스.run_phase1_service, run_id, 요청)
    return {"run_id": run_id}

@라우터.get("/preprocess/view-file")
async def view_file(path: str = Query("")):
    """서버 파일 내용 읽기 (work 디렉토리 내 파일만)"""
    if not path or "/work/" not in path:
        raise HTTPException(status_code=400, detail="work 디렉토리 파일만 조회 가능")
    try:
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            content = f.read(100000)  # 최대 100KB
        return {"content": content, "path": path}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"파일 없음: {path}")


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
    from sqlalchemy import text
    db = 세션팩토리()
    try:
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
