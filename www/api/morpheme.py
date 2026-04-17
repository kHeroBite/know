"""analyze_morpheme API 엔드포인트"""
from typing import Optional
import asyncio
import glob as _glob
import os
from functools import partial

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import get_current_user
from services.morpheme_service import analyze_morpheme, analyze_morpheme_full, analyze_realtime, analyze_realtime_full

from core.constants import DOMAIN_DIR
from services.workspace_service import get_jiana_home_path

라우터 = APIRouter(prefix="/morpheme", tags=["morpheme"])


class AnalyzeRequest(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None


def _resolve_jiana_home(workspace: Optional[str], domain: Optional[str]) -> Optional[str]:
    """workspace 우선, 없으면 domain 경로에서 jiana_home 결정.

    domain 경로: lib/jiana-dist-*/ 자동 탐색 (버전 하위 디렉토리 지원).
    예: domain/epost/lib/jiana-dist-1.5.13/ 형태.
    """
    if workspace:
        return get_jiana_home_path(workspace)
    if domain:
        domain_path = os.path.join(DOMAIN_DIR, domain)
        # lib/jiana-dist-* 하위 디렉토리 탐색 (버전 디렉토리 패턴)
        candidates = _glob.glob(os.path.join(domain_path, "lib", "jiana-dist-*"))
        for c in sorted(candidates, reverse=True):  # 최신 버전 우선
            if os.path.isfile(os.path.join(c, "lib", "jiana1.5.jar")):
                return c
        # fallback: domain_path 직접 (jiana1.5.jar가 바로 있는 경우)
        if os.path.isfile(os.path.join(domain_path, "lib", "jiana1.5.jar")):
            return domain_path
        return domain_path  # 최후 fallback (기존 동작)
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
