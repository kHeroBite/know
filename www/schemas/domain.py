from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class create_domain(BaseModel):
    """도메인 등록 요청 모델."""
    site: str
    memo: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    url: Optional[str] = None
    param: Optional[str] = None


class update_domain_service(BaseModel):
    """도메인 수정 요청 모델 (site 변경 불가)."""
    memo: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    url: Optional[str] = None
    param: Optional[str] = None


class 도메인응답(BaseModel):
    """도메인 응답 모델."""
    site: str
    memo: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    url: Optional[str] = None
    param: Optional[str] = None
    user_id: Optional[str] = None
    created: Optional[datetime] = None

    class Config:
        from_attributes = True
