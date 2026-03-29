from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import DB세션
from api.auth import 현재사용자가져오기
from schemas.account import 계정생성요청, 계정수정요청, 계정응답
from services.account_service import 계정목록조회, 계정생성, 계정수정, 계정삭제, 비밀번호초기화

라우터 = APIRouter()


def _관리자확인(current_user: dict = Depends(현재사용자가져오기)):
    if current_user.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다")
    return current_user


@라우터.get("/accounts")
def 계정목록(db: Session = Depends(DB세션), _: dict = Depends(_관리자확인)):
    return 계정목록조회(db)


@라우터.post("/accounts", response_model=계정응답)
def 계정추가(요청: 계정생성요청, db: Session = Depends(DB세션), _: dict = Depends(_관리자확인)):
    return 계정생성(db, 요청.user_id, 요청.name, 요청.password, 요청.auth, 요청.email)


@라우터.put("/accounts/{user_id}", response_model=계정응답)
def 계정변경(user_id: str, 요청: 계정수정요청, db: Session = Depends(DB세션), _: dict = Depends(_관리자확인)):
    return 계정수정(db, user_id, 요청.name, 요청.password, 요청.auth, 요청.email)


@라우터.delete("/accounts/{user_id}")
def 계정제거(user_id: str, db: Session = Depends(DB세션), _: dict = Depends(_관리자확인)):
    계정삭제(db, user_id)
    return {"message": f"계정 '{user_id}' 삭제 완료"}


@라우터.post("/accounts/{user_id}/reset-password")
def 비밀번호재설정(user_id: str, db: Session = Depends(DB세션), _: dict = Depends(_관리자확인)):
    return 비밀번호초기화(db, user_id)
