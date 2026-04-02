"""AI분석 검색 서비스 — DuckDuckGo Instant Answer API + Wikipedia 한국어 API."""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import quote

import httpx

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


async def _덕덕고검색(keyword: str) -> dict:
    """DuckDuckGo Instant Answer API로 키워드 정보 추출 (JSON, 크롤링 불필요)."""
    try:
        # 키워드만 사용 (프롬프트 포함 시 Instant Answer 적중률 저하)
        url = (
            f"https://api.duckduckgo.com/?q={quote(keyword)}"
            "&format=json&no_html=1&skip_disambig=1&kl=kr-ko"
        )
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        data = resp.json()
        # AbstractText: 위키 기반 요약
        result = data.get("AbstractText") or ""
        if not result:
            # RelatedTopics 첫 번째 항목 텍스트 fallback
            for topic in data.get("RelatedTopics", []):
                if isinstance(topic, dict) and topic.get("Text"):
                    result = topic["Text"][:300]
                    break
        if not result:
            result = f"'{keyword}'에 대한 검색 결과가 없습니다"
        return {"result": result[:300], "error": None}
    except Exception as e:
        return {"result": None, "error": str(e)}


async def _위키피디아검색(keyword: str) -> dict:
    """Wikipedia 한국어 REST API로 키워드 요약 추출 (영어 fallback 포함)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            # 한국어 Wikipedia 우선
            ko_url = f"https://ko.wikipedia.org/api/rest_v1/page/summary/{quote(keyword)}"
            resp = await client.get(ko_url)
            if resp.status_code == 404:
                # 영어 Wikipedia fallback
                en_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(keyword)}"
                resp = await client.get(en_url)
            resp.raise_for_status()
        data = resp.json()
        result = data.get("extract") or data.get("description") or ""
        if not result:
            result = f"Wikipedia에서 '{keyword}' 정보를 찾을 수 없습니다"
        return {"result": result[:300], "error": None}
    except Exception as e:
        return {"result": None, "error": str(e)}


async def AI검색(keyword: str) -> dict:
    """DuckDuckGo + Wikipedia 동시 검색."""
    import asyncio
    prompt = 프롬프트로드()
    query = prompt.format(keyword=keyword)
    ddg_task = asyncio.create_task(_덕덕고검색(keyword))
    wiki_task = asyncio.create_task(_위키피디아검색(keyword))
    ddg_result = await ddg_task
    wiki_result = await wiki_task
    return {
        "google": ddg_result.get("result") if ddg_result else None,
        "wikipedia": wiki_result.get("result") if wiki_result else None,
        "query": query,
    }
