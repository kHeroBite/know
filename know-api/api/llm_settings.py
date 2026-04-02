"""LLM 설정 API 라우터."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import 현재사용자가져오기
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


def _키마스킹(key: str) -> str:
    """API 키를 마스킹 처리 (앞 4자 + *****)."""
    if not key or len(key) <= 4:
        return key
    return key[:4] + "*" * (len(key) - 4)


@라우터.get("")
async def 설정전체조회(
    _current: dict = Depends(현재사용자가져오기),
) -> List[Dict[str, Any]]:
    """전체 LLM provider 설정 조회 (api_key 마스킹)."""
    설정목록 = llm_settings_service.설정전체조회()
    for s in 설정목록:
        s["api_key"] = _키마스킹(s.get("api_key", ""))
    return 설정목록


@라우터.put("/{provider}")
async def 설정저장(
    provider: str,
    body: LLM설정수정요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """provider 설정 저장 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 설정을 수정할 수 있습니다")
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return llm_settings_service.설정저장(
        provider=provider,
        api_key=body.api_key,
        base_url=body.base_url,
        model=body.model,
        is_active=body.is_active,
    )


@라우터.post("/{provider}/test")
async def 통신테스트(
    provider: str,
    body: 통신테스트요청,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """provider 통신 테스트."""
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return await llm_settings_service.통신테스트(
        provider=provider,
        api_key=body.api_key,
        base_url=body.base_url,
    )


@라우터.get("/{provider}/models")
async def 모델목록조회(
    provider: str,
    api_key: str = "",
    base_url: str = "",
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """provider 사용 가능 모델 목록."""
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    models = await llm_settings_service.모델목록조회(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
    )
    return {"provider": provider, "models": models}


@라우터.put("/active/{provider}")
async def 활성변경(
    provider: str,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """활성 provider 변경 (관리자만)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=403, detail="관리자만 활성 provider를 변경할 수 있습니다")
    if provider not in ("openai", "claude", "gemini", "local"):
        raise HTTPException(status_code=400, detail=f"잘못된 provider: {provider}")
    return llm_settings_service.활성변경(provider)
