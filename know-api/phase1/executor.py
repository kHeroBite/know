"""Phase 1 단계별 실행기 — tasks.py 독립 구현 (import 없음)"""
import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Optional

WORKS_DIR = "/home/know/apps/bin/works_know"
JIANA_DIR = "/home/know/jiana1.5.12"

PHASE1_STEPS = {
    0: {"name": "파일선택",   "type": "noop"},
    1: {"name": "정제",       "type": "shell", "script": f"{WORKS_DIR}/refine_log.sh"},
    2: {"name": "형태소분석", "type": "shell", "script": f"{JIANA_DIR}/cotton_test.sh"},
    3: {"name": "등록",       "type": "db"},
    4: {"name": "빌드",       "type": "shell", "script": f"{JIANA_DIR}/antdic.sh"},
}

logger = logging.getLogger(__name__)

def _publish_phase1(run_id: str, step_num: int, step_name: str, percent: int, message: str, status: str) -> None:
    """Redis pub/sub 발행 — tasks.py _publish 독립 구현"""
    try:
        import redis as sync_redis
        r = sync_redis.Redis(
            host=os.environ.get("REDIS_HOST", "127.0.0.1"),
            port=int(os.environ.get("REDIS_PORT", "6379")),
            db=int(os.environ.get("REDIS_DB", "0")),
        )
        payload = json.dumps({
            "run_id": run_id,
            "step_num": step_num,
            "step_name": step_name,
            "percent": percent,
            "message": message,
            "status": status,
            "ts": datetime.now().isoformat(),
        }, ensure_ascii=False)
        r.publish(f"phase1:{run_id}", payload)
        r.close()
    except Exception as e:
        logger.error(f"Redis 발행 실패: {e}")

async def _run_shell(run_id: str, step_num: int, step: dict, file_path: str, domain: str) -> None:
    """shell 스크립트 실행 + stdout 스트리밍"""
    cmd = [step["script"], file_path, domain]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    assert proc.stdout is not None
    async for line in proc.stdout:
        decoded = line.decode("utf-8", errors="replace").rstrip()
        _publish_phase1(run_id, step_num, step["name"], 50, decoded, "running")
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"단계 {step_num}({step['name']}) 실패 (exit={proc.returncode})")

def _sync_register(domain: str, file_path: str) -> int:
    """동기 DB INSERT — SQLAlchemy 독립 세션 (tasks.py _do_register 미사용)"""
    from core.database import 세션팩토리
    from sqlalchemy import text
    db = 세션팩토리()
    count = 0
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"등록 파일 없음: {file_path}")
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = [line.strip() for line in f if line.strip()]
        table_name = f"dictionary_{domain}"
        for line in lines:
            word = line.split("\t")[0] if "\t" in line else line
            word = word.strip()
            if not word:
                continue
            try:
                db.execute(text(f"INSERT IGNORE INTO {table_name}(_WORD) VALUES (:w)"), {"w": word})
                count += 1
            except Exception:
                pass
        db.commit()
        return count
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

async def _run_register(run_id: str, step_num: int, step: dict, domain: str, file_path: str) -> None:
    """등록 단계 — run_in_executor로 동기 DB 작업 실행"""
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, _sync_register, domain, file_path)
    _publish_phase1(run_id, step_num, step["name"], 100, f"등록 완료: {count}건", "running")

async def phase1_실행(run_id: str, domain: str, file_path: str, start_step: int, end_step: int) -> None:
    """Phase 1 전체 파이프라인 실행 — 단계별 순차 실행"""
    for step_num in range(start_step, end_step + 1):
        step = PHASE1_STEPS.get(step_num)
        if step is None:
            continue

        if step["type"] == "noop":
            _publish_phase1(run_id, step_num, step["name"], 100, "파일 확인 완료", "completed")
            continue

        _publish_phase1(run_id, step_num, step["name"], 0, "시작", "running")
        try:
            if step["type"] == "shell":
                await _run_shell(run_id, step_num, step, file_path, domain)
            elif step["type"] == "db":
                await _run_register(run_id, step_num, step, domain, file_path)
            _publish_phase1(run_id, step_num, step["name"], 100, "완료", "completed")
        except Exception as e:
            _publish_phase1(run_id, step_num, step["name"], -1, str(e), "failed")
            raise
