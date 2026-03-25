"""api/pipeline.py — 파이프라인 REST API 라우터"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from api.auth import 현재사용자가져오기
from core.database import DB세션
from services.pipeline_service import pipeline_service

라우터 = APIRouter(prefix="/api/pipeline", tags=["파이프라인"])

@라우터.post("/start")
def 파이프라인시작(domain: str, file_path: str, current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """파이프라인 시작"""
    started_by = current_user.get("id") or current_user.get("user_id")
    return pipeline_service.파이프라인시작(db, domain, file_path, started_by=started_by)

@라우터.get("/{pipeline_id}/status")
def 파이프라인상태조회(pipeline_id: int, current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """단계별 상태 조회"""
    return pipeline_service.파이프라인상태(db, pipeline_id)

@라우터.post("/{pipeline_id}/approve/{stage}")
def 파이프라인승인(pipeline_id: int, stage: str, current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """승인 게이트"""
    approved_by = str(current_user.get("user_id", "unknown"))
    return pipeline_service.파이프라인승인(db, pipeline_id, stage, approved_by)

@라우터.post("/{pipeline_id}/cancel")
def 파이프라인취소(pipeline_id: int, current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """파이프라인 취소"""
    return pipeline_service.파이프라인취소(db, pipeline_id)

@라우터.get("/history")
def 파이프라인이력조회(page: int = Query(default=1, ge=1), size: int = Query(default=20, ge=1, le=100), current_user: dict = Depends(현재사용자가져오기), db: Session = Depends(DB세션)):
    """파이프라인 이력 페이지네이션"""
    return pipeline_service.파이프라인이력(db, page=page, size=size)
