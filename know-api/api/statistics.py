from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import DB세션
from api.auth import 현재사용자가져오기
from services.statistics_service import 도메인별사전통계, 전체도메인통계

라우터 = APIRouter(prefix="/api/stats", tags=["통계"])


@라우터.get("/dictionary/{domain}")
def 사전통계(
    domain: str,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """도메인별 사전 유형별 항목 수 반환."""
    return 도메인별사전통계(db, domain)


@라우터.get("/domains")
def 전체통계(
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
):
    """전체 도메인 사전 현황 반환."""
    return 전체도메인통계(db)
