from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from schemas.account import 계정생성요청, 계정수정요청, 계정응답
from services.account_service import get_account_list, create_account, update_account_info, delete_account, reset_account_password

라우터 = APIRouter()


def _check_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다")
    return current_user


@라우터.get("/accounts")
def list_accounts(db: Session = Depends(db_session), _: dict = Depends(_check_admin)):
    return get_account_list(db)


@라우터.post("/accounts", response_model=계정응답)
def add_account(요청: 계정생성요청, db: Session = Depends(db_session), _: dict = Depends(_check_admin)):
    return create_account(db, 요청.user_id, 요청.name, 요청.password, 요청.auth, 요청.email)


@라우터.put("/accounts/{user_id}", response_model=계정응답)
def update_account(user_id: str, 요청: 계정수정요청, db: Session = Depends(db_session), _: dict = Depends(_check_admin)):
    return update_account_info(db, user_id, 요청.name, 요청.password, 요청.auth, 요청.email)


@라우터.delete("/accounts/{user_id}")
def remove_account(user_id: str, db: Session = Depends(db_session), _: dict = Depends(_check_admin)):
    delete_account(db, user_id)
    return {"message": f"계정 '{user_id}' 삭제 complete"}


@라우터.post("/accounts/{user_id}/reset-password")
def reset_password(user_id: str, db: Session = Depends(db_session), _: dict = Depends(_check_admin)):
    return reset_account_password(db, user_id)
