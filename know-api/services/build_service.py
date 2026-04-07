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
DEFAULT_JIANA_HOME = "/home/know/jiana1.5.12"
DICT_BACKUP_DIR = "/home/know/dict_backup"


def ws_사전_파일export(db, workspace: str, domain: str, jiana_home: str) -> dict:
    """WS_ 사전 DB의 UDIC/CNDIC 데이터를 jiana txt_resrc 파일로 export.

    udic → txt_resrc/udic/user.ks
    cndic → txt_resrc/cndic/cnlist.ks
    """
    from models.dictionary import ws_사전사이트명
    from sqlalchemy import text

    site = ws_사전사이트명(workspace, domain)
    결과 = {}

    # UDIC → user.ks
    udic_path = os.path.join(jiana_home, "txt_resrc", "udic", "user.ks")
    os.makedirs(os.path.dirname(udic_path), exist_ok=True)
    try:
        rows = db.execute(text(f"SELECT _WORD FROM {site}_UDIC ORDER BY _WORD")).scalars().all()
        with open(udic_path, "w", encoding="utf-8-sig") as f:  # BOM 포함
            for word in rows:
                if word and word.strip():
                    f.write(word.strip() + "\n")
        결과["udic"] = len(rows)
        logger.info("사전 export: %s_UDIC → %s (%d건)", site, udic_path, len(rows))
    except Exception as e:
        logger.warning("UDIC export 실패: %s", e)
        결과["udic_error"] = str(e)

    # CNDIC → cnlist.ks
    cndic_path = os.path.join(jiana_home, "txt_resrc", "cndic", "cnlist.ks")
    os.makedirs(os.path.dirname(cndic_path), exist_ok=True)
    try:
        rows = db.execute(text(f"SELECT _WORD FROM {site}_CNDIC ORDER BY _WORD")).scalars().all()
        with open(cndic_path, "w", encoding="utf-8") as f:
            for word in rows:
                if word and word.strip():
                    f.write(word.strip() + "\n")
        결과["cndic"] = len(rows)
        logger.info("사전 export: %s_CNDIC → %s (%d건)", site, cndic_path, len(rows))
    except Exception as e:
        logger.warning("CNDIC export 실패: %s", e)
        결과["cndic_error"] = str(e)

    return 결과


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
        jiana_home: Optional[str] = None,
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

        background_tasks.add_task(_run_build_background, bh.id, domain, jiana_home)

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
            # prev_row_count: 다음 항목(시간상 이전 빌드)의 entry_count
            if i + 1 < len(rows):
                prev = rows[i + 1]
                item["prev_row_count"] = prev.entry_count  # None 가능
            else:
                item["prev_row_count"] = None
            items.append(item)

        return {
            "total": total,
            "page": page,
            "size": size,
            "domain": domain,
            "items": items,
        }

    # ──────────────────────────────────────────────
    # 전체 빌드 이력 (도메인 통합)
    # ──────────────────────────────────────────────
    def 전체빌드이력(self, db: Session, size: int = 50) -> dict:
        """모든 도메인의 빌드 이력 통합 조회 (SQLite 직접)."""
        import sqlite3
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "know.db")
        conn = sqlite3.connect(db_path)
        try:
            cur = conn.execute(
                "SELECT id, domain, build_type, status, started_at, completed_at, "
                "started_by, output_path, file_size, entry_count "
                "FROM build_history ORDER BY id DESC LIMIT ?", (size,))
            rows = cur.fetchall()
        finally:
            conn.close()
        items = []
        agg = {}
        for r in rows:
            item = {
                "id": r[0], "domain": r[1], "build_type": r[2], "status": r[3],
                "started_at": r[4], "completed_at": r[5],
                "started_by": r[6], "output_path": r[7],
                "file_size": r[8], "row_count": r[9] or 0,
            }
            items.append(item)
            dom = r[1] or "unknown"
            if dom not in agg:
                agg[dom] = {"total": 0, "success": 0, "failed": 0}
            agg[dom]["total"] += 1
            if r[3] == "success":
                agg[dom]["success"] += 1
            elif r[3] == "failed":
                agg[dom]["failed"] += 1
        domain_stats = [{"domain": k, **v} for k, v in agg.items()]
        return {"items": items, "domain_stats": domain_stats}

    # ──────────────────────────────────────────────
    # 사전 동기화
    # ──────────────────────────────────────────────
    def 사전동기화(self, db: Session, domain: str) -> dict:
        """사전 파일 동기화 (rsync 또는 cp fallback)"""
        src = os.path.join(DICT_BACKUP_DIR, domain)
        dst = os.path.join(DEFAULT_JIANA_HOME, "dic")

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
        dic_dir = os.path.join(DEFAULT_JIANA_HOME, "dic")

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
    """BuildHistory → dict 변환 (프론트엔드 스펙 준수).

    프론트엔드(BuildHistory.tsx) 기대 필드:
      id, domain, status, row_count, prev_row_count, started_at, completed_at, error_message
    """
    return {
        "id": bh.id,
        "domain": bh.domain,
        "build_type": bh.build_type,
        "status": bh.status,
        "row_count": bh.entry_count,          # entry_count → row_count (프론트 스펙)
        "prev_row_count": None,               # 빌드이력() 에서 채움
        "started_at": bh.started_at.isoformat() if bh.started_at else None,
        "completed_at": bh.completed_at.isoformat() if bh.completed_at else None,
        "started_by": bh.started_by,
        "output_path": bh.output_path,
        "file_size": bh.file_size,
        "error_message": None,                # 확장 시 bh.error_message 매핑
        "log_text": bh.log_text or "",
    }


async def _run_build_background(build_history_id: int, domain: str, jiana_home: str = None):
    """BackgroundTask로 실행되는 빌드 래퍼 (스레드 풀에서 실행)"""
    import asyncio
    try:
        from pipeline.build_wrapper import run_build
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: run_build(domain=domain, build_history_id=build_history_id, jiana_home=jiana_home))
    except Exception as exc:
        logger.error(
            "백그라운드 빌드 실패: domain=%s, build_history_id=%s, err=%s",
            domain,
            build_history_id,
            exc,
        )
        # DB에 실패 상태 기록 (running → failed)
        try:
            from core.database import 세션팩토리
            from datetime import datetime
            db = 세션팩토리()
            bh = db.query(BuildHistory).filter_by(id=build_history_id).first()
            if bh and bh.status == "running":
                bh.status = "failed"
                bh.completed_at = datetime.now()
                bh.log_text = (bh.log_text or "") + f"\n[ERROR] {exc}"
                db.commit()
            db.close()
        except Exception:
            pass


# 싱글턴
build_service = BuildService()
