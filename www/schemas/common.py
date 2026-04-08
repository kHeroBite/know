from __future__ import annotations
from typing import Generic, TypeVar, List
from pydantic import BaseModel

T = TypeVar("T")


class 페이지응답(BaseModel, Generic[T]):
    """페이지네이션 응답 공통 모델."""
    items: List[T]
    total: int
    page: int
    size: int


class 성공응답(BaseModel):
    """단순 성공 응답 모델."""
    success: bool = True
    message: str = "처리 complete"
