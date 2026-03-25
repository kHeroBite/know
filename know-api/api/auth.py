from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from core.database import DB세션
from core.security import 액세스토큰생성, 토큰검증
from services.auth_service import 사용자인증, 사용자조회
from schemas.auth import 로그인요청, 토큰응답, 사용자정보

라우터 = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def 현재사용자가져오기(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(DB세션),
) -> dict:
    payload = 토큰검증(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰")
    user = 사용자조회(db, payload.get("sub", ""))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없음")
    return user


@라우터.post("/login", response_model=토큰응답)
def 로그인(요청: 로그인요청, db: Session = Depends(DB세션)):
    user = 사용자인증(db, 요청.user_id, 요청.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="아이디 또는 비밀번호 오류")
    token = 액세스토큰생성({"sub": user["user_id"]})
    return 토큰응답(access_token=token)


@라우터.post("/logout")
def 로그아웃():
    """클라이언트가 토큰을 폐기. 서버는 stateless."""
    return {"message": "로그아웃 완료"}


@라우터.get("/me", response_model=사용자정보)
def 내정보(current_user: dict = Depends(현재사용자가져오기)):
    return 사용자정보(**current_user)
