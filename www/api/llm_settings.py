"""LLM 설정 API 라우터."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from services import llm_settings_service

라우터 = APIRouter(tags=["LLM설정"])


class LLM설정수정요청(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    is_active: int = 0


class 통신테스트요청(BaseModel):
    api_key: str = ""
    base_url: str = ""


def _mask_key(key: str) -> str:
    """API 키를 마스킹 처리 (앞 4자 + *****)."""
    if not key or len(key) <= 4:
        return key
    return key[:4] + "*" * (len(key) - 4)


@라우터.get("")
async def get_all_llm_settings(
    _current: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """전체 LLM provider 설정 조회."""
    설정list_tasks = llm_settings_service.get_all_llm_settings()
    return 설정list_tasks


@라우터.put("/{provider}")
async def save_llm_settings(
    provider: str,
    body: LLM설정수정요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """provider 설정 저장 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 설정을 수정할 수 있습니다")
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return llm_settings_service.save_llm_settings(
        provider=provider,
        api_key=body.api_key,
        base_url=body.base_url,
        model=body.model,
        is_active=body.is_active,
    )


@라우터.post("/{provider}/test")
async def test_llm_connection(
    provider: str,
    body: 통신테스트요청,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """provider 통신 테스트."""
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return await llm_settings_service.test_llm_connection(
        provider=provider,
        api_key=body.api_key,
        base_url=body.base_url,
    )


@라우터.get("/{provider}/models")
async def get_llm_model_list(
    provider: str,
    api_key: str = "",
    base_url: str = "",
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """provider 사용 가능 모델 list_tasks."""
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    models = await llm_settings_service.get_llm_model_list(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
    )
    return {"provider": provider, "models": models}


class 프롬프트저장요청(BaseModel):
    prompt: str = ""


@라우터.get("/thesaurus-prompt")
async def get_synonym_prompt(
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """유사어 추천 LLM 프롬프트 조회 (공유)."""
    return llm_settings_service.get_synonym_prompt()


@라우터.put("/thesaurus-prompt")
async def save_synonym_prompt(
    body: 프롬프트저장요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """유사어 추천 LLM 프롬프트 저장 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 수정 가능")
    return llm_settings_service.save_synonym_prompt(body.prompt)


@라우터.put("/active/{provider}")
async def change_llm_active(
    provider: str,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """활성 provider 변경 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 활성 provider를 변경할 수 있습니다")
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return llm_settings_service.change_llm_active(provider)
