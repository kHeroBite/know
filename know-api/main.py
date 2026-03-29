from __future__ import annotations
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from core.database import DB연결확인
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



@앱.get("/api/health")
def 헬스체크():
    return {"status": "ok", "db": DB연결확인()}


# React SPA 정적 파일 서빙 (빌드 후 활성화)
_프론트엔드경로 = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_프론트엔드경로):
    앱.mount("/assets", StaticFiles(directory=os.path.join(_프론트엔드경로, "assets")), name="assets")

    @앱.get("/{full_path:path}")
    def 프론트엔드서빙(full_path: str):
        """SPA 라우팅 — 모든 비API 경로를 index.html로."""
        index = os.path.join(_프론트엔드경로, "index.html")
        return FileResponse(index)
