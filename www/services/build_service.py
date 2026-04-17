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

from core.constants import DEFAULT_JIANA_HOME, DICT_BACKUP_DIR


def ws_export_dict_file(db, workspace: str, domain: str, jiana_home: str) -> dict:
    """WS_ 사전 DB의 UDIC/CNDIC 데이터를 jiana txt_resrc 파일로 export.

    udic → txt_resrc/udic/user.ks
    cndic → txt_resrc/cndic/cnlist.ks
    """
    from models.dictionary import ws_dict_site_name
    from sqlalchemy import text

    site = ws_dict_site_name(workspace, domain)
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

    # THESAURUS → synonym.UTF-8 (공백 구분 형식: head tail1 tail2 ...)
    synonym_path = os.path.join(jiana_home, "synonym.UTF-8")
    try:
        rows = db.execute(text(f"SELECT _HEAD_WORD, _TAIL_WORD FROM {site}_THESAURUS")).fetchall()
        with open(synonym_path, "w", encoding="utf-8") as f:
            for head, tail in rows:
                if not head:
                    continue
                tails = [t.strip() for t in (tail or "").split(",") if t.strip()]
                if tails:
                    f.write(head.strip() + " " + " ".join(tails) + "\n")
        결과["thesaurus"] = len(rows)
        logger.info("사전 export: %s_THESAURUS → %s (%d건)", site, synonym_path, len(rows))
        # WS 루트에도 synonym.UTF-8 생성 (정책 #4 + 전처리 파일 우선 지원)
        from pathlib import Path
        ws_root = Path(jiana_home).parent
        ws_syn_path = ws_root / "synonym.UTF-8"
        shutil.copy2(synonym_path, str(ws_syn_path))
        logger.info("WS 루트 synonym.UTF-8 생성: %s", ws_syn_path)
    except Exception as e:
        logger.warning("THESAURUS export 실패: %s", e)
        결과["thesaurus_error"] = str(e)

    return 결과


class BuildService:
    # ──────────────────────────────────────────────
    # 빌드 시작
    # ──────────────────────────────────────────────
    def start_build_service(
        self,
        db: Session,
        background_tasks: BackgroundTasks,
        domain: str,
        triggered_by: Optional[int] = None,
        jiana_home: Optional[str] = None,
        workspace: Optional[str] = None,
    ) -> dict:
        """사전 빌드 시작 (백그라운드 태스크)

        이미 빌드 중이면 409 반환.
        build_history 레코드 생성 후 background task로 run_phase1_service.
        workspace가 있으면 ant dic 전 thesaurus export 수행.
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

        # 워크스페이스 상태에서 site_code 읽기 (없으면 사이트 목록에서 domain_code 역매핑)
        ws_site_code = None
        if workspace:
            try:
                from services.workspace_service import _read_state
                ws_state = _read_state()
                ws_info = ws_state.get(workspace, {})
                ws_site_code = ws_info.get("site_code")
                # site_code가 없으면 사이트 목록에서 domain_code로 역매핑
                if not ws_site_code and ws_info.get("domain"):
                    try:
                        from services.site_service import list_sites
                        for site in list_sites(db):
                            if site.get("domain_code", "").lower() == ws_info["domain"].lower():
                                ws_site_code = site.get("site_code")
                                break
                    except Exception:
                        pass
            except Exception:
                pass

        bh = BuildHistory(
            domain=domain,
            workspace=workspace or None,
            site_code=ws_site_code,
            build_type="full",
            status="running",
            started_at=datetime.now(),
            started_by=triggered_by,
        )
        db.add(bh)
        db.commit()
        db.refresh(bh)

        background_tasks.add_task(_run_build_background, bh.id, domain, jiana_home, workspace)

        logger.info("빌드 시작 등록: domain=%s, build_history_id=%s, workspace=%s", domain, bh.id, workspace)
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
    def get_build_status_service(self, db: Session, domain: str, workspace: Optional[str] = None) -> dict:
        """최신 BuildHistory 조회 (workspace 지정 시 해당 workspace의 빌드만)"""
        q = db.query(BuildHistory).filter(BuildHistory.domain == domain)
        if workspace:
            q = q.filter(BuildHistory.workspace == workspace)
        bh = q.order_by(BuildHistory.id.desc()).first()
        if not bh:
            raise HTTPException(
                status_code=404, detail=f"도메인 '{domain}'의 빌드 이력이 없습니다."
            )
        return _bh_to_dict(bh)

    # ──────────────────────────────────────────────
    # 빌드 이력 (페이지네이션)
    # ──────────────────────────────────────────────
    def get_build_history_service(
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
    def get_all_build_history_service(self, db: Session, size: int = 50) -> dict:
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
    def sync_dict_service(self, db: Session, domain: str) -> dict:
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

            logger.info("사전 동기화 complete: %s → %s", src, dst)
            return {
                "domain": domain,
                "status": "ok",
                "message": f"사전 동기화 complete: {src} → {dst}",
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
                "message": f"사전 동기화 complete (cp): {src} → {dst}",
            }
        except Exception as exc:
            logger.error("사전 동기화 실패: %s", exc)
            raise HTTPException(status_code=500, detail=f"사전 동기화 오류: {exc}")

    # ──────────────────────────────────────────────
    # 사전 initialize
    # ──────────────────────────────────────────────
    def reset_dict_service(self, db: Session, domain: str) -> dict:
        """사전 파일 initialize (dic/ 디렉토리 비우기)"""
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

            logger.info("사전 initialize complete: domain=%s, 제거=%d건", domain, len(removed))
            return {
                "domain": domain,
                "status": "ok",
                "message": f"사전 initialize complete. {len(removed)}개 항목 제거.",
                "removed_count": len(removed),
            }
        except Exception as exc:
            logger.error("사전 initialize 실패: %s", exc)
            raise HTTPException(status_code=500, detail=f"사전 initialize 오류: {exc}")


# ──────────────────────────────────────────────────────────
# 내부 유틸
# ──────────────────────────────────────────────────────────

def _estimate_build_percent(status: str, log_text: str) -> int:
    """log_text 단계 마커로 빌드 진행률(0~100) 추정."""
    if status in ("completed", "success"):
        return 100
    if status in ("failed", "cancelled"):
        return 0
    # running 상태에서 log 분석 (단계 마커 순서대로 체크)
    if "[재분석]" in log_text:
        return 95
    if "[3/3] data.tar 생성 complete" in log_text:
        return 90
    if "[3/3] data.tar 생성" in log_text:
        return 75
    if "[2/3]" in log_text:
        return 60
    if "[1/3] ant dic 컴파일 complete" in log_text:
        return 50
    if "[OUT]" in log_text:
        return 30  # ant dic 컴파일 진행 중
    if "[thesaurus export]" in log_text or "[1/3]" in log_text:
        return 15
    return 5  # 시작 직후


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
        "percent": _estimate_build_percent(bh.status, bh.log_text or ""),
        "row_count": bh.entry_count,          # entry_count → row_count (프론트 스펙)
        "prev_row_count": None,               # get_build_history_service() 에서 채움
        "started_at": bh.started_at.isoformat() if bh.started_at else None,
        "completed_at": bh.completed_at.isoformat() if bh.completed_at else None,
        "started_by": bh.started_by,
        "output_path": bh.output_path,
        "file_size": bh.file_size,
        "error_message": None,                # 확장 시 bh.error_message 매핑
        "log_text": bh.log_text or "",
    }


async def _run_build_background(build_history_id: int, domain: str, jiana_home: str = None, workspace: str = None):
    """BackgroundTask로 실행되는 빌드 래퍼 (스레드 풀에서 run_phase1_service)"""
    import asyncio
    try:
        from pipeline.build_wrapper import run_build
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: run_build(domain=domain, build_history_id=build_history_id, jiana_home=jiana_home, workspace=workspace))
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
