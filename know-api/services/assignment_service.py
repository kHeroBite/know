"""데이터 할당 서비스 — 프리징/목록/할당/완료/사전등록"""
import os, logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException

logger = logging.getLogger(__name__)
WORKSPACE_BASE = "/home/know/apps/know-ops/workspace"


def synonym_파싱(workspace: str) -> list:
    """synonym.txt를 파싱하여 [{keyword, analysis}] 반환."""
    syn_path = os.path.join(WORKSPACE_BASE, workspace, "build", "work", "synonym.txt")
    if not os.path.isfile(syn_path):
        raise HTTPException(400, detail=f"synonym.txt 없음: {syn_path}")
    
    with open(syn_path, encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    
    blocks = []
    current_block = []
    for line in lines:
        stripped = line.rstrip("\r\n")
        if stripped.strip() == "":
            if current_block:
                # 첫 줄의 탭 앞 = keyword
                keyword = current_block[0].split("\t")[0].strip()
                if keyword and not keyword.startswith("comp "):
                    analysis = "\n".join(current_block)
                    blocks.append({"keyword": keyword, "analysis": analysis})
                current_block = []
        else:
            current_block.append(stripped)
    # 마지막 블록
    if current_block:
        keyword = current_block[0].split("\t")[0].strip()
        if keyword and not keyword.startswith("comp "):
            analysis = "\n".join(current_block)
            blocks.append({"keyword": keyword, "analysis": analysis})
    
    return blocks


def 프리징(db: Session, workspace: str, domain: str) -> dict:
    """synonym.txt → keyword_assignments INSERT (기존 데이터 DELETE 후)."""
    blocks = synonym_파싱(workspace)
    if not blocks:
        raise HTTPException(400, detail="키워드가 없습니다")
    
    # 기존 데이터 삭제
    db.execute(text("DELETE FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
               {"ws": workspace, "dom": domain})
    
    # INSERT
    for i, block in enumerate(blocks, 1):
        db.execute(text("""
            INSERT INTO keyword_assignments (workspace, domain, line_num, keyword, analysis, status)
            VALUES (:ws, :dom, :num, :kw, :anal, 'pending')
        """), {"ws": workspace, "dom": domain, "num": i, "kw": block["keyword"], "anal": block["analysis"]})
    
    db.commit()
    return {"total": len(blocks), "workspace": workspace, "domain": domain}


def 키워드목록(db: Session, workspace: str, domain: str, filter: str = "pending",
              page: int = 1, size: int = 50) -> dict:
    """키워드 목록 조회 (페이지네이션 + 필터)."""
    where = "workspace=:ws AND domain=:dom"
    params = {"ws": workspace, "dom": domain}
    
    if filter == "pending":
        where += " AND status='pending'"
    elif filter == "assigned":
        where += " AND status='assigned'"
    elif filter == "completed":
        where += " AND status='completed'"
    # filter == "all" → 조건 없음
    
    total = db.execute(text(f"SELECT COUNT(*) FROM keyword_assignments WHERE {where}"), params).scalar() or 0
    
    offset = (page - 1) * size
    rows = db.execute(text(f"""
        SELECT id, line_num, keyword, analysis, status, assigned_to, assigned_at, completed_at
        FROM keyword_assignments WHERE {where}
        ORDER BY line_num ASC LIMIT :limit OFFSET :offset
    """), {**params, "limit": size, "offset": offset}).fetchall()
    
    items = [{"id": r[0], "line_num": r[1], "keyword": r[2], "analysis": r[3],
              "status": r[4], "assigned_to": r[5], "assigned_at": r[6], "completed_at": r[7]} for r in rows]
    
    return {"items": items, "total": total, "page": page, "size": size}


def 통계(db: Session, workspace: str, domain: str) -> dict:
    """상태별 건수."""
    rows = db.execute(text("""
        SELECT status, COUNT(*) FROM keyword_assignments
        WHERE workspace=:ws AND domain=:dom GROUP BY status
    """), {"ws": workspace, "dom": domain}).fetchall()
    result = {"total": 0, "pending": 0, "assigned": 0, "completed": 0}
    for status, cnt in rows:
        result[status] = cnt
        result["total"] += cnt
    return result


def 할당받기(db: Session, workspace: str, domain: str, from_line: int, to_line: int, user_id: str) -> dict:
    """범위 내 pending 키워드를 user_id에게 할당."""
    now = datetime.now().isoformat()
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='assigned', assigned_to=:uid, assigned_at=:now
        WHERE workspace=:ws AND domain=:dom AND line_num >= :fr AND line_num <= :to AND status='pending'
    """), {"uid": user_id, "now": now, "ws": workspace, "dom": domain, "fr": from_line, "to": to_line})
    db.commit()
    return {"assigned": result.rowcount, "user_id": user_id, "from": from_line, "to": to_line}


def 완료처리(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """user_id에게 할당된 키워드를 완료 처리."""
    now = datetime.now().isoformat()
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='completed', completed_at=:now
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"now": now, "ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "user_id": user_id}
