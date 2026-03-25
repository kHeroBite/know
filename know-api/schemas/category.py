from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class 카테고리항목생성(BaseModel):
    """카테고리 항목 등록 요청 모델."""
    word: str
    display_category: str


class 카테고리항목수정(BaseModel):
    """카테고리 항목 수정 요청 모델."""
    new_display_category: str


class 카테고리항목응답(BaseModel):
    """카테고리 항목 응답 모델."""
    word: str
    display_category: str

    class Config:
        from_attributes = True
