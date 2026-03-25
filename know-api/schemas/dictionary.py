from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class 사전항목생성(BaseModel):
    """사전 항목 등록 요청 모델 (udic/cndic 공용)."""
    word: str
    memo: Optional[str] = None


class 사전항목수정(BaseModel):
    """사전 항목 수정 요청 모델."""
    memo: Optional[str] = None


class 사전항목응답(BaseModel):
    """사전 항목 응답 모델 (udic/cndic 공용)."""
    word: str
    memo: Optional[str] = None

    class Config:
        from_attributes = True


class 유의어항목생성(BaseModel):
    """유의어 등록 요청 모델 (_HEAD_WORD 기준 단일 행)."""
    head_word: str
    tail_word: str  # 쉼표 구분 동의어 목록 (Java 호환)
    memo: Optional[str] = None


class 유의어항목수정(BaseModel):
    """유의어 수정 요청 모델."""
    tail_word: str
    memo: Optional[str] = None


class 유의어항목응답(BaseModel):
    """유의어 응답 모델."""
    head_word: str
    tail_word: str
    memo: Optional[str] = None

    class Config:
        from_attributes = True


class 일괄항목(BaseModel):
    """일괄 등록 단일 항목."""
    word: str
    memo: Optional[str] = None


class 유의어일괄항목(BaseModel):
    """유의어 일괄 등록 단일 항목."""
    head_word: str
    tail_word: str
    memo: Optional[str] = None
