"""AI분석 검색 서비스 — LLM 질의 + Wikipedia 한국어 API."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from urllib.parse import quote

import httpx

from services.llm_settings_service import LLM질의

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
_uvicorn_logger = logging.getLogger("uvicorn")
if _uvicorn_logger.handlers:
    for _h in _uvicorn_logger.handlers:
        logger.addHandler(_h)
    logger.propagate = False

_TIMEOUT = 10.0
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

_PROMPT_FILE = Path(__file__).parent.parent / "config" / "ai_prompt.json"
_DEFAULT_PROMPT = "{keyword} 무엇인지 짧게 2줄로 설명해줘"


def 프롬프트로드() -> str:
    """config/ai_prompt.json에서 프롬프트 템플릿 로드."""
    try:
        if _PROMPT_FILE.exists():
            data = json.loads(_PROMPT_FILE.read_text(encoding="utf-8"))
            return data.get("prompt_template", _DEFAULT_PROMPT)
    except Exception:
        pass
    return _DEFAULT_PROMPT


def 프롬프트저장(prompt_template: str) -> None:
    """config/ai_prompt.json에 프롬프트 템플릿 저장."""
    _PROMPT_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PROMPT_FILE.write_text(
        json.dumps({"prompt_template": prompt_template}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


async def _위키피디아검색(keyword: str) -> dict:
    """Wikipedia 한국어 REST API로 키워드 요약 추출 (영어 fallback 포함)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            ko_url = f"https://ko.wikipedia.org/api/rest_v1/page/summary/{quote(keyword)}"
            logger.info("[AI분석][Wiki] 한국어 검색: url=%s", ko_url)
            resp = await client.get(ko_url)
            if resp.status_code == 404:
                logger.info("[AI분석][Wiki] 한국어 404 → 영어 fallback 시도")
                en_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(keyword)}"
                resp = await client.get(en_url)
            logger.info("[AI분석][Wiki] 응답 status=%d", resp.status_code)
            resp.raise_for_status()
        data = resp.json()
        result = data.get("extract") or data.get("description") or ""
        if not result:
            result = f"Wikipedia에서 '{keyword}' 정보를 찾을 수 없습니다"
        else:
            logger.info("[AI분석][Wiki] 최종 결과: %r", result[:100])
        return {"result": result[:300], "error": None}
    except Exception as e:
        logger.error("[AI분석][Wiki] 오류: %s", e)
        return {"result": None, "error": str(e)}


async def AI검색(keyword: str) -> dict:
    """LLM 질의 + Wikipedia 동시 검색."""
    import asyncio
    logger.info("[AI분석] 검색 시작: keyword=%r", keyword)
    prompt = 프롬프트로드()
    query = prompt.format(keyword=keyword)
    logger.info("[AI분석] 프롬프트 query=%r", query)

    llm_task = asyncio.create_task(LLM질의(keyword, prompt))
    wiki_task = asyncio.create_task(_위키피디아검색(keyword))

    llm_result = await llm_task
    wiki_result = await wiki_task

    llm_val = llm_result.get("result") if llm_result else None
    wiki_val = wiki_result.get("result") if wiki_result else None
    provider = llm_result.get("provider") if llm_result else None
    model = llm_result.get("model") if llm_result else None

    logger.info(
        "[AI분석] 최종 반환: llm=%r, wikipedia=%r, provider=%s, model=%s",
        llm_val[:60] if llm_val else None,
        wiki_val[:60] if wiki_val else None,
        provider,
        model,
    )
    return {
        "llm": llm_val,
        "wikipedia": wiki_val,
        "query": query,
        "provider": provider,
        "model": model,
    }
