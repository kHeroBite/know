"""LLM 설정 서비스 — provider별 API 키/모델 관리 + 통신 테스트 + LLM 질의."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime


def _strip_think(text: str) -> str:
    """Qwen3 등 thinking 모델의 <think>...</think> 태그 제거."""
    return re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()


def _strip_markdown(text: str) -> str:
    """마크다운 헤딩(#)/볼드(**)/이탤릭(*) 제거 — AI분석 응답 후처리."""
    # 헤딩 제거: ## 제목 → 제목
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # 볼드/이탤릭 제거: **텍스트** → 텍스트
    text = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', text)
    # __텍스트__ → 텍스트
    text = re.sub(r'_{1,2}(.+?)_{1,2}', r'\1', text)
    return text.strip()

import httpx
from sqlalchemy import text

from core.database import 엔진

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0


def get_all_llm_settings() -> list[dict]:
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


def save_llm_settings(provider: str, api_key: str, base_url: str, model: str, is_active: int) -> dict:
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


def change_llm_active(provider: str) -> dict:
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


def get_synonym_prompt() -> dict:
    """활성 LLM 설정의 thesaurus_prompt 반환."""
    with 엔진.connect() as conn:
        row = conn.execute(text("SELECT thesaurus_prompt FROM llm_settings WHERE is_active=1 LIMIT 1")).fetchone()
    prompt = (row[0] if row and row[0] else "")
    return {"prompt": prompt}


def save_synonym_prompt(prompt: str) -> dict:
    """활성 LLM 설정의 thesaurus_prompt 저장."""
    with 엔진.connect() as conn:
        conn.execute(text(
            "UPDATE llm_settings SET thesaurus_prompt=:p, updated_at=:now WHERE is_active=1"
        ), {"p": prompt, "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        conn.commit()
    return {"success": True}


async def test_llm_connection(provider: str, api_key: str, base_url: str) -> dict:
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
            _save_test_result(provider, 1)
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
            _save_test_result(provider, 1)
            return {"success": True, "message": f"Claude 연결 성공: {result}"}

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            models = list(genai.list_models())
            _save_test_result(provider, 1)
            return {"success": True, "message": f"Gemini 연결 성공: {len(models)}개 모델 확인"}

        elif provider == "local":
            url = (base_url or "http://localhost:11434").rstrip("/")
            from urllib.parse import urlparse
            parsed = urlparse(url)
            server_root = f"{parsed.scheme}://{parsed.netloc}"
            # 시도 순서: 1) base_url/v1/models (직접 경로), 2) server_root/v1/models, 3) server_root/api/tags
            models_urls = [f"{url}/v1/models"]
            if "/v1/" in url:
                models_urls.insert(0, f"{url.rsplit('/v1/', 1)[0]}/v1/models")
            if f"{server_root}/v1/models" not in models_urls:
                models_urls.append(f"{server_root}/v1/models")
            models_urls.append(f"{url}/api/tags")
            if f"{server_root}/api/tags" not in models_urls:
                models_urls.append(f"{server_root}/api/tags")
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                for mu in models_urls:
                    try:
                        resp = await client.get(mu)
                        resp.raise_for_status()
                        data = resp.json()
                        if "data" in data:
                            model_count = len(data["data"])
                            _save_test_result(provider, 1)
                            return {"success": True, "message": f"OpenAI 호환 연결 성공: {model_count}개 모델 ({mu})"}
                        elif "models" in data:
                            model_count = len(data["models"])
                            _save_test_result(provider, 1)
                            return {"success": True, "message": f"Ollama 연결 성공: {model_count}개 모델"}
                    except Exception:
                        continue
            _save_test_result(provider, 0)
            return {"success": False, "message": f"연결 실패: 시도한 URL — {', '.join(models_urls)}"}

        else:
            return {"success": False, "message": f"알 수 없는 provider: {provider}"}

    except Exception as e:
        logger.error("[LLM설정] test_llm_connection 실패 (%s): %s", provider, e)
        _save_test_result(provider, 0)
        return {"success": False, "message": str(e)}


def _record_usage_log(user_id: str, usage_type: str, model: str, prompt_tokens: int = 0, completion_tokens: int = 0):
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


def _save_test_result(provider: str, passed: int):
    """test_passed 플래그 업데이트."""
    with 엔진.connect() as conn:
        conn.execute(text(
            "UPDATE llm_settings SET test_passed=:p, updated_at=:now WHERE provider=:prov"
        ), {"p": passed, "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "prov": provider})
        conn.commit()


async def get_llm_model_list(provider: str, api_key: str, base_url: str) -> list[str]:
    """provider별 사용 가능 모델 list_tasks."""
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
            models_urls = [f"{url}/v1/models"]
            if "/v1/" in url:
                models_urls.insert(0, f"{url.rsplit('/v1/', 1)[0]}/v1/models")
            if f"{server_root}/v1/models" not in models_urls:
                models_urls.append(f"{server_root}/v1/models")
            models_urls.append(f"{url}/api/tags")
            if f"{server_root}/api/tags" not in models_urls:
                models_urls.append(f"{server_root}/api/tags")
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
        logger.error("[LLM설정] 모델list_tasks 조회 실패 (%s): %s", provider, e)
        return []


def _get_active_settings() -> dict | None:
    """활성 provider 설정 1건 조회 (하위 호환)."""
    with 엔진.connect() as conn:
        row = conn.execute(text(
            "SELECT provider, api_key, base_url, model FROM llm_settings WHERE is_active=1 LIMIT 1"
        )).first()
    if not row:
        return None
    return dict(row._mapping)


def _get_active_settings_list() -> list[dict]:
    """활성 provider 설정 전체 조회."""
    with 엔진.connect() as conn:
        rows = conn.execute(text(
            "SELECT provider, api_key, base_url, model FROM llm_settings WHERE is_active=1"
        )).fetchall()
    return [dict(r._mapping) for r in rows]


async def _single_llm_query(설정: dict, keyword: str, prompt: str, user_id: str, usage_type: str) -> dict:
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
            result = _strip_markdown(resp.choices[0].message.content)
            used_model = model or "gpt-4o-mini"
            pt = getattr(getattr(resp, 'usage', None), 'prompt_tokens', 0) or 0
            ct = getattr(getattr(resp, 'usage', None), 'completion_tokens', 0) or 0
            _record_usage_log(user_id, usage_type, used_model, pt, ct)
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        elif provider == "claude":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)
            resp = await client.messages.create(
                model=model or "claude-haiku-4-5-20251001",
                system="마크다운 형식(#, ##, **, __, *, - 목록 등)을 절대 사용하지 마세요. 자연스러운 문장으로만 답변하세요.",
                messages=[{"role": "user", "content": query}],
                max_tokens=500,
            )
            result = _strip_markdown(resp.content[0].text)
            used_model = model or "claude-haiku-4-5-20251001"
            pt = getattr(getattr(resp, 'usage', None), 'input_tokens', 0) or 0
            ct = getattr(getattr(resp, 'usage', None), 'output_tokens', 0) or 0
            _record_usage_log(user_id, usage_type, used_model, pt, ct)
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            gmodel = genai.GenerativeModel(model or "gemini-2.0-flash")
            resp = await gmodel.generate_content_async(query)
            result = _strip_markdown(resp.text)
            used_model = model or "gemini-2.0-flash"
            _record_usage_log(user_id, usage_type, used_model, 0, 0)
            return {"result": result, "provider": provider, "model": used_model, "error": None}

        elif provider == "local":
            url = (base_url or "http://localhost:11434").rstrip("/")
            used_model = model or ""
            # model이 비어 있으면 /v1/models에서 첫 번째 모델 자동 감지
            if not used_model:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as probe:
                        mresp = await probe.get(f"{url}/v1/models")
                        mresp.raise_for_status()
                        mdata = mresp.json()
                        models_list = mdata.get("data", [])
                        if models_list:
                            used_model = models_list[0]["id"]
                            logger.info("[llm_query][local] model 자동 감지: %s", used_model)
                except Exception as me:
                    logger.warning("[llm_query][local] model 자동 감지 실패: %s", me)
                    used_model = "llama3"
            async with httpx.AsyncClient(timeout=60.0) as client:
                chat_url = url if "/v1/chat/completions" in url else f"{url}/v1/chat/completions"
                req_body = {
                    "model": used_model,
                    "messages": [{"role": "user", "content": query}],
                    "max_tokens": 800,
                }
                logger.info("[llm_query][local] POST %s body=%s", chat_url, req_body)
                resp = await client.post(chat_url, json=req_body)
                if not resp.is_success:
                    logger.error("[llm_query][local] 응답 %d: %s", resp.status_code, resp.text[:500])
                resp.raise_for_status()
                data = resp.json()
                result = _strip_markdown(_strip_think(data["choices"][0]["message"]["content"]))
                _record_usage_log(user_id, usage_type, used_model, 0, 0)
                return {"result": result, "provider": provider, "model": used_model, "error": None}

        else:
            return {"result": None, "provider": provider, "model": model, "error": f"알 수 없는 provider: {provider}"}

    except Exception as e:
        logger.error("[llm_query] 실패 (%s/%s): %s", provider, model, e)
        return {"result": None, "provider": provider, "model": model, "error": str(e)}


async def llm_query(keyword: str, prompt: str, user_id: str = '', usage_type: str = '') -> dict:
    """활성 provider들로 LLM 질의 (병렬). 반환: {result, provider, model, error, results}."""
    설정list_tasks = _get_active_settings_list()
    if not 설정list_tasks:
        return {"result": None, "provider": None, "model": None, "error": "활성화된 LLM provider가 없습니다", "results": []}

    tasks = [_single_llm_query(s, keyword, prompt, user_id, usage_type) for s in 설정list_tasks]
    결과list_tasks = list(await asyncio.gather(*tasks))

    성공결과 = [r for r in 결과list_tasks if r.get("error") is None]
    첫번째 = 성공결과[0] if 성공결과 else 결과list_tasks[0]

    return {
        "result": 첫번째.get("result"),
        "provider": 첫번째.get("provider"),
        "model": 첫번째.get("model"),
        "error": 첫번째.get("error"),
        "results": 결과list_tasks,
    }
