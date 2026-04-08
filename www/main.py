from __future__ import annotations
import os
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from core.config import 설정값
from core.exceptions import KnowAPIError
from core.database import check_db_connection, 엔진, 세션팩토리
from api.auth import 라우터 as 인증라우터
from api.domain import 라우터 as 도메인라우터
from api.dictionary import 라우터 as 사전라우터
from api.category import 라우터 as 카테고리라우터
from api.statistics import 라우터 as 통계라우터
from api.pipeline import 라우터 as 파이프라인라우터
from api.knowledge import 라우터 as 지식작업라우터
from api.build import 라우터 as 빌드라우터
from api.realtime import 라우터 as 실시간라우터
from api.phase1 import 라우터 as phase1라우터, ws라우터 as phase1_ws라우터
from api.workspace import 라우터 as 워크스페이스라우터, 도메인관리라우터
from api.account import 라우터 as 계정라우터
from api.assignment import 라우터 as 할당라우터
from api.morpheme import 라우터 as 형태소라우터
from api.work_history import 라우터 as 작업이력라우터
from api.ai_analysis import 라우터 as AI분석라우터
from api.llm_settings import 라우터 as LLM설정라우터
from api.dict_verify import 라우터 as 사전검증라우터
from api.dashboard import 라우터 as 대시보드라우터
from api.notification import 라우터 as 알림라우터


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
_접근로그 = logging.getLogger("access")
# 멀티워커 환경에서도 로그가 파일에 기록되도록 FileHandler 추가
_log_file_handler = logging.FileHandler("/tmp/know-api.log", encoding="utf-8")
_log_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s.%(msecs)03d %(levelname)s %(message)s", datefmt="%H:%M:%S"
))
_접근로그.addHandler(_log_file_handler)
_접근로그.setLevel(logging.INFO)

@asynccontextmanager
async def _lifespan(app: FastAPI):
    """서버 기동 시 마이그레이션 + phase 자동 추론."""
    from sqlalchemy import text
    마이그레이션경로 = os.path.join(os.path.dirname(__file__), "migrations", "002_user_work_phase.sql")
    try:
        with open(마이그레이션경로, "r", encoding="utf-8") as f:
            sql문 = f.read()
        with 엔진.connect() as conn:
            for 문장 in sql문.split(";"):
                sql_라인 = [l for l in 문장.splitlines() if l.strip() and not l.strip().startswith("--")]
                정제된_sql = " ".join(sql_라인).strip()
                if 정제된_sql:
                    conn.execute(text(정제된_sql))
            conn.commit()
    except Exception as e:
        print(f"[migration 002] 실패: {e}")
    try:
        from services.workspace_service import _auto_migrate_phase
        db = 세션팩토리()
        try:
            _auto_migrate_phase(db)
        finally:
            db.close()
    except Exception as e:
        print(f"[phase 자동마이그레이션] 실패: {e}")
    yield


앱 = FastAPI(
    title="know-api",
    description="검색엔진 지식작업 관리도구 API",
    version="2.0.0",
    lifespan=_lifespan,
)

@앱.middleware("http")
async def 타이밍미들웨어(request: Request, call_next):
    시작 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - 시작) * 1000
    _접근로그.info("%.0fms %s %s %d", ms, request.method, request.url.path, response.status_code)
    return response

# CORS 오리진: 환경변수 ALLOWED_ORIGINS (쉼표 구분) 또는 config 기본값
_cors_origins_raw = 설정값.ALLOWED_ORIGINS
if _cors_origins_raw == "*":
    _cors_origins = ["*"]
else:
    _cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

앱.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
앱.include_router(인증라우터, prefix="/api/auth", tags=["인증"])
앱.include_router(도메인라우터)
앱.include_router(사전라우터)
앱.include_router(카테고리라우터)
앱.include_router(통계라우터)
앱.include_router(파이프라인라우터)
앱.include_router(지식작업라우터)
앱.include_router(빌드라우터)
# WebSocket 라우터는 prefix 없이 등록 (/ws/... 경로 유지)
앱.include_router(실시간라우터)
앱.include_router(phase1라우터, prefix="/api", tags=["phase1"])
앱.include_router(phase1_ws라우터)  # Phase1 WS는 prefix 없이
앱.include_router(워크스페이스라우터, prefix="/api", tags=["워크스페이스"])
앱.include_router(도메인관리라우터, prefix="/api", tags=["도메인관리"])
앱.include_router(계정라우터, prefix="/api", tags=["계정관리"])
앱.include_router(할당라우터, prefix="/api/assignments", tags=["데이터assign"])
앱.include_router(형태소라우터, prefix="/api", tags=["analyze_morpheme"])
앱.include_router(작업이력라우터, prefix="/api", tags=["작업이력"])
앱.include_router(AI분석라우터, prefix="/api", tags=["AI분석"])
앱.include_router(LLM설정라우터, prefix="/api/llm-settings", tags=["LLM설정"])
앱.include_router(사전검증라우터, prefix="/api", tags=["verify_dict"])
앱.include_router(대시보드라우터)
앱.include_router(알림라우터)


# ── 전역 예외 핸들러 ──────────────────────────────────────
_에러로거 = logging.getLogger("error")


@앱.exception_handler(KnowAPIError)
async def know_api_에러_핸들러(request: Request, exc: KnowAPIError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@앱.exception_handler(Exception)
async def 일반_에러_핸들러(request: Request, exc: Exception):
    _에러로거.error("Unexpected error: %s %s — %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "서버 내부 오류가 발생했습니다."})





@앱.get("/api/health")
def health_check():
    return {"status": "ok", "db": check_db_connection()}


# React SPA 정적 파일 서빙 (빌드 후 활성화)
_프론트엔드경로 = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_프론트엔드경로):
    앱.mount("/assets", StaticFiles(directory=os.path.join(_프론트엔드경로, "assets")), name="assets")

    # 매뉴얼 스크린샷 정적 파일 서빙
    _매뉴얼경로 = os.path.join(_프론트엔드경로, "manual")
    if os.path.isdir(_매뉴얼경로):
        앱.mount("/manual", StaticFiles(directory=_매뉴얼경로), name="manual")

    @앱.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        """SPA 라우팅 — 정적 파일 존재 시 직접 서빙, 아니면 index.html."""
        file_path = os.path.join(_프론트엔드경로, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index = os.path.join(_프론트엔드경로, "index.html")
        return FileResponse(index)
