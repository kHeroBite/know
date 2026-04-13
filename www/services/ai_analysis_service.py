"""AI분석 검색 서비스 — LLM 질의 + Wikipedia 한국어 API."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from urllib.parse import quote

import httpx

from services.llm_settings_service import llm_query

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
_DEFAULT_PROMPT = """당신은 검색엔진 지식체계 구축 전문가입니다. 아래 키워드에 대해 지식작업 담당자가 카테고리 분류와 사전 구축에 참고할 수 있도록 자연스러운 문장으로 설명해 주세요.

키워드: {keyword}

키워드의 핵심 의미와 주요 용도, 분류 관점에서의 위치를 2~4문장으로 자연스럽게 서술하세요. 마크다운(#, **, __, -, * 등) 형식은 절대 사용하지 마세요. 이모지는 자유롭게 사용해도 됩니다."""


def load_prompt() -> str:
    """config/ai_prompt.json에서 프롬프트 템플릿 로드."""
    try:
        if _PROMPT_FILE.exists():
            data = json.loads(_PROMPT_FILE.read_text(encoding="utf-8"))
            return data.get("prompt_template", _DEFAULT_PROMPT)
    except Exception:
        pass
    return _DEFAULT_PROMPT


def save_prompt(prompt_template: str) -> None:
    """config/ai_prompt.json에 프롬프트 템플릿 저장."""
    _PROMPT_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PROMPT_FILE.write_text(
        json.dumps({"prompt_template": prompt_template}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


async def _search_wikipedia(keyword: str) -> dict:
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


async def ai_search_service(keyword: str, user_id: str = '') -> dict:
    """로컬LLM + Wikipedia 기본 검색 (범용LLM 제외)."""
    import asyncio
    from services.llm_settings_service import _get_active_settings_list, _single_llm_query
    logger.info("[AI분석] 검색 시작: keyword=%r", keyword)
    prompt = load_prompt()

    # 로컬LLM 설정만 추출
    all_active = _get_active_settings_list()
    local_settings = [s for s in all_active if s["provider"] == "local"]

    tasks_map = {}
    if local_settings:
        tasks_map["local"] = asyncio.create_task(
            _single_llm_query(local_settings[0], keyword, prompt, user_id, "ai_analysis")
        )
    wiki_task = asyncio.create_task(_search_wikipedia(keyword))

    local_result = await tasks_map["local"] if "local" in tasks_map else None
    wiki_result = await wiki_task

    wiki_val = wiki_result.get("result") if wiki_result else None

    local_log = (local_result.get("result") or "")[:60] if local_result else None
    logger.info("[AI분석] 완료: local=%r, wiki=%r",
                local_log,
                wiki_val[:60] if wiki_val else None)
    return {
        "wikipedia": wiki_val,
        "local_result": local_result,
        "local_active": bool(local_settings),
        "query": prompt.format(keyword=keyword),
    }


async def ai_search_provider(keyword: str, provider: str, user_id: str = '') -> dict:
    """범용LLM 특정 provider 단일 호출."""
    from services.llm_settings_service import _get_active_settings_list, _single_llm_query
    logger.info("[AI분석][범용] provider=%s keyword=%r", provider, keyword)
    prompt = load_prompt()

    all_active = _get_active_settings_list()
    provider_settings = [s for s in all_active if s["provider"] == provider]
    if not provider_settings:
        return {"result": None, "provider": provider, "model": None,
                "error": f"'{provider}' 설정이 활성화되지 않았습니다"}

    return await _single_llm_query(provider_settings[0], keyword, prompt, user_id, "ai_analysis")
