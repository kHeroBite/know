"""사전검증 API 엔드포인트

POST /run               — 키워드 목록으로 사전검증 실행 (workspace 지정 시 DB 자동 조회)
POST /run-file-based    — 형태소분석 기반 사전검증 실행 (Java 로직 복원)
GET  /result/{domain}   — 최근 검증 결과 조회
POST /analyze           — 단일 키워드 형태소분석
"""
from typing import Optional, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import 현재사용자가져오기
from core.database import DB세션
from services.dict_verify_service import 사전검증, 자동사전검증
from services.morpheme_service import 형태소분석

라우터 = APIRouter(prefix="/dict-verify", tags=["사전검증"])

# 최근 검증 결과 메모리 캐시 (도메인별)
_최근결과: dict = {}


class 검증요청(BaseModel):
    keywords: List[str]
    domain: str
    workspace: Optional[str] = None


class 분석요청(BaseModel):
    keyword: str
    domain: Optional[str] = None


class 자동검증요청(BaseModel):
    workspace: str
    domain: str


@라우터.post("/run")
def 검증실행(요청: 검증요청, db: Session = Depends(DB세션), _current: dict = Depends(현재사용자가져오기)):
    """키워드 목록으로 사전검증 실행.

    keywords가 빈 배열이고 workspace가 주어지면 서버에서 완료 키워드를 자동 조회.
    """
    keywords = 요청.keywords
    if not keywords and 요청.workspace:
        rows = db.execute(text(
            "SELECT keyword FROM keyword_assignments "
            "WHERE workspace=:ws AND domain=:dom AND status='done'"
        ), {"ws": 요청.workspace, "dom": 요청.domain}).fetchall()
        keywords = [r[0] for r in rows]
    result = 사전검증(keywords, 요청.domain)
    _최근결과[요청.domain] = result
    return result


@라우터.post("/run-file-based")
def 파일기반검증실행(요청: 자동검증요청, db: Session = Depends(DB세션), _current: dict = Depends(현재사용자가져오기)):
    """기존 Java 로직(형태소분석) 기반 사전검증. 완료 키워드 자동 로딩."""
    result = 자동사전검증(db, 요청.workspace, 요청.domain)
    _최근결과[요청.domain] = result
    return result


@라우터.get("/result/{domain}")
def 결과조회(domain: str, _current: dict = Depends(현재사용자가져오기)):
    """최근 검증 결과 조회."""
    if domain in _최근결과:
        return _최근결과[domain]
    return {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": domain}


@라우터.post("/analyze")
def 단일분석(요청: 분석요청, _current: dict = Depends(현재사용자가져오기)):
    """단일 키워드 형태소분석."""
    return 형태소분석(요청.keyword, 요청.domain)
