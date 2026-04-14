"""verify_dict API 엔드포인트

POST /run               — 키워드 목록으로 verify_dict run_phase1_service (workspace 지정 시 DB 자동 조회)
POST /run-file-based    — analyze_morpheme 기반 verify_dict run_phase1_service (Java 로직 복원)
GET  /result/{domain}   — 최근 검증 결과 조회
POST /analyze           — 단일 키워드 analyze_morpheme
"""
from typing import Optional, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from services.dict_verify_service import verify_dict, auto_verify_dict, reprocess_keywords
from services.morpheme_service import analyze_morpheme
from services.workspace_service import get_jiana_home_path
from services.assignment_service import _kw_table

라우터 = APIRouter(prefix="/dict-verify", tags=["verify_dict"])

# 최근 검증 결과 메모리 캐시 (도메인별)
_최근결과: dict = {}


class 검증요청(BaseModel):
    keywords: List[str]
    domain: str
    workspace: Optional[str] = None
    # workspace가 있으면 workspace/jiana 경로를 자동 사용


class 분석요청(BaseModel):
    keyword: str
    domain: Optional[str] = None
    workspace: Optional[str] = None


class 자동검증요청(BaseModel):
    workspace: str
    domain: str


class 재처리요청(BaseModel):
    workspace: str
    domain: str
    keywords: List[str]


@라우터.post("/run")
def run_verify(요청: 검증요청, db: Session = Depends(db_session), _current: dict = Depends(get_current_user)):
    """키워드 목록으로 verify_dict run_phase1_service.

    keywords가 빈 배열이고 workspace가 주어지면 서버에서 complete 키워드를 자동 조회.
    """
    keywords = 요청.keywords
    if not keywords and 요청.workspace:
        rows = db.execute(text(
            "SELECT keyword FROM keyword_assignments "
            "WHERE workspace=:ws AND domain=:dom AND status='done'"
        ), {"ws": 요청.workspace, "dom": 요청.domain}).fetchall()
        keywords = [r[0] for r in rows]
    jiana_home = get_jiana_home_path(요청.workspace) if 요청.workspace else None
    result = verify_dict(keywords, 요청.domain, jiana_home=jiana_home)
    _최근결과[요청.domain] = result
    return result


@라우터.post("/run-file-based")
def run_file_verify(요청: 자동검증요청, db: Session = Depends(db_session), _current: dict = Depends(get_current_user)):
    """기존 Java 로직(analyze_morpheme) 기반 verify_dict. complete 키워드 자동 로딩."""
    jiana_home = get_jiana_home_path(요청.workspace) if 요청.workspace else None
    result = auto_verify_dict(db, 요청.workspace, 요청.domain, jiana_home=jiana_home)
    _최근결과[요청.domain] = result
    return result


@라우터.post("/run-split")
def run_split_verify(요청: 자동검증요청, db: Session = Depends(db_session), _current: dict = Depends(get_current_user)):
    """complete/미complete 키워드를 분리하여 각각 verify_dict run_phase1_service."""
    jiana_home = get_jiana_home_path(요청.workspace) if 요청.workspace else None
    try:
        tbl = _kw_table(요청.workspace)
    except ValueError as e:
        return {"error": str(e), "completed": {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": 요청.domain}, "pending": {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": 요청.domain}}
    # complete 키워드 (워크스페이스 동적 테이블 kw_{workspace} 사용)
    완료rows = db.execute(text(
        f"SELECT DISTINCT keyword FROM {tbl} "
        "WHERE domain=:dom AND status='completed'"
    ), {"dom": 요청.domain}).scalars().all()
    # 미complete 키워드
    미완료rows = db.execute(text(
        f"SELECT DISTINCT keyword FROM {tbl} "
        "WHERE domain=:dom AND status!='completed'"
    ), {"dom": 요청.domain}).scalars().all()

    완료결과 = verify_dict(list(완료rows), 요청.domain, jiana_home=jiana_home) if 완료rows else {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": 요청.domain}
    미완료결과 = verify_dict(list(미완료rows), 요청.domain, jiana_home=jiana_home) if 미완료rows else {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": 요청.domain}

    return {"completed": 완료결과, "pending": 미완료결과}


@라우터.get("/result/{domain}")
def get_verify_result(domain: str, _current: dict = Depends(get_current_user)):
    """최근 검증 결과 조회."""
    if domain in _최근결과:
        return _최근결과[domain]
    return {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": domain}


@라우터.post("/reprocess")
def reprocess(요청: 재처리요청, db: Session = Depends(db_session), _current: dict = Depends(get_current_user)):
    """선택 키워드 재처리 — pending 초기화 + verify→build→work 2단계 역전이."""
    return reprocess_keywords(db, 요청.workspace, 요청.domain, 요청.keywords)


@라우터.post("/analyze")
def single_analyze(요청: 분석요청, _current: dict = Depends(get_current_user)):
    """단일 키워드 analyze_morpheme."""
    jiana_home = get_jiana_home_path(요청.workspace) if 요청.workspace else None
    return analyze_morpheme(요청.keyword, 요청.domain, jiana_home=jiana_home)
