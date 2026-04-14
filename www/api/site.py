from __future__ import annotations
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from services.site_service import (
    list_sites as svc_list_sites,
    get_site as svc_get_site,
    create_site as svc_create_site,
    update_site as svc_update_site,
    delete_site as svc_delete_site,
)

라우터 = APIRouter(prefix="/api/sites", tags=["사이트"])


class 사이트응답(BaseModel):
    id: int
    name: str
    domain_code: str
    description: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class create_site(BaseModel):
    name: str
    domain_code: str
    description: Optional[str] = None


class update_site(BaseModel):
    name: Optional[str] = None
    domain_code: Optional[str] = None
    description: Optional[str] = None


def _require_admin(current: dict) -> None:
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한 필요")


@라우터.get("", response_model=List[사이트응답])
def list_all_sites(
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """사이트 전체 목록 조회."""
    return [사이트응답(**item) for item in svc_list_sites(db)]


@라우터.get("/{site_id}", response_model=사이트응답)
def get_one_site(
    site_id: int,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """사이트 단건 조회."""
    return 사이트응답(**svc_get_site(site_id, db))


@라우터.post("", response_model=사이트응답, status_code=status.HTTP_201_CREATED)
def add_site(
    요청: create_site,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """사이트 등록 (admin 권한 필요)."""
    _require_admin(current)
    결과 = svc_create_site(
        name=요청.name,
        domain_code=요청.domain_code,
        description=요청.description,
        db=db,
    )
    return 사이트응답(**결과)


@라우터.put("/{site_id}", response_model=사이트응답)
def modify_site(
    site_id: int,
    요청: update_site,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """사이트 정보 수정 (admin 권한 필요)."""
    _require_admin(current)
    결과 = svc_update_site(
        site_id=site_id,
        name=요청.name,
        domain_code=요청.domain_code,
        description=요청.description,
        db=db,
    )
    return 사이트응답(**결과)


@라우터.delete("/{site_id}")
def remove_site(
    site_id: int,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """사이트 삭제 (admin 권한 필요)."""
    _require_admin(current)
    svc_delete_site(site_id, db)
    return {"success": True, "message": f"사이트 삭제 complete: {site_id}"}
