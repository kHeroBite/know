"""analyze_morpheme API 엔드포인트"""
from typing import Optional
import asyncio
import json
import os
import shutil
from functools import partial

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.auth import get_current_user
from services.morpheme_service import analyze_morpheme, analyze_morpheme_full, analyze_realtime, analyze_realtime_full

from core.constants import DOMAIN_DIR, STATE_FILE, WORKSPACE_DIR
from services.workspace_service import get_jiana_home_path

라우터 = APIRouter(prefix="/morpheme", tags=["morpheme"])


BACKUP_DIR_PATH = "/home/know/apps/know-ops/backup"


class AnalyzeRequest(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None
    skip_workspace: bool = False   # DomainManage: True
    backup_name: Optional[str] = None  # 백업 형태소분析 시 지정


def _find_workspace_jiana_for_domain(domain: str) -> Optional[str]:
    """도메인에 연결된 USED 워크스페이스의 jiana 경로 반환.

    workspace/.state.json에서 domain이 일치하고 status=USED인 워크스페이스를 찾아
    해당 workspace/jiana 경로를 반환한다.
    사용자사전(udic_1.5.dcd)은 워크스페이스 jiana에 빌드되므로 이쪽을 우선 사용해야 함.
    """
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
        for ws_name, ws_state in state.items():
            if ws_state.get("domain") == domain and ws_state.get("status") in ("USED", "CONNECTING"):
                jiana_path = os.path.join(WORKSPACE_DIR, ws_name, "jiana")
                if os.path.isdir(jiana_path):
                    return jiana_path
    except Exception:
        pass
    return None



def _prepare_backup_jiana(backup_name: str, domain: str):
    """백업 data/를 임시 jiana에 복사 후 (jiana_home, tmp_root) 반환.

    domain/{code}/ 구조(lib/jiana1.5.jar + data/)를 기준으로 tmp_root 구성.
    jiana/베이스/ 는 resources/korean/data/ 구조라 data/ 직접 접근 불가.
    """
    backup_path = os.path.join(BACKUP_DIR_PATH, backup_name)

    # domain/{code}/ 에서 lib/ 경로 탐색 — JAR 소스로 사용
    domain_path = os.path.join(DOMAIN_DIR, domain)
    domain_lib = os.path.join(domain_path, "lib")
    if not os.path.isfile(os.path.join(domain_lib, "jiana1.5.jar")):
        raise ValueError(f"domain lib에 jiana1.5.jar 없음: {domain_lib}")

    tmp_root = f"/tmp/know-morpheme-{backup_name}"
    tmp_jiana = tmp_root  # tmp_root 자체가 jiana_home

    # 기존 임시 디렉토리 정리
    if os.path.exists(tmp_root):
        shutil.rmtree(tmp_root, ignore_errors=True)

    os.makedirs(tmp_root)

    # domain/lib/ → tmp/lib/ 복사 (JAR + 클래스파일 포함)
    shutil.copytree(domain_lib, os.path.join(tmp_jiana, "lib"))

    # 백업 data/를 tmp/data/로 복사 (LiteTest가 {jh}/data/ 직접 읽음)
    shutil.copytree(
        os.path.join(backup_path, "data"),
        os.path.join(tmp_jiana, "data")
    )

    return tmp_jiana, tmp_root


def _resolve_jiana_home(workspace: Optional[str], domain: Optional[str], skip_workspace: bool = False) -> Optional[str]:
    """workspace 우선, 없으면 domain에 연결된 USED 워크스페이스 jiana, 마지막으로 domain 엔진 경로.

    우선순위:
    1. workspace 명시: workspace/jiana/ 직접 사용 (사용자사전 포함)
    2. domain 명시 + skip_workspace=False: .state.json에서 USED 워크스페이스 찾아 그 jiana 사용 (사용자사전 포함)
    3. fallback: domain/ 직접 사용 (domain/lib/jiana1.5.jar + domain/data/ 사용자사전 포함)
       — 이전에 domain/lib/jiana-dist-*/ 를 반환했으나 그 경로엔 data/가 없어 사용자사전 미적용됨
    """
    if workspace:
        return get_jiana_home_path(workspace)
    if domain:
        if not skip_workspace:
            # 해당 도메인에 연결된 워크스페이스 jiana 우선 사용 (사용자사전 빌드됨)
            ws_jiana = _find_workspace_jiana_for_domain(domain)
            if ws_jiana:
                return ws_jiana
        # fallback: domain/ 직접 사용 — domain/lib/jiana1.5.jar + domain/data/ 구조
        # (domain/lib/jiana-dist-*/ 하위엔 data/가 없어 사용자사전이 적용되지 않음)
        domain_path = os.path.join(DOMAIN_DIR, domain)
        if os.path.isfile(os.path.join(domain_path, "lib", "jiana1.5.jar")):
            return domain_path
        return domain_path  # 최후 fallback
    return None


@라우터.post("/analyze")
async def keyword_analyze(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 analyze_morpheme (심플 — LiteTest)."""
    tmp_root = None
    try:
        if req.backup_name:
            jiana_home, tmp_root = _prepare_backup_jiana(req.backup_name, req.domain)
        else:
            jiana_home = _resolve_jiana_home(req.workspace, req.domain, req.skip_workspace)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(analyze_morpheme, req.keyword, req.domain, jiana_home=jiana_home))
    finally:
        if tmp_root:
            shutil.rmtree(tmp_root, ignore_errors=True)


@라우터.post("/analyze-full")
async def keyword_analyze_full(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 형태소分析 (풀 — FullTest, 품사태그 포함)."""
    tmp_root = None
    try:
        if req.backup_name:
            jiana_home, tmp_root = _prepare_backup_jiana(req.backup_name, req.domain)
        else:
            jiana_home = _resolve_jiana_home(req.workspace, req.domain, req.skip_workspace)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(analyze_morpheme_full, req.keyword, req.domain, jiana_home=jiana_home))
    finally:
        if tmp_root:
            shutil.rmtree(tmp_root, ignore_errors=True)


@라우터.post("/analyze-realtime")
async def realtime_analyze(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 실시간 LITE 分析. JVM subprocess를 executor에서 실행해 이벤트루프 블로킹 방지."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_realtime, req.keyword, req.domain or "", req.workspace or ""))


@라우터.post("/analyze-full-realtime")
async def realtime_analyze_full(req: AnalyzeRequest, _current: dict = Depends(get_current_user)):
    """단일 키워드 실시간 FULL 分析. JVM subprocess를 executor에서 실행해 이벤트루프 블로킹 방지."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(analyze_realtime_full, req.keyword, req.domain or "", req.workspace or ""))
