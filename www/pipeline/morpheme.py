# pipeline/morpheme.py — cotton_test.sh subprocess 래퍼 (asyncio 기반)
"""
실제 스크립트 경로: /home/know/jiana1.5.12/cotton_test.sh
  - JIANA_HOME=/home/know/jiana1.5.12/
  - JAVA_HOME=/home/know/jdk1.7.0_80
  - run_phase1_service: cotton_test.sh {입력파일} {출력파일}

타임아웃: 30분 (asyncio.wait_for)
stdout/stderr 스트리밍: 100자 단위로 Redis pub/sub 전송
returncode != 0 시 MorphemeError 예외 raise
"""
import asyncio
import logging
import os
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# 기본 서버 경로 (워크스페이스 jiana가 없을 때 ��용)
from core.constants import DEFAULT_JIANA_HOME
DEFAULT_COTTON_TEST_SH = os.path.join(DEFAULT_JIANA_HOME, "cotton_test.sh")
MORPHEME_OUTPUT_DIR = "/home/know/apps/know-ops/www/uploads/morpheme"

# analyze_morpheme 타임아웃: 30분
MORPHEME_TIMEOUT = 1800


class MorphemeError(Exception):
    """analyze_morpheme run_phase1_service 오류"""
    def __init__(self, message: str, returncode: int = -1, stderr: str = ""):
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


async def run_morpheme(
    input_file: str,
    pipeline_id: int,
    script_path: str = DEFAULT_COTTON_TEST_SH,
    timeout: int = MORPHEME_TIMEOUT,
) -> Dict[str, Any]:
    """cotton_test.sh를 asyncio subprocess로 run_phase1_service

    Args:
        input_file: 정제된 키워드 list_tasks 파일 경로
        pipeline_id: 파이프라인 ID (Redis 채널 및 출력 파일명에 사용)
        script_path: cotton_test.sh 경로 (기본값: 서버 실제 경로)
        timeout: run_phase1_service 타임아웃 초 (기본: 1800초 = 30분)

    Returns:
        dict:
            output_file  - analyze_morpheme 결과 파일 경로
            log          - run_phase1_service 로그 전체
            returncode   - 프로세스 종료 코드

    Raises:
        MorphemeError: 스크립트 run_phase1_service 실패 또는 타임아웃
    """
    os.makedirs(MORPHEME_OUTPUT_DIR, exist_ok=True)
    output_file = os.path.join(MORPHEME_OUTPUT_DIR, f"morpheme_{pipeline_id}.txt")

    if not os.path.exists(script_path):
        raise MorphemeError(f"cotton_test.sh 경로 없음: {script_path}")
    if not os.path.exists(input_file):
        raise MorphemeError(f"입력 파일 없음: {input_file}")

    cmd_args = ["bash", script_path, input_file, output_file]
    logger.info("analyze_morpheme run_phase1_service: %s", " ".join(cmd_args))

    try:
        result = await asyncio.wait_for(
            _run_with_streaming(cmd_args, pipeline_id),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise MorphemeError(
            f"analyze_morpheme 타임아웃 ({timeout}초 초과)",
            returncode=-1,
        )

    if result["returncode"] != 0:
        raise MorphemeError(
            f"cotton_test.sh 실패 (returncode={result['returncode']})",
            returncode=result["returncode"],
            stderr=result.get("stderr", ""),
        )

    logger.info("analyze_morpheme complete: output=%s", output_file)
    return {
        "output_file": output_file,
        "log": result["log"],
        "returncode": result["returncode"],
    }


async def _run_with_streaming(cmd_args: list, pipeline_id: int) -> Dict[str, Any]:
    """subprocess run_phase1_service + stdout/stderr 스트리밍 (100자 단위 Redis 발행)"""
    proc = await asyncio.create_subprocess_exec(
        *cmd_args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    log_parts = []
    stdout_buf = []
    stderr_buf = []

    async def read_stream(stream, buf: list, label: str):
        """스트림 읽기 + 100자 누적 시 Redis 발행"""
        accumulated = ""
        async for line in stream:
            text = line.decode("utf-8", errors="replace").rstrip()
            buf.append(text)
            log_parts.append(f"[{label}] {text}")
            accumulated += text + "\n"
            if len(accumulated) >= 100:
                _publish_log(pipeline_id, "morpheme", accumulated)
                accumulated = ""
        if accumulated:
            _publish_log(pipeline_id, "morpheme", accumulated)

    await asyncio.gather(
        read_stream(proc.stdout, stdout_buf, "OUT"),
        read_stream(proc.stderr, stderr_buf, "ERR"),
    )
    await proc.wait()

    return {
        "returncode": proc.returncode,
        "log": "\n".join(log_parts),
        "stderr": "\n".join(stderr_buf),
    }


def _publish_log(pipeline_id: int, stage: str, text: str):
    """Redis pub/sub으로 로그 스트리밍"""
    try:
        import redis, json
        from datetime import datetime
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
# 단독 run_phase1_service 테스트
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    if len(sys.argv) < 3:
        print(f"사용법: python -m pipeline.morpheme <입력파일> <pipeline_id>")
        sys.exit(1)
    _input_file = sys.argv[1]
    _pid = int(sys.argv[2])
    result = asyncio.run(run_morpheme(_input_file, _pid))
    print(f"complete: {result}")
