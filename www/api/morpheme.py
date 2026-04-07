"""형태소분석 API 엔드포인트"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import 현재사용자가져오기
from services.morpheme_service import 형태소분석, 풀형태소분석, 실시간_분석, 실시간_풀분석
from services.workspace_service import jiana홈경로

라우터 = APIRouter(prefix="/morpheme", tags=["형태소분석"])


class 분석요청(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None


@라우터.post("/analyze")
def 키워드분석(요청: 분석요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 형태소분석 (심플 — LiteTest)."""
    jiana_home = jiana홈경로(요청.workspace) if 요청.workspace else None
    return 형태소분석(요청.keyword, 요청.domain, jiana_home=jiana_home)


@라우터.post("/analyze-full")
def 키워드풀분석(요청: 분석요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 형태소분석 (풀 — FullTest, 품사태그 포함)."""
    jiana_home = jiana홈경로(요청.workspace) if 요청.workspace else None
    return 풀형태소분석(요청.keyword, 요청.domain, jiana_home=jiana_home)


@라우터.post("/analyze-realtime")
def 실시간분석(요청: 분석요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 실시간 LITE 분석."""
    return 실시간_분석(요청.keyword, 요청.domain or "", 요청.workspace or "")


@라우터.post("/analyze-full-realtime")
def 실시간풀분석(요청: 분석요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 실시간 FULL 분석."""
    return 실시간_풀분석(요청.keyword, 요청.domain or "", 요청.workspace or "")
