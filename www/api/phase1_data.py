"""Phase 1 데이터기반 전처리 API — 범용 SGML 컬럼 선택 방식 (REST + WebSocket)

기존 사이트 고정(galleria/hmall/thd/ssf) 엔드포인트 제거.
업로드된 SGML 파일에서 컬럼 자동 감지 → 사용자가 컬럼 선택 → 로컬 파이프라인 실행.
"""
import os
import logging
import uuid
import json
from fastapi import APIRouter, UploadFile, File, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from typing import List, Optional
from pydantic import BaseModel

from core.exceptions import ValidationError

라우터 = APIRouter()
ws라우터 = APIRouter()  # WebSocket 전용 (prefix 없이 등록)

logger = logging.getLogger(__name__)

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))

REDIS_HOST = os.environ.get("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))


def _redis_url() -> str:
    return f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"


# ──────────────────────────────────────────────
# Pydantic 모델
# ──────────────────────────────────────────────

class ColumnSpec(BaseModel):
    name: str
    split_delimiter: Optional[str] = None


class DataAnalyze요청(BaseModel):
    filenames: List[str]
    workspace: Optional[str] = ""


class DataRun요청(BaseModel):
    filenames: List[str]
    columns: List[ColumnSpec]
    workspace: Optional[str] = ""


class DataConfig요청(BaseModel):
    domain: str
    selected_columns: List[ColumnSpec]


class DataRunAll요청(BaseModel):
    """데이터기반 전처리 6단계 전체 실행 요청."""
    filenames: List[str]
    columns: List[ColumnSpec]
    workspace: Optional[str] = ""
    domain: Optional[str] = ""


class DataRunStep요청(BaseModel):
    """데이터기반 전처리 단일 단계 실행 요청."""
    filenames: List[str]
    columns: List[ColumnSpec]
    workspace: Optional[str] = ""
    domain: Optional[str] = ""
    step_num: int  # 1~6


# ──────────────────────────────────────────────
# 파일 관리 엔드포인트
# ──────────────────────────────────────────────

@라우터.get("/preprocess/data-files")
async def list_data_files(workspace: str = Query("")):
    """워크스페이스의 data_input/ 직계 파일 목록 (비재귀)."""
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.list_files(workspace)


@라우터.post("/preprocess/data-files")
async def upload_data_file(file: UploadFile = File(...), workspace: str = Query("")):
    """SGML 파일 업로드 (workspace/build/data_input/ 루트로 저장)."""
    safe_name = os.path.basename(file.filename or "")
    if not safe_name:
        raise ValidationError("파일명이 비어 있습니다")
    ct = file.content_type or ""
    if ct.startswith(("image/", "audio/", "video/")):
        raise ValidationError(f"텍스트 파일만 허용됩니다: {ct}")
    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError(f"파일 크기 초과 (최대 {MAX_UPLOAD_MB}MB)")
    logger.info(
        f"데이터 파일 업로드: name={safe_name}, size={len(content)}, workspace={workspace}"
    )
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.save_file(safe_name, content, workspace)


@라우터.delete("/preprocess/data-files/{filename}")
async def delete_data_file(filename: str, workspace: str = Query("")):
    """워크스페이스 data_input/ 직계 파일 삭제."""
    safe_name = os.path.basename(filename)
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.delete_file(safe_name, workspace)


# ──────────────────────────────────────────────
# 컬럼 분석 엔드포인트
# ──────────────────────────────────────────────

@라우터.post("/preprocess/data-analyze-columns")
async def analyze_columns(요청: DataAnalyze요청):
    """업로드된 SGML 파일들에서 컬럼명 추출 + 샘플 5개 반환."""
    if not 요청.filenames:
        raise ValidationError("분석할 파일명이 없습니다")
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.analyze_columns(요청.filenames, 요청.workspace or "")


# ──────────────────────────────────────────────
# 실행 엔드포인트
# ──────────────────────────────────────────────

@라우터.post("/preprocess/data-run")
async def start_data_execution(요청: DataRun요청, background_tasks: BackgroundTasks):
    """선택된 컬럼만 추출+정규화하여 output/{col}.txt 저장."""
    if not 요청.filenames:
        raise ValidationError("입력 파일이 없습니다")
    if not 요청.columns:
        raise ValidationError("선택된 컬럼이 없습니다")

    run_id = str(uuid.uuid4())
    from services.phase1_data_service import Phase1Data서비스

    workspace = 요청.workspace or ""
    filenames = list(요청.filenames)
    columns_payload = [c.dict() for c in 요청.columns]

    await Phase1Data서비스.register_execution_db(run_id, workspace, filenames, columns_payload)
    background_tasks.add_task(
        Phase1Data서비스.run_data_service,
        run_id,
        workspace,
        filenames,
        columns_payload,
    )
    return {"run_id": run_id}


@라우터.get("/preprocess/data-run/latest")
async def get_latest_data_run(workspace: str = Query("")):
    """워크스페이스 기준 가장 최근 실행 정보 조회."""
    from core.database import 세션팩토리
    from sqlalchemy import text
    db = 세션팩토리()
    try:
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
    """data run 로그 DB 조회."""
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


# ──────────────────────────────────────────────
# 컬럼 선택 설정 엔드포인트 (도메인 단위)
# ──────────────────────────────────────────────

@라우터.get("/preprocess/data-config")
async def get_data_config(domain: str = Query(...)):
    """도메인별 선택 컬럼 설정 조회."""
    if not domain:
        raise ValidationError("domain 파라미터가 필요합니다")
    from services.phase1_data_service import Phase1Data서비스
    return await Phase1Data서비스.get_config(domain)


@라우터.post("/preprocess/data-config")
async def save_data_config(요청: DataConfig요청):
    """도메인별 선택 컬럼 설정 저장 (UPSERT)."""
    if not 요청.domain:
        raise ValidationError("domain은 필수입니다")
    from services.phase1_data_service import Phase1Data서비스
    selected = [c.dict() for c in 요청.selected_columns]
    return await Phase1Data서비스.save_config(요청.domain, selected)


# ──────────────────────────────────────────────
# B5: 6단계 전체 실행 엔드포인트
# ──────────────────────────────────────────────

@라우터.post("/preprocess/data-run-all")
async def data_run_all(요청: DataRunAll요청, background_tasks: BackgroundTasks):
    """데이터기반 전처리 6단계 전체 실행.

    반환: {run_id, status, message}
    WS로 실시간 진행상황 수신: /ws/preprocess-data/{run_id}
    """
    from services.phase1_data_service import Phase1Data서비스

    if not 요청.filenames:
        raise ValidationError("filenames는 필수입니다")
    if not 요청.columns:
        raise ValidationError("columns는 필수입니다")

    run_id = str(uuid.uuid4())
    workspace = 요청.workspace or ""
    domain = 요청.domain or ""
    filenames = [f for f in 요청.filenames if f]
    columns = [c.dict() for c in 요청.columns]

    # DB 등록
    await Phase1Data서비스.register_execution_db(run_id, workspace, filenames, columns)

    # 백그라운드 실행
    background_tasks.add_task(
        Phase1Data서비스.run_all_stages,
        run_id, workspace, domain, filenames, columns
    )

    return {"run_id": run_id, "status": "started", "message": "6단계 전처리 시작됨"}


# ──────────────────────────────────────────────
# B6: 단일 단계 실행 엔드포인트
# ──────────────────────────────────────────────

@라우터.post("/preprocess/data-run-step")
async def data_run_step(요청: DataRunStep요청, background_tasks: BackgroundTasks):
    """데이터기반 전처리 단일 단계 실행.

    반환: {run_id, status, step_num, message}
    """
    from services.phase1_data_service import Phase1Data서비스

    if not (1 <= 요청.step_num <= 6):
        raise ValidationError(f"step_num은 1~6 범위여야 합니다: {요청.step_num}")
    if not 요청.filenames:
        raise ValidationError("filenames는 필수입니다")

    run_id = str(uuid.uuid4())
    workspace = 요청.workspace or ""
    domain = 요청.domain or ""
    filenames = [f for f in 요청.filenames if f]
    columns = [c.dict() for c in 요청.columns]

    # DB 등록
    await Phase1Data서비스.register_execution_db(run_id, workspace, filenames, columns)

    # 백그라운드 실행
    background_tasks.add_task(
        Phase1Data서비스.run_step_only,
        run_id, workspace, domain, 요청.step_num, filenames, columns
    )

    return {
        "run_id": run_id,
        "status": "started",
        "step_num": 요청.step_num,
        "message": f"Step {요청.step_num} 실행 시작됨"
    }


# ──────────────────────────────────────────────
# B7: 단계 상태 조회 엔드포인트
# ──────────────────────────────────────────────

@라우터.get("/preprocess/data-step-status")
async def data_step_status(workspace: str = Query(""), run_id: Optional[str] = Query(None)):
    """데이터기반 전처리 단계별 최신 상태 조회.

    run_id를 지정하면 해당 실행의 단계별 상태를 반환한다.
    run_id 미지정 시 워크스페이스 최근 실행의 상태를 반환한다.
    """
    from sqlalchemy import text
    from core.database import 세션팩토리

    def _query():
        db = 세션팩토리()
        try:
            resolved_run_id = run_id
            if not resolved_run_id:
                # 최근 실행 run_id 조회
                row = db.execute(text(
                    "SELECT run_id FROM phase1_data_runs "
                    "WHERE workspace=:ws ORDER BY rowid DESC LIMIT 1"
                ), {"ws": workspace or ""}).fetchone()
                if not row:
                    return {"run_id": None, "steps": {}}
                resolved_run_id = row[0]

            # 단계별 최신 상태 (step_num별 마지막 row)
            rows = db.execute(text(
                "SELECT step_num, step_name, status, percent, message, elapsed_sec "
                "FROM phase1_data_logs "
                "WHERE run_id=:run_id "
                "ORDER BY id DESC"
            ), {"run_id": resolved_run_id}).fetchall()

            steps: dict = {}
            for r in rows:
                s_num = r[0]
                if s_num not in steps:
                    steps[s_num] = {
                        "step_num": s_num,
                        "step_name": r[1],
                        "status": r[2],
                        "percent": r[3],
                        "message": r[4],
                        "elapsed_sec": r[5],
                    }
            return {"run_id": resolved_run_id, "steps": steps}
        finally:
            db.close()

    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _query)


# ──────────────────────────────────────────────
# WebSocket (기존 유지)
# ──────────────────────────────────────────────

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
