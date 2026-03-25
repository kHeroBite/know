from __future__ import annotations
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from models.account import 계정테이블
from core.security import 비밀번호검증, 비밀번호해시, 액세스토큰생성


def 사용자인증(db: Session, user_id: str, password: str) -> Optional[dict]:
    """아이디/비밀번호 검증. 성공 시 사용자 정보 dict 반환."""
    행 = db.execute(
        select(계정테이블).where(계정테이블.c._USER_ID == user_id)
    ).fetchone()

    if not 행:
        return None

    # 비밀번호 검증 (bcrypt + 평문 fallback)
    if not 비밀번호검증(password, 행._PASSWORD):
        return None

    # 평문이었으면 bcrypt로 자동 업그레이드
    if not 행._PASSWORD.startswith("$2"):
        db.execute(
            계정테이블.update()
            .where(계정테이블.c._USER_ID == user_id)
            .values(_PASSWORD=비밀번호해시(password))
        )
        db.commit()

    return {
        "user_id": 행._USER_ID,
        "name": 행._NAME,
        "auth": 행._AUTH or "R",
    }


def 사용자조회(db: Session, user_id: str) -> Optional[dict]:
    행 = db.execute(
        select(계정테이블).where(계정테이블.c._USER_ID == user_id)
    ).fetchone()
    if not 행:
        return None
    return {"user_id": 행._USER_ID, "name": 행._NAME, "auth": 행._AUTH or "R"}
