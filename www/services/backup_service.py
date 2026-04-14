"""backup_service.py — 도메인 사전 백업 목록/복원/삭제 서비스"""
from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text

from core.constants import DICT_BACKUP_DIR, DOMAIN_DIR

logger = logging.getLogger(__name__)


def _read_metadata(backup_dir: Path) -> dict[str, Any] | None:
    """backup_dir/metadata.json 읽기. 없으면 None."""
    meta_path = backup_dir / "metadata.json"
    if not meta_path.exists():
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def list_backups(domain: str) -> list[dict[str, Any]]:
    """DICT_BACKUP_DIR 스캔 → {domain}_* 패턴 + metadata.json 병합.

    Returns:
        [{name, path, timestamp, dict_counts, has_db_backup, files}, ...]
        시간 내림차순 정렬.
    """
    if not os.path.isdir(DICT_BACKUP_DIR):
        return []
    result: list[dict[str, Any]] = []
    prefix = f"{domain}_"
    for item in sorted(Path(DICT_BACKUP_DIR).iterdir()):
        if not item.is_dir():
            continue
        if not item.name.startswith(prefix):
            continue
        meta = _read_metadata(item)
        if meta:
            entry = {
                "name": item.name,
                "path": str(item),
                "timestamp": meta.get("timestamp", ""),
                "dict_counts": meta.get("dict_counts", {}),
                "has_db_backup": bool(meta.get("backup_tables")),
                "files": meta.get("files", []),
                "backup_tables": meta.get("backup_tables", []),
            }
        else:
            # 메타데이터 없음 — 디렉토리 mtime 기반
            try:
                mtime = datetime.fromtimestamp(item.stat().st_mtime).isoformat()
            except OSError:
                mtime = ""
            entry = {
                "name": item.name,
                "path": str(item),
                "timestamp": mtime,
                "dict_counts": {},
                "has_db_backup": False,
                "files": [],
                "backup_tables": [],
            }
        result.append(entry)
    # 타임스탬프 내림차순
    result.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return result


def _backup_current_state(domain: str, db) -> dict[str, Any]:
    """복원 전 현재 도메인 상태를 백업 (restore_backup의 skip_backup=False용).

    complete_workspace의 백업 로직과 유사하나 WS 역방향 복사/phase 전이는 하지 않음.
    """
    domain_path = Path(DOMAIN_DIR) / domain
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"{domain}_{timestamp_str}"
    backup_path = Path(DICT_BACKUP_DIR) / base_name
    if backup_path.exists():
        for i in range(1, 100):
            backup_path = Path(DICT_BACKUP_DIR) / f"{base_name}_{i:03d}"
            if not backup_path.exists():
                break
    backup_path.mkdir(parents=True, exist_ok=True)

    files: list[str] = []
    for item in ["data", "txt_resrc"]:
        src = domain_path / item
        if src.exists():
            shutil.copytree(str(src), str(backup_path / item), dirs_exist_ok=True)
            files.append(item)
    syn_src = domain_path / "synonym.UTF-8"
    if syn_src.exists():
        shutil.copy2(str(syn_src), str(backup_path / "synonym.UTF-8"))
        files.append("synonym.UTF-8")

    dict_counts = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    backup_tables: list[str] = []
    try:
        engine = db.get_bind()
        dst_site = domain.upper()
        type_map = [
            ("udic", "_UDIC"),
            ("cndic", "_CNDIC"),
            ("thesaurus", "_THESAURUS"),
            ("category", "_CATEGORY"),
        ]
        with engine.connect() as conn:
            for type_key, suffix in type_map:
                src_table = f"{dst_site}{suffix}"
                bak_table = f"BAK_{timestamp_str}_{dst_site}{suffix}"
                row = conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
                    {"n": src_table},
                ).fetchone()
                if not row:
                    continue
                conn.exec_driver_sql(
                    f"CREATE TABLE {bak_table} AS SELECT * FROM {src_table}"
                )
                cnt = conn.execute(
                    text(f"SELECT COUNT(*) FROM {bak_table}")
                ).scalar() or 0
                dict_counts[type_key] = int(cnt)
                backup_tables.append(bak_table)
            conn.commit()
    except Exception as e:
        logger.warning("현재상태 DB 백업 실패 (무시): %s", e)

    metadata = {
        "domain": domain,
        "ws_name": None,
        "timestamp": datetime.now().isoformat(),
        "dict_counts": dict_counts,
        "backup_tables": backup_tables,
        "files": files,
        "auto": True,
    }
    try:
        with open(backup_path / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
    except OSError as e:
        logger.warning("metadata.json 기록 실패: %s", e)

    return {"backup_path": str(backup_path), "metadata": metadata}


def _check_build_not_running(db) -> None:
    """build_history에 status=running인 레코드가 있으면 409 차단."""
    try:
        row = db.execute(
            text("SELECT id FROM build_history WHERE status='running' LIMIT 1")
        ).fetchone()
    except Exception as e:
        logger.warning("build_history 조회 실패 (무시): %s", e)
        return
    if row:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="빌드 진행 중에는 복원할 수 없습니다",
        )


def restore_backup(domain: str, backup_name: str, skip_backup: bool, db) -> dict[str, Any]:
    """백업 디렉토리에서 파일/DB를 도메인으로 복원.

    skip_backup=False이면 현재 상태를 자동 백업 후 복원.
    """
    _check_build_not_running(db)

    backup_path = Path(DICT_BACKUP_DIR) / backup_name
    if not backup_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"백업을 찾을 수 없습니다: {backup_name}",
        )

    auto_backup_path: str | None = None
    if not skip_backup:
        auto = _backup_current_state(domain, db)
        auto_backup_path = auto.get("backup_path")

    domain_path = Path(DOMAIN_DIR) / domain
    if not domain_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"도메인을 찾을 수 없습니다: {domain}",
        )

    # 파일 복원 (덮어쓰기)
    restored_files: list[str] = []
    for item in ["data", "txt_resrc"]:
        src = backup_path / item
        if src.exists():
            dst = domain_path / item
            if dst.exists():
                shutil.rmtree(str(dst))
            shutil.copytree(str(src), str(dst))
            restored_files.append(item)
    syn_src = backup_path / "synonym.UTF-8"
    if syn_src.exists():
        shutil.copy2(str(syn_src), str(domain_path / "synonym.UTF-8"))
        restored_files.append("synonym.UTF-8")

    # DB 복원 (BAK_ 테이블 → 원본 테이블)
    db_counts: dict[str, int] = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    meta = _read_metadata(backup_path) or {}
    backup_tables: list[str] = meta.get("backup_tables", [])
    if backup_tables:
        try:
            engine = db.get_bind()
            dst_site = domain.upper()
            suffix_to_type = {
                "_UDIC": "udic",
                "_CNDIC": "cndic",
                "_THESAURUS": "thesaurus",
                "_CATEGORY": "category",
            }
            with engine.connect() as conn:
                trans = conn.begin()
                try:
                    for bak_table in backup_tables:
                        # 백업 테이블 존재 확인
                        row = conn.execute(
                            text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
                            {"n": bak_table},
                        ).fetchone()
                        if not row:
                            logger.warning("백업 테이블 없음: %s", bak_table)
                            continue
                        # suffix 추출 → 원본 테이블 결정
                        matched_suffix = None
                        for suf in suffix_to_type.keys():
                            if bak_table.endswith(suf):
                                matched_suffix = suf
                                break
                        if not matched_suffix:
                            continue
                        dst_table = f"{dst_site}{matched_suffix}"
                        conn.execute(text(f"DELETE FROM {dst_table}"))
                        res = conn.execute(
                            text(f"INSERT INTO {dst_table} SELECT * FROM {bak_table}")
                        )
                        cnt = res.rowcount if res.rowcount is not None else 0
                        db_counts[suffix_to_type[matched_suffix]] = int(cnt)
                    trans.commit()
                except Exception:
                    trans.rollback()
                    raise
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("DB 복원 실패: %s", e)
            raise HTTPException(status_code=500, detail=f"DB 복원 실패: {e}")

    return {
        "restored_files": restored_files,
        "db_counts": db_counts,
        "auto_backup_path": auto_backup_path,
        "skip_backup": skip_backup,
    }


def delete_backup(domain: str, backup_name: str, db) -> dict[str, Any]:
    """백업 디렉토리 + 연관 BAK_ 테이블 삭제."""
    backup_path = Path(DICT_BACKUP_DIR) / backup_name
    if not backup_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"백업을 찾을 수 없습니다: {backup_name}",
        )
    # 도메인 소속 검증 (디렉토리 이름 prefix)
    if not backup_name.startswith(f"{domain}_"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"백업이 도메인 '{domain}'에 속하지 않습니다",
        )

    meta = _read_metadata(backup_path) or {}
    backup_tables: list[str] = meta.get("backup_tables", [])
    deleted_tables: list[str] = []
    if backup_tables:
        try:
            engine = db.get_bind()
            with engine.connect() as conn:
                for bak_table in backup_tables:
                    try:
                        conn.exec_driver_sql(f"DROP TABLE IF EXISTS {bak_table}")
                        deleted_tables.append(bak_table)
                    except Exception as e:
                        logger.warning("DROP TABLE 실패 (%s): %s", bak_table, e)
                conn.commit()
        except Exception as e:
            logger.warning("DB 테이블 삭제 실패 (무시): %s", e)

    # 디렉토리 제거
    try:
        shutil.rmtree(str(backup_path))
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"백업 디렉토리 삭제 실패: {e}")

    return {"deleted_tables": deleted_tables, "deleted_dir": str(backup_path)}
