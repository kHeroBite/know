"""Phase 1 데이터기반 전처리 API — 사이트별 파일 관리 + 실행 (REST + WebSocket)"""
import os
import logging
import uuid
import json
import asyncio
from fastapi import APIRouter, UploadFile, File, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from typing import Optional
from pydantic import BaseModel

from core.exceptions import ValidationError, NotFoundError

라우터 = APIRouter()
ws라우터 = APIRouter()  # WebSocket 전용 (prefix 없이 등록)

logger = logging.getLogger(__name__)

ALLOWED_FOLDERS = {"galleria", "hmall", "thd", "ssf"}
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))

REDIS_HOST = os.environ.get("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))


def _redis_url() -> str:
    return f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"


class DataRun요청(BaseModel):
    folder: str           # galleria / hmall / thd / ssf
    workspace: Optional[str] = None


@라우터.get("/preprocess/data-files/{folder}")
async def list_data_files(folder: str, workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {folder}")
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.list_files(folder, workspace)


@라우터.post("/preprocess/data-files/{folder}")
async def upload_data_file(folder: str, file: UploadFile = File(...), workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {folder}")
    safe_name = os.path.basename(file.filename or "")
    ct = file.content_type or ""
    if ct.startswith(("image/", "audio/", "video/")):
        raise ValidationError(f"텍스트 파일만 허용됩니다: {ct}")
    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError(f"파일 크기 초과 (최대 {MAX_UPLOAD_MB}MB)")
    logger.info(f"데이터 파일 업로드: name={safe_name}, size={len(content)}, folder={folder}, workspace={workspace}")
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.save_file(folder, safe_name, content, workspace)


@라우터.delete("/preprocess/data-files/{folder}/{filename}")
async def delete_data_file(folder: str, filename: str, workspace: str = Query("")):
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {folder}")
    safe_name = os.path.basename(filename)
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.delete_file(folder, safe_name, workspace)


@라우터.post("/preprocess/data-run")
async def start_data_execution(요청: DataRun요청, background_tasks: BackgroundTasks):
    if 요청.folder not in ALLOWED_FOLDERS:
        raise ValidationError(f"폴더 오류: {요청.folder}")
    run_id = str(uuid.uuid4())
    from services.phase1_data_service import Phase1Data서비스
    await Phase1Data서비스.register_execution_db(run_id, 요청)
    background_tasks.add_task(Phase1Data서비스.run_data_service, run_id, 요청)
    return {"run_id": run_id}


@라우터.get("/preprocess/data-run/latest")
async def get_latest_data_run(workspace: str = Query(""), folder: str = Query("")):
    """워크스페이스+폴더 기준 가장 최근 실행 정보 조회"""
    from core.database import 세션팩토리
    from sqlalchemy import text
    db = 세션팩토리()
    try:
        if folder and folder in ALLOWED_FOLDERS:
            row = db.execute(text(
                "SELECT run_id, status, folder, workspace FROM phase1_data_runs "
                "WHERE workspace=:ws AND folder=:folder ORDER BY id DESC LIMIT 1"
            ), {"ws": workspace, "folder": folder}).fetchone()
        else:
            row = db.execute(text(
                "SELECT run_id, status, folder, workspace FROM phase1_data_runs "
                "WHERE workspace=:ws ORDER BY id DESC LIMIT 1"
            ), {"ws": workspace}).fetchone()
        if row:
            return {"run_id": row[0], "status": row[1], "folder": row[2], "workspace": row[3]}
        return {"run_id": None}
    finally:
        db.close()


@라우터.get("/preprocess/data-logs/{run_id}")
async def get_data_execution_log(run_id: str):
    """data run 로그 DB 조회"""
    from core.database import 세션팩토리
    from sqlalchemy import text
    db = 세션팩토리()
    try:
        rows = db.execute(text(
            "SELECT step_num, step_name, percent, message, status, elapsed_sec, ts "
            "FROM phase1_data_logs WHERE run_id = :run_id ORDER BY id ASC"
        ), {"run_id": run_id}).fetchall()
        return [
            {"run_id": run_id, "step_num": r[0], "step_name": r[1], "percent": r[2],
             "message": r[3], "status": r[4], "elapsed_sec": r[5], "ts": str(r[6])}
            for r in rows
        ]
    finally:
        db.close()


@ws라우터.websocket("/ws/preprocess-data/{run_id}")
async def phase1_data_ws(websocket: WebSocket, run_id: str):
    await websocket.accept()
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(_redis_url(), encoding="utf-8", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"phase1_data:{run_id}")
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                await websocket.send_text(msg["data"])
                try:
                    data = json.loads(msg["data"])
                    if data.get("step_num") == -1 or data.get("status") == "failed":
                        break
                except Exception:
                    pass
        await pubsub.unsubscribe(f"phase1_data:{run_id}")
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
