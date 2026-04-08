"""analyze_morpheme API 엔드포인트"""
from typing import Optional
import asyncio
from functools import partial

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import get_current_user
from services.morpheme_service import analyze_morpheme, analyze_morpheme_full, analyze_realtime, analyze_realtime_full
from services.workspace_service import get_jiana_home_path

라우터 = APIRouter(prefix="/morpheme", tags=["morpheme"])


class AnalyzeRequest(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None


@라우터.post("/analyze")
async def keyword_analyze(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 analyze_morpheme (심플 — LiteTest)."""
    jiana_home = get_jiana_home_path(req.workspace) if req.workspace else None
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_morpheme, req.keyword, req.domain, jiana_home=jiana_home))


@라우터.post("/analyze-full")
async def keyword_analyze_full(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 형태소分析 (풀 — FullTest, 품사태그 포함)."""
    jiana_home = get_jiana_home_path(req.workspace) if req.workspace else None
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
