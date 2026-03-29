from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func
from fastapi import HTTPException
from models.account import 계정테이블
from core.security import 비밀번호해시


def 계정목록조회(db: Session) -> List[dict]:
    rows = db.execute(select(계정테이블)).mappings().all()
    return [_행to계정(row) for row in rows]


def 계정조회(db: Session, user_id: str) -> dict:
    row = db.execute(
        select(계정테이블).where(계정테이블.c._USER_ID == user_id)
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"사용자를 찾을 수 없음: {user_id}")
    return _행to계정(row)


def 계정생성(db: Session, user_id: str, name: str, password: str, auth: str = "R") -> dict:
    기존 = db.execute(
        select(계정테이블.c._USER_ID).where(계정테이블.c._USER_ID == user_id)
    ).first()
    if 기존:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 사용자: {user_id}")
    db.execute(insert(계정테이블).values(
        _USER_ID=user_id,
        _NAME=name,
        _PASSWORD=비밀번호해시(password),
        _AUTH=auth,
        _CREATED=datetime.now(),
        _UPDATED=datetime.now(),
    ))
    db.commit()
    return 계정조회(db, user_id)


def 계정수정(db: Session, user_id: str, name: Optional[str] = None, password: Optional[str] = None, auth: Optional[str] = None) -> dict:
    계정조회(db, user_id)  # 존재 확인
    업데이트값 = {"_UPDATED": datetime.now()}
    if name is not None:
        업데이트값["_NAME"] = name
    if password is not None:
        업데이트값["_PASSWORD"] = 비밀번호해시(password)
    if auth is not None:
        업데이트값["_AUTH"] = auth
    db.execute(update(계정테이블).where(계정테이블.c._USER_ID == user_id).values(**업데이트값))
    db.commit()
    return 계정조회(db, user_id)


def 계정삭제(db: Session, user_id: str) -> None:
    계정조회(db, user_id)  # 존재 확인
    if user_id == "admin":
        raise HTTPException(status_code=400, detail="admin 계정은 삭제할 수 없습니다")
    db.execute(delete(계정테이블).where(계정테이블.c._USER_ID == user_id))
    db.commit()


def _행to계정(row) -> dict:
    return {
        "user_id": row["_USER_ID"],
        "name": row["_NAME"],
        "auth": row["_AUTH"],
        "created": str(row["_CREATED"]) if row["_CREATED"] else None,
        "updated": str(row["_UPDATED"]) if row["_UPDATED"] else None,
    }
