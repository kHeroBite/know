from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from services.statistics_service import get_domain_dict_stats, get_all_domain_stats, get_llm_usage_stats_service, get_llm_monthly_trend, get_statistics_by_period

라우터 = APIRouter(prefix="/api/stats", tags=["get_stats"])


@라우터.get("/dictionary/{domain}")
def get_dict_stats(
    domain: str,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """도메인별 사전 유형별 항목 수 반환."""
    return get_domain_dict_stats(db, domain)


@라우터.get("/domains")
def get_all_stats(
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """전체 도메인 사전 현황 반환."""
    return get_all_domain_stats(db)


@라우터.get("/llm-usage")
def get_llm_usage_stats(
    year: int = Query(..., description="조회 연도 (예: 2026)"),
    month: int = Query(..., description="조회 월 (1~12)"),
    _current: dict = Depends(get_current_user),
):
    """월별 사용자/usage_type별 LLM 사용 get_stats 반환."""
    return get_llm_usage_stats_service(year, month)


@라우터.get("/by-period")
def get_stats_by_period(
    period: str = Query("day", description="집계 기간: day | week | month"),
    user_id: Optional[str] = Query(None, description="특정 사용자 필터 (생략 시 전체)"),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
):
    """기간별(일/주/월) 키워드 처리 건수 통계."""
    return get_statistics_by_period(db, period, user_id)


@라우터.get("/llm-usage-trend")
def get_llm_usage_trend(
    mode: str = Query("monthly", description="daily 또는 monthly"),
    start: str = Query("", description="시작일 (YYYY-MM-DD 또는 YYYY-MM)"),
    end: str = Query("", description="종료일 (YYYY-MM-DD 또는 YYYY-MM)"),
    _current: dict = Depends(get_current_user),
):
    """기간별 사용자/모델별 LLM 사용 추이."""
    return get_llm_monthly_trend(mode=mode, start=start, end=end)
