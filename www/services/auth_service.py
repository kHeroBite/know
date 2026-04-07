from __future__ import annotations
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from models.account import 계정테이블
from core.security import 비밀번호검증, 비밀번호해시, 액세스토큰생성
import secrets, string
from datetime import datetime
from sqlalchemy import update


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


def 비밀번호찾기처리(db: Session, user_id: str, email: str) -> dict:
    """아이디+이메일 확인 후 비밀번호 초기화 + 이메일 발송."""
    from fastapi import HTTPException
    from core.config import 설정값

    행 = db.execute(
        select(계정테이블).where(계정테이블.c._USER_ID == user_id)
    ).fetchone()

    if not 행:
        raise HTTPException(status_code=404, detail="존재하지 않는 아이디입니다")

    저장된이메일 = 행._EMAIL if hasattr(행, '_EMAIL') else None
    if not 저장된이메일:
        raise HTTPException(status_code=400, detail="이메일이 등록되지 않은 계정입니다. 관리자에게 문의하세요.")

    if 저장된이메일.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=400, detail="등록된 이메일과 일치하지 않습니다")

    # SMTP 설정 확인
    if not 설정값.SMTP_HOST:
        raise HTTPException(status_code=503, detail="메일 서버가 설정되지 않았습니다. 관리자에게 비밀번호 초기화를 요청하세요.")

    # 랜덤 8자리 비밀번호 생성
    새비밀번호 = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))

    # 이메일 발송 먼저 시도 (성공해야 비밀번호 변경)
    try:
        from services.email_service import 비밀번호초기화메일발송
        비밀번호초기화메일발송(저장된이메일, user_id, 새비밀번호)
    except Exception as e:
        raise HTTPException(status_code=503, detail="이메일 발송에 실패했습니다. 관리자에게 문의하세요.")

    # 이메일 발송 성공 후 DB 업데이트
    db.execute(update(계정테이블).where(계정테이블.c._USER_ID == user_id).values(
        _PASSWORD=비밀번호해시(새비밀번호), _UPDATED=datetime.now()
    ))
    db.commit()

    return {"message": "임시 비밀번호가 이메일로 발송되었습니다. 로그인 후 비밀번호를 변경하세요."}
