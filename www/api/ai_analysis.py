"""AI분석 API 라우터."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import get_current_user
from services.ai_analysis_service import ai_search_service, ai_search_provider, load_prompt, save_prompt

라우터 = APIRouter(prefix="/ai-analysis", tags=["AI분석"])


@라우터.get("/search")
async def ai_search(
    keyword: str = Query(..., min_length=1),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """키워드로 LLM + Wikipedia 검색 수행."""
    return await ai_search_service(keyword, user_id=current.get('user_id', ''))


@라우터.get("/search/{provider}")
async def ai_search_by_provider(
    provider: str,
    keyword: str = Query(..., min_length=1),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """특정 범용LLM provider로 AI분석 호출."""
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return await ai_search_provider(keyword, provider, user_id=current.get("user_id", ""))


@라우터.get("/active-providers")
async def get_active_providers(
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """현재 활성화된 LLM provider 목록 반환."""
    from services.llm_settings_service import _get_active_settings_list
    active = _get_active_settings_list()
    return {
        "providers": [
            {"provider": s["provider"], "model": s["model"]}
            for s in active
        ]
    }


@라우터.get("/prompt")
async def get_prompt(
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """현재 AI 분석 프롬프트 템플릿 조회."""
    return {"prompt_template": load_prompt()}


class 프롬프트수정요청(BaseModel):
    prompt_template: str


@라우터.put("/prompt")
async def update_prompt(
    body: 프롬프트수정요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """AI 분석 프롬프트 템플릿 수정 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 프롬프트를 수정할 수 있습니다")
    save_prompt(body.prompt_template)
    return {"prompt_template": body.prompt_template}
