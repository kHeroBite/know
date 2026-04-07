from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


class 계정생성요청(BaseModel):
    user_id: str
    name: str
    password: str
    auth: str = "R"  # A=admin, W=write, R=read
    email: Optional[str] = None


class 계정수정요청(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    auth: Optional[str] = None
    email: Optional[str] = None


class 계정응답(BaseModel):
    user_id: str
    name: Optional[str]
    auth: str
    email: Optional[str] = None
    created: Optional[str] = None
    updated: Optional[str] = None
