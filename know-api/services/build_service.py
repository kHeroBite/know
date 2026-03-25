"""services/build_service.py — 사전 빌드 비즈니스 로직 서비스"""
from __future__ import annotations
import logging
import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.orm import Session

from models.pipeline import BuildHistory

logger = logging.getLogger(__name__)

# 사전 파일 경로 상수
JIANA_HOME = "/home/know/jiana1.5.12"
DICT_BACKUP_DIR = "/home/know/dict_backup"


class BuildService:
    # ──────────────────────────────────────────────
    # 빌드 시작
    # ──────────────────────────────────────────────
    def 빌드시작(
        self,
        db: Session,
        background_tasks: BackgroundTasks,
        domain: str,
        triggered_by: Optional[int] = None,
    ) -> dict:
        """사전 빌드 시작 (백그라운드 태스크)

        이미 빌드 중이면 409 반환.
        build_history 레코드 생성 후 background task로 실행.
        """
        실행중 = (
            db.query(BuildHistory)
            .filter(BuildHistory.domain == domain, BuildHistory.status == "running")
            .first()
        )
        if 실행중:
            raise HTTPException(
                status_code=409,
                detail=f"도메인 '{domain}'에 이미 빌드 중입니다. (id={실행중.id})",
            )

        bh = BuildHistory(
            domain=domain,
            build_type="full",
            status="running",
            started_at=datetime.now(),
            started_by=triggered_by,
        )
        db.add(bh)
        db.commit()
        db.refresh(bh)

        background_tasks.add_task(_run_build_background, bh.id, domain)

        logger.info("빌드 시작 등록: domain=%s, build_history_id=%s", domain, bh.id)
        return {
            "build_history_id": bh.id,
            "domain": domain,
            "status": "running",
            "started_at": bh.started_at.isoformat(),
            "message": "빌드가 시작되었습니다.",
        }

    # ──────────────────────────────────────────────
    # 빌드 상태 조회
    # ──────────────────────────────────────────────
    def 빌드상태(self, db: Session, domain: str) -> dict:
        """최신 BuildHistory 조회"""
        bh = (
            db.query(BuildHistory)
            .filter(BuildHistory.domain == domain)
            .order_by(BuildHistory.id.desc())
            .first()
        )
        if not bh:
            raise HTTPException(
                status_code=404, detail=f"도메인 '{domain}'의 빌드 이력이 없습니다."
            )
        return _bh_to_dict(bh)

    # ──────────────────────────────────────────────
    # 빌드 이력 (페이지네이션)
    # ──────────────────────────────────────────────
    def 빌드이력(
        self,
        db: Session,
        domain: str,
        page: int = 1,
        size: int = 20,
    ) -> dict:
        """BuildHistory 페이지네이션 + 이전/현재 row_count diff"""
        if page < 1:
            page = 1
        if size < 1 or size > 100:
            size = 20

        offset = (page - 1) * size
        q = db.query(BuildHistory).filter(BuildHistory.domain == domain)
        total = q.count()
        rows = q.order_by(BuildHistory.id.desc()).offset(offset).limit(size).all()

        items = []
        for i, bh in enumerate(rows):
            item = _bh_to_dict(bh)
            if i + 1 < len(rows):
                prev = rows[i + 1]
                if prev.entry_count is not None and bh.entry_count is not None:
                    item["entry_count_diff"] = bh.entry_count - prev.entry_count
                else:
                    item["entry_count_diff"] = None
            else:
                item["entry_count_diff"] = None
            items.append(item)

        return {
            "total": total,
            "page": page,
            "size": size,
            "domain": domain,
            "items": items,
        }

    # ──────────────────────────────────────────────
    # 사전 동기화
    # ──────────────────────────────────────────────
    def 사전동기화(self, db: Session, domain: str) -> dict:
        """사전 파일 동기화 (rsync 또는 cp fallback)"""
        src = os.path.join(DICT_BACKUP_DIR, domain)
        dst = os.path.join(JIANA_HOME, "dic")

        if not os.path.isdir(src):
            raise HTTPException(
                status_code=404,
                detail=f"동기화 소스 없음: {src}",
            )

        try:
            os.makedirs(dst, exist_ok=True)
            import subprocess
            result = subprocess.run(
                ["rsync", "-av", "--delete", f"{src}/", f"{dst}/"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                raise RuntimeError(f"rsync 실패: {result.stderr}")

            logger.info("사전 동기화 완료: %s → %s", src, dst)
            return {
                "domain": domain,
                "status": "ok",
                "message": f"사전 동기화 완료: {src} → {dst}",
                "output": result.stdout[:500] if result.stdout else "",
            }
        except FileNotFoundError:
            logger.warning("rsync 없음, shutil.copytree 사용")
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            return {
                "domain": domain,
                "status": "ok",
                "message": f"사전 동기화 완료 (cp): {src} → {dst}",
            }
        except Exception as exc:
            logger.error("사전 동기화 실패: %s", exc)
            raise HTTPException(status_code=500, detail=f"사전 동기화 오류: {exc}")

    # ──────────────────────────────────────────────
    # 사전 초기화
    # ──────────────────────────────────────────────
    def 사전초기화(self, db: Session, domain: str) -> dict:
        """사전 파일 초기화 (dic/ 디렉토리 비우기)"""
        dic_dir = os.path.join(JIANA_HOME, "dic")

        if not os.path.isdir(dic_dir):
            raise HTTPException(
                status_code=404,
                detail=f"사전 디렉토리 없음: {dic_dir}",
            )

        try:
            removed = []
            for fname in os.listdir(dic_dir):
                fpath = os.path.join(dic_dir, fname)
                if os.path.isfile(fpath):
                    os.remove(fpath)
                    removed.append(fname)
                elif os.path.isdir(fpath):
                    shutil.rmtree(fpath)
                    removed.append(fname + "/")

            logger.info("사전 초기화 완료: domain=%s, 제거=%d건", domain, len(removed))
            return {
                "domain": domain,
                "status": "ok",
                "message": f"사전 초기화 완료. {len(removed)}개 항목 제거.",
                "removed_count": len(removed),
            }
        except Exception as exc:
            logger.error("사전 초기화 실패: %s", exc)
            raise HTTPException(status_code=500, detail=f"사전 초기화 오류: {exc}")


# ──────────────────────────────────────────────────────────
# 내부 유틸
# ──────────────────────────────────────────────────────────

def _bh_to_dict(bh: BuildHistory) -> dict:
    return {
        "build_history_id": bh.id,
        "domain": bh.domain,
        "build_type": bh.build_type,
        "status": bh.status,
        "started_at": bh.started_at.isoformat() if bh.started_at else None,
        "completed_at": bh.completed_at.isoformat() if bh.completed_at else None,
        "started_by": bh.started_by,
        "output_path": bh.output_path,
        "file_size": bh.file_size,
        "entry_count": bh.entry_count,
    }


async def _run_build_background(build_history_id: int, domain: str):
    """BackgroundTask로 실행되는 빌드 래퍼"""
    try:
        from pipeline.build_wrapper import run_build
        await run_build(domain=domain, build_history_id=build_history_id)
    except Exception as exc:
        logger.error(
            "백그라운드 빌드 실패: domain=%s, build_history_id=%s, err=%s",
            domain,
            build_history_id,
            exc,
        )


# 싱글턴
build_service = BuildService()
