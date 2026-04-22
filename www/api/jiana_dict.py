"""jiana 사전 파일 직접 편집 API.

워크스페이스 연결 후 jiana/txt_resrc/{grammar,sdic} 파일을 직접 편집한다.

엔드포인트:
    GET  /api/jiana-dict/types?workspace_id={ws}           — 편집 가능한 사전 타입 목록
    GET  /api/jiana-dict/{dict_type}/files?workspace_id={ws} — 파일 목록
    GET  /api/jiana-dict/{dict_type}/file/{filename}?workspace_id={ws} — 파일 내용
    PUT  /api/jiana-dict/{dict_type}/file/{filename}        — 파일 저장
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from api.auth import get_current_user
from fastapi import Depends
from services.jiana_dict_service import (
    list_dict_types,
    list_dict_files,
    read_dict_file,
    write_dict_file,
)

라우터 = APIRouter(prefix="/api/jiana-dict", tags=["jiana-dict"])


class 파일저장요청(BaseModel):
    workspace_id: str
    domain: Optional[str] = None
    content: str


@라우터.get("/types")
def get_dict_types(
    workspace_id: str = Query(..., description="워크스페이스 ID"),
    domain: Optional[str] = Query(None, description="도메인 (선택적 검증용)"),
    _: dict = Depends(get_current_user),
):
    """편집 가능한 사전 타입 목록 반환."""
    types = list_dict_types(workspace_id, domain)
    return {"types": types}


@라우터.get("/{dict_type}/files")
def get_dict_files(
    dict_type: str,
    workspace_id: str = Query(..., description="워크스페이스 ID"),
    domain: Optional[str] = Query(None, description="도메인 (선택적 검증용)"),
    _: dict = Depends(get_current_user),
):
    """사전 타입 내 파일 목록 반환."""
    files = list_dict_files(workspace_id, dict_type, domain)
    return {"files": files}


@라우터.get("/{dict_type}/file/{filename}")
def get_dict_file(
    dict_type: str,
    filename: str,
    workspace_id: str = Query(..., description="워크스페이스 ID"),
    domain: Optional[str] = Query(None, description="도메인 (선택적 검증용)"),
    _: dict = Depends(get_current_user),
):
    """사전 파일 내용 반환."""
    return read_dict_file(workspace_id, dict_type, filename, domain)


@라우터.put("/{dict_type}/file/{filename}")
def put_dict_file(
    dict_type: str,
    filename: str,
    body: 파일저장요청,
    _: dict = Depends(get_current_user),
):
    """사전 파일 저장 (저장 전 .bak 백업 자동 생성)."""
    return write_dict_file(
        body.workspace_id,
        dict_type,
        filename,
        body.content,
        body.domain,
    )
