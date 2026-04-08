"""Phase 1 서비스 — 파일 관리 + run_phase1_service 오케스트레이션"""
import os
import asyncio
import logging
from datetime import datetime
from typing import Dict
from core.database import 세션팩토리

WORKSPACE_DIR = "/home/know/apps/know-ops/workspace"
BUILD_DIR = "/home/know/apps/know-ops/build"  # fallback (워크스페이스 미선택 시)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

logger = logging.getLogger(__name__)


def _build_dir(workspace: str, folder: str) -> str:
    """워크스페이스별 빌드 폴더 경로 반환."""
    if workspace:
        return os.path.join(WORKSPACE_DIR, workspace, "build", folder)
    return os.path.join(BUILD_DIR, folder)


class Phase1서비스:
    @staticmethod
    async def list_phase1_files(folder: str, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()
        def _list():
            dir_path = _build_dir(workspace, folder)
            os.makedirs(dir_path, exist_ok=True)
            files = []
            for fname in sorted(os.listdir(dir_path)):
                fp = os.path.join(dir_path, fname)
                if os.path.isfile(fp):
                    stat = os.stat(fp)
                    files.append({
                        "name": fname,
                        "size": stat.st_size,
                        "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
            return {"folder": folder, "files": files}
        return await loop.run_in_executor(None, _list)

    @staticmethod
    async def save_file(folder: str, filename: str, content: bytes, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()
        def _write():
            dir_path = _build_dir(workspace, folder)
            os.makedirs(dir_path, exist_ok=True)
            file_path = os.path.join(dir_path, filename)
            with open(file_path, 'wb') as f:
                f.write(content)
            stat = os.stat(file_path)
            return {
                "filename": filename,
                "size": stat.st_size,
                "saved_path": file_path,
                "uploaded_at": datetime.now().isoformat()
            }
        return await loop.run_in_executor(None, _write)

    @staticmethod
    async def delete_phase1_file(folder: str, filename: str, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()
        def _delete():
            file_path = os.path.join(_build_dir(workspace, folder), filename)
            if not os.path.exists(file_path):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"파일 없음: {filename}")
            os.remove(file_path)
            return {"deleted": True, "filename": filename}
        return await loop.run_in_executor(None, _delete)

    @staticmethod
    async def register_execution_db(run_id: str, 요청) -> None:
        # 파일 자동 선택: filename이 없으면 폴더의 최신 파일 사용
        resolved_filename = 요청.filename if 요청.filename else ""
        if not resolved_filename:
            folder_path = _build_dir(요청.workspace or "", 요청.category)
            if os.path.isdir(folder_path):
                found = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
                if found:
                    found.sort(key=lambda x: os.path.getmtime(os.path.join(folder_path, x)), reverse=True)
                    resolved_filename = found[0]
        domain_val = 요청.domain if 요청.domain else ""
        filename_val = resolved_filename if resolved_filename else "(auto)"
        db = 세션팩토리()
        try:
            from sqlalchemy import text
            db.execute(text("""
                INSERT INTO phase1_runs (run_id, domain, category, filename, start_step, end_step, status)
                VALUES (:run_id, :domain, :category, :filename, :start_step, :end_step, 'pending')
            """), {
                "run_id": run_id,
                "domain": domain_val,
                "category": 요청.category,
                "filename": filename_val,
                "start_step": 요청.start_step,
                "end_step": 요청.end_step,
            })
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        요청.filename = resolved_filename

    @staticmethod
    async def run_phase1_service(run_id: str, 요청) -> None:
        loop = asyncio.get_event_loop()
        def _update_status(status, step=-1, error=None):
            db = 세션팩토리()
            try:
                from sqlalchemy import text
                db.execute(text("""
                    UPDATE phase1_runs SET status=:status, current_step=:step, error_message=:error
                    WHERE run_id=:run_id
                """), {"status": status, "step": step, "error": error, "run_id": run_id})
                db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()

        try:
            await loop.run_in_executor(None, _update_status, "running", -1, None)
            folder_dir = _build_dir(요청.workspace or "", 요청.category)
            filename = 요청.filename or ""
            if not filename:
                if os.path.isdir(folder_dir):
                    files = [f for f in os.listdir(folder_dir) if os.path.isfile(os.path.join(folder_dir, f))]
                    if files:
                        files.sort(key=lambda f: os.path.getmtime(os.path.join(folder_dir, f)), reverse=True)
                        filename = files[0]
            file_path = os.path.join(folder_dir, filename) if filename else folder_dir
            logger.info(f"Phase1 run_phase1_service: run_id={run_id}, domain={요청.domain}, file_path={file_path}, "
                        f"steps={요청.start_step}-{요청.end_step}, workspace={요청.workspace}")
            from phase1.executor import run_phase1
            await run_phase1(run_id, 요청.domain or "", file_path, 요청.start_step, 요청.end_step, 요청.workspace or "", 요청.filter_mode, 요청.filter_value, 요청.sort_by, getattr(요청, "rank_value", 150000), getattr(요청, "count_value", 5))
            await loop.run_in_executor(None, _update_status, "completed", 요청.end_step, None)
        except Exception as e:
            logger.error(f"Phase1 run_phase1_service 실패: run_id={run_id}, error={e}", exc_info=True)
            await loop.run_in_executor(None, _update_status, "failed", -1, str(e))
