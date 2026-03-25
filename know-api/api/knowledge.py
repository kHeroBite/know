"""api/knowledge.py — 지식작업 REST API 라우터"""
from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from api.auth import 현재사용자가져오기
from core.database import DB세션
from services.knowledge_service import knowledge_service

라우터 = APIRouter(prefix="/api/knowledge", tags=["지식작업"])
_MAX_UPLOAD_SIZE = 100 * 1024 * 1024

@라우터.post("/upload")
async def 파일업로드(file: UploadFile = File(...), current_user: dict = Depends(현재사용자가져오기)):
    """파일 업로드 (최대 100MB)"""
    if file.size and file.size > _MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"파일 크기 초과: {file.size/1024/1024:.1f}MB > 100MB")
    return await knowledge_service.파일업로드(file)

@라우터.post("/assign")
def 작업분배(pipeline_id: int, assignments: List[dict], current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """작업 분배"""
    return knowledge_service.작업분배(db, pipeline_id, assignments)

@라우터.get("/tasks")
def 내작업목록(page: int = Query(default=1, ge=1), size: int = Query(default=20, ge=1, le=100), current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """내 작업 목록"""
    user_id = current_user.get("id") or current_user.get("user_id")
    return knowledge_service.내작업목록(db, user_id=user_id, page=page, size=size)
