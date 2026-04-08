# pipeline/build_wrapper.py — Python 직접 구현 (antdic.sh 의존 제거)
"""
antdic.sh 4단계를 Python으로 직접 구현:
  1) FTP 다운로드 (ftpinfo.txt 파싱 → ftplib)
  2) ant dic 컴파일 (subprocess)
  3) data.tar 삭제 (os.remove)
  4) data.tar 생성 (tarfile)

동시 빌드 방지: threading.Lock (전역)
빌드 complete 후 entry_count 확인
build_history 레코드 업데이트 포함.
"""
import ftplib
import logging
import os
import subprocess
import tarfile
import threading
import time
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_JIANA_HOME = "/home/know/jiana1.5.12"


# 전역 빌드 Lock: 동시 빌드 방지 (threading.Lock — Celery worker sync 환경)
_build_lock = threading.Lock()

# 현재 빌드 프로세스 추적 (중지용)
_current_proc: Optional[subprocess.Popen] = None
_build_cancelled = threading.Event()

# 빌드 타임아웃: 1시간
BUILD_TIMEOUT = 3600


def cancel_build() -> bool:
    """진행 중인 빌드를 중지한다. DB도 cancelled로 업데이트."""
    global _current_proc
    _build_cancelled.set()
    killed = False
    if _current_proc and _current_proc.poll() is None:
        _current_proc.kill()
        logger.info("빌드 프로세스 강제 종료: PID=%s", _current_proc.pid)
        killed = True
    # DB에서 running 상태인 빌드를 cancelled로 업데이트
    try:
        from core.database import SessionLocal
        from models.pipeline import BuildHistory
        db = SessionLocal()
        try:
            rows = db.query(BuildHistory).filter_by(status="running").all()
            for row in rows:
                row.status = "cancelled"
                row.completed_at = datetime.now()
                row.log_text = (row.log_text or "") + "\n[중지] 사용자에 의해 빌드가 중지되었습니다."
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning("cancel DB 업데이트 실패: %s", e)
    return killed or len(rows) > 0 if 'rows' in dir() else killed


class BuildError(Exception):
    """사전 빌드 오류"""
    def __init__(self, message: str, returncode: int = -1, stderr: str = ""):
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


def run_build(
    domain: str,
    pipeline_id: Optional[int] = None,
    build_history_id: Optional[int] = None,
    timeout: int = BUILD_TIMEOUT,
    jiana_home: Optional[str] = None,
    workspace: Optional[str] = None,
) -> Dict[str, Any]:
    """antdic 4단계를 Python으로 직접 run_phase1_service

    동시 빌드를 방지하기 위해 전역 threading.Lock 사용.
    build_history 테이블에 시작/complete/실패 상태를 기록.

    Args:
        domain: 사전 도메인 (예: 'autoever', 'base')
        pipeline_id: 파이프라인 ID (Redis 채널용, None이면 발행 생략)
        build_history_id: build_history.id (None이면 신규 생성)
        timeout: ant dic 컴파일 타임아웃 초 (기본: 3600초 = 1시간)
        workspace: 워크스페이스 이름 (예: 'A', 'B'). 지정 시 ant dic 전 thesaurus export 수행.

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
    build_home = jiana_home or DEFAULT_JIANA_HOME
    if not os.path.exists(os.path.join(build_home, "build.xml")):
        raise BuildError(f"build.xml 경로 없음: {build_home}/build.xml")

    # DB에서 현재 빌드 중 여부 확인
    _bh_id = build_history_id or _create_build_history(domain)

    # 전역 Lock 획득 시도 (non-blocking)
    if not _build_lock.acquire(blocking=False):
        err_msg = "다른 빌드가 진행 중입니다. 잠시 후 다시 시도하세요."
        _fail_build_history(_bh_id, err_msg)
        raise BuildError(err_msg)

    _build_cancelled.clear()
    try:
        logger.info("빌드 시작: domain=%s, build_history_id=%s, workspace=%s", domain, _bh_id, workspace)
        _update_build_history(_bh_id, status="running")

        # ant dic 빌드 전 thesaurus export (workspace 지정 시)
        if workspace:
            _export_thesaurus_before_build(workspace, domain, build_home, _bh_id, pipeline_id)

        try:
            result = _run_antdic(domain, pipeline_id, timeout, _bh_id, build_home)
        except subprocess.TimeoutExpired:
            msg = f"빌드 타임아웃 ({timeout}초 초과)"
            _fail_build_history(_bh_id, msg)
            raise BuildError(msg, returncode=-1)

        if result["returncode"] != 0:
            msg = f"antdic 빌드 실패 (returncode={result['returncode']})"
            _fail_build_history(_bh_id, msg, log_text=result.get("log", ""))
            raise BuildError(msg, returncode=result["returncode"],
                             stderr=result.get("stderr", ""))

        # 빌드 결과물 확인
        data_tar = os.path.join(build_home, "data.tar")
        file_size = os.path.getsize(data_tar) if os.path.exists(data_tar) else None
        entry_count = _count_entries(domain)

        _update_build_history(
            _bh_id,
            status="completed",
            output_path=data_tar,
            file_size=file_size,
            entry_count=entry_count,
            log_text=result.get("log", ""),
        )

        logger.info("빌드 complete: domain=%s, entry_count=%s, file_size=%s",
                    domain, entry_count, file_size)
        return {
            "output_path": data_tar,
            "entry_count": entry_count,
            "file_size": file_size,
            "log": result.get("log", ""),
            "build_history_id": _bh_id,
        }
    finally:
        _build_lock.release()


def _run_antdic(domain: str, pipeline_id: Optional[int],
                timeout: int, build_history_id: Optional[int] = None,
                build_home: str = DEFAULT_JIANA_HOME) -> Dict[str, Any]:
    """antdic 4단계를 Python으로 직접 구현

    antdic.sh가 수행하던 작업을 Python으로 대체:
      [1/4] FTP 다운로드 (ftpinfo.txt 파싱 → ftplib)
      [2/4] ant dic 컴파일 (subprocess)
      [3/4] 기존 data.tar 삭제 (os.remove)
      [4/4] data.tar 생성 (tarfile)
    """
    logs = []
    data_tar = os.path.join(build_home, "data.tar")

    # ── [1/3] ant dic 컴파일 ────────────────────────────────────
    logger.info("[1/3] ant dic 컴파일 시작 (경로: %s)", build_home)
    logs.append(f"[1/3] ant dic 컴파일... (경로: {build_home})")
    _publish_log(pipeline_id, "build", "\n".join(logs), domain=domain)
    global _current_proc
    ant_err_lines = []
    try:
        _current_proc = subprocess.Popen(
            ["ant", "dic"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            cwd=build_home,
        )
        # stdout 라인별 실시간 읽기 + 즉시 publish
        start_time = time.time()
        line_count = 0
        while True:
            if _build_cancelled.is_set():
                _current_proc.kill()
                break
            if time.time() - start_time > timeout:
                _current_proc.kill()
                _current_proc = None
                raise subprocess.TimeoutExpired("ant dic", timeout)
            line_bytes = _current_proc.stdout.readline()
            if not line_bytes and _current_proc.poll() is not None:
                break
            if line_bytes:
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                if line:
                    logs.append(f"[OUT] {line}")
                    line_count += 1
                    full_log = "\n".join(logs)
                    _publish_log(pipeline_id, "build", full_log, domain=domain)
                    # 5줄마다 DB에 중간 저장 (폴링 fallback용)
                    if build_history_id and line_count % 5 == 0:
                        _update_build_history(build_history_id, log_text=full_log)
        # stderr는 stdout에 병합됨 (stderr=STDOUT)
        proc_returncode = _current_proc.returncode
        _current_proc = None
    except subprocess.TimeoutExpired:
        raise

    if _build_cancelled.is_set():
        logs.append("[중지] 사용자에 의해 빌드가 중지되었습니다.")
        full_log = "\n".join(logs)
        _publish_log(pipeline_id, "build", full_log, domain=domain)
        _update_build_history(_bh_id, status="cancelled", log_text=full_log)
        return {"returncode": -2, "log": full_log, "stderr": "cancelled"}

    if proc_returncode != 0:
        full_log = "\n".join(logs)
        _publish_log(pipeline_id, "build", full_log, domain=domain)
        return {"returncode": proc_returncode, "log": full_log, "stderr": "\n".join(ant_err_lines)}
    logger.info("[1/3] ant dic 컴파일 complete")

    # ── [2/3] 기존 data.tar 삭제 ────────────────────────────────
    logger.info("[2/3] 기존 data.tar 삭제")
    logs.append("[1/3] ant dic 컴파일 complete")
    logs.append("[2/3] 기존 data.tar 삭제...")
    _publish_log(pipeline_id, "build", "\n".join(logs), domain=domain)
    if os.path.exists(data_tar):
        os.remove(data_tar)
        logs.append(f"  삭제 complete: {data_tar}")
    else:
        logs.append(f"  {data_tar} 없음 (건너뜀)")

    # ── [3/3] data.tar 생성 ─────────────────────────────────────
    logger.info("[3/3] data.tar 생성 시작")
    logs.append("[3/3] data.tar 생성...")
    _publish_log(pipeline_id, "build", "\n".join(logs), domain=domain)
    tar_targets = [
        "data",
        "eng_eng.pair",
        "eng_kor.pair",
        "kor_kor.pair",
        "hypernym_hyponym.pair",
        "meaning.pair",
        "synonym.UTF-8",
    ]
    with tarfile.open(data_tar, "w") as tar:
        for name in tar_targets:
            full_path = os.path.join(build_home, name)
            if os.path.exists(full_path):
                tar.add(full_path, arcname=name)
                logs.append(f"  추가: {name}")
            else:
                logs.append(f"  [경고] {name} 없음 (건너뜀)")
    logs.append(f"  생성 complete: {data_tar}")
    logger.info("[3/3] data.tar 생성 complete: %s", data_tar)

    full_log = "\n".join(logs)
    _publish_log(pipeline_id, "build", full_log, domain=domain)

    return {"returncode": 0, "log": full_log, "stderr": ""}


def _ftp_download_from_ftpinfo(ftpinfo_path: str) -> str:
    """ftpinfo.txt 파싱 → ftplib으로 파일 다운로드, 로그 문자열 반환

    ftpinfo.txt의 open/user/lcd/cd/get/mget/bye 명령을 해석하여
    ftplib.FTP로 실행한다. 첫 번째 lcd 경로는 DEFAULT_JIANA_HOME으로 매핑.
    """
    host = None
    user = None
    password = None
    base_local = None   # 첫 lcd 절대경로 (DEFAULT_JIANA_HOME 매핑 기준점)
    current_local = DEFAULT_JIANA_HOME
    current_remote = "/"
    first_lcd = True
    actions = []  # (kind, remote_dir, local_dir, filename_or_pattern)

    with open(ftpinfo_path, "r", encoding="euc-kr", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            cmd = parts[0].lower()

            if cmd == "open":
                host = parts[1]
            elif cmd == "user":
                user = parts[1]
                password = parts[2] if len(parts) > 2 else ""
            elif cmd == "lcd":
                path = parts[1]
                if first_lcd:
                    # 첫 lcd 절대경로 → DEFAULT_JIANA_HOME 기준점으로 설정
                    base_local = path
                    current_local = DEFAULT_JIANA_HOME
                    first_lcd = False
                elif path.startswith("/") and base_local:
                    # 절대경로: base_local 기준 상대경로를 DEFAULT_JIANA_HOME에 적용
                    rel = os.path.relpath(path, base_local)
                    current_local = os.path.normpath(
                        os.path.join(DEFAULT_JIANA_HOME, rel))
                else:
                    # 상대경로
                    current_local = os.path.normpath(
                        os.path.join(current_local, path))
            elif cmd == "cd":
                path = parts[1]
                if path.startswith("/"):
                    current_remote = path
                else:
                    current_remote = os.path.normpath(
                        os.path.join(current_remote, path))
            elif cmd == "get" and len(parts) > 1:
                actions.append(
                    ("get", current_remote, current_local, parts[1]))
            elif cmd == "mget" and len(parts) > 1:
                actions.append(
                    ("mget", current_remote, current_local, parts[1]))
            elif cmd in ("bye", "quit"):
                break

    if not host or not user:
        raise BuildError("ftpinfo.txt 파싱 실패: host/user 정보 없음")

    logs = [f"  FTP 접속: {user}@{host}"]
    with ftplib.FTP(host) as ftp:
        ftp.login(user, password)
        ftp.set_type("I")  # binary mode

        for kind, remote_dir, local_dir, pattern in actions:
            ftp.cwd(remote_dir)
            os.makedirs(local_dir, exist_ok=True)

            if kind == "get":
                local_path = os.path.join(local_dir, pattern)
                with open(local_path, "wb") as fp:
                    ftp.retrbinary(f"RETR {pattern}", fp.write)
                logs.append(f"  GET {remote_dir}/{pattern}")

            elif kind == "mget":
                try:
                    file_list = ftp.nlst()
                except ftplib.error_perm:
                    file_list = []
                for fname in file_list:
                    local_path = os.path.join(local_dir, fname)
                    try:
                        with open(local_path, "wb") as fp:
                            ftp.retrbinary(f"RETR {fname}", fp.write)
                        logs.append(f"  MGET {remote_dir}/{fname}")
                    except ftplib.error_perm as e:
                        logs.append(f"  [경고] MGET {fname} 실패: {e}")

    return "\n".join(logs)


def _export_thesaurus_before_build(
    workspace: str,
    domain: str,
    build_home: str,
    build_history_id: int,
    pipeline_id: Optional[int],
) -> None:
    """ant dic 빌드 전 DB thesaurus를 synonym_full_v2.txt로 내보내기.

    출력 경로: /home/know/apps/know-ops/workspace/{workspace}/synonym_full_v2.txt
    내보내기 실패해도 빌드 자체는 계속 진행 (경고만 기록).
    """
    from pathlib import Path
    workspace_base = "/home/know/apps/know-ops/workspace"
    출력파일 = Path(workspace_base) / workspace / "synonym_full_v2.txt"
    try:
        from phase1.executor import _export_db_thesaurus_to_file
        cnt = _export_db_thesaurus_to_file(workspace, domain, 출력파일)
        msg = f"[thesaurus export] {출력파일} — {cnt}건"
        logger.info(msg)
        _update_build_history(build_history_id, log_text=msg)
        _publish_log(pipeline_id, "build", msg, domain=domain)
    except Exception as e:
        logger.warning("thesaurus export 실패 (빌드 계속): %s", e)
        _publish_log(pipeline_id, "build", f"[thesaurus export 실패] {e}", domain=domain)


def _count_entries(domain: str) -> Optional[int]:
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


def _create_build_history(domain: str) -> int:
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


def _update_build_history(
    build_id: int,
    status: str = None,
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
                if status:
                    row.status = status
                if status in ("completed", "failed", "cancelled"):
                    row.completed_at = datetime.now()
                if output_path:
                    row.output_path = output_path
                if file_size is not None:
                    row.file_size = file_size
                if entry_count is not None:
                    row.entry_count = entry_count
                if log_text is not None:
                    row.log_text = log_text
                db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning("build_history 업데이트 실패: %s", e)


def _fail_build_history(build_id: int, error_msg: str,
                        log_text: str = None):
    """build_history 실패 처리"""
    _update_build_history(build_id, status="failed", log_text=
                          f"[오류] {error_msg}\n" + (log_text or ""))


def _publish_log(pipeline_id, stage: str, text: str, domain: str = ""):
    """Redis pub/sub으로 빌드 로그 스트리밍 (실패 시 무시)"""
    try:
        import redis
        import json
        r = redis.Redis(host="localhost", port=6379, db=0)
        payload = json.dumps({
            "stage": stage,
            "log": text,
            "ts": datetime.now().isoformat(),
        })
        if pipeline_id:
            r.publish(f"pipeline:{pipeline_id}", payload)
        if domain:
            r.publish(f"build:{domain}", payload)
    except Exception as e:
        logger.debug("Redis log publish 실패: %s", e)


# ─────────────────────────────────────────────
# 단독 run_phase1_service 테스트
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    domain_arg = sys.argv[1] if len(sys.argv) > 1 else "base"
    result = run_build(domain_arg)
    print(f"빌드 결과: {result}")
