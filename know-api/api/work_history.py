"""작업이력 API 라우터."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth import 현재사용자가져오기
from core.database import DB세션
from services.work_history_service import (
    이력목록조회,
    이력추가,
    이력취소,
    이력전체삭제,
)

라우터 = APIRouter(prefix="/work-history", tags=["작업이력"])


class 이력추가요청(BaseModel):
    workspace: str
    domain: str
    action_type: str
    dic_type: str
    word: Optional[str] = None
    memo: Optional[str] = None
    head_word: Optional[str] = None
    tail_word: Optional[str] = None


@라우터.get("")
def 이력목록(
    workspace: str = Query(...),
    domain: str = Query(...),
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """작업이력 목록 조회."""
    return 이력목록조회(db, workspace, domain, current.get("user_id", ""))


@라우터.post("")
def 이력기록(
    요청: 이력추가요청,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """작업이력 기록 추가."""
    return 이력추가(
        db,
        요청.workspace,
        요청.domain,
        current.get("user_id", ""),
        요청.action_type,
        요청.dic_type,
        요청.word,
        요청.memo,
        요청.head_word,
        요청.tail_word,
    )


@라우터.post("/undo/{history_id}")
def 이력취소처리(
    history_id: int,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """작업 취소/롤백."""
    return 이력취소(db, history_id, current.get("user_id", ""))


@라우터.delete("")
def 이력전체삭제처리(
    workspace: str = Query(...),
    domain: str = Query(...),
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 해제 시 전체 이력 삭제."""
    return 이력전체삭제(db, workspace, domain)
