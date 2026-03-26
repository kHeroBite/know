"""Phase 1 파이프라인 API — REST + WebSocket (realtime.py 무수정)"""
import os
import logging
import uuid
import json
import asyncio
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.auth import 현재사용자가져오기

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
    domain: str
    category: str
    filename: str
    start_step: int = 0
    end_step: int = 4

class 워크스페이스생성요청(BaseModel):
    name: str

class 도메인복사요청(BaseModel):
    source: str
    target: str

class 도메인적용요청(BaseModel):
    workspace: str

@라우터.get("/preprocess/files/{folder}")
async def 파일목록(folder: str):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"폴더 오류: {folder}")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.파일목록(folder)

@라우터.post("/preprocess/files/{folder}")
async def 파일업로드(folder: str, file: UploadFile = File(...)):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"폴더 오류: {folder}")
    safe_name = os.path.basename(file.filename or "")
    ct = file.content_type or ""
    if ct.startswith(("image/", "audio/", "video/")):
        raise HTTPException(status_code=422, detail=f"텍스트 파일만 허용됩니다: {ct}")
    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=422, detail=f"파일 크기 초과 (최대 {MAX_UPLOAD_MB}MB)")
    logger.info(f"파일 업로드: name={safe_name}, size={len(content)}, content_type={ct}")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.파일저장(folder, safe_name, content)

@라우터.delete("/preprocess/files/{folder}/{filename}")
async def 파일삭제(folder: str, filename: str):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"폴더 오류: {folder}")
    safe_name = os.path.basename(filename)
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.파일삭제(folder, safe_name)

@라우터.post("/preprocess/run")
async def 실행시작(요청: Phase1실행요청, background_tasks: BackgroundTasks):
    if 요청.category not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=422, detail=f"카테고리 오류: {요청.category}")
    run_id = str(uuid.uuid4())
    from services.phase1_service import Phase1서비스
    await Phase1서비스.실행DB등록(run_id, 요청)
    background_tasks.add_task(Phase1서비스.실행, run_id, 요청)
    return {"run_id": run_id}

# ─────────────────────────────────────────────
# 워크스페이스 관리 API
# ─────────────────────────────────────────────

@라우터.get("/preprocess/workspaces")
async def 워크스페이스목록조회():
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.워크스페이스목록()

@라우터.post("/preprocess/workspaces")
async def 워크스페이스생성(body: 워크스페이스생성요청):
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.워크스페이스생성(body.name)

@라우터.delete("/preprocess/workspaces/{name}")
async def 워크스페이스삭제(name: str, current_user: dict = Depends(현재사용자가져오기)):
    if current_user.get("user_id") != "super":
        raise HTTPException(status_code=403, detail="super 권한 필요")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.워크스페이스삭제(name)

# ─────────────────────────────────────────────
# 도메인 관리 API
# ─────────────────────────────────────────────

@라우터.get("/preprocess/domains")
async def 도메인목록조회():
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.도메인목록()

@라우터.post("/preprocess/domains/copy")
async def 도메인복사(body: 도메인복사요청):
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.도메인복사(body.source, body.target)

@라우터.delete("/preprocess/domains/{name}")
async def 도메인삭제(name: str, current_user: dict = Depends(현재사용자가져오기)):
    if current_user.get("user_id") != "super":
        raise HTTPException(status_code=403, detail="super 권한 필요")
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.도메인삭제(name)

@라우터.post("/preprocess/domains/{name}/apply")
async def 도메인적용(name: str, body: 도메인적용요청):
    from services.phase1_service import Phase1서비스
    return await Phase1서비스.도메인적용(name, body.workspace)

@ws라우터.websocket("/ws/preprocess/{run_id}")
async def phase1_ws(websocket: WebSocket, run_id: str):
    await websocket.accept()
    try:
        import aioredis
        r = aioredis.from_url(_redis_url(), encoding="utf-8", decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"phase1:{run_id}")
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                await websocket.send_text(msg["data"])
                try:
                    data = json.loads(msg["data"])
                    if data.get("status") in ("completed", "failed"):
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
