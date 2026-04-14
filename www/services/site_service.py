from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException


def _row_to_site(row) -> dict:
    return {
        "id": row["id"],
        "site_code": row["site_code"],
        "name": row["name"],
        "domain_code": row["domain_code"],
        "description": row["description"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_sites(db: Session) -> list[dict]:
    """전체 사이트 목록 조회 (id 오름차순)."""
    rows = db.execute(
        text("SELECT id, site_code, name, domain_code, description, created_at, updated_at "
             "FROM sites ORDER BY id ASC")
    ).mappings().all()
    return [_row_to_site(r) for r in rows]


def get_site(site_id: int, db: Session) -> dict:
    """사이트 단건 조회. 없으면 404."""
    row = db.execute(
        text("SELECT id, site_code, name, domain_code, description, created_at, updated_at "
             "FROM sites WHERE id = :id"),
        {"id": site_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"사이트를 찾을 수 없음: {site_id}")
    return _row_to_site(row)


def _check_domain_exists(db: Session, domain_code: str) -> None:
    """domain_code가 domains._SITE에 존재하는지 검증."""
    row = db.execute(
        text("SELECT _SITE FROM domains WHERE _SITE = :code"),
        {"code": domain_code.upper()},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"도메인을 찾을 수 없음: {domain_code}")


def _check_name_unique(db: Session, name: str, exclude_id: Optional[int] = None) -> None:
    """사이트명 중복 검사."""
    if exclude_id is None:
        row = db.execute(
            text("SELECT id FROM sites WHERE name = :name"),
            {"name": name},
        ).first()
    else:
        row = db.execute(
            text("SELECT id FROM sites WHERE name = :name AND id != :id"),
            {"name": name, "id": exclude_id},
        ).first()
    if row:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 사이트명: {name}")


def _check_site_code_unique(db: Session, site_code: str, exclude_id: Optional[int] = None) -> None:
    """사이트 코드 중복 검사."""
    if exclude_id is None:
        row = db.execute(
            text("SELECT id FROM sites WHERE site_code = :code"),
            {"code": site_code},
        ).first()
    else:
        row = db.execute(
            text("SELECT id FROM sites WHERE site_code = :code AND id != :id"),
            {"code": site_code, "id": exclude_id},
        ).first()
    if row:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 사이트 코드: {site_code}")


def create_site(
    site_code: str,
    name: str,
    domain_code: str,
    description: Optional[str],
    db: Session,
) -> dict:
    """사이트 등록."""
    if not site_code or not site_code.strip():
        raise HTTPException(status_code=400, detail="사이트 코드는 필수입니다")
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="사이트명은 필수입니다")
    site_code = site_code.strip()
    name = name.strip()
    domain_code = domain_code.upper()
    _check_site_code_unique(db, site_code)
    _check_name_unique(db, name)
    _check_domain_exists(db, domain_code)

    now = datetime.now().isoformat(sep=" ", timespec="seconds")
    result = db.execute(
        text("INSERT INTO sites (site_code, name, domain_code, description, created_at, updated_at) "
             "VALUES (:site_code, :name, :code, :desc, :created, :updated)"),
        {"site_code": site_code, "name": name, "code": domain_code, "desc": description,
         "created": now, "updated": now},
    )
    db.commit()
    new_id = result.lastrowid
    return get_site(new_id, db)


def update_site(
    site_id: int,
    site_code: Optional[str],
    name: Optional[str],
    domain_code: Optional[str],
    description: Optional[str],
    db: Session,
) -> dict:
    """사이트 정보 수정."""
    existing = get_site(site_id, db)

    new_site_code = existing["site_code"]
    new_name = existing["name"]
    new_domain = existing["domain_code"]
    new_desc = existing["description"]

    if site_code is not None and site_code.strip():
        new_site_code = site_code.strip()
        if new_site_code != existing["site_code"]:
            _check_site_code_unique(db, new_site_code, exclude_id=site_id)
    if name is not None and name.strip():
        new_name = name.strip()
        if new_name != existing["name"]:
            _check_name_unique(db, new_name, exclude_id=site_id)
    if domain_code is not None and domain_code.strip():
        new_domain = domain_code.upper()
        if new_domain != existing["domain_code"]:
            _check_domain_exists(db, new_domain)
    if description is not None:
        new_desc = description

    now = datetime.now().isoformat(sep=" ", timespec="seconds")
    db.execute(
        text("UPDATE sites SET site_code=:site_code, name=:name, domain_code=:code, description=:desc, "
             "updated_at=:updated WHERE id=:id"),
        {"site_code": new_site_code, "name": new_name, "code": new_domain, "desc": new_desc,
         "updated": now, "id": site_id},
    )
    db.commit()
    return get_site(site_id, db)


def delete_site(site_id: int, db: Session) -> bool:
    """사이트 삭제."""
    get_site(site_id, db)
    db.execute(text("DELETE FROM sites WHERE id = :id"), {"id": site_id})
    db.commit()
    return True
