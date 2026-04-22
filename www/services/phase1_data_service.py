"""Phase 1 데이터기반 전처리 서비스 — 사이트별 파일 관리 + 실행"""
import os
import asyncio
import logging
import json
from datetime import datetime
from typing import Dict

from core.constants import WORKSPACE_DIR
from core.database import 세션팩토리

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

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
        """데이터기반 전처리 실행 — 사이트별 파일 처리"""
        loop = asyncio.get_event_loop()

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

            workspace = 요청.workspace or ""
            folder = 요청.folder
            dir_path = _data_dir(workspace, folder)

            # 파일 목록 확인
            files = []
            if os.path.isdir(dir_path):
                files = [f for f in os.listdir(dir_path) if os.path.isfile(os.path.join(dir_path, f))]

            if not files:
                _publish_data(run_id, -1, "완료", 100, f"{folder}: 처리할 파일이 없습니다.", "failed")
                await loop.run_in_executor(None, _update_status, "failed", "파일 없음")
                return

            total = len(files)
            _publish_data(run_id, 1, "파일확인", 0, f"{folder}: 파일 {total}개 발견", "running")

            # 파일별 처리
            for idx, fname in enumerate(sorted(files)):
                percent = int((idx / total) * 80) + 10
                _publish_data(run_id, 1, "파일처리", percent,
                              f"처리 중: {fname} ({idx+1}/{total})", "running")
                await asyncio.sleep(0)  # 이벤트 루프 양보

            _publish_data(run_id, 1, "파일처리", 90,
                          f"{folder}: {total}개 파일 처리 완료", "running")

            # 완료 시그널
            _publish_data(run_id, -1, "완료", 100, f"{folder} 데이터기반 전처리 완료", "completed")
            await loop.run_in_executor(None, _update_status, "completed", None)

        except Exception as e:
            logger.error(f"Phase1Data run_data_service 실패: run_id={run_id}, error={e}", exc_info=True)
            try:
                _publish_data(run_id, -1, "오류", 0, str(e), "failed")
            except Exception:
                pass
            await loop.run_in_executor(None, _update_status, "failed", str(e))
