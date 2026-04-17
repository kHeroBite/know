"""analyze_morpheme API 엔드포인트"""
from typing import Optional
import asyncio
import glob as _glob
import json
import os
from functools import partial

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import get_current_user
from services.morpheme_service import analyze_morpheme, analyze_morpheme_full, analyze_realtime, analyze_realtime_full

from core.constants import DOMAIN_DIR, STATE_FILE, WORKSPACE_DIR
from services.workspace_service import get_jiana_home_path

라우터 = APIRouter(prefix="/morpheme", tags=["morpheme"])


class AnalyzeRequest(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None


def _find_workspace_jiana_for_domain(domain: str) -> Optional[str]:
    """도메인에 연결된 USED 워크스페이스의 jiana 경로 반환.

    workspace/.state.json에서 domain이 일치하고 status=USED인 워크스페이스를 찾아
    해당 workspace/jiana 경로를 반환한다.
    사용자사전(udic_1.5.dcd)은 워크스페이스 jiana에 빌드되므로 이쪽을 우선 사용해야 함.
    """
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
        for ws_name, ws_state in state.items():
            if ws_state.get("domain") == domain and ws_state.get("status") in ("USED", "CONNECTING"):
                jiana_path = os.path.join(WORKSPACE_DIR, ws_name, "jiana")
                if os.path.isdir(jiana_path):
                    return jiana_path
    except Exception:
        pass
    return None


def _resolve_jiana_home(workspace: Optional[str], domain: Optional[str]) -> Optional[str]:
    """workspace 우선, 없으면 domain에 연결된 USED 워크스페이스 jiana, 마지막으로 domain 엔진 경로.

    우선순위:
    1. workspace 명시: workspace/jiana/ 직접 사용 (사용자사전 포함)
    2. domain 명시: .state.json에서 USED 워크스페이스 찾아 그 jiana 사용 (사용자사전 포함)
    3. fallback: domain/lib/jiana-dist-*/ 엔진 경로 (사용자사전 없음 — 순수 분析용)
    """
    if workspace:
        return get_jiana_home_path(workspace)
    if domain:
        # 해당 도메인에 연결된 워크스페이스 jiana 우선 사용 (사용자사전 빌드됨)
        ws_jiana = _find_workspace_jiana_for_domain(domain)
        if ws_jiana:
            return ws_jiana
        # fallback: domain/lib/jiana-dist-*/ 탐색 (순수 엔진)
        domain_path = os.path.join(DOMAIN_DIR, domain)
        candidates = _glob.glob(os.path.join(domain_path, "lib", "jiana-dist-*"))
        for c in sorted(candidates, reverse=True):  # 최신 버전 우선
            if os.path.isfile(os.path.join(c, "lib", "jiana1.5.jar")):
                return c
        if os.path.isfile(os.path.join(domain_path, "lib", "jiana1.5.jar")):
            return domain_path
        return domain_path  # 최후 fallback
    return None


@라우터.post("/analyze")
async def keyword_analyze(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 analyze_morpheme (심플 — LiteTest)."""
    jiana_home = _resolve_jiana_home(req.workspace, req.domain)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_morpheme, req.keyword, req.domain, jiana_home=jiana_home))


@라우터.post("/analyze-full")
async def keyword_analyze_full(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 형태소分析 (풀 — FullTest, 품사태그 포함)."""
    jiana_home = _resolve_jiana_home(req.workspace, req.domain)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_morpheme_full, req.keyword, req.domain, jiana_home=jiana_home))


@라우터.post("/analyze-realtime")
async def realtime_analyze(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 실시간 LITE 分析. JVM subprocess를 executor에서 실행해 이벤트루프 블로킹 방지."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_realtime, req.keyword, req.domain or "", req.workspace or ""))


@라우터.post("/analyze-full-realtime")
async def realtime_analyze_full(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 실시간 FULL 分析. JVM subprocess를 executor에서 실행해 이벤트루프 블로킹 방지."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_realtime_full, req.keyword, req.domain or "", req.workspace or ""))
