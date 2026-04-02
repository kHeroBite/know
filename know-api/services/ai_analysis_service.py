"""AI분석 웹스크래핑 서비스 — Google/Perplexity 검색."""
from __future__ import annotations

from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

_TIMEOUT = 10.0
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}


async def _구글검색(keyword: str) -> dict:
    """Google 검색 결과 snippet에서 텍스트 추출."""
    try:
        query = quote_plus(f"{keyword}가 무엇인지 짧게 2줄로 알려달라")
        url = f"https://www.google.com/search?q={query}"
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Google featured snippet / 검색결과 텍스트 추출
        snippets = []
        for selector in ["div.BNeawe.s3v9rd", "div.BNeawe", "span.hgKElc", "div.IsZvec"]:
            elements = soup.select(selector)
            for el in elements:
                txt = el.get_text(strip=True)
                if txt and len(txt) > 10:
                    snippets.append(txt)
            if snippets:
                break
        if not snippets:
            # fallback: 모든 검색결과 div
            for div in soup.find_all("div"):
                txt = div.get_text(strip=True)
                if len(txt) > 30 and keyword.lower() in txt.lower():
                    snippets.append(txt[:200])
                    break
        result = snippets[0][:300] if snippets else "검색 결과를 추출할 수 없습니다"
        return {"result": result, "error": None}
    except Exception as e:
        return {"result": None, "error": str(e)}


async def _퍼플렉시티검색(keyword: str) -> dict:
    """Perplexity 검색 결과에서 답변 텍스트 추출."""
    try:
        query = quote_plus(keyword)
        url = f"https://www.perplexity.ai/search?q={query}"
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Perplexity는 JS 렌더링이 필요해서 정적 HTML에서는 제한적
        texts = []
        for tag in soup.find_all(["p", "span", "div"]):
            txt = tag.get_text(strip=True)
            if txt and len(txt) > 20:
                texts.append(txt)
        result = texts[0][:300] if texts else "Perplexity 결과를 추출할 수 없습니다 (JS 렌더링 필요)"
        return {"result": result, "error": None}
    except Exception as e:
        return {"result": None, "error": str(e)}


async def AI검색(keyword: str) -> dict:
    """Google + Perplexity 동시 검색."""
    import asyncio
    google_task = asyncio.create_task(_구글검색(keyword))
    perplexity_task = asyncio.create_task(_퍼플렉시티검색(keyword))
    google_result = await google_task
    perplexity_result = await perplexity_task
    return {
        "google": google_result.get("result") if google_result else None,
        "perplexity": perplexity_result.get("result") if perplexity_result else None,
    }
