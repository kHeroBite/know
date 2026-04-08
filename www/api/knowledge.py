"""api/knowledge.py — 지식작업 REST API 라우터"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from api.auth import get_current_user
from core.database import db_session
from services.knowledge_service import knowledge_service

라우터 = APIRouter(prefix="/api/knowledge", tags=["지식작업"])
_MAX_UPLOAD_SIZE = 100 * 1024 * 1024


class 작업분배요청(BaseModel):
    """프론트엔드(Knowledge.tsx)가 전송하는 distribute_tasks_service 요청 바디"""
    assignee: str
    row_count: int
    file_id: int


@라우터.post("/upload")
async def upload_file_service(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """파일 업로드 (최대 100MB)"""
    if file.size and file.size > _MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"파일 크기 초과: {file.size/1024/1024:.1f}MB > 100MB")
    return await knowledge_service.upload_file_service(file)


@라우터.post("/assign")
def distribute_tasks_service(body: 작업분배요청, current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """작업 분배 — 프론트엔드 스펙: {assignee, row_count, file_id}"""
    # file_id 기반 단일 분배: assignee를 pipeline_id=file_id로 매핑하고
    # item_start=1 ~ item_end=row_count 범위로 단일 TaskAssignment 생성
    assignments = [
        {
            "assignee_id": None,         # assignee 이름은 별도 저장 필요 시 확장
            "item_start": 1,
            "item_end": body.row_count,
        }
    ]
    result = knowledge_service.distribute_tasks_service(db, pipeline_id=body.file_id, assignments=assignments)
    result["assignee"] = body.assignee
    result["row_count"] = body.row_count
    result["file_id"] = body.file_id
    return result


@라우터.get("/tasks")
def get_my_task_list(page: int = Query(default=1, ge=1), size: int = Query(default=20, ge=1, le=100), current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """내 작업 list_tasks"""
    user_id = current_user.get("id") or current_user.get("user_id")
    return knowledge_service.get_my_task_list(db, user_id=user_id, page=page, size=size)
