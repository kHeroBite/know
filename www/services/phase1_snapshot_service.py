"""phase1 스냅샷 서비스 — 전처리 결과 보존/복원/목록 조회."""
from __future__ import annotations

import json
import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import text

from core.constants import WORKSPACE_BASE
from core.database import 세션팩토리

logger = logging.getLogger(__name__)

# 보관할 최대 스냅샷 수
MAX_SNAPSHOTS = 5

# 스냅샷에 포함할 work/ 파일 목록
WORK_FILES = ["keywords.txt", "refine.txt", "analyzed.txt", "transform.txt", "synonym.txt"]


def _work_dir(workspace: str) -> Path:
    return Path(WORKSPACE_BASE) / workspace / "build" / "work"


def _snapshots_dir(workspace: str) -> Path:
    return Path(WORKSPACE_BASE) / workspace / "build" / "__snapshots__"


def get_active_method(workspace: str) -> Optional[str]:
    """build/work/.method 마커 파일에서 현재 활성 method 읽기. 없으면 None."""
    marker = _work_dir(workspace) / ".method"
    try:
        if marker.exists():
            return marker.read_text(encoding="utf-8").strip()
    except Exception as e:
        logger.warning("[snapshot] .method 파일 읽기 실패: %s", e)
    return None


def get_other_method_keywords(workspace: str, current_method: str) -> set:
    """다른 method의 활성 refine.txt 키워드 셋 반환.

    우선순위:
    1. 다른 method의 가장 최근 스냅샷 refine.txt
    없으면 빈 set 반환 (dedup 스킵 → 안전)
    """
    other_method = "data" if current_method == "log" else "log"
    db = 세션팩토리()
    try:
        row = db.execute(text(
            "SELECT payload_path FROM phase1_snapshots "
            "WHERE workspace=:ws AND method=:method ORDER BY id DESC LIMIT 1"
        ), {"ws": workspace, "method": other_method}).fetchone()
    finally:
        db.close()

    if not row:
        return set()

    other_refine = Path(row[0]) / "refine.txt"
    if not other_refine.exists():
        logger.info("[snapshot] 다른 method 스냅샷 refine.txt 없음: %s", other_refine)
        return set()

    try:
        with open(other_refine, encoding="utf-8", errors="replace") as f:
            return {line.strip() for line in f if line.strip()}
    except Exception as e:
        logger.warning("[snapshot] 다른 method refine.txt 읽기 실패: %s", e)
        return set()


def archive_snapshot(workspace: str, method: str, domain: str) -> dict:
    """현재 work/ 파일 5종 + kw_{ws} JSON dump를 스냅샷으로 보존.

    Returns:
        {"snapshot_id": str, "kw_count": int, "created_at": str}
        파일 없으면 {"snapshot_id": None, "message": "결과 없음"}
    """
    work_dir = _work_dir(workspace)

    # work/ 파일 존재 확인
    existing = [f for f in WORK_FILES if (work_dir / f).exists()]
    if not existing:
        logger.info("[snapshot] archive 스킵: work/ 파일 없음 (workspace=%s)", workspace)
        return {"snapshot_id": None, "message": "결과 없음"}

    # snapshot_id 생성
    now = datetime.now()
    snapshot_id = f"{now.strftime('%Y%m%d_%H%M%S')}_{method}_{uuid.uuid4().hex[:6]}"
    payload_path = _snapshots_dir(workspace) / snapshot_id
    payload_path.mkdir(parents=True, exist_ok=True)

    # 파일 5종 복사
    for fname in WORK_FILES:
        src = work_dir / fname
        if src.exists():
            shutil.copy2(str(src), str(payload_path / fname))

    # kw_{ws} JSON dump (domain 필터)
    kw_count = 0
    kw_rows = []
    db = 세션팩토리()
    try:
        tbl = f"kw_{workspace}"
        try:
            rows = db.execute(text(
                f"SELECT id, domain, line_num, keyword, analysis, full_analysis, "
                f"status, assigned_to, assigned_at, completed_at, flag, created_at "
                f"FROM {tbl} WHERE domain=:dom"
            ), {"dom": domain}).fetchall()
            kw_rows = [
                {
                    "id": r[0], "domain": r[1], "line_num": r[2], "keyword": r[3],
                    "analysis": r[4], "full_analysis": r[5], "status": r[6],
                    "assigned_to": r[7], "assigned_at": r[8], "completed_at": r[9],
                    "flag": r[10], "created_at": r[11],
                }
                for r in rows
            ]
            kw_count = len(kw_rows)
        except Exception as e:
            logger.warning("[snapshot] kw_%s 조회 실패 (테이블 미존재 가능): %s", workspace, e)
    finally:
        db.close()

    kw_dump_path = payload_path / "kw_dump.json"
    with open(kw_dump_path, "w", encoding="utf-8") as f:
        json.dump(kw_rows, f, ensure_ascii=False, indent=2)

    # snapshot.json 메타 작성
    created_at = now.strftime("%Y-%m-%d %H:%M:%S")
    meta = {
        "snapshot_id": snapshot_id,
        "workspace": workspace,
        "domain": domain,
        "method": method,
        "created_at": created_at,
        "kw_count": kw_count,
        "files": existing,
    }
    with open(payload_path / "snapshot.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # DB INSERT
    db = 세션팩토리()
    try:
        db.execute(text(
            "INSERT INTO phase1_snapshots "
            "(snapshot_id, workspace, domain, method, created_at, payload_path, kw_count) "
            "VALUES (:sid, :ws, :dom, :method, :created_at, :path, :cnt)"
        ), {
            "sid": snapshot_id, "ws": workspace, "dom": domain, "method": method,
            "created_at": created_at, "path": str(payload_path), "cnt": kw_count,
        })
        db.commit()
        logger.info("[snapshot] archive 완료: %s (kw=%d)", snapshot_id, kw_count)

        # 5개 초과 시 oldest 자동 삭제
        _cleanup_old_snapshots(db, workspace, domain)
    finally:
        db.close()

    return {"snapshot_id": snapshot_id, "kw_count": kw_count, "created_at": created_at}


def _cleanup_old_snapshots(db, workspace: str, domain: str) -> None:
    """스냅샷이 MAX_SNAPSHOTS 초과 시 가장 오래된 것부터 삭제."""
    try:
        rows = db.execute(text(
            "SELECT id, snapshot_id, payload_path FROM phase1_snapshots "
            "WHERE workspace=:ws AND domain=:dom ORDER BY id ASC"
        ), {"ws": workspace, "dom": domain}).fetchall()

        if len(rows) <= MAX_SNAPSHOTS:
            return

        to_delete = rows[:len(rows) - MAX_SNAPSHOTS]
        for row in to_delete:
            row_id, sid, path = row[0], row[1], row[2]
            # 파일 디렉토리 삭제
            try:
                if path and Path(path).exists():
                    shutil.rmtree(str(path))
                    logger.info("[snapshot] 오래된 스냅샷 디렉토리 삭제: %s", path)
            except Exception as e:
                logger.warning("[snapshot] 디렉토리 삭제 실패: %s — %s", path, e)
            # DB row 삭제
            db.execute(text("DELETE FROM phase1_snapshots WHERE id=:id"), {"id": row_id})
            logger.info("[snapshot] 오래된 스냅샷 DB 삭제: id=%s, sid=%s", row_id, sid)

        db.commit()
    except Exception as e:
        logger.error("[snapshot] cleanup 실패: %s", e)


def list_snapshots(workspace: str) -> list:
    """최근 5개 스냅샷 조회 (created_at DESC).

    Returns:
        list of dict: id, snapshot_id, workspace, domain, method, created_at, kw_count
    """
    db = 세션팩토리()
    try:
        rows = db.execute(text(
            "SELECT id, snapshot_id, workspace, domain, method, created_at, kw_count "
            "FROM phase1_snapshots WHERE workspace=:ws "
            "ORDER BY id DESC LIMIT :limit"
        ), {"ws": workspace, "limit": MAX_SNAPSHOTS}).fetchall()
        return [
            {
                "id": r[0], "snapshot_id": r[1], "workspace": r[2],
                "domain": r[3], "method": r[4], "created_at": r[5], "kw_count": r[6],
            }
            for r in rows
        ]
    finally:
        db.close()


def restore_snapshot(workspace: str, snapshot_id: str) -> dict:
    """선택 스냅샷을 활성으로 복원.

    처리 순서:
    1. 현재 상태를 임시 스냅샷으로 archive
    2. 선택 스냅샷 payload_path 조회
    3. 파일 5종 → work/ 복사 (덮어쓰기)
    4. kw_dump.json → kw_{ws} bulk INSERT (기존 domain 데이터 삭제 후)

    Returns:
        {"restored": True, "snapshot_id": str, "kw_count": int}
    """
    db = 세션팩토리()
    try:
        row = db.execute(text(
            "SELECT id, snapshot_id, workspace, domain, method, payload_path, kw_count "
            "FROM phase1_snapshots WHERE workspace=:ws AND snapshot_id=:sid"
        ), {"ws": workspace, "sid": snapshot_id}).fetchone()
    finally:
        db.close()

    if not row:
        raise ValueError(f"스냅샷을 찾을 수 없음: {snapshot_id}")

    _, snap_id, ws, domain, method, payload_path, kw_count = row
    payload = Path(payload_path)

    if not payload.exists():
        raise ValueError(f"스냅샷 파일 없음: {payload_path}")

    # 현재 상태 임시 archive (실패해도 복원 계속 진행)
    current_method = get_active_method(workspace) or method
    try:
        archive_snapshot(workspace, current_method, domain)
    except Exception as e:
        logger.warning("[snapshot] 복원 전 현재 상태 archive 실패 (무시): %s", e)

    # work/ 디렉토리 확보
    work_dir = _work_dir(workspace)
    work_dir.mkdir(parents=True, exist_ok=True)

    # 파일 5종 복사 (덮어쓰기)
    for fname in WORK_FILES:
        src = payload / fname
        if src.exists():
            shutil.copy2(str(src), str(work_dir / fname))
        else:
            dst = work_dir / fname
            if dst.exists():
                dst.unlink()

    # .method 마커 복원
    try:
        (work_dir / ".method").write_text(method, encoding="utf-8")
    except Exception as e:
        logger.warning("[snapshot] .method 마커 복원 실패: %s", e)

    # kw_dump.json → kw_{ws} 복원
    kw_dump_path = payload / "kw_dump.json"
    restored_count = 0
    if kw_dump_path.exists():
        try:
            with open(kw_dump_path, encoding="utf-8") as f:
                kw_rows = json.load(f)

            tbl = f"kw_{workspace}"
            db = 세션팩토리()
            try:
                # 테이블 확보
                from services.assignment_service import ensure_kw_table
                ensure_kw_table(db, workspace)

                # 기존 domain 데이터 삭제 후 INSERT (트랜잭션)
                db.execute(text(f"DELETE FROM {tbl} WHERE domain=:dom"), {"dom": domain})
                for r in kw_rows:
                    db.execute(text(
                        f"INSERT OR IGNORE INTO {tbl} "
                        "(domain, line_num, keyword, analysis, full_analysis, "
                        "status, assigned_to, assigned_at, completed_at, flag, created_at) "
                        "VALUES (:domain, :line_num, :keyword, :analysis, :full_analysis, "
                        ":status, :assigned_to, :assigned_at, :completed_at, :flag, :created_at)"
                    ), {
                        "domain": r.get("domain", domain),
                        "line_num": r.get("line_num", 0),
                        "keyword": r.get("keyword", ""),
                        "analysis": r.get("analysis", ""),
                        "full_analysis": r.get("full_analysis", ""),
                        "status": r.get("status", "pending"),
                        "assigned_to": r.get("assigned_to"),
                        "assigned_at": r.get("assigned_at"),
                        "completed_at": r.get("completed_at"),
                        "flag": r.get("flag", ""),
                        "created_at": r.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    })
                db.commit()
                restored_count = len(kw_rows)
                logger.info("[snapshot] kw_%s 복원 완료: %d건", workspace, restored_count)
            finally:
                db.close()
        except Exception as e:
            logger.error("[snapshot] kw 복원 실패: %s", e)

    logger.info("[snapshot] restore 완료: %s (kw=%d)", snapshot_id, restored_count)
    return {"restored": True, "snapshot_id": snapshot_id, "kw_count": restored_count}
