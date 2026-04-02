"""Phase 1 단계별 실행기 — tasks.py 독립 구현 (import 없음)"""
import asyncio
import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

KNOW_OPS_SRC = "/home/know/apps/know-ops/src"
WORKSPACE_BASE = "/home/know/apps/know-ops/workspace"

PHASE1_STEPS = {
    0: {"name": "파일선택",   "type": "noop"},
    1: {"name": "키워드추출", "type": "python", "func": "extract"},
    2: {"name": "정제",       "type": "python", "func": "refine"},
    3: {"name": "형태소분석", "type": "python", "func": "analyze"},
    4: {"name": "결과변환",   "type": "python", "func": "convert"},
    5: {"name": "유사어체크", "type": "python", "func": "synonym"},
    6: {"name": "프리징", "type": "python", "func": "freeze"},
}

logger = logging.getLogger(__name__)

# 단계별 시작 시간 추적
_step_start_times = {}  # type: dict


def _ensure_know_ops_path() -> None:
    if KNOW_OPS_SRC not in sys.path:
        sys.path.insert(0, KNOW_OPS_SRC)


def _make_설정(workspace_dir: str):
    """workspace 경로 기반 know-ops 설정 생성"""
    _ensure_know_ops_path()
    from know.core.config import 설정
    base = Path(workspace_dir)
    return 설정(
        base_경로=base,
        jiana_jar경로=base / "lib" / "jiana1.5.jar",
        dqdic_jar경로=base / "lib" / "dqdic-1.0.3.jar",
        스팸패턴경로=base / "spam_kwd.pat",
        상품코드패턴경로=base / "prodcode_pat.cmd",
    )


def _save_log_to_db(run_id: str, step_num: int, step_name: str, percent: int, message: str, status: str, elapsed_sec: float) -> None:
    """로그를 DB에 영속 저장"""
    try:
        from core.database import 세션팩토리
        from sqlalchemy import text
        db = 세션팩토리()
        db.execute(text(
            "INSERT INTO phase1_logs (run_id, step_num, step_name, percent, message, status, elapsed_sec) "
            "VALUES (:run_id, :step_num, :step_name, :percent, :message, :status, :elapsed_sec)"
        ), {
            "run_id": run_id, "step_num": step_num, "step_name": step_name,
            "percent": percent, "message": message, "status": status, "elapsed_sec": elapsed_sec,
        })
        db.commit()
        db.close()
    except Exception as e:
        logger.error(f"로그 DB 저장 실패: {e}")


def _publish_phase1(run_id: str, step_num: int, step_name: str, percent: int, message: str, status: str, elapsed_sec: float = 0) -> None:
    """Redis pub/sub 발행 + DB 저장"""
    payload_dict = {
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
    _save_log_to_db(run_id, step_num, step_name, percent, message, status, elapsed_sec)
    # Redis 발행
    try:
        import redis as sync_redis
        r = sync_redis.Redis(
            host=os.environ.get("REDIS_HOST", "127.0.0.1"),
            port=int(os.environ.get("REDIS_PORT", "6379")),
            db=int(os.environ.get("REDIS_DB", "0")),
        )
        r.publish(f"phase1:{run_id}", json.dumps(payload_dict, ensure_ascii=False))
        r.close()
    except Exception as e:
        logger.error(f"Redis 발행 실패: {e}")


def _sync_extract(file_path: str, domain: str, workspace_dir: str, filter_mode: str = "rank", filter_value: int = 150000, sort_by: str = "count") -> str:
    """키워드추출: popular/ + fails/ → work/keywords.txt (등수별 교차 합치기)"""
    _ensure_know_ops_path()
    from know.pipeline.추출.키워드추출기 import 키워드추출기
    from collections import Counter

    설정값 = _make_설정(workspace_dir)
    추출기 = 키워드추출기(설정=설정값)
    ws = Path(workspace_dir)
    os.makedirs(ws / "build" / "work", exist_ok=True)

    # 각각 빈도순 키워드 추출
    pop_카운터 = 추출기._디렉토리_읽기(ws / "build" / "popular")
    fail_카운터 = 추출기._디렉토리_읽기(ws / "build" / "fails")

    # filter_value가 None이거나 9999999 이상이면 전체 사용
    effective_n = filter_value if (filter_value is not None and filter_value < 9999999) else None

    # 필터링 적용
    if effective_n is None:
        pop_필터 = [kw for kw, _ in pop_카운터.most_common()]
        fail_필터 = [kw for kw, _ in fail_카운터.most_common()]
    else:
        pop_필터 = 추출기._필터링(pop_카운터, filter_mode, effective_n)
        fail_필터 = 추출기._필터링(fail_카운터, filter_mode, effective_n)

    # sort_by 적용
    if sort_by == "rank":
        pop_set = set(pop_필터)
        fail_set = set(fail_필터)
        pop_순위 = [kw for kw in pop_카운터 if kw in pop_set]
        fail_순위 = [kw for kw in fail_카운터 if kw in fail_set]
    else:  # "count": 검색횟수 내림차순
        pop_순위 = sorted(pop_필터, key=lambda kw: pop_카운터[kw], reverse=True)
        fail_순위 = sorted(fail_필터, key=lambda kw: fail_카운터[kw], reverse=True)

    # 등수별 교차 합치기: pop1/fail1/pop2/fail2/...
    seen = set()
    교차_키워드 = []
    max_len = max(len(pop_순위), len(fail_순위))
    for i in range(max_len):
        if i < len(pop_순위) and pop_순위[i] not in seen:
            교차_키워드.append(pop_순위[i])
            seen.add(pop_순위[i])
        if i < len(fail_순위) and fail_순위[i] not in seen:
            교차_키워드.append(fail_순위[i])
            seen.add(fail_순위[i])

    # 스팸 정제
    from know.pipeline.정제.검색로그정제기 import 검색로그정제기
    정제기 = 검색로그정제기(설정값)
    정제된 = 정제기.키워드_정제(교차_키워드)

    # 교차 순서 유지하며 정제 결과만 필터
    정제set = set(정제된)
    최종 = [kw for kw in 교차_키워드 if kw in 정제set]

    출력 = ws / "build" / "work" / "keywords.txt"
    with open(출력, "w", encoding="utf-8") as f:
        for kw in 최종:
            f.write(f"{kw}\n")

    return f"{출력} ({len(최종)}건, 인기:{len(pop_순위)}건 실패:{len(fail_순위)}건)"


def _sync_refine(file_path: str, domain: str, workspace_dir: str) -> str:
    """정제: work/keywords.txt → work/refine.txt"""
    _ensure_know_ops_path()
    from know.pipeline.정제.검색로그정제기 import 검색로그정제기
    설정값 = _make_설정(workspace_dir)
    정제기 = 검색로그정제기(설정값=설정값)
    ws = Path(workspace_dir)
    os.makedirs(ws / "build" / "work", exist_ok=True)
    입력 = ws / "build" / "work" / "keywords.txt"
    출력 = ws / "build" / "work" / "refine.txt"
    입력cnt = sum(1 for line in open(입력, encoding='utf-8', errors='replace') if line.strip())
    result = 정제기.정제(입력, domain, 출력파일=출력)
    cnt = sum(1 for line in open(출력, encoding='utf-8', errors='replace') if line.strip())
    제거 = 입력cnt - cnt
    return f"{result} ({cnt}건, 제거:{제거}건)"


def _sync_analyze(file_path: str, domain: str, workspace_dir: str) -> str:
    """형태소분석: work/refine.txt → work/analyzed.txt"""
    _ensure_know_ops_path()
    from know.pipeline.분석.형태소분석래퍼 import 형태소분석래퍼
    설정값 = _make_설정(workspace_dir)
    래퍼 = 형태소분석래퍼(설정값=설정값)
    ws = Path(workspace_dir)
    os.makedirs(ws / "build" / "work", exist_ok=True)
    입력 = ws / "build" / "work" / "refine.txt"
    출력 = ws / "build" / "work" / "analyzed.txt"
    result = 래퍼.분석(입력, domain, 출력파일=출력)
    # analyzed.txt는 줄바꿈 포맷 — 빈줄로 구분된 블록 수 = 키워드 수
    raw = open(출력, encoding='utf-8', errors='replace').read()
    cnt = len([b for b in raw.split('\n\n') if b.strip()])
    블록들 = [b for b in raw.split('\n\n') if b.strip()]
    형태소수 = sum(len([l for l in b.strip().splitlines() if l.strip() and not l.startswith('comp :')]) - 1 for b in 블록들)
    복합어수 = sum(1 for l in raw.splitlines() if l.startswith('comp :'))
    return f"{result} ({cnt}건, 형태소:{형태소수} 복합어:{복합어수})"


def _sync_convert(file_path: str, workspace_dir: str = "") -> str:
    """결과반환: work/analyzed.txt → work/transform.txt"""
    _ensure_know_ops_path()
    from know.pipeline.변환.형태소결과변환기 import 형태소결과변환기
    변환기 = 형태소결과변환기()
    ws = Path(workspace_dir) if workspace_dir else Path(file_path).parent.parent
    work_dir = ws / "build" / "work"
    os.makedirs(work_dir, exist_ok=True)
    입력 = work_dir / "analyzed.txt"
    raw_result = 변환기.변환(입력)  # → analyzed.txt.5
    최종출력 = work_dir / "transform.txt"
    shutil.copy2(str(raw_result), str(최종출력))
    alllines = list(open(최종출력, encoding='utf-8', errors='replace'))
    kw_lines = [l for l in alllines if '\t' in l and not l.strip().startswith('comp :')]
    cnt = len(kw_lines)
    형태소 = sum(len([p for p in l.split('\t')[1:] if p.strip()]) for l in kw_lines)
    복합어 = sum(l.count('comp :') for l in alllines)
    return f"{최종출력} ({cnt}건, 형태소:{형태소} 복합어:{복합어})"


def _sync_synonym(file_path: str, domain: str, workspace_dir: str) -> str:
    """유사어체크: work/transform.txt → work/synonym.txt"""
    from phase1.synonym_checker import 유사어체크
    ws = Path(workspace_dir)
    work_dir = ws / "build" / "work"
    os.makedirs(work_dir, exist_ok=True)
    입력 = work_dir / "transform.txt"
    출력 = work_dir / "synonym.txt"
    # synonym 사전 찾기: 워크스페이스 → 도메인 순 (확장자 있음/없음 모두)
    domain_dir = Path(WORKSPACE_BASE).parent / "domain" / domain
    syn_candidates = [
        ws / "synonym_full_v2.txt", ws / "synonym_full_v2",
        ws / "synonym_full.txt", ws / "synonym_full",
        domain_dir / "synonym_full_v2.txt", domain_dir / "synonym_full_v2",
        domain_dir / "synonym_full.txt", domain_dir / "synonym_full",
    ]
    syn_path = Path("/dev/null")
    for p in syn_candidates:
        if p.exists():
            syn_path = p
            break
    설정값 = _make_설정(workspace_dir)
    result = 유사어체크(입력, syn_path, 출력, 설정값=설정값)
    import re
    with open(출력, encoding='utf-8', errors='replace') as f:
        content = f.read()
    syn_cnt = len(re.findall(r'<<.*?>>', content)) + len(re.findall(r'(?<!<)<[^<>]+>(?!>)', content))
    kw_cnt = sum(1 for line in content.splitlines() if '\t' in line and not line.strip().startswith('comp :'))
    return f"{result} ({kw_cnt}건, 유사어 {syn_cnt}건)"


def _sync_freeze(domain: str, workspace_dir: str) -> str:
    """프리징: synonym.txt → keyword_assignments DB INSERT"""
    from core.database import 세션팩토리
    from services.assignment_service import 프리징
    ws_name = Path(workspace_dir).name  # "A", "B" 등
    db = 세션팩토리()
    try:
        result = 프리징(db, ws_name, domain)
        return f"{result['total']}건"
    finally:
        db.close()


async def _run_python(run_id: str, step_num: int, step: dict, domain: str, file_path: str, workspace_dir: str, filter_mode: str = "rank", filter_value: int = 150000, sort_by: str = "count") -> None:
    """python 단계 — run_in_executor로 비동기 처리"""
    loop = asyncio.get_event_loop()
    func = step.get("func", "convert")
    if func == "extract":
        result = await loop.run_in_executor(None, lambda: _sync_extract(file_path, domain, workspace_dir, filter_mode, filter_value, sort_by))
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"추출 완료: {result}", "running", elapsed)
    elif func == "refine":
        result = await loop.run_in_executor(None, _sync_refine, file_path, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"정제 완료: {result}", "running", elapsed)
    elif func == "analyze":
        result = await loop.run_in_executor(None, _sync_analyze, file_path, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"분석 완료: {result}", "running", elapsed)
    elif func == "convert":
        result = await loop.run_in_executor(None, _sync_convert, file_path, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"변환 완료: {result}", "running", elapsed)
    elif func == "synonym":
        result = await loop.run_in_executor(None, _sync_synonym, file_path, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"유사어체크 완료: {result}", "running", elapsed)
    elif func == "freeze":
        result = await loop.run_in_executor(None, _sync_freeze, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"프리징 완료: {result}", "running", elapsed)


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
    elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
    _publish_phase1(run_id, step_num, step["name"], 100, f"등록 완료: {count}건", "running", elapsed)


async def phase1_실행(run_id: str, domain: str, file_path: str, start_step: int, end_step: int, workspace: str = "A", filter_mode: str = "rank", filter_value: int = 150000, sort_by: str = "count") -> None:
    """Phase 1 전체 파이프라인 실행 — 단계별 순차 실행"""
    workspace_dir = f"{WORKSPACE_BASE}/{workspace}"
    total_start = time.time()

    # 전체실행(start_step=1) 시 work 폴더 초기화
    if start_step <= 1:
        work_dir = os.path.join(workspace_dir, "build", "work")
        if os.path.isdir(work_dir):
            shutil.rmtree(work_dir)
        os.makedirs(work_dir, exist_ok=True)

    for step_num in range(start_step, end_step + 1):
        step = PHASE1_STEPS.get(step_num)
        if step is None:
            continue

        if step["type"] == "noop":
            _publish_phase1(run_id, step_num, step["name"], 100, "파일 확인 완료", "completed")
            continue

        _step_start_times[f"{run_id}_{step_num}"] = time.time()
        _publish_phase1(run_id, step_num, step["name"], 0, "시작", "running")
        try:
            if step["type"] == "python":
                await _run_python(run_id, step_num, step, domain, file_path, workspace_dir, filter_mode, filter_value, sort_by)
            elif step["type"] == "db":
                await _run_register(run_id, step_num, step, domain, file_path)
            elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
            _publish_phase1(run_id, step_num, step["name"], 100, "완료", "completed", elapsed)
        except Exception as e:
            elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
            _publish_phase1(run_id, step_num, step["name"], -1, str(e), "failed", elapsed)
            raise
        finally:
            _step_start_times.pop(f"{run_id}_{step_num}", None)

    # 전체 완료 시그널
    total_elapsed = time.time() - total_start
    _publish_phase1(run_id, -1, "전체", 100, f"파이프라인 완료 ({round(total_elapsed, 1)}초)", "completed", total_elapsed)
