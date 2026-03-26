"""Phase 1 서비스 — 파일 관리 + 실행 오케스트레이션"""
import os
import asyncio
import json
from datetime import datetime
from typing import Dict
from core.database import 세션팩토리

BUILD_DIR = "/home/know/apps/know-ops/build"
SCRIPTS_DIR = "/home/know/apps/know-ops/src"
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

class Phase1서비스:
    @staticmethod
    async def 파일목록(folder: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _list():
            dir_path = os.path.join(BUILD_DIR, folder)
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
    async def 파일저장(folder: str, filename: str, content: bytes) -> Dict:
        loop = asyncio.get_event_loop()
        def _write():
            dir_path = os.path.join(BUILD_DIR, folder)
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
    async def 파일삭제(folder: str, filename: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _delete():
            file_path = os.path.join(BUILD_DIR, folder, filename)
            if not os.path.exists(file_path):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"파일 없음: {filename}")
            os.remove(file_path)
            return {"deleted": True, "filename": filename}
        return await loop.run_in_executor(None, _delete)

    @staticmethod
    async def 실행DB등록(run_id: str, 요청) -> None:
        loop = asyncio.get_event_loop()
        def _insert():
            db = 세션팩토리()
            try:
                from sqlalchemy import text
                db.execute(text("""
                    INSERT INTO phase1_runs (run_id, domain, category, filename, start_step, end_step, status)
                    VALUES (:run_id, :domain, :category, :filename, :start_step, :end_step, 'pending')
                """), {
                    "run_id": run_id,
                    "domain": 요청.domain,
                    "category": 요청.category,
                    "filename": 요청.filename,
                    "start_step": 요청.start_step,
                    "end_step": 요청.end_step,
                })
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()
        await loop.run_in_executor(None, _insert)

    @staticmethod
    async def 실행(run_id: str, 요청) -> None:
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
            base_dir = os.path.join(BUILD_DIR, 요청.workspace) if 요청.workspace else BUILD_DIR
            file_path = os.path.join(base_dir, 요청.category, 요청.filename)
            from phase1.executor import phase1_실행
            await phase1_실행(run_id, 요청.domain, file_path, 요청.start_step, 요청.end_step, 요청.workspace)
            await loop.run_in_executor(None, _update_status, "completed", 요청.end_step, None)
        except Exception as e:
            await loop.run_in_executor(None, _update_status, "failed", -1, str(e))
