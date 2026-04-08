"""api/pipeline.py — 파이프라인 REST API 라우터"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from api.auth import get_current_user
from core.database import db_session
from services.pipeline_service import pipeline_service

라우터 = APIRouter(prefix="/api/pipeline", tags=["파이프라인"])

class 파이프라인시작요청(BaseModel):
    domain: str
    file_path: str

@라우터.post("/start")
def start_pipeline_service(req: 파이프라인시작요청, current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """파이프라인 시작"""
    started_by = current_user.get("id") or current_user.get("user_id")
    return pipeline_service.start_pipeline_service(db, req.domain, req.file_path, started_by=started_by)

@라우터.get("/{pipeline_id}/status")
def get_pipeline_status(pipeline_id: int, current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """단계별 상태 조회"""
    return pipeline_service.get_pipeline_status_service(db, pipeline_id)

@라우터.post("/{pipeline_id}/approve/{stage}")
def approve_pipeline_service(pipeline_id: int, stage: str, current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """승인 게이트"""
    approved_by = str(current_user.get("user_id", "unknown"))
    return pipeline_service.approve_pipeline_service(db, pipeline_id, stage, approved_by)

@라우터.post("/{pipeline_id}/cancel")
def cancel_pipeline_service(pipeline_id: int, current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """파이프라인 취소"""
    return pipeline_service.cancel_pipeline_service(db, pipeline_id)

@라우터.get("/history")
def get_pipeline_history(page: int = Query(default=1, ge=1), size: int = Query(default=20, ge=1, le=100), current_user: dict = Depends(get_current_user), db: Session = Depends(db_session)):
    """파이프라인 이력 페이지네이션"""
    return pipeline_service.get_pipeline_history_service(db, page=page, size=size)
