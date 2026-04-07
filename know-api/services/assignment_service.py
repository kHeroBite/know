"""데이터 할당 서비스 — 프리징/목록/할당/완료/사전등록"""
from __future__ import annotations
import os, logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException

logger = logging.getLogger(__name__)
WORKSPACE_BASE = "/home/know/apps/know-ops/workspace"


import re as _re


def _유사어키워드추출(block_lines: list[str]) -> dict:
    """분석 블록에서 유사어 정보를 구조화하여 추출.

    Returns:
        {
            "part_synonyms": [{"word": "미니", "synonyms": "MINI MINNIE"}, ...],
            "full_synonyms": "CHEESE 치이즈",  # <<>> 안의 내용
        }
    """
    part_syns = []
    full_syns = ""
    for line in block_lines:
        s = line.strip()
        # 부분 워드 유사어: "미니 <MINI MINNIE>"
        if "\t" not in s and not s.startswith("<<") and not s.startswith("comp "):
            m = _re.match(r'^(.+?)\s+<(.+?)>$', s)
            if m:
                part_syns.append({"word": m.group(1).strip(), "synonyms": m.group(2).strip()})
        # 전체 키워드 유사어: <<CHEESE 치이즈>>
        if s.startswith("<<") and s.endswith(">>"):
            full_syns = s[2:-2].strip()
    return {"part_synonyms": part_syns, "full_synonyms": full_syns}


def synonym_파싱(workspace: str) -> list:
    """synonym.txt를 파싱하여 [{keyword, analysis, synonym_info}] 반환."""
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
                keyword = current_block[0].split("\t")[0].strip()
                if keyword and not keyword.startswith("comp "):
                    analysis = "\n".join(current_block)
                    synonym_info = _유사어키워드추출(current_block)
                    blocks.append({"keyword": keyword, "analysis": analysis, "synonym_info": synonym_info})
                current_block = []
        else:
            current_block.append(stripped)
    if current_block:
        keyword = current_block[0].split("\t")[0].strip()
        if keyword and not keyword.startswith("comp "):
            analysis = "\n".join(current_block)
            synonym_info = _유사어키워드추출(current_block)
            blocks.append({"keyword": keyword, "analysis": analysis, "synonym_info": synonym_info})

    return blocks


def _배치_풀분석(keywords: list[str], workspace: str) -> dict[str, str]:
    """키워드 목록을 FullTest로 일괄 분석하여 {keyword: result} 반환.

    FullTest는 파일 기반이므로 키워드를 모아서 한 번에 처리.
    실패 시 빈 dict 반환 (프리징을 막지 않음).
    """
    import tempfile
    from pathlib import Path as P
    from services.workspace_service import jiana홈경로

    jiana_home = jiana홈경로(workspace)
    lib_path = f"{jiana_home}/lib"
    classpath = f"{lib_path}/jiana1.5.jar:{lib_path}/dqdic-1.0.3.jar"
    resource_path = f"{jiana_home}/resources/korean"

    if not keywords:
        return {}

    try:
        with tempfile.TemporaryDirectory(prefix="fulltest_batch_") as tmpdir:
            input_file = P(tmpdir) / "input.txt"
            output_file = P(tmpdir) / "output.txt"

            # 모든 키워드를 한 파일에 작성
            input_file.write_text("\n".join(keywords) + "\n", encoding="utf-8")

            import subprocess, os
            env = os.environ.copy()
            env["MARINER2_HOME"] = jiana_home

            proc = subprocess.run(
                ["java", "-classpath", classpath, "test.FullTest",
                 resource_path, str(input_file), str(output_file)],
                capture_output=True, text=False,
                timeout=300,  # 배치는 5분 타임아웃
                env=env, cwd=jiana_home,
            )

            if proc.returncode != 0 or not output_file.exists():
                logger.warning("FullTest 배치 실패 (rc=%d)", proc.returncode)
                return {}

            # 출력 파싱: 빈줄로 구분된 블록 → {keyword: result}
            raw = output_file.read_text(encoding="utf-8", errors="replace")
            결과: dict[str, str] = {}
            for block in raw.split("\n\n"):
                block = block.strip()
                if not block:
                    continue
                first_line = block.split("\n")[0]
                kw = first_line.split("\t")[0].strip() if "\t" in first_line else first_line.strip()
                결과[kw] = block

            return 결과

    except Exception as e:
        logger.warning("FullTest 배치 전처리 실패 (스킵): %s", e)
        return {}


def _풀분석_유사어병합(block: dict, 풀분석결과: dict[str, str]) -> str:
    """FullTest 결과에 유사어 정보를 심플 버전과 동일한 구조로 병합.

    결과 형식:
        치즈	치즈 ncn                    ← 원본 FullTest
        미니 <MINI MINNIE>              ← 부분 유사어 태그
        <<CHEESE 치이즈>>               ← 전체 유사어 태그
        CHEESE	CHEESE nq_per           ← 유사어의 FullTest 분석
        치이즈	치이즈 ncn               ← 유사어의 FullTest 분석
    """
    kw = block["keyword"]
    base = 풀분석결과.get(kw, "")
    if not base:
        return ""

    syn_info = block.get("synonym_info", {})
    lines = [base]

    # 부분 워드 유사어
    for ps in syn_info.get("part_synonyms", []):
        word = ps.get("word", "")
        synonyms = ps.get("synonyms", "")
        if word and synonyms:
            lines.append(f"{word} <{synonyms}>")

    # 전체 키워드 유사어
    full_syns = syn_info.get("full_synonyms", "")
    if full_syns:
        lines.append(f"<<{full_syns}>>")
        # 각 유사어의 FullTest 분석 결과 추가
        for syn in full_syns.split():
            syn = syn.strip()
            if syn and syn in 풀분석결과:
                lines.append(풀분석결과[syn])

    return "\n".join(lines)


def _full_analysis_컬럼확인(db: Session) -> bool:
    """full_analysis 컬럼 존재 여부 확인 + 없으면 추가."""
    try:
        db.execute(text("SELECT full_analysis FROM keyword_assignments LIMIT 0"))
        return True
    except Exception:
        db.rollback()
        try:
            db.execute(text("ALTER TABLE keyword_assignments ADD COLUMN full_analysis TEXT DEFAULT ''"))
            db.commit()
            return True
        except Exception:
            db.rollback()
            return False


def 프리징(db: Session, workspace: str, domain: str) -> dict:
    """synonym.txt → keyword_assignments INSERT (기존 데이터 DELETE 후)."""
    blocks = synonym_파싱(workspace)
    if not blocks:
        raise HTTPException(400, detail="키워드가 없습니다")

    # full_analysis 컬럼 확인
    has_full = _full_analysis_컬럼확인(db)

    # FullTest 배치 전처리 (실패해도 프리징은 계속)
    풀분석결과: dict[str, str] = {}
    if has_full:
        try:
            # 원본 키워드 + 유사어 키워드를 모두 수집하여 배치 분석
            all_keywords = set()
            for b in blocks:
                all_keywords.add(b["keyword"])
                syn_info = b.get("synonym_info", {})
                # 전체 유사어 키워드들
                for syn in syn_info.get("full_synonyms", "").split():
                    if syn.strip():
                        all_keywords.add(syn.strip())
                # 부분 유사어 키워드들
                for ps in syn_info.get("part_synonyms", []):
                    for syn in ps.get("synonyms", "").split():
                        if syn.strip():
                            all_keywords.add(syn.strip())
            풀분석결과 = _배치_풀분석(sorted(all_keywords), workspace)
            logger.info(f"FullTest 배치 완료: {len(풀분석결과)}/{len(all_keywords)}건 (원본 {len(blocks)} + 유사어)")
        except Exception as e:
            logger.warning(f"FullTest 배치 스킵: {e}")

    # 기존 데이터 삭제
    db.execute(text("DELETE FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
               {"ws": workspace, "dom": domain})

    # INSERT
    if has_full:
        for i, block in enumerate(blocks, 1):
            full_result = _풀분석_유사어병합(block, 풀분석결과)
            db.execute(text("""
                INSERT INTO keyword_assignments (workspace, domain, line_num, keyword, analysis, full_analysis, status)
                VALUES (:ws, :dom, :num, :kw, :anal, :full_anal, 'pending')
            """), {"ws": workspace, "dom": domain, "num": i, "kw": block["keyword"],
                   "anal": block["analysis"], "full_anal": full_result})
    else:
        for i, block in enumerate(blocks, 1):
            db.execute(text("""
                INSERT INTO keyword_assignments (workspace, domain, line_num, keyword, analysis, status)
                VALUES (:ws, :dom, :num, :kw, :anal, 'pending')
            """), {"ws": workspace, "dom": domain, "num": i, "kw": block["keyword"],
                   "anal": block["analysis"]})

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
    # full_analysis 컬럼 유무 확인
    try:
        db.execute(text("SELECT full_analysis FROM keyword_assignments LIMIT 0"))
        has_full = True
    except Exception:
        db.rollback()
        has_full = False

    if has_full:
        rows = db.execute(text(f"""
            SELECT id, line_num, keyword, analysis, status, assigned_to, assigned_at, completed_at, flag, full_analysis
            FROM keyword_assignments WHERE {where}
            ORDER BY line_num ASC LIMIT :limit OFFSET :offset
        """), {**params, "limit": size, "offset": offset}).fetchall()

        items = [{"id": r[0], "line_num": r[1], "keyword": r[2], "analysis": r[3],
                  "status": r[4], "assigned_to": r[5], "assigned_at": r[6], "completed_at": r[7],
                  "flag": r[8] or "", "full_analysis": r[9] or ""} for r in rows]
    else:
        rows = db.execute(text(f"""
            SELECT id, line_num, keyword, analysis, status, assigned_to, assigned_at, completed_at, flag
            FROM keyword_assignments WHERE {where}
            ORDER BY line_num ASC LIMIT :limit OFFSET :offset
        """), {**params, "limit": size, "offset": offset}).fetchall()

        items = [{"id": r[0], "line_num": r[1], "keyword": r[2], "analysis": r[3],
                  "status": r[4], "assigned_to": r[5], "assigned_at": r[6], "completed_at": r[7],
                  "flag": r[8] or "", "full_analysis": ""} for r in rows]
    
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


def 할당받기(db: Session, workspace: str, domain: str, from_pos: int, to_pos: int, user_id: str) -> dict:
    """미완료 목록 내 순번(from_pos~to_pos) 기준으로 pending 키워드를 할당."""
    now = datetime.now().isoformat()
    offset = max(0, from_pos - 1)
    limit = to_pos - from_pos + 1
    # pending 목록에서 순번 기준으로 대상 ID 조회
    ids = db.execute(text("""
        SELECT id FROM keyword_assignments
        WHERE workspace=:ws AND domain=:dom AND status='pending'
        ORDER BY line_num ASC LIMIT :lim OFFSET :off
    """), {"ws": workspace, "dom": domain, "lim": limit, "off": offset}).fetchall()
    if not ids:
        raise HTTPException(400, detail="할당 가능한 미완료 키워드가 없습니다")
    id_list = [r[0] for r in ids]
    placeholders = ",".join(f":id{i}" for i in range(len(id_list)))
    params = {"uid": user_id, "now": now}
    params.update({f"id{i}": v for i, v in enumerate(id_list)})
    db.execute(text(f"""
        UPDATE keyword_assignments SET status='assigned', assigned_to=:uid, assigned_at=:now
        WHERE id IN ({placeholders})
    """), params)
    db.commit()
    return {"assigned": len(id_list), "user_id": user_id,
            "message": f"{len(id_list)}건 할당 완료"}


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
    """현재 flag 상태 유지하고 작업자 제거(반납) — 작업한(W/R)은 completed, 나머지는 pending."""
    now = datetime.now().isoformat()
    # 작업완료(W) / 검토완료(R) 키워드 → completed
    db.execute(text("""
        UPDATE keyword_assignments SET status='completed', completed_at=:now, assigned_to=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned' AND flag IN ('W','R')
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
