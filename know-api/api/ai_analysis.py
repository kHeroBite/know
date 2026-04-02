"""AI분석 API 라우터."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import 현재사용자가져오기
from services.ai_analysis_service import AI검색, 프롬프트로드, 프롬프트저장

라우터 = APIRouter(prefix="/ai-analysis", tags=["AI분석"])


@라우터.get("/search")
async def AI검색처리(
    keyword: str = Query(..., min_length=1),
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """키워드로 LLM + Wikipedia 검색 수행."""
    return await AI검색(keyword)


@라우터.get("/prompt")
async def 프롬프트조회(
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """현재 AI 분석 프롬프트 템플릿 조회."""
    return {"prompt_template": 프롬프트로드()}


class 프롬프트수정요청(BaseModel):
    prompt_template: str


@라우터.put("/prompt")
async def 프롬프트수정(
    body: 프롬프트수정요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """AI 분석 프롬프트 템플릿 수정 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 프롬프트를 수정할 수 있습니다")
    프롬프트저장(body.prompt_template)
    return {"prompt_template": body.prompt_template}
