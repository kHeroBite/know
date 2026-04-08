"""작업이력 API 라우터."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from services.work_history_service import (
    get_history_list,
    add_history,
    cancel_history_service,
    delete_all_history_service,
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
def list_history(
    workspace: str = Query(...),
    domain: str = Query(...),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """작업이력 list_tasks 조회."""
    return get_history_list(db, workspace, domain, current.get("user_id", ""))


@라우터.post("")
def record_history(
    요청: 이력추가요청,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """작업이력 기록 추가."""
    return add_history(
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
def cancel_history(
    history_id: int,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """작업 취소/롤백."""
    return cancel_history_service(db, history_id, current.get("user_id", ""))


@라우터.delete("")
def delete_all_history(
    workspace: str = Query(...),
    domain: str = Query(...),
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스 해제 시 전체 이력 삭제."""
    return delete_all_history_service(db, workspace, domain)
