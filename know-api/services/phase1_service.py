"""Phase 1 서비스 — 파일 관리 + 실행 오케스트레이션"""
import os
import shutil
import asyncio
import json
from datetime import datetime
from typing import Optional, List, Dict
from core.database import 세션팩토리

BUILD_DIR = "/home/know/apps/know-ops/build"
DOMAIN_DIR = "/home/know/apps/know-ops"
WORKSPACE_DIR = "/home/know/apps/know-ops/workspace"
PROTECTED_DIRS = {"build", "workspace", ".venv", "src", "site"}
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

WORKSPACE_SUBDIRS = ["build/popular", "build/fails", "fail_log", "pop_log", "work"]

def _make_workspace_subdirs(ws_dir: str) -> None:
    for sub in WORKSPACE_SUBDIRS:
        os.makedirs(os.path.join(ws_dir, sub), exist_ok=True)

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
            file_path = os.path.join(BUILD_DIR, 요청.category, 요청.filename)
            from phase1.executor import phase1_실행
            await phase1_실행(run_id, 요청.domain, file_path, 요청.start_step, 요청.end_step)
            await loop.run_in_executor(None, _update_status, "completed", 요청.end_step, None)
        except Exception as e:
            await loop.run_in_executor(None, _update_status, "failed", -1, str(e))

    # ─────────────────────────────────────────────
    # 도메인 관리
    # ─────────────────────────────────────────────

    @staticmethod
    async def 도메인목록() -> Dict:
        loop = asyncio.get_event_loop()
        def _list():
            os.makedirs(DOMAIN_DIR, exist_ok=True)
            folders = [
                d for d in sorted(os.listdir(DOMAIN_DIR))
                if os.path.isdir(os.path.join(DOMAIN_DIR, d))
                and d not in PROTECTED_DIRS
            ]
            return {"domains": folders}
        return await loop.run_in_executor(None, _list)

    @staticmethod
    async def 도메인복사(source: str, target: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _copy():
            if target in PROTECTED_DIRS:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=f"보호된 이름: {target}")
            src_dir = os.path.join(DOMAIN_DIR, source)
            if not os.path.exists(src_dir):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"도메인 없음: {source}")
            dst_dir = os.path.join(DOMAIN_DIR, target)
            if os.path.exists(dst_dir):
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail=f"이미 존재하는 도메인: {target}")
            shutil.copytree(src_dir, dst_dir)
            return {"copied": True, "source": source, "target": target}
        return await loop.run_in_executor(None, _copy)

    @staticmethod
    async def 도메인삭제(name: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _delete():
            if name in PROTECTED_DIRS:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=f"보호된 이름: {name}")
            dir_path = os.path.join(DOMAIN_DIR, name)
            if not os.path.exists(dir_path):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"도메인 없음: {name}")
            shutil.rmtree(dir_path)
            return {"deleted": True, "name": name}
        return await loop.run_in_executor(None, _delete)

    @staticmethod
    async def 도메인적용(domain_name: str, workspace_name: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _apply():
            src_dir = os.path.join(DOMAIN_DIR, domain_name)
            if not os.path.exists(src_dir):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"도메인 없음: {domain_name}")
            ws_dir = os.path.join(WORKSPACE_DIR, workspace_name)
            _make_workspace_subdirs(ws_dir)
            copied = 0
            for item in os.listdir(src_dir):
                s = os.path.join(src_dir, item)
                d = os.path.join(ws_dir, item)
                if os.path.isfile(s):
                    shutil.copy2(s, d)
                    copied += 1
                elif os.path.isdir(s):
                    if os.path.exists(d):
                        shutil.rmtree(d)
                    shutil.copytree(s, d)
                    copied += 1
            return {"applied": True, "domain": domain_name, "workspace": workspace_name, "copied": copied}
        return await loop.run_in_executor(None, _apply)

    # ─────────────────────────────────────────────
    # 워크스페이스 관리
    # ─────────────────────────────────────────────

    @staticmethod
    async def 워크스페이스목록() -> Dict:
        loop = asyncio.get_event_loop()
        def _list():
            os.makedirs(WORKSPACE_DIR, exist_ok=True)
            folders = [
                d for d in sorted(os.listdir(WORKSPACE_DIR))
                if os.path.isdir(os.path.join(WORKSPACE_DIR, d))
            ]
            return {"workspaces": folders}
        return await loop.run_in_executor(None, _list)

    @staticmethod
    async def 워크스페이스생성(name: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _create():
            if name in PROTECTED_DIRS:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=f"보호된 이름: {name}")
            ws_dir = os.path.join(WORKSPACE_DIR, name)
            if os.path.exists(ws_dir):
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail=f"이미 존재하는 워크스페이스: {name}")
            _make_workspace_subdirs(ws_dir)
            return {"created": True, "name": name}
        return await loop.run_in_executor(None, _create)

    @staticmethod
    async def 워크스페이스삭제(name: str) -> Dict:
        loop = asyncio.get_event_loop()
        def _delete():
            if name in PROTECTED_DIRS:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=f"보호된 이름: {name}")
            ws_dir = os.path.join(WORKSPACE_DIR, name)
            if not os.path.exists(ws_dir):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"워크스페이스 없음: {name}")
            shutil.rmtree(ws_dir)
            return {"deleted": True, "name": name}
        return await loop.run_in_executor(None, _delete)
