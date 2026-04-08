from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from schemas.category import 카테고리항목생성, 카테고리항목수정, 카테고리항목응답
from schemas.common import 페이지응답, 성공응답
from services.category_service import (
    get_category_list,
    add_category,
    update_category,
    delete_category,
    bulk_add_category,
)

라우터 = APIRouter(prefix="/api/categories", tags=["카테고리"])


@라우터.get("/{domain}", response_model=페이지응답[카테고리항목응답])
def list_categories(
    domain: str,
    page: int = 1,
    size: int = 100,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """카테고리 list_tasks 조회."""
    결과 = get_category_list(db, domain, page=page, size=size)
    return 페이지응답[카테고리항목응답](
        items=[카테고리항목응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.post("/{domain}", response_model=카테고리항목응답, status_code=status.HTTP_201_CREATED)
def add_category_item(
    domain: str,
    요청: 카테고리항목생성,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """카테고리 항목 추가."""
    결과 = add_category(db, domain, 요청.word, 요청.display_category, user_id=current.get("user_id"))
    return 카테고리항목응답(**결과)


@라우터.put("/{domain}/{word}", response_model=카테고리항목응답)
def update_category_item(
    domain: str,
    word: str,
    요청: 카테고리항목수정,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """카테고리 항목 수정 (display_category 변경)."""
    결과 = update_category(db, domain, word, 요청.new_display_category)
    return 카테고리항목응답(**결과)


@라우터.delete("/{domain}/{word}", response_model=성공응답)
def remove_category_item(
    domain: str,
    word: str,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """카테고리 항목 삭제."""
    if current.get("auth") not in ("A", "W"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="쓰기 권한 필요")
    delete_category(db, domain, word)
    return 성공응답(message=f"카테고리 삭제 complete: {word}")


@라우터.post("/{domain}/bulk", response_model=성공응답)
def bulk_add_categories(
    domain: str,
    items: List[카테고리항목생성],
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """카테고리 항목 일괄 등록."""
    결과 = bulk_add_category(db, domain, [i.model_dump() for i in items], user_id=current.get("user_id"))
    return 성공응답(message=f"일괄 등록 complete: 성공 {결과['inserted']}건, 건너뜀 {결과['skipped']}건")
