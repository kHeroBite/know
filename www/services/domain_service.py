from __future__ import annotations
import os
import shutil
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func, text
from fastapi import HTTPException
from models.domain import 도메인테이블
from models.dictionary import validate_site_name, create_domain_table
from core.database import 엔진


def get_domain_list(db: Session, page: int = 1, size: int = 20) -> dict:
    """전체 도메인 list_tasks 페이지네이션 조회."""
    offset = (page - 1) * size
    total_stmt = select(func.count()).select_from(도메인테이블)
    total = db.execute(total_stmt).scalar() or 0
    stmt = select(도메인테이블).offset(offset).limit(size)
    rows = db.execute(stmt).mappings().all()
    items = [_row_to_domain(row) for row in rows]
    return {"items": items, "total": total, "page": page, "size": size}


def get_domain_service(db: Session, site: str) -> dict:
    """특정 도메인 조회. 없으면 HTTPException 404."""
    stmt = select(도메인테이블).where(도메인테이블.c._SITE == site.upper())
    row = db.execute(stmt).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"도메인을 찾을 수 없음: {site}")
    return _row_to_domain(row)


def create_domain(
    db: Session,
    site: str,
    memo: Optional[str] = None,
    ip: Optional[str] = None,
    port: Optional[int] = None,
    url: Optional[str] = None,
    param: Optional[str] = None,
    user_id: Optional[str] = None,
) -> dict:
    """도메인 등록 + 4개 사전 테이블 생성."""
    validate_site_name(site)
    site_upper = site.upper()

    # 중복 확인
    존재여부 = db.execute(
        select(도메인테이블.c._SITE).where(도메인테이블.c._SITE == site_upper)
    ).first()
    if 존재여부:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 도메인: {site_upper}")

    # DOMAIN_MNG INSERT
    stmt = insert(도메인테이블).values(
        _SITE=site_upper,
        _MEMO=memo,
        _IP=ip,
        _PORT=port,
        _URL=url,
        _PARAM=param,
        _USER_ID=user_id,
        _CREATED=datetime.now(),
    )
    db.execute(stmt)
    db.commit()

    # 동적 사전 테이블 4개 생성 (UDIC, CNDIC, THESAURUS, CATEGORY)
    try:
        create_domain_table(site_upper, 엔진)
    except Exception as e:
        # 테이블 생성 실패 시 도메인 레코드 롤백
        db.execute(delete(도메인테이블).where(도메인테이블.c._SITE == site_upper))
        db.commit()
        raise HTTPException(status_code=500, detail=f"사전 테이블 생성 실패: {e}")

    return get_domain_service(db, site_upper)


def update_domain_service(
    db: Session,
    site: str,
    memo: Optional[str] = None,
    ip: Optional[str] = None,
    port: Optional[int] = None,
    url: Optional[str] = None,
    param: Optional[str] = None,
) -> dict:
    """도메인 정보 수정 (site 변경 불가)."""
    site_upper = site.upper()
    # 존재 확인
    get_domain_service(db, site_upper)

    # None 값은 기존 값 유지 (부분 업데이트)
    업데이트값 = {}
    if memo is not None:
        업데이트값["_MEMO"] = memo
    if ip is not None:
        업데이트값["_IP"] = ip
    if port is not None:
        업데이트값["_PORT"] = port
    if url is not None:
        업데이트값["_URL"] = url
    if param is not None:
        업데이트값["_PARAM"] = param

    if 업데이트값:
        stmt = update(도메인테이블).where(도메인테이블.c._SITE == site_upper).values(**업데이트값)
        db.execute(stmt)
        db.commit()

    return get_domain_service(db, site_upper)


def delete_domain_ws(db: Session, site: str) -> None:
    """도메인 삭제 + 4개 사전 테이블 DROP + 서버 디렉토리 삭제."""
    site_upper = site.upper()
    # 존재 확인
    get_domain_service(db, site_upper)

    # 동적 사전 테이블 4개 DROP (db 세션 경유)
    try:
        for suffix in ('_UDIC', '_CNDIC', '_THESAURUS', '_CATEGORY'):
            db.execute(text(f"DROP TABLE IF EXISTS `{site_upper}{suffix}`"))
        db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"사전 테이블 삭제 실패: {e}")

    # keyword_assignments 정리
    db.execute(text(f"DELETE FROM keyword_assignments WHERE domain=:dom"), {"dom": site_upper})

    # DOMAIN_MNG DELETE
    db.execute(delete(도메인테이블).where(도메인테이블.c._SITE == site_upper))
    db.commit()

    # 서버 디렉토리 삭제
    from core.constants import DOMAIN_DIR
    도메인경로 = os.path.join(DOMAIN_DIR, site_upper.lower())
    if os.path.isdir(도메인경로):
        shutil.rmtree(도메인경로, ignore_errors=True)


def _row_to_domain(row) -> dict:
    """DB 행 → 응답 딕셔너리 변환."""
    return {
        "site": row["_SITE"],
        "memo": row["_MEMO"],
        "ip": row["_IP"],
        "port": row["_PORT"],
        "url": row["_URL"],
        "param": row["_PARAM"],
        "user_id": row["_USER_ID"],
        "created": row["_CREATED"],
    }
