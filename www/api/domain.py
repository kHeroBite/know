from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from schemas.domain import create_domain, update_domain_service, 도메인응답
from schemas.common import 페이지응답, 성공응답
from services.domain_service import (
    get_domain_list,
    get_domain_service,
    create_domain as 서비스create_domain,
    update_domain_service as 서비스update_domain_service,
    delete_domain_ws,
)

라우터 = APIRouter(prefix="/api/domains", tags=["도메인"])


@라우터.get("", response_model=페이지응답[도메인응답])
def list_domains_service(
    page: int = 1,
    size: int = 20,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """도메인 list_tasks 조회 (페이지네이션)."""
    결과 = get_domain_list(db, page=page, size=size)
    return 페이지응답[도메인응답](
        items=[도메인응답(**item) for item in 결과["items"]],
        total=결과["total"],
        page=결과["page"],
        size=결과["size"],
    )


@라우터.get("/{site}", response_model=도메인응답)
def get_domain(
    site: str,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """도메인 단건 조회."""
    return 도메인응답(**get_domain_service(db, site))


@라우터.post("", response_model=도메인응답, status_code=status.HTTP_201_CREATED)
def add_domain_service(
    요청: create_domain,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """도메인 등록 (admin 권한 필요)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")
    결과 = 서비스create_domain(
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
def update_domain(
    site: str,
    요청: update_domain_service,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """도메인 정보 수정 (admin 권한 필요)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")
    결과 = 서비스update_domain_service(
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
def remove_domain(
    site: str,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """도메인 삭제 + 사전 테이블 DROP (admin 권한 필요)."""
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")
    delete_domain_ws(db, site)
    return 성공응답(message=f"도메인 삭제 complete: {site.upper()}")
