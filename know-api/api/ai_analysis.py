"""AI분석 API 라우터."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Query

from api.auth import 현재사용자가져오기
from services.ai_analysis_service import AI검색

라우터 = APIRouter(prefix="/ai-analysis", tags=["AI분석"])


@라우터.get("/search")
async def AI검색처리(
    keyword: str = Query(..., min_length=1),
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """키워드로 Google + Perplexity 검색 수행."""
    return await AI검색(keyword)
