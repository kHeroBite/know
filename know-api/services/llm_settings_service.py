"""LLM 설정 서비스 — provider별 API 키/모델 관리 + 통신 테스트 + LLM 질의."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime


def _strip_think(text: str) -> str:
    """Qwen3 등 thinking 모델의 <think>...</think> 태그 제거."""
    return re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()

import httpx
from sqlalchemy import text

from core.database import 엔진

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0


def 설정전체조회() -> list[dict]:
    """4개 provider 설정 반환 (category 포함)."""
    with 엔진.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, provider, api_key, base_url, model, is_active, test_passed, "
            "created_at, updated_at FROM llm_settings ORDER BY id"
        )).fetchall()
    결과 = []
    for r in rows:
        d = dict(r._mapping)
        d["category"] = "로컬LLM" if d["provider"] == "local" else "범용LLM"
        결과.append(d)
    return 결과


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
    """해당 provider is_active 토글 (나머지 유지)."""
    with 엔진.connect() as conn:
        row = conn.execute(text(
            "SELECT is_active FROM llm_settings WHERE provider=:p"
        ), {"p": provider}).first()
        현재 = row[0] if row else 0
        새값 = 0 if 현재 == 1 else 1
        conn.execute(text(
            "UPDATE llm_settings SET is_active=:v, updated_at=:now WHERE provider=:p"
        ), {"v": 새값, "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "p": provider})
        conn.commit()
    return {"provider": provider, "is_active": 새값 == 1}


def 유사어프롬프트조회() -> dict:
    """활성 LLM 설정의 thesaurus_prompt 반환."""
    with 엔진.connect() as conn:
        row = conn.execute(text("SELECT thesaurus_prompt FROM llm_settings WHERE is_active=1 LIMIT 1")).fetchone()
    prompt = (row[0] if row and row[0] else "")
    return {"prompt": prompt}


def 유사어프롬프트저장(prompt: str) -> dict:
    """활성 LLM 설정의 thesaurus_prompt 저장."""
    with 엔진.connect() as conn:
        conn.execute(text(
            "UPDATE llm_settings SET thesaurus_prompt=:p, updated_at=:now WHERE is_active=1"
        ), {"p": prompt, "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        conn.commit()
    return {"success": True}


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
            from urllib.parse import urlparse
            parsed = urlparse(url)
            server_root = f"{parsed.scheme}://{parsed.netloc}"
            models_urls = [f"{url.rsplit('/v1/', 1)[0]}/v1/models"] if "/v1/" in url else []
            models_urls += [f"{server_root}/v1/models", f"{server_root}/api/tags"]
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                for mu in models_urls:
                    try:
                        resp = await client.get(mu)
                        resp.raise_for_status()
                        data = resp.json()
                        if "data" in data:
                            model_count = len(data["data"])
                            _테스트결과저장(provider, 1)
                            return {"success": True, "message": f"OpenAI 호환 연결 성공: {model_count}개 모델 ({mu})"}
                        elif "models" in data:
                            model_count = len(data["models"])
                            _테스트결과저장(provider, 1)
                            return {"success": True, "message": f"Ollama 연결 성공: {model_count}개 모델"}
                    except Exception:
                        continue
            _테스트결과저장(provider, 0)
            return {"success": False, "message": f"연결 실패: 시도한 URL — {', '.join(models_urls)}"}

        else:
            return {"success": False, "message": f"알 수 없는 provider: {provider}"}

    except Exception as e:
        logger.error("[LLM설정] 통신테스트 실패 (%s): %s", provider, e)
        _테스트결과저장(provider, 0)
        return {"success": False, "message": str(e)}


def _사용로그기록(user_id: str, usage_type: str, model: str, prompt_tokens: int = 0, completion_tokens: int = 0):
    """LLM 사용 로그 INSERT."""
    try:
        with 엔진.connect() as conn:
            conn.execute(text(
                "INSERT INTO llm_usage_log (user_id, usage_type, model, prompt_tokens, completion_tokens) "
                "VALUES (:uid, :utype, :model, :pt, :ct)"
            ), {
                "uid": user_id or '',
                "utype": usage_type or '',
                "model": model or '',
                "pt": prompt_tokens,
                "ct": completion_tokens,
            })
            conn.commit()
    except Exception as e:
        logger.warning("[LLM사용로그] 기록 실패: %s", e)


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
            from urllib.parse import urlparse
            parsed = urlparse(url)
            server_root = f"{parsed.scheme}://{parsed.netloc}"
            models_urls = [f"{url.rsplit('/v1/', 1)[0]}/v1/models"] if "/v1/" in url else []
            models_urls += [f"{server_root}/v1/models", f"{server_root}/api/tags"]
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                for mu in models_urls:
                    try:
                        resp = await client.get(mu)
                        resp.raise_for_status()
                        data = resp.json()
                        if "data" in data:
                            return sorted([m["id"] for m in data["data"]])
                        elif "models" in data:
                            return [m["name"] for m in data["models"]]
                    except Exception:
                        continue
            return []

        else:
            return []

    except Exception as e:
        logger.error("[LLM설정] 모델목록 조회 실패 (%s): %s", provider, e)
        return []


def _활성설정조회() -> dict | None:
    """활성 provider 설정 1건 조회 (하위 호환)."""
    with 엔진.connect() as conn:
        row = conn.execute(text(
            "SELECT provider, api_key, base_url, model FROM llm_settings WHERE is_active=1 LIMIT 1"
        )).first()
    if not row:
        return None
    return dict(row._mapping)


def _활성설정목록조회() -> list[dict]:
    """활성 provider 설정 전체 조회."""
    with 엔진.connect() as conn:
        rows = conn.execute(text(
            "SELECT provider, api_key, base_url, model FROM llm_settings WHERE is_active=1"
        )).fetchall()
    return [dict(r._mapping) for r in rows]


async def _단일LLM질의(설정: dict, keyword: str, prompt: str, user_id: str, usage_type: str) -> dict:
    """단일 provider LLM 질의 (내부 헬퍼)."""
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
            used_model = model or "gpt-4o-mini"
            pt = getattr(getattr(resp, 'usage', None), 'prompt_tokens', 0) or 0
            ct = getattr(getattr(resp, 'usage', None), 'completion_tokens', 0) or 0
            _사용로그기록(user_id, usage_type, used_model, pt, ct)
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        elif provider == "claude":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)
            resp = await client.messages.create(
                model=model or "claude-haiku-4-5-20251001",
                messages=[{"role": "user", "content": query}],
                max_tokens=500,
            )
            result = resp.content[0].text
            used_model = model or "claude-haiku-4-5-20251001"
            pt = getattr(getattr(resp, 'usage', None), 'input_tokens', 0) or 0
            ct = getattr(getattr(resp, 'usage', None), 'output_tokens', 0) or 0
            _사용로그기록(user_id, usage_type, used_model, pt, ct)
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            gmodel = genai.GenerativeModel(model or "gemini-2.0-flash")
            resp = await gmodel.generate_content_async(query)
            result = resp.text
            used_model = model or "gemini-2.0-flash"
            _사용로그기록(user_id, usage_type, used_model, 0, 0)
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        elif provider == "local":
            url = (base_url or "http://localhost:11434").rstrip("/")
            used_model = model or "llama3"
            async with httpx.AsyncClient(timeout=60.0) as client:
                if "/v1/chat/completions" in url:
                    resp = await client.post(url, json={
                        "model": used_model,
                        "messages": [{"role": "user", "content": query}],
                        "max_completion_tokens": 2000,
                    })
                    resp.raise_for_status()
                    data = resp.json()
                    result = _strip_think(data["choices"][0]["message"]["content"])
                    _사용로그기록(user_id, usage_type, used_model, 0, 0)
                    return {"result": result, "provider": provider, "model": used_model, "error": None}
                else:
                    try:
                        resp = await client.post(f"{url}/v1/chat/completions", json={
                            "model": used_model,
                            "messages": [{"role": "user", "content": query}],
                            "max_completion_tokens": 2000,
                        })
                        resp.raise_for_status()
                        data = resp.json()
                        result = _strip_think(data["choices"][0]["message"]["content"])
                        _사용로그기록(user_id, usage_type, used_model, 0, 0)
                        return {"result": result, "provider": provider, "model": used_model, "error": None}
                    except Exception:
                        pass
                    resp = await client.post(f"{url}/api/generate", json={
                        "model": used_model,
                        "prompt": query,
                        "stream": False,
                    })
                    resp.raise_for_status()
                    data = resp.json()
                    result = data.get("response", "")
                    _사용로그기록(user_id, usage_type, used_model, 0, 0)
                    return {"result": result, "provider": provider, "model": used_model, "error": None}

        else:
            return {"result": None, "provider": provider, "model": model, "error": f"알 수 없는 provider: {provider}"}

    except Exception as e:
        logger.error("[LLM질의] 실패 (%s/%s): %s", provider, model, e)
        return {"result": None, "provider": provider, "model": model, "error": str(e)}


async def LLM질의(keyword: str, prompt: str, user_id: str = '', usage_type: str = '') -> dict:
    """활성 provider들로 LLM 질의 (병렬). 반환: {result, provider, model, error, results}."""
    설정목록 = _활성설정목록조회()
    if not 설정목록:
        return {"result": None, "provider": None, "model": None, "error": "활성화된 LLM provider가 없습니다", "results": []}

    tasks = [_단일LLM질의(s, keyword, prompt, user_id, usage_type) for s in 설정목록]
    결과목록 = list(await asyncio.gather(*tasks))

    성공결과 = [r for r in 결과목록 if r.get("error") is None]
    첫번째 = 성공결과[0] if 성공결과 else 결과목록[0]

    return {
        "result": 첫번째.get("result"),
        "provider": 첫번째.get("provider"),
        "model": 첫번째.get("model"),
        "error": 첫번째.get("error"),
        "results": 결과목록,
    }
