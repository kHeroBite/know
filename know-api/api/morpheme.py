"""형태소분석 API 엔드포인트"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import 현재사용자가져오기
from services.morpheme_service import 형태소분석

라우터 = APIRouter(prefix="/morpheme", tags=["형태소분석"])


class 분석요청(BaseModel):
    keyword: str
    domain: Optional[str] = None


@라우터.post("/analyze")
def 키워드분석(요청: 분석요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 형태소분석."""
    return 형태소분석(요청.keyword, 요청.domain)
