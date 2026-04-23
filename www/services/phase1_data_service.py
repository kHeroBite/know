"""Phase 1 데이터기반 전처리 서비스 — 사이트별 파일 관리 + 실행"""
import os
import asyncio
import logging
import json
import time
from datetime import datetime
from typing import Dict

from core.constants import WORKSPACE_DIR
from core.database import 세션팩토리

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

SITE_CONFIG = {
    "galleria": {
        "cwd": "/home/know/apps/data/galleria_db",
        "script": "ext_gal.sh",
        "subdir": "backup",
        "glob_prefix": "GALLERIA_DB",
        "glob_ext": ".UTF-8",
    },
    "hmall": {
        "cwd": "/home/know/apps/data/hmall_db",
        "script": "ext_hmall.sh",
        "subdir": "insert_bak01",
        "glob_prefix": "DV",
        "glob_ext": ".UTF-8",
    },
    "thd": {
        "cwd": "/home/know/apps/data/thd_db",
        "script": "ext_thd.sh",
        "subdir": ".",
        "glob_prefix": "HDSHOP_DB",
        "glob_ext": ".UTF-8",
    },
    "ssf": {
        "cwd": "/home/know/apps/data/ssf_db",
        "script": "ext_ssf.sh",
        "subdir": "insert_bak",
        "glob_prefix": "GOODS_DB",
        "glob_ext": ".UTF-8",
    },
}

_SSH_HOST = os.environ.get("PIPELINE_SSH_HOST", "133.186.132.245")
_SSH_USER = os.environ.get("PIPELINE_SSH_USER", "know")
_SSH_PASS = os.environ.get("PIPELINE_SSH_PASS", "ledge123!")

logger = logging.getLogger(__name__)


def _data_dir(workspace: str, folder: str) -> str:
    """워크스페이스별 data_input 폴더 경로 반환."""
    if workspace:
        return os.path.join(WORKSPACE_DIR, workspace, "build", "data_input", folder)
    return os.path.join(WORKSPACE_DIR, "default", "build", "data_input", folder)


def _publish_data(run_id: str, step_num: int, step_name: str, percent: int,
                  message: str, status: str, elapsed_sec: float = 0) -> None:
    """Redis pub/sub 발행 + DB 저장"""
    payload = {
        "run_id": run_id,
        "step_num": step_num,
        "step_name": step_name,
        "percent": percent,
        "message": message,
        "status": status,
        "elapsed_sec": round(elapsed_sec, 1),
        "ts": datetime.now().isoformat(),
    }
    # DB 저장
    try:
        from sqlalchemy import text
        db = 세션팩토리()
        db.execute(text(
            "INSERT INTO phase1_data_logs (run_id, step_num, step_name, percent, message, status, elapsed_sec) "
            "VALUES (:run_id, :step_num, :step_name, :percent, :message, :status, :elapsed_sec)"
        ), {
            "run_id": run_id, "step_num": step_num, "step_name": step_name,
            "percent": percent, "message": message, "status": status, "elapsed_sec": elapsed_sec,
        })
        db.commit()
        db.close()
    except Exception as e:
        logger.error(f"데이터 로그 DB 저장 실패: {e}")
    # Redis 발행
    try:
        import redis as sync_redis
        r = sync_redis.Redis(
            host=os.environ.get("REDIS_HOST", "127.0.0.1"),
            port=int(os.environ.get("REDIS_PORT", "6379")),
            db=int(os.environ.get("REDIS_DB", "0")),
        )
        r.publish(f"phase1_data:{run_id}", json.dumps(payload, ensure_ascii=False))
        r.close()
    except Exception as e:
        logger.error(f"Redis 발행 실패: {e}")


class Phase1Data서비스:

    @staticmethod
    async def list_files(folder: str, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()
        def _list():
            dir_path = _data_dir(workspace, folder)
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
            dir_path = _data_dir(workspace, folder)
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
    async def delete_file(folder: str, filename: str, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()
        def _delete():
            file_path = os.path.join(_data_dir(workspace, folder), filename)
            if not os.path.exists(file_path):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"파일 없음: {filename}")
            os.remove(file_path)
            return {"deleted": True, "filename": filename}
        return await loop.run_in_executor(None, _delete)

    @staticmethod
    async def register_execution_db(run_id: str, 요청) -> None:
        from sqlalchemy import text
        db = 세션팩토리()
        try:
            db.execute(text("""
                INSERT INTO phase1_data_runs (run_id, folder, workspace, status)
                VALUES (:run_id, :folder, :workspace, 'pending')
            """), {
                "run_id": run_id,
                "folder": 요청.folder,
                "workspace": 요청.workspace or "",
            })
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    async def run_data_service(run_id: str, 요청) -> None:
        """데이터기반 전처리 실행 — SSH로 서버 파이프라인 스크립트 실행"""
        loop = asyncio.get_event_loop()
        start_time = time.time()

        workspace = 요청.workspace or ""
        folder = 요청.folder

        def _update_status(status: str, error: str = None):
            try:
                from sqlalchemy import text
                db = 세션팩토리()
                db.execute(text(
                    "UPDATE phase1_data_runs SET status=:status, error_message=:error WHERE run_id=:run_id"
                ), {"status": status, "error": error, "run_id": run_id})
                db.commit()
                db.close()
            except Exception:
                pass

        try:
            await loop.run_in_executor(None, _update_status, "running", None)

            cfg = SITE_CONFIG.get(folder)
            if cfg is None:
                raise ValueError(f"지원하지 않는 폴더: {folder}")

            _publish_data(run_id, 1, "초기화", 5, f"{folder}: 파이프라인 준비 중", "running")

            # Step 1: 업로드 파일이 있으면 SSH(scp)로 서버 전송
            dir_path = _data_dir(workspace, folder)
            files = []
            if os.path.isdir(dir_path):
                files = sorted([
                    f for f in os.listdir(dir_path)
                    if os.path.isfile(os.path.join(dir_path, f))
                ])

            if files:
                _publish_data(run_id, 1, "파일전송", 10,
                              f"{folder}: 업로드 파일 {len(files)}개 서버 전송 중", "running")
                for idx, fname in enumerate(files):
                    local_path = os.path.join(dir_path, fname)
                    subdir = cfg["subdir"]
                    remote_name = f"{cfg['glob_prefix']}_f.{idx:04d}{cfg['glob_ext']}"
                    if subdir == ".":
                        remote_path = f"{cfg['cwd']}/{remote_name}"
                    else:
                        remote_path = f"{cfg['cwd']}/{subdir}/{remote_name}"
                    scp_cmd = [
                        "sshpass", "-p", _SSH_PASS,
                        "scp", "-o", "StrictHostKeyChecking=no",
                        local_path,
                        f"{_SSH_USER}@{_SSH_HOST}:{remote_path}",
                    ]
                    proc = await asyncio.create_subprocess_exec(
                        *scp_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
                    if proc.returncode != 0:
                        raise RuntimeError(
                            f"파일 전송 실패: {fname} → {stderr.decode('utf-8', errors='replace')}"
                        )
                _publish_data(run_id, 1, "파일전송", 20, f"{folder}: 파일 전송 완료", "running")
            else:
                _publish_data(run_id, 1, "파일확인", 15,
                              f"{folder}: 업로드 파일 없음, 서버 기존 데이터 사용", "running")

            # Step 2: SSH로 스크립트 실행
            _publish_data(run_id, 2, "스크립트실행", 25,
                          f"{folder}: {cfg['script']} 실행 시작", "running")
            ssh_cmd = [
                "sshpass", "-p", _SSH_PASS,
                "ssh", "-o", "StrictHostKeyChecking=no",
                f"{_SSH_USER}@{_SSH_HOST}",
                f"cd {cfg['cwd']} && sh {cfg['script']} 2>&1",
            ]
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            line_count = 0
            async for line in proc.stdout:
                line_str = line.decode("utf-8", errors="replace").rstrip()
                if line_str:
                    line_count += 1
                    percent = min(25 + line_count * 2, 85)
                    _publish_data(run_id, 2, "스크립트실행", percent, line_str, "running")

            await asyncio.wait_for(proc.wait(), timeout=600)
            elapsed = round(time.time() - start_time, 1)

            if proc.returncode != 0:
                raise RuntimeError(f"스크립트 종료코드: {proc.returncode}")

            _publish_data(run_id, -1, "완료", 100,
                          f"{folder} 데이터기반 전처리 완료 ({elapsed}초)", "completed",
                          elapsed_sec=elapsed)
            await loop.run_in_executor(None, _update_status, "completed", None)

        except Exception as e:
            logger.error(
                f"Phase1Data run_data_service 실패: run_id={run_id}, error={e}", exc_info=True
            )
            try:
                _publish_data(run_id, -1, "오류", 0, str(e), "failed")
            except Exception:
                pass
            await loop.run_in_executor(None, _update_status, "failed", str(e))
