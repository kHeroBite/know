from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from core.database import DB세션
from api.auth import 현재사용자가져오기
from schemas.category import 카테고리항목생성, 카테고리항목수정, 카테고리항목응답
from schemas.common import 페이지응답, 성공응답
from services.category_service import (
    카테고리목록조회,
    카테고리추가,
    카테고리수정,
    카테고리삭제,
    카테고리일괄추가,
)

라우터 = APIRouter(prefix="/api/categories", tags=["카테고리"])


@라우터.get("/{domain}", response_model=페이지응답[카테고리항목응답])
def 카테고리목록(
    domain: str,
    page: int = 1,
    size: int = 100,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """카테고리 목록 조회."""
    결과 = 카테고리목록조회(db, domain, page=page, size=size)
    return 페이지응답[카테고리항목응답](
        items=[카테고리항목응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.post("/{domain}", response_model=카테고리항목응답, status_code=status.HTTP_201_CREATED)
def 카테고리항목등록(
    domain: str,
    요청: 카테고리항목생성,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """카테고리 항목 추가."""
    결과 = 카테고리추가(db, domain, 요청.word, 요청.display_category, user_id=current.get("user_id"))
    return 카테고리항목응답(**결과)


@라우터.put("/{domain}/{word}", response_model=카테고리항목응답)
def 카테고리항목변경(
    domain: str,
    word: str,
    요청: 카테고리항목수정,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """카테고리 항목 수정 (display_category 변경)."""
    결과 = 카테고리수정(db, domain, word, 요청.new_display_category)
    return 카테고리항목응답(**결과)


@라우터.delete("/{domain}/{word}", response_model=성공응답)
def 카테고리항목제거(
    domain: str,
    word: str,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """카테고리 항목 삭제."""
    카테고리삭제(db, domain, word)
    return 성공응답(message=f"카테고리 삭제 완료: {word}")


@라우터.post("/{domain}/bulk", response_model=성공응답)
def 카테고리일괄등록(
    domain: str,
    items: List[카테고리항목생성],
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """카테고리 항목 일괄 등록."""
    결과 = 카테고리일괄추가(db, domain, [i.dict() for i in items], user_id=current.get("user_id"))
    return 성공응답(message=f"일괄 등록 완료: 성공 {결과['inserted']}건, 건너뜀 {결과['skipped']}건")
