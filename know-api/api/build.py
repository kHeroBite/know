"""api/build.py — 사전 빌드 REST API 라우터"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from api.auth import 현재사용자가져오기
from core.database import DB세션
from services.build_service import build_service

라우터 = APIRouter(tags=["빌드"])


# ──────────────────────────────────────────────
# 빌드
# ──────────────────────────────────────────────

@라우터.post("/api/build/{domain}")
def 빌드시작(
    domain: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(현재사용자가져오기),
    db: Session = Depends(DB세션),
):
    """사전 빌드 시작 (백그라운드 실행)"""
    triggered_by = current_user.get("id") or current_user.get("user_id")
    return build_service.빌드시작(db, background_tasks, domain, triggered_by=triggered_by)


@라우터.get("/api/build/{domain}/status")
def 빌드상태조회(
    domain: str,
    current_user: dict = Depends(현재사용자가져오기),
    db: Session = Depends(DB세션),
):
    """현재 빌드 상태 (최신 BuildHistory)"""
    return build_service.빌드상태(db, domain)


@라우터.get("/api/build/{domain}/history")
def 빌드이력조회(
    domain: str,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(현재사용자가져오기),
    db: Session = Depends(DB세션),
):
    """빌드 이력 페이지네이션"""
    return build_service.빌드이력(db, domain, page=page, size=size)


# ──────────────────────────────────────────────
# 사전 관리
# ──────────────────────────────────────────────

@라우터.post("/api/dictionaries/{domain}/sync")
def 사전동기화(
    domain: str,
    current_user: dict = Depends(현재사용자가져오기),
    db: Session = Depends(DB세션),
):
    """사전 파일 동기화"""
    return build_service.사전동기화(db, domain)


@라우터.post("/api/dictionaries/{domain}/init")
def 사전초기화(
    domain: str,
    current_user: dict = Depends(현재사용자가져오기),
    db: Session = Depends(DB세션),
):
    """사전 파일 초기화"""
    return build_service.사전초기화(db, domain)
