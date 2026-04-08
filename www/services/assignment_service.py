"""데이터 assign 서비스 — freeze_service/list_tasks/assign/complete/사전등록"""
from __future__ import annotations
import os, logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException

from core.constants import WORKSPACE_BASE

logger = logging.getLogger(__name__)


import re as _re


def _extract_synonym_keywords(block_lines: list[str]) -> dict:
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


def parse_synonym(workspace: str) -> list:
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
                    synonym_info = _extract_synonym_keywords(current_block)
                    blocks.append({"keyword": keyword, "analysis": analysis, "synonym_info": synonym_info})
                current_block = []
        else:
            current_block.append(stripped)
    if current_block:
        keyword = current_block[0].split("\t")[0].strip()
        if keyword and not keyword.startswith("comp "):
            analysis = "\n".join(current_block)
            synonym_info = _extract_synonym_keywords(current_block)
            blocks.append({"keyword": keyword, "analysis": analysis, "synonym_info": synonym_info})

    return blocks


def _batch_full_analyze(keywords: list[str], workspace: str) -> dict[str, str]:
    """키워드 목록을 FullTest로 일괄 분석하여 {keyword: result} 반환.

    FullTest는 파일 기반이므로 키워드를 모아서 한 번에 처리.
    실패 시 빈 dict 반환 (프리징을 막지 않음).
    """
    import tempfile
    from pathlib import Path as P
    from services.workspace_service import get_jiana_home_path

    jiana_home = get_jiana_home_path(workspace)
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


def _merge_full_analyze_synonyms(block: dict, 풀분석결과: dict[str, str]) -> str:
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


def _check_full_analysis_column(db: Session) -> bool:
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


def freeze_service(db: Session, workspace: str, domain: str) -> dict:
    """refine.txt → keyword_assignments INSERT (기존 데이터 DELETE 후)."""
    refine_path = os.path.join(WORKSPACE_BASE, workspace, "build", "work", "refine.txt")
    if not os.path.isfile(refine_path):
        raise HTTPException(400, detail=f"refine.txt 없음: {refine_path}")

    with open(refine_path, encoding="utf-8", errors="replace") as f:
        keywords = [line.strip() for line in f if line.strip()]

    if not keywords:
        raise HTTPException(400, detail="키워드가 없습니다")

    # 기존 데이터 삭제
    db.execute(text("DELETE FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
               {"ws": workspace, "dom": domain})

    # INSERT (analysis='', full_analysis='')
    for i, kw in enumerate(keywords, 1):
        db.execute(text("""
            INSERT INTO keyword_assignments (workspace, domain, line_num, keyword, analysis, full_analysis, status)
            VALUES (:ws, :dom, :num, :kw, '', '', 'pending')
        """), {"ws": workspace, "dom": domain, "num": i, "kw": kw})

    db.commit()
    return {"total": len(keywords), "workspace": workspace, "domain": domain}


def list_keywords(db: Session, workspace: str, domain: str, filter: str = "pending",
              page: int = 1, size: int = 50, assigned_to: Optional[str] = None) -> dict:
    """키워드 list_tasks 조회 (페이지네이션 + 필터 + assigned_to)."""
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


def get_stats(db: Session, workspace: str, domain: str) -> dict:
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


def get_assignment(db: Session, workspace: str, domain: str, from_pos: int, to_pos: int, user_id: str) -> dict:
    """미complete list_tasks 내 순번(from_pos~to_pos) 기준으로 pending 키워드를 assign."""
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
        raise HTTPException(400, detail="assign 가능한 미complete 키워드가 없습니다")
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
            "message": f"{len(id_list)}건 assign complete"}


def update_flag_service(db: Session, keyword_id: int, flag: str, user_id: str) -> dict:
    """키워드 flag 업데이트 (R=읽음, W=작업complete, ''=미확인)."""
    db.execute(
        text("UPDATE keyword_assignments SET flag=:flag WHERE id=:id AND assigned_to=:uid"),
        {"flag": flag, "id": keyword_id, "uid": user_id},
    )
    db.commit()
    return {"id": keyword_id, "flag": flag}


def get_last_read_position(db: Session, workspace: str, domain: str, assigned_to: str, size: int = 100) -> dict:
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


def process_complete(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """user_id에게 할당된 키워드를 complete 처리."""
    now = datetime.now().isoformat()
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='completed', completed_at=:now
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"now": now, "ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "user_id": user_id}


def process_all_complete(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """할당된 모든 키워드를 complete(W) 처리 후 작업자 제거(반납)."""
    now = datetime.now().isoformat()
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='completed', flag='W', completed_at=:now, assigned_to=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"now": now, "ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "mode": "all_complete"}


def process_all_incomplete(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """할당된 모든 키워드를 미complete 처리 후 작업자 제거(반납) — pending으로 복귀."""
    result = db.execute(text("""
        UPDATE keyword_assignments SET status='pending', flag='', assigned_to=NULL, assigned_at=NULL, completed_at=NULL
        WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'
    """), {"ws": workspace, "dom": domain, "uid": user_id})
    db.commit()
    return {"completed": result.rowcount, "mode": "all_incomplete"}


def complete_by_history(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """현재 flag 상태 유지하고 작업자 제거(반납) — 작업한(W/R)은 completed, 나머지는 pending."""
    now = datetime.now().isoformat()
    # 작업complete(W) / 검토complete(R) 키워드 → completed
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


def process_complete_mode(db: Session, workspace: str, domain: str, user_id: str, mode: str) -> dict:
    """모드에 따라 process_complete 함수 분기."""
    if mode == "all_complete":
        return process_all_complete(db, workspace, domain, user_id)
    elif mode == "all_incomplete":
        return process_all_incomplete(db, workspace, domain, user_id)
    elif mode == "by_history":
        return complete_by_history(db, workspace, domain, user_id)
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"알 수 없는 mode: {mode}")


def reanalyze_after_build(workspace: str, domain: str) -> dict:
    """빌드 완료 후 3/4/5단계(분석→변환→유사어)를 재실행하여 keyword_assignments 업데이트.

    1. _sync_analyze → _sync_convert → _sync_synonym 순차 실행
    2. synonym.txt 파싱 → analysis 컬럼 UPDATE (lite)
    3. FullTest 배치 분석 → full_analysis 컬럼 UPDATE
    빌드 완료 후 새 사전 기반으로 재분석하기 위해 호출.
    """
    from core.database import 세션팩토리
    from phase1.executor import _sync_analyze, _sync_convert, _sync_synonym, WORKSPACE_BASE
    import os

    workspace_dir = os.path.join(WORKSPACE_BASE, workspace)
    refine_path = os.path.join(workspace_dir, "build", "work", "refine.txt")

    # refine.txt 없으면 재분석 불가
    if not os.path.isfile(refine_path):
        logger.warning("reanalyze_after_build: refine.txt 없음 (%s) — 스킵", refine_path)
        return {"skipped": True, "reason": "refine.txt 없음"}

    try:
        logger.info("reanalyze_after_build: 3단계(분석) 시작 — workspace=%s, domain=%s", workspace, domain)
        _sync_analyze(refine_path, domain, workspace_dir)

        logger.info("reanalyze_after_build: 4단계(변환) 시작")
        _sync_convert(refine_path, workspace_dir)

        logger.info("reanalyze_after_build: 5단계(유사어) 시작")
        _sync_synonym(refine_path, domain, workspace_dir)
    except Exception as e:
        logger.error("reanalyze_after_build: 전처리 단계 실패 — %s", e)
        return {"skipped": True, "reason": str(e)}

    # synonym.txt 파싱 → keyword_assignments.analysis 업데이트 (lite)
    try:
        blocks = parse_synonym(workspace)
    except Exception as e:
        logger.error("reanalyze_after_build: synonym.txt 파싱 실패 — %s", e)
        return {"skipped": True, "reason": f"synonym.txt 파싱 실패: {e}"}

    db = 세션팩토리()
    try:
        _check_full_analysis_column(db)

        # analysis 컬럼 업데이트 (lite)
        for block in blocks:
            db.execute(text("""
                UPDATE keyword_assignments SET analysis=:ana
                WHERE workspace=:ws AND domain=:dom AND keyword=:kw
            """), {"ana": block["analysis"], "ws": workspace, "dom": domain, "kw": block["keyword"]})
        db.commit()
        logger.info("reanalyze_after_build: analysis 업데이트 complete — %d건", len(blocks))

        # full_analysis 컬럼 업데이트 (FullTest 배치)
        keywords = [b["keyword"] for b in blocks]
        풀분석결과 = _batch_full_analyze(keywords, workspace)
        if 풀분석결과:
            full_count = 0
            for block in blocks:
                merged = _merge_full_analyze_synonyms(block, 풀분석결과)
                if merged:
                    db.execute(text("""
                        UPDATE keyword_assignments SET full_analysis=:fa
                        WHERE workspace=:ws AND domain=:dom AND keyword=:kw
                    """), {"fa": merged, "ws": workspace, "dom": domain, "kw": block["keyword"]})
                    full_count += 1
            db.commit()
            logger.info("reanalyze_after_build: full_analysis 업데이트 complete — %d건", full_count)
        else:
            full_count = 0
            logger.warning("reanalyze_after_build: FullTest 결과 없음 — full_analysis 업데이트 스킵")

        return {
            "workspace": workspace,
            "domain": domain,
            "analysis_updated": len(blocks),
            "full_analysis_updated": full_count,
        }
    finally:
        db.close()
