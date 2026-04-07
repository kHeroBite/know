"""형태소분석 API 엔드포인트"""
from typing import Optional
import asyncio
from functools import partial

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import 현재사용자가져오기
from services.morpheme_service import 형태소분석, 풀형태소분석, 실시간_분析, 실시간_풀분析
from services.workspace_service import jiana홈경로

라우터 = APIRouter(prefix="/morpheme", tags=["형태소분析"])


class 분析요청(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None


@라우터.post("/analyze")
async def 키워드분析(요청: 분析요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 형태소분析 (심플 — LiteTest)."""
    jiana_home = jiana홈경로(요청.workspace) if 요청.workspace else None
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(형태소분析, 요청.keyword, 요청.domain, jiana_home=jiana_home))


@라우터.post("/analyze-full")
async def 키워드풀분析(요청: 분析요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 형태소분析 (풀 — FullTest, 품사태그 포함)."""
    jiana_home = jiana홈경로(요청.workspace) if 요청.workspace else None
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(풀형태소분析, 요청.keyword, 요청.domain, jiana_home=jiana_home))


@라우터.post("/analyze-realtime")
async def 실시간분析(요청: 분析요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 실시간 LITE 분析. JVM subprocess를 executor에서 실행해 이벤트루프 블로킹 방지."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(실시간_분析, 요청.keyword, 요청.domain or "", 요청.workspace or ""))


@라우터.post("/analyze-full-realtime")
async def 실시간풀분析(요청: 분析요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 실시간 FULL 분析. JVM subprocess를 executor에서 실행해 이벤트루프 블로킹 방지."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(실시간_풀분析, 요청.keyword, 요청.domain or "", 요청.workspace or ""))
