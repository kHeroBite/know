from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import db_session
from core.security import create_access_token, verify_token
from services.auth_service import authenticate_user, get_user
from schemas.auth import 로그인요청, 토큰응답, 사용자정보

라우터 = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(db_session),
) -> dict:
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰")
    user = get_user(db, payload.get("sub", ""))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없음")
    return user


@라우터.post("/login", response_model=토큰응답)
def login(요청: 로그인요청, db: Session = Depends(db_session)):
    user = authenticate_user(db, 요청.user_id, 요청.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="아이디 또는 비밀번호 오류")
    token = create_access_token({"sub": user["user_id"]})
    return 토큰응답(
        access_token=token,
        user_id=user["user_id"],
        name=user.get("name"),
        auth=user.get("auth", "N"),
    )


@라우터.post("/logout")
def logout():
    """클라이언트가 토큰을 폐기. 서버는 stateless."""
    return {"message": "logout complete"}


@라우터.get("/me", response_model=사용자정보)
def get_me(current_user: dict = Depends(get_current_user)):
    return 사용자정보(**current_user)


class 비밀번호찾기요청(BaseModel):
    user_id: str
    email: str


@라우터.post("/forgot-password")
def find_password(요청: 비밀번호찾기요청, db: Session = Depends(db_session)):
    from services.auth_service import process_find_password
    result = process_find_password(db, 요청.user_id, 요청.email)
    return result
