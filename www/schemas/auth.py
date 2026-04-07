from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


class 로그인요청(BaseModel):
    user_id: str
    password: str


class 토큰응답(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: Optional[str] = None
    auth: str


class 사용자정보(BaseModel):
    user_id: str
    name: Optional[str]
    auth: str   # A/W/R/N
