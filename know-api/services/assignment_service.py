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
              page: int = 1, size: int = 50, assigned_to: Optional[str] = None) -> dict:
    """키워드 목록 조회 (페이지네이션 + 필터 + assigned_to)."""
    where = "workspace=:ws AND domain=:dom"
    params = {"ws": workspace, "dom": domain}
    
    if filter == "pending":
        where += " AND status='pending'"
    elif filter == "assigned":
        where += " AND status='assigned'"
    elif filter == "completed":
        where += " AND status='completed'"
    # filter == "all" → 조건 없음
    
    if assigned_to:
        where += " AND assigned_to=:uid"
        params["uid"] = assigned_to
    
    total = db.execute(text(f"SELECT COUNT(*) FROM keyword_assignments WHERE {where}"), params).scalar() or 0

    worked_count = db.execute(text(
        f"SELECT COUNT(*) FROM keyword_assignments WHERE {where} AND flag != ''"
    ), params).scalar() or 0

    offset = (page - 1) * size
    rows = db.execute(text(f"""
        SELECT id, line_num, keyword, analysis, status, assigned_to, assigned_at, completed_at, flag
        FROM keyword_assignments WHERE {where}
        ORDER BY line_num ASC LIMIT :limit OFFSET :offset
    """), {**params, "limit": size, "offset": offset}).fetchall()
    
    items = [{"id": r[0], "line_num": r[1], "keyword": r[2], "analysis": r[3],
              "status": r[4], "assigned_to": r[5], "assigned_at": r[6], "completed_at": r[7],
              "flag": r[8] or ""} for r in rows]
    
    return {"items": items, "total": total, "page": page, "size": size, "worked_count": worked_count}


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


def flag_업데이트(db: Session, keyword_id: int, flag: str, user_id: str) -> dict:
    """키워드 flag 업데이트 (R=읽음, W=작업완료, ''=미확인)."""
    db.execute(
        text("UPDATE keyword_assignments SET flag=:flag WHERE id=:id AND assigned_to=:uid"),
        {"flag": flag, "id": keyword_id, "uid": user_id},
    )
    db.commit()
    return {"id": keyword_id, "flag": flag}


def 마지막읽은위치(db: Session, workspace: str, domain: str, assigned_to: str, size: int = 100) -> dict:
    """마지막으로 읽은(R/W) 키워드의 위치를 반환하여 해당 페이지부터 로딩할 수 있게 한다."""
    params = {"ws": workspace, "dom": domain, "uid": assigned_to}

    # 마지막 R/W 키워드 조회 (line_num DESC)
    row = db.execute(text("""
        SELECT id, line_num FROM keyword_assignments
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND flag IN ('R','W')
        ORDER BY line_num DESC LIMIT 1
    """), params).fetchone()

    if not row:
        return {"keyword_id": None, "page": 1}

    keyword_id, line_num = row[0], row[1]

    # 해당 키워드 앞에 몇 건이 있는지 (페이지 계산용)
    position = db.execute(text("""
        SELECT COUNT(*) FROM keyword_assignments
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid
        AND status='assigned' AND line_num < :ln
    """), {**params, "ln": line_num}).scalar() or 0

    page = max(1, (position // size) + 1)

    return {"keyword_id": keyword_id, "line_num": line_num, "page": page, "position": position}


def 완료처리(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """user_id에게 할당된 키워드를 완료 처리."""
    now = datetime.now().isoformat()
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='completed', completed_at=:now
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"now": now, "ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "user_id": user_id}


def 전체_완료처리(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """할당된 모든 키워드를 완료(W) 처리 후 작업자 제거(반납)."""
    now = datetime.now().isoformat()
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='completed', flag='W', completed_at=:now, assigned_to=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"now": now, "ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "mode": "all_complete"}


def 전체_미완료처리(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """할당된 모든 키워드를 미완료 처리 후 작업자 제거(반납) — pending으로 복귀."""
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='pending', flag='', assigned_to=NULL, assigned_at=NULL, completed_at=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "mode": "all_incomplete"}


def 작업이력대로_완료처리(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """현재 flag 상태 유지하고 작업자 제거(반납) — 작업한(W)은 completed, 나머지는 pending."""
    now = datetime.now().isoformat()
    # 작업완료(W) 키워드 → completed
    db.execute(text("""
        UPDATE keyword_assignments SET status='completed', completed_at=:now, assigned_to=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned' AND flag='W'
    """), {"now": now, "ws": workspace, "dom": domain, "uid": user_id})
    # 미작업 키워드 → pending 복귀
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='pending', assigned_to=NULL, assigned_at=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "mode": "by_history"}


def 작업완료모드처리(db: Session, workspace: str, domain: str, user_id: str, mode: str) -> dict:
    """모드에 따라 완료처리 함수 분기."""
    if mode == "all_complete":
        return 전체_완료처리(db, workspace, domain, user_id)
    elif mode == "all_incomplete":
        return 전체_미완료처리(db, workspace, domain, user_id)
    elif mode == "by_history":
        return 작업이력대로_완료처리(db, workspace, domain, user_id)
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"알 수 없는 mode: {mode}")
