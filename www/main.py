from __future__ import annotations
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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


앱 = FastAPI(
    title="know-api",
    description="검색엔진 지식작업 관리도구 API",
    version="2.0.0",
)

앱.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:18000"],
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



@앱.on_event("startup")
def _run_migration():
    """서버 기동 시 신규 테이블 생성 + 기존 워크스페이스 phase 자동 추론."""
    from sqlalchemy import text
    마이그레이션경로 = os.path.join(os.path.dirname(__file__), "migrations", "002_user_work_phase.sql")
    try:
        with open(마이그레이션경로, "r", encoding="utf-8") as f:
            sql문 = f.read()
        with 엔진.connect() as conn:
            for 문장 in sql문.split(";"):
                # 주석 라인 제거 후 실제 SQL만 추출
                sql_라인 = [l for l in 문장.splitlines() if l.strip() and not l.strip().startswith("--")]
                정제된_sql = " ".join(sql_라인).strip()
                if 정제된_sql:
                    conn.execute(text(정제된_sql))
            conn.commit()
    except Exception as e:
        print(f"[migration 002] run_phase1_service 실패: {e}")
    # phase 자동 마이그레이션 (기존 워크스페이스 대상)
    try:
        from services.workspace_service import _auto_migrate_phase
        db = 세션팩토리()
        try:
            _auto_migrate_phase(db)
        finally:
            db.close()
    except Exception as e:
        print(f"[phase 자동마이그레이션] run_phase1_service 실패: {e}")


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
