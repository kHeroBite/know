from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from core.database import DB세션
from api.auth import 현재사용자가져오기
from schemas.dictionary import (
    사전항목생성,
    사전항목수정,
    사전항목응답,
    유의어항목생성,
    유의어항목수정,
    유의어항목응답,
    일괄항목,
    유의어일괄항목,
)
from schemas.common import 페이지응답, 성공응답
from services.dictionary_service import (
    사전목록조회,
    사전항목추가,
    사전항목수정 as 서비스사전항목수정,
    사전항목삭제,
    일괄항목추가,
    유의어목록조회,
    유의어추가,
    유의어수정,
    유의어삭제,
    유의어일괄추가,
    사전파일건수미리보기,
    비동기파일임포트시작,
    임포트진행률조회,
)
from pydantic import BaseModel
from services.thesaurus_recommend import 유사어추천후보검색, LLM재순위

라우터 = APIRouter(prefix="/api/dictionaries", tags=["사전"])


# ─── 파일 임포트 (비동기 + 진행률) ───────────────────────────────


@라우터.get("/{domain}/file-preview")
def 파일건수미리보기(domain: str, _: dict = Depends(현재사용자가져오기)):
    """도메인 사전 파일의 예상 건수 조회."""
    return 사전파일건수미리보기(domain.upper())


@라우터.post("/{domain}/import-from-files")
def 파일사전임포트(
    domain: str,
    udic: bool = Query(True),
    cndic: bool = Query(True),
    thesaurus: bool = Query(True),
    mode: str = Query("create"),
    current: dict = Depends(현재사용자가져오기),
):
    """백그라운드에서 사전 파일 임포트 시작 (비동기). 사전별 선택 가능.
    mode: create(새로생성), overwrite(덮어쓰기), append(추가하기)."""
    if current.get("auth") not in ("W", "A"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    if mode not in ("create", "overwrite", "append"):
        raise HTTPException(status_code=400, detail="mode는 create/overwrite/append 중 하나")
    run_id = 비동기파일임포트시작(
        domain.upper(), user_id=current.get("user_id"),
        import_udic=udic, import_cndic=cndic, import_thesaurus=thesaurus,
        mode=mode,
    )
    return {"status": "started", "run_id": run_id, "message": "임포트가 시작되었습니다."}


@라우터.get("/{domain}/import-progress")
def 임포트진행률(domain: str, _: dict = Depends(현재사용자가져오기)):
    """임포트 진행률 조회."""
    return 임포트진행률조회(domain.upper())


# ─── UDIC / CNDIC ─────────────────────────────────────────────────


@라우터.get("/{domain}/{type}", response_model=페이지응답[사전항목응답])
def 사전목록(
    domain: str,
    type: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = Query(default=None),
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """사전 항목 목록 조회 (udic/cndic)."""
    결과 = 사전목록조회(db, domain, type, page=page, size=size, search=search)
    return 페이지응답[사전항목응답](
        items=[사전항목응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.post("/{domain}/{type}", response_model=사전항목응답, status_code=status.HTTP_201_CREATED)
def 사전항목등록(
    domain: str,
    type: str,
    요청: 사전항목생성,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """사전 항목 추가 (udic/cndic)."""
    결과 = 사전항목추가(db, domain, type, 요청.word, 요청.memo, user_id=current.get("user_id"))
    return 사전항목응답(**결과)


@라우터.put("/{domain}/{type}/{word}", response_model=사전항목응답)
def 사전항목변경(
    domain: str,
    type: str,
    word: str,
    요청: 사전항목수정,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """사전 항목 수정 (udic/cndic)."""
    결과 = 서비스사전항목수정(db, domain, type, word, 요청.memo)
    return 사전항목응답(**결과)


@라우터.delete("/{domain}/{type}/{word}", response_model=성공응답)
def 사전항목제거(
    domain: str,
    type: str,
    word: str,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """사전 항목 삭제 (udic/cndic)."""
    if current.get("auth") not in ("W", "A"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    사전항목삭제(db, domain, type, word)
    return 성공응답(message=f"삭제 완료: {word}")


@라우터.post("/{domain}/{type}/bulk", response_model=성공응답)
def 사전일괄등록(
    domain: str,
    type: str,
    items: List[일괄항목],
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """사전 항목 일괄 등록 (udic/cndic)."""
    결과 = 일괄항목추가(db, domain, type, [i.model_dump() for i in items], user_id=current.get("user_id"))
    return 성공응답(message=f"일괄 등록 완료: 성공 {결과['inserted']}건, 건너뜀 {결과['skipped']}건")


# ─── THESAURUS ─────────────────────────────────────────────────────


@라우터.get("/{domain}/thesaurus/list", response_model=페이지응답[유의어항목응답])
def 유의어목록(
    domain: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = None,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """유의어 목록 조회."""
    결과 = 유의어목록조회(db, domain, page=page, size=size, search=search)
    return 페이지응답[유의어항목응답](
        items=[유의어항목응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.post("/{domain}/thesaurus", response_model=유의어항목응답, status_code=status.HTTP_201_CREATED)
def 유의어등록(
    domain: str,
    요청: 유의어항목생성,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """유의어 추가."""
    결과 = 유의어추가(db, domain, 요청.head_word, 요청.tail_word, 요청.memo, user_id=current.get("user_id"))
    return 유의어항목응답(**결과)


@라우터.put("/{domain}/thesaurus/{head_word}", response_model=유의어항목응답)
def 유의어변경(
    domain: str,
    head_word: str,
    요청: 유의어항목수정,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """유의어 수정."""
    결과 = 유의어수정(db, domain, head_word, 요청.tail_word, 요청.memo)
    return 유의어항목응답(**결과)


@라우터.delete("/{domain}/thesaurus/{head_word}", response_model=성공응답)
def 유의어제거(
    domain: str,
    head_word: str,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """유의어 삭제."""
    if current.get("auth") not in ("W", "A"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    유의어삭제(db, domain, head_word)
    return 성공응답(message=f"유의어 삭제 완료: {head_word}")


@라우터.post("/{domain}/thesaurus/bulk", response_model=성공응답)
def 유의어일괄등록(
    domain: str,
    items: List[유의어일괄항목],
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """유의어 일괄 등록."""
    결과 = 유의어일괄추가(db, domain, [i.model_dump() for i in items], user_id=current.get("user_id"))
    return 성공응답(message=f"일괄 등록 완료: 성공 {결과['inserted']}건, 건너뜀 {결과['skipped']}건")


# ─── THESAURUS RECOMMEND ────────────────────────────────────────────


class LLM추천요청(BaseModel):
    keyword: str
    candidates: list
    context: str = ""
    prompt: str = ""


@라우터.get("/{domain}/thesaurus/recommend")
def 유사어추천(
    domain: str,
    keyword: str = Query(...),
    limit: int = Query(50),
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """키워드 기반 유사어 세트 추천 (텍스트 매칭 Phase 1)."""
    결과 = 유사어추천후보검색(db, domain, keyword, limit)
    return {"items": 결과, "total": len(결과), "keyword": keyword}


@라우터.post("/{domain}/thesaurus/recommend/llm")
async def 유사어LLM추천(
    domain: str,
    요청: LLM추천요청,
    _current: dict = Depends(현재사용자가져오기),
):
    """LLM 기반 의미 재순위 (Phase 2)."""
    결과 = await LLM재순위(요청.keyword, 요청.candidates, 요청.context, 요청.prompt)
    return 결과
