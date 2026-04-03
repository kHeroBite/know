"""LLM 설정 서비스 — provider별 API 키/모델 관리 + 통신 테스트 + LLM 질의."""
from __future__ import annotations

import logging
from datetime import datetime

import httpx
from sqlalchemy import text

from core.database import 엔진

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0


def 설정전체조회() -> list[dict]:
    """4개 provider 설정 반환."""
    with 엔진.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, provider, api_key, base_url, model, is_active, test_passed, "
            "created_at, updated_at FROM llm_settings ORDER BY id"
        )).fetchall()
    return [dict(r._mapping) for r in rows]


def 설정저장(provider: str, api_key: str, base_url: str, model: str, is_active: int) -> dict:
    """provider 설정 UPDATE."""
    with 엔진.connect() as conn:
        conn.execute(text(
            "UPDATE llm_settings SET api_key=:key, base_url=:url, model=:model, "
            "is_active=:active, updated_at=:now WHERE provider=:p"
        ), {
            "key": api_key, "url": base_url, "model": model,
            "active": is_active, "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "p": provider,
        })
        conn.commit()
    return {"provider": provider, "saved": True}


def 활성변경(provider: str) -> dict:
    """해당 provider만 is_active=1, 나머지 0."""
    with 엔진.connect() as conn:
        conn.execute(text("UPDATE llm_settings SET is_active=0"))
        conn.execute(text(
            "UPDATE llm_settings SET is_active=1, updated_at=:now WHERE provider=:p"
        ), {"now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "p": provider})
        conn.commit()
    return {"provider": provider, "is_active": True}


async def 통신테스트(provider: str, api_key: str, base_url: str) -> dict:
    """provider별 API 통신 테스트."""
    try:
        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "test"}],
                max_completion_tokens=5,
            )
            result = resp.choices[0].message.content
            # 테스트 성공 시 test_passed 업데이트
            _테스트결과저장(provider, 1)
            return {"success": True, "message": f"OpenAI 연결 성공: {result}"}

        elif provider == "claude":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                messages=[{"role": "user", "content": "test"}],
                max_tokens=5,
            )
            result = resp.content[0].text
            _테스트결과저장(provider, 1)
            return {"success": True, "message": f"Claude 연결 성공: {result}"}

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            models = list(genai.list_models())
            _테스트결과저장(provider, 1)
            return {"success": True, "message": f"Gemini 연결 성공: {len(models)}개 모델 확인"}

        elif provider == "local":
            url = (base_url or "http://localhost:11434").rstrip("/")
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                # OpenAI 호환 (vLLM 등) 먼저 시도
                try:
                    resp = await client.get(f"{url}/v1/models")
                    resp.raise_for_status()
                    data = resp.json()
                    model_count = len(data.get("data", []))
                    _테스트결과저장(provider, 1)
                    return {"success": True, "message": f"OpenAI 호환 연결 성공 (vLLM 등): {model_count}개 모델"}
                except Exception:
                    pass
                # Ollama fallback
                resp = await client.get(f"{url}/api/tags")
                resp.raise_for_status()
            data = resp.json()
            model_count = len(data.get("models", []))
            _테스트결과저장(provider, 1)
            return {"success": True, "message": f"Ollama 연결 성공: {model_count}개 모델"}

        else:
            return {"success": False, "message": f"알 수 없는 provider: {provider}"}

    except Exception as e:
        logger.error("[LLM설정] 통신테스트 실패 (%s): %s", provider, e)
        _테스트결과저장(provider, 0)
        return {"success": False, "message": str(e)}


def _테스트결과저장(provider: str, passed: int):
    """test_passed 플래그 업데이트."""
    with 엔진.connect() as conn:
        conn.execute(text(
            "UPDATE llm_settings SET test_passed=:p, updated_at=:now WHERE provider=:prov"
        ), {"p": passed, "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "prov": provider})
        conn.commit()


async def 모델목록조회(provider: str, api_key: str, base_url: str) -> list[str]:
    """provider별 사용 가능 모델 목록."""
    try:
        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
            models = await client.models.list()
            return sorted([
                m.id for m in models.data
                if any(k in m.id for k in ("gpt", "o1", "o3"))
            ])

        elif provider == "claude":
            return [
                "claude-opus-4-6",
                "claude-sonnet-4-6",
                "claude-haiku-4-5-20251001",
            ]

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            models = list(genai.list_models())
            return sorted([
                m.name.replace("models/", "")
                for m in models
                if "gemini" in m.name.lower()
            ])

        elif provider == "local":
            url = (base_url or "http://localhost:11434").rstrip("/")
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                # OpenAI 호환 (vLLM 등) 먼저 시도
                try:
                    resp = await client.get(f"{url}/v1/models")
                    resp.raise_for_status()
                    data = resp.json()
                    return sorted([m["id"] for m in data.get("data", [])])
                except Exception:
                    pass
                # Ollama fallback
                resp = await client.get(f"{url}/api/tags")
                resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]

        else:
            return []

    except Exception as e:
        logger.error("[LLM설정] 모델목록 조회 실패 (%s): %s", provider, e)
        return []


def _활성설정조회() -> dict | None:
    """활성 provider 설정 1건 조회."""
    with 엔진.connect() as conn:
        row = conn.execute(text(
            "SELECT provider, api_key, base_url, model FROM llm_settings WHERE is_active=1 LIMIT 1"
        )).first()
    if not row:
        return None
    return dict(row._mapping)


async def LLM질의(keyword: str, prompt: str) -> dict:
    """활성 provider로 LLM 질의. 반환: {result, provider, model, error}."""
    설정 = _활성설정조회()
    if not 설정:
        return {"result": None, "provider": None, "model": None, "error": "활성화된 LLM provider가 없습니다"}

    provider = 설정["provider"]
    api_key = 설정["api_key"]
    base_url = 설정["base_url"]
    model = 설정["model"]
    query = prompt.format(keyword=keyword)

    try:
        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
            resp = await client.chat.completions.create(
                model=model or "gpt-4o-mini",
                messages=[{"role": "user", "content": query}],
                max_completion_tokens=500,
            )
            result = resp.choices[0].message.content
            return {"result": result, "provider": provider, "model": model or "gpt-4o-mini", "error": None}

        elif provider == "claude":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)
            resp = await client.messages.create(
                model=model or "claude-haiku-4-5-20251001",
                messages=[{"role": "user", "content": query}],
                max_tokens=500,
            )
            result = resp.content[0].text
            return {"result": result, "provider": provider, "model": model or "claude-haiku-4-5-20251001", "error": None}

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            gmodel = genai.GenerativeModel(model or "gemini-2.0-flash")
            resp = await gmodel.generate_content_async(query)
            result = resp.text
            return {"result": result, "provider": provider, "model": model or "gemini-2.0-flash", "error": None}

        elif provider == "local":
            url = (base_url or "http://localhost:11434").rstrip("/")
            used_model = model or "llama3"
            async with httpx.AsyncClient(timeout=30.0) as client:
                # OpenAI 호환 (vLLM 등) 먼저 시도
                try:
                    resp = await client.post(f"{url}/v1/chat/completions", json={
                        "model": used_model,
                        "messages": [{"role": "user", "content": query}],
                        "max_tokens": 500,
                    })
                    resp.raise_for_status()
                    data = resp.json()
                    result = data["choices"][0]["message"]["content"]
                    return {"result": result, "provider": provider, "model": used_model, "error": None}
                except Exception:
                    pass
                # Ollama fallback
                resp = await client.post(f"{url}/api/generate", json={
                    "model": used_model,
                    "prompt": query,
                    "stream": False,
                })
                resp.raise_for_status()
            data = resp.json()
            result = data.get("response", "")
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        else:
            return {"result": None, "provider": provider, "model": model, "error": f"알 수 없는 provider: {provider}"}

    except Exception as e:
        logger.error("[LLM질의] 실패 (%s/%s): %s", provider, model, e)
        return {"result": None, "provider": provider, "model": model, "error": str(e)}
