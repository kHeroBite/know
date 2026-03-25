from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from .config import 설정값

암호컨텍스트 = CryptContext(schemes=["bcrypt"], deprecated="auto")


def 비밀번호해시(평문: str) -> str:
    return 암호컨텍스트.hash(평문)


def 비밀번호검증(평문: str, 저장된값: str) -> bool:
    """bcrypt 해시 검증 + 기존 평문 fallback (마이그레이션 호환)."""
    if not 저장된값:
        return False
    # bcrypt 해시 형식 ($2b$...)
    if 저장된값.startswith("$2"):
        return 암호컨텍스트.verify(평문, 저장된값)
    # 기존 평문 비밀번호 호환
    return 평문 == 저장된값


def 액세스토큰생성(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=설정값.JWT_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, 설정값.JWT_SECRET, algorithm=설정값.JWT_ALGORITHM)


def 토큰검증(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, 설정값.JWT_SECRET, algorithms=[설정값.JWT_ALGORITHM])
    except JWTError:
        return None
