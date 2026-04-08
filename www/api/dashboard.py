from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from services import dashboard_service

라우터 = APIRouter(prefix="/api/dashboard", tags=["대시보드"])


@라우터.get("/summary")
def get_summary(
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """대시보드 요약 - 워크스페이스 현황 및 오늘 처리 건수."""
    return dashboard_service.get_dashboard_summary(db, current["user_id"])


@라우터.get("/recent-activities")
def get_recent_activities(
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """최근 작업 이력 조회."""
    return dashboard_service.get_recent_activities(db, current["user_id"], limit)


@라우터.get("/domain-stats")
def get_domain_stats(
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """도메인별 키워드 통계."""
    return dashboard_service.get_domain_stats(db)
