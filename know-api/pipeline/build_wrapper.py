# pipeline/build_wrapper.py — antdic.sh subprocess 래퍼 (asyncio 기반)
"""
실제 스크립트 경로: /home/know/jiana1.5.12/antdic.sh
  - ant dic 실행 (ant 빌드 + FTP 전송 + data.tar 생성)
  - 동시 빌드 방지: asyncio.Lock (전역)
  - 빌드 완료 후 entry_count 확인

build_history 레코드 업데이트 포함.
"""
import asyncio
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# 실제 서버 경로 (서버 확인 결과: /home/know/jiana1.5.12/antdic.sh)
ANTDIC_SH = "/home/know/jiana1.5.12/antdic.sh"
JIANA_HOME = "/home/know/jiana1.5.12"

# 전역 빌드 Lock: 동시 빌드 방지
_build_lock = asyncio.Lock()

# 빌드 타임아웃: 1시간
BUILD_TIMEOUT = 3600


class BuildError(Exception):
    """사전 빌드 오류"""
    def __init__(self, message: str, returncode: int = -1, stderr: str = ""):
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


async def run_build(
    domain: str,
    pipeline_id: Optional[int] = None,
    build_history_id: Optional[int] = None,
    script_path: str = ANTDIC_SH,
    timeout: int = BUILD_TIMEOUT,
) -> Dict[str, Any]:
    """antdic.sh를 asyncio subprocess로 실행

    동시 빌드를 방지하기 위해 전역 asyncio.Lock 사용.
    build_history 테이블에 시작/완료/실패 상태를 기록.

    Args:
        domain: 사전 도메인 (예: 'autoever', 'base')
        pipeline_id: 파이프라인 ID (Redis 채널용, None이면 발행 생략)
        build_history_id: build_history.id (None이면 신규 생성)
        script_path: antdic.sh 경로 (기본값: 서버 실제 경로)
        timeout: 실행 타임아웃 초 (기본: 3600초 = 1시간)

    Returns:
        dict:
            output_path  - 빌드 결과물 경로 (data.tar)
            entry_count  - 빌드 결과 항목 수
            file_size    - data.tar 파일 크기 (bytes)
            log          - 빌드 로그 전체
            build_history_id - build_history.id

    Raises:
        BuildError: 빌드 실패 또는 타임아웃
    """
    if not os.path.exists(script_path):
        raise BuildError(f"antdic.sh 경로 없음: {script_path}")

    # DB에서 현재 빌드 중 여부 확인
    _bh_id = build_history_id or await _create_build_history(domain)

    # 전역 Lock 획득 (동시 빌드 방지)
    if _build_lock.locked():
        err_msg = "다른 빌드가 진행 중입니다. 잠시 후 다시 시도하세요."
        await _fail_build_history(_bh_id, err_msg)
        raise BuildError(err_msg)

    async with _build_lock:
        logger.info("빌드 시작: domain=%s, build_history_id=%s", domain, _bh_id)
        await _update_build_history(_bh_id, status="running")

        try:
            result = await asyncio.wait_for(
                _run_antdic(script_path, domain, pipeline_id),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            msg = f"빌드 타임아웃 ({timeout}초 초과)"
            await _fail_build_history(_bh_id, msg)
            raise BuildError(msg, returncode=-1)

        if result["returncode"] != 0:
            msg = f"antdic.sh 실패 (returncode={result['returncode']})"
            await _fail_build_history(_bh_id, msg, log_text=result.get("log", ""))
            raise BuildError(msg, returncode=result["returncode"],
                             stderr=result.get("stderr", ""))

        # 빌드 결과물 확인
        data_tar = os.path.join(JIANA_HOME, "data.tar")
        file_size = os.path.getsize(data_tar) if os.path.exists(data_tar) else None
        entry_count = await _count_entries(domain)

        await _update_build_history(
            _bh_id,
            status="completed",
            output_path=data_tar,
            file_size=file_size,
            entry_count=entry_count,
            log_text=result.get("log", ""),
        )

        logger.info("빌드 완료: domain=%s, entry_count=%s, file_size=%s",
                    domain, entry_count, file_size)
        return {
            "output_path": data_tar,
            "entry_count": entry_count,
            "file_size": file_size,
            "log": result.get("log", ""),
            "build_history_id": _bh_id,
        }


async def _run_antdic(script_path: str, domain: str,
                      pipeline_id: Optional[int]) -> Dict[str, Any]:
    """antdic.sh 실행 + 로그 스트리밍"""
    # antdic.sh는 JIANA_HOME 디렉토리에서 실행해야 함
    cmd = f"cd {JIANA_HOME} && bash {script_path}"
    logger.info("antdic.sh 실행: %s", cmd)

    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=JIANA_HOME,
    )

    log_parts = []
    stderr_buf = []

    async def read_stream(stream, buf: list, label: str):
        accumulated = ""
        async for line in stream:
            text = line.decode("utf-8", errors="replace").rstrip()
            buf.append(text)
            log_parts.append(f"[{label}] {text}")
            accumulated += text + "\n"
            if len(accumulated) >= 100:
                if pipeline_id is not None:
                    _publish_log(pipeline_id, "build", accumulated)
                accumulated = ""
        if accumulated and pipeline_id is not None:
            _publish_log(pipeline_id, "build", accumulated)

    await asyncio.gather(
        read_stream(proc.stdout, log_parts, "OUT"),
        read_stream(proc.stderr, stderr_buf, "ERR"),
    )
    await proc.wait()

    return {
        "returncode": proc.returncode,
        "log": "\n".join(log_parts),
        "stderr": "\n".join(stderr_buf),
    }


async def _count_entries(domain: str) -> Optional[int]:
    """빌드 결과 항목 수 조회 (dictionary 테이블)"""
    try:
        from core.database import SessionLocal
        db = SessionLocal()
        try:
            from sqlalchemy import text
            result = db.execute(
                text("SELECT COUNT(*) FROM dictionary WHERE domain = :domain"),
                {"domain": domain},
            ).scalar()
            return result
        finally:
            db.close()
    except Exception as e:
        logger.warning("entry_count 조회 실패: %s", e)
        return None


async def _create_build_history(domain: str) -> int:
    """build_history 신규 레코드 생성, ID 반환"""
    try:
        from core.database import SessionLocal
        from models.pipeline import BuildHistory
        db = SessionLocal()
        try:
            row = BuildHistory(domain=domain, build_type="full", status="running")
            db.add(row)
            db.commit()
            db.refresh(row)
            return row.id
        finally:
            db.close()
    except Exception as e:
        logger.warning("build_history 생성 실패: %s", e)
        return -1


async def _update_build_history(
    build_id: int,
    status: str,
    output_path: str = None,
    file_size: int = None,
    entry_count: int = None,
    log_text: str = None,
):
    """build_history 상태 업데이트"""
    if build_id < 0:
        return
    try:
        from core.database import SessionLocal
        from models.pipeline import BuildHistory
        db = SessionLocal()
        try:
            row = db.query(BuildHistory).filter_by(id=build_id).first()
            if row:
                row.status = status
                if status in ("completed", "failed"):
                    row.completed_at = datetime.now()
                if output_path:
                    row.output_path = output_path
                if file_size is not None:
                    row.file_size = file_size
                if entry_count is not None:
                    row.entry_count = entry_count
                if log_text:
                    row.log_text = (row.log_text or "") + log_text
                db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning("build_history 업데이트 실패: %s", e)


async def _fail_build_history(build_id: int, error_msg: str,
                               log_text: str = None):
    """build_history 실패 처리"""
    await _update_build_history(build_id, status="failed", log_text=
                                f"[오류] {error_msg}\n" + (log_text or ""))


def _publish_log(pipeline_id: int, stage: str, text: str):
    """Redis pub/sub으로 빌드 로그 스트리밍"""
    try:
        import redis, json
        r = redis.Redis(host="localhost", port=6379, db=0)
        payload = json.dumps({
            "stage": stage,
            "log": text,
            "ts": datetime.now().isoformat(),
        })
        r.publish(f"pipeline:{pipeline_id}", payload)
    except Exception as e:
        logger.debug("Redis log publish 실패: %s", e)


# ─────────────────────────────────────────────
# 단독 실행 테스트
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    domain_arg = sys.argv[1] if len(sys.argv) > 1 else "base"
    result = asyncio.run(run_build(domain_arg))
    print(f"빌드 결과: {result}")
