from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import DB세션
from api.auth import 현재사용자가져오기
from schemas.domain import 도메인생성, 도메인수정, 도메인응답
from schemas.common import 페이지응답, 성공응답
from services.domain_service import (
    도메인목록조회,
    도메인조회,
    도메인생성 as 서비스도메인생성,
    도메인수정 as 서비스도메인수정,
    도메인삭제,
)

라우터 = APIRouter(prefix="/api/domains", tags=["도메인"])


@라우터.get("", response_model=페이지응답[도메인응답])
def 도메인목록(
    page: int = 1,
    size: int = 20,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """도메인 목록 조회 (페이지네이션)."""
    결과 = 도메인목록조회(db, page=page, size=size)
    return 페이지응답[도메인응답](
        items=[도메인응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.get("/{site}", response_model=도메인응답)
def 도메인상세(
    site: str,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """도메인 단건 조회."""
    return 도메인응답(**도메인조회(db, site))


@라우터.post("", response_model=도메인응답, status_code=status.HTTP_201_CREATED)
def 도메인추가(
    요청: 도메인생성,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """도메인 등록 (admin 권한 필요)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")
    결과 = 서비스도메인생성(
        db,
        site=요청.site,
        memo=요청.memo,
        ip=요청.ip,
        port=요청.port,
        url=요청.url,
        param=요청.param,
        user_id=current.get("user_id"),
    )
    return 도메인응답(**결과)


@라우터.put("/{site}", response_model=도메인응답)
def 도메인변경(
    site: str,
    요청: 도메인수정,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """도메인 정보 수정 (admin 권한 필요)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")
    결과 = 서비스도메인수정(
        db,
        site=site,
        memo=요청.memo,
        ip=요청.ip,
        port=요청.port,
        url=요청.url,
        param=요청.param,
    )
    return 도메인응답(**결과)


@라우터.delete("/{site}", response_model=성공응답)
def 도메인제거(
    site: str,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """도메인 삭제 + 사전 테이블 DROP (admin 권한 필요)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")
    도메인삭제(db, site)
    return 성공응답(message=f"도메인 삭제 완료: {site.upper()}")
