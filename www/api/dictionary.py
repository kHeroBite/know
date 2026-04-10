from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from schemas.dictionary import (
    사전항목생성,
    update_dict_item_service,
    사전항목응답,
    유의어항목생성,
    유의어항목수정,
    유의어항목응답,
    일괄항목,
    유의어일괄항목,
)
from schemas.common import 페이지응답, 성공응답
from services.dictionary_service import (
    get_dict_list,
    add_dict_item_service,
    update_dict_item_service as 서비스update_dict_item_service,
    delete_dict_item_service,
    bulk_add_items,
    get_synonym_list,
    add_synonym_service,
    update_synonym_service,
    delete_synonym_service,
    bulk_add_synonyms_service,
    preview_dict_file_count,
    get_dict_db_count,
    start_async_file_import,
    get_import_progress_service,
)
from pydantic import BaseModel
from services.thesaurus_recommend import search_similar_candidates, rerank_with_llm
from models.dictionary import ws_dict_site_name

라우터 = APIRouter(prefix="/api/dictionaries", tags=["사전"])


def _resolve_site(domain: str, workspace: str | None = None) -> str:
    """workspace가 있으면 WS_ 사이트명, 없으면 도메인 그대로 반환."""
    if workspace:
        return ws_dict_site_name(workspace, domain)
    return domain


# ─── 파일 임포트 (비동기 + 진행률) ───────────────────────────────


@라우터.get("/{domain}/file-preview")
def preview_file_count(domain: str, db: Session = Depends(db_session), _: dict = Depends(get_current_user)):
    """도메인 사전 파일의 예상 건수 + 현재 DB 건수 함께 조회."""
    site = domain.upper()
    파일 = preview_dict_file_count(site)
    db건수 = get_dict_db_count(db, site)
    return {
        "file": 파일,
        "db": db건수,
        # 하위 호환: 기존 파일건수 필드 유지
        "udic": 파일["udic"],
        "cndic": 파일["cndic"],
        "thesaurus": 파일["thesaurus"],
    }


@라우터.post("/{domain}/import-from-files")
def import_dict_file(
    domain: str,
    udic: bool = Query(True),
    cndic: bool = Query(True),
    thesaurus: bool = Query(True),
    mode: str = Query("create"),
    current: dict = Depends(get_current_user),
):
    """백그라운드에서 사전 파일 임포트 시작 (비동기). 사전별 선택 가능.
    mode: create(새로생성), overwrite(덮어쓰기), append(추가하기)."""
    if current.get("auth") not in ("W", "A"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    if mode not in ("create", "overwrite", "append"):
        raise HTTPException(status_code=400, detail="mode는 create/overwrite/append 중 하나")
    run_id = start_async_file_import(
        domain.upper(), user_id=current.get("user_id"),
        import_udic=udic, import_cndic=cndic, import_thesaurus=thesaurus,
        mode=mode,
    )
    return {"status": "started", "run_id": run_id, "message": "임포트가 시작되었습니다."}


@라우터.get("/{domain}/import-progress")
def get_import_progress(domain: str, _: dict = Depends(get_current_user)):
    """임포트 진행률 조회."""
    return get_import_progress_service(domain.upper())


# ─── THESAURUS (먼저 등록 — 동적 라우트보다 구체적인 경로 우선) ──────


@라우터.get("/{domain}/thesaurus/list", response_model=페이지응답[유의어항목응답])
def list_synonyms(
    domain: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = None,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """유의어 list_tasks 조회."""
    site = _resolve_site(domain, workspace)
    결과 = get_synonym_list(db, site, page=page, size=size, search=search)
    return 페이지응답[유의어항목응답](
        items=[유의어항목응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.post("/{domain}/thesaurus", response_model=유의어항목응답, status_code=status.HTTP_201_CREATED)
def add_synonym(
    domain: str,
    요청: 유의어항목생성,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """유의어 추가."""
    site = _resolve_site(domain, workspace)
    결과 = add_synonym_service(db, site, 요청.head_word, 요청.tail_word, 요청.memo, user_id=current.get("user_id"))
    return 유의어항목응답(**결과)


@라우터.put("/{domain}/thesaurus/{head_word}", response_model=유의어항목응답)
def update_synonym(
    domain: str,
    head_word: str,
    요청: 유의어항목수정,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """유의어 수정."""
    site = _resolve_site(domain, workspace)
    결과 = update_synonym_service(db, site, head_word, 요청.tail_word, 요청.memo)
    return 유의어항목응답(**결과)


@라우터.delete("/{domain}/thesaurus/{head_word}", response_model=성공응답)
def remove_synonym(
    domain: str,
    head_word: str,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """유의어 삭제."""
    if current.get("auth") not in ("W", "A"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    site = _resolve_site(domain, workspace)
    delete_synonym_service(db, site, head_word)
    return 성공응답(message=f"유의어 삭제 complete: {head_word}")


@라우터.post("/{domain}/thesaurus/bulk", response_model=성공응답)
def bulk_add_synonyms(
    domain: str,
    items: List[유의어일괄항목],
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """유의어 일괄 등록."""
    site = _resolve_site(domain, workspace)
    결과 = bulk_add_synonyms_service(db, site, [i.model_dump() for i in items], user_id=current.get("user_id"))
    return 성공응답(message=f"일괄 등록 complete: 성공 {결과['inserted']}건, 건너뜀 {결과['skipped']}건")


# ─── THESAURUS RECOMMEND ────────────────────────────────────────────


class LLM추천요청(BaseModel):
    keyword: str
    candidates: list
    context: str = ""
    prompt: str = ""


@라우터.get("/{domain}/thesaurus/recommend")
def recommend_similar(
    domain: str,
    keyword: str = Query(...),
    limit: int = Query(50),
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """키워드 기반 유사어 세트 추천 (텍스트 매칭 Phase 1)."""
    site = _resolve_site(domain, workspace)
    결과 = search_similar_candidates(db, site, keyword, limit)
    return {"items": 결과, "total": len(결과), "keyword": keyword}


@라우터.post("/{domain}/thesaurus/recommend/llm")
async def recommend_similar_llm(
    domain: str,
    요청: LLM추천요청,
    current: dict = Depends(get_current_user),
):
    """LLM 기반 의미 재순위 (Phase 2)."""
    결과 = await rerank_with_llm(요청.keyword, 요청.candidates, 요청.context, 요청.prompt, user_id=current.get('user_id', ''))
    return 결과


# ─── UDIC / CNDIC ─────────────────────────────────────────────────


@라우터.get("/{domain}/{type}", response_model=페이지응답[사전항목응답])
def list_dicts(
    domain: str,
    type: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = Query(default=None),
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """사전 항목 list_tasks 조회 (udic/cndic)."""
    site = _resolve_site(domain, workspace)
    결과 = get_dict_list(db, site, type, page=page, size=size, search=search)
    return 페이지응답[사전항목응답](
        items=[사전항목응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.post("/{domain}/{type}", response_model=사전항목응답, status_code=status.HTTP_201_CREATED)
def add_dict_item(
    domain: str,
    type: str,
    요청: 사전항목생성,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """사전 항목 추가 (udic/cndic)."""
    site = _resolve_site(domain, workspace)
    결과 = add_dict_item_service(db, site, type, 요청.word, 요청.memo, user_id=current.get("user_id"))
    return 사전항목응답(**결과)


@라우터.put("/{domain}/{type}/{word}", response_model=사전항목응답)
def update_dict_item(
    domain: str,
    type: str,
    word: str,
    요청: update_dict_item_service,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """사전 항목 수정 (udic/cndic)."""
    site = _resolve_site(domain, workspace)
    결과 = 서비스update_dict_item_service(db, site, type, word, 요청.memo)
    return 사전항목응답(**결과)


@라우터.delete("/{domain}/{type}/{word}", response_model=성공응답)
def remove_dict_item(
    domain: str,
    type: str,
    word: str,
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """사전 항목 삭제 (udic/cndic)."""
    if current.get("auth") not in ("W", "A"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    site = _resolve_site(domain, workspace)
    delete_dict_item_service(db, site, type, word)
    return 성공응답(message=f"삭제 complete: {word}")


@라우터.post("/{domain}/{type}/bulk", response_model=성공응답)
def bulk_add_dict(
    domain: str,
    type: str,
    items: List[일괄항목],
    workspace: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """사전 항목 일괄 등록 (udic/cndic)."""
    site = _resolve_site(domain, workspace)
    결과 = bulk_add_items(db, site, type, [i.model_dump() for i in items], user_id=current.get("user_id"))
    return 성공응답(message=f"일괄 등록 complete: 성공 {결과['inserted']}건, 건너뜀 {결과['skipped']}건")
