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

from core.constants import KNOW_OPS_SRC, WORKSPACE_BASE

PHASE1_STEPS = {
    0: {"name": "파일선택",   "type": "noop"},
    1: {"name": "키워드추출", "type": "python", "func": "extract"},
    2: {"name": "정제",       "type": "python", "func": "refine"},
    3: {"name": "형태소분석", "type": "python", "func": "analyze"},
    4: {"name": "결과변환",   "type": "python", "func": "convert"},
    5: {"name": "유사어검사", "type": "python", "func": "synonym"},
    6: {"name": "DB업데이트",           "type": "python", "func": "freeze"},
}

logger = logging.getLogger(__name__)

# 단계별 시작 시간 추적
_step_start_times = {}  # type: dict


def _ensure_know_ops_path() -> None:
    if KNOW_OPS_SRC not in sys.path:
        sys.path.insert(0, KNOW_OPS_SRC)


def _make_config(workspace_dir: str):
    """workspace 경로 기반 know-ops 설정 생성. jiana는 workspace/jiana/ 하위 사용."""
    _ensure_know_ops_path()
    from know.core.config import 설정
    base = Path(workspace_dir)
    jiana_dir = base / "jiana"
    # jiana 폴더가 있으면 그곳을, 없으면 workspace 루트를 base_경로로 사용
    effective_base = jiana_dir if jiana_dir.is_dir() else base
    return 설정(
        base_경로=effective_base,
        jiana_jar경로=effective_base / "lib" / "jiana1.5.jar",
        dqdic_jar경로=effective_base / "lib" / "dqdic-1.0.3.jar",
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


def _sync_extract(file_path: str, domain: str, workspace_dir: str, filter_mode: str = "rank", filter_value: int = 150000, sort_by: str = "count", rank_value: int = 150000, count_value: int = 5) -> str:
    """키워드추출: popular/ + fails/ → work/keywords.txt (등수별 교차 합치기)"""
    _ensure_know_ops_path()
    from know.pipeline.추출.키워드추출기 import 키워드추출기
    from collections import Counter

    설정값 = _make_config(workspace_dir)
    추출기 = 키워드추출기(설정=설정값)
    ws = Path(workspace_dir)
    os.makedirs(ws / "build" / "work", exist_ok=True)

    # 각각 빈도순 키워드 추출
    pop_카운터 = 추출기._디렉토리_읽기(ws / "build" / "popular")
    fail_카운터 = 추출기._디렉토리_읽기(ws / "build" / "fails")

    # filter_value가 None이거나 9999999 이상이면 전체 사용
    effective_n = filter_value if (filter_value is not None and filter_value < 9999999) else None

    # 필터링 적용
    if filter_mode in ("both_and", "both_or"):
        # rank/count 두 조건 동시 적용 (교집합 또는 합집합)
        eff_rank = rank_value if (rank_value is not None and rank_value < 9999999) else None
        eff_count = count_value if (count_value is not None and count_value < 9999999) else None

        def _both_filter(카운터):
            r_set = set(추출기._필터링(카운터, "rank", eff_rank)) if eff_rank is not None else set(kw for kw, _ in 카운터.most_common())
            c_set = set(추출기._필터링(카운터, "count", eff_count)) if eff_count is not None else set(kw for kw, _ in 카운터.most_common())
            return list(r_set & c_set) if filter_mode == "both_and" else list(r_set | c_set)

        pop_필터 = _both_filter(pop_카운터)
        fail_필터 = _both_filter(fail_카운터)
    elif effective_n is None:
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
    """정제: work/keywords.txt → work/refine.txt (원본 순서 유지)"""
    _ensure_know_ops_path()
    from know.pipeline.정제.검색로그정제기 import 검색로그정제기
    설정값 = _make_config(workspace_dir)
    정제기 = 검색로그정제기(설정값=설정값)
    ws = Path(workspace_dir)
    os.makedirs(ws / "build" / "work", exist_ok=True)
    입력 = ws / "build" / "work" / "keywords.txt"
    출력 = ws / "build" / "work" / "refine.txt"
    # 원본 순서 보존: 정제 전 keywords.txt 순서 기록
    원본순서 = [line.strip() for line in open(입력, encoding='utf-8', errors='replace') if line.strip()]
    입력cnt = len(원본순서)
    result = 정제기.정제(입력, domain, 출력파일=출력)
    # 정제 결과를 set으로 읽어 원본 순서 기준으로 재정렬
    정제결과 = {line.strip() for line in open(출력, encoding='utf-8', errors='replace') if line.strip()}
    재정렬 = [kw for kw in 원본순서 if kw in 정제결과]
    with open(출력, "w", encoding="utf-8") as f:
        for kw in 재정렬:
            f.write(f"{kw}\n")
    cnt = len(재정렬)
    제거 = 입력cnt - cnt
    return f"{result} ({cnt}건, 제거:{제거}건)"


def _sync_analyze(file_path: str, domain: str, workspace_dir: str) -> str:
    """analyze_morpheme: work/refine.txt → work/analyzed.txt"""
    _ensure_know_ops_path()
    from know.pipeline.분석.형태소분석래퍼 import 형태소분석래퍼
    설정값 = _make_config(workspace_dir)
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


def _export_db_thesaurus_to_file(workspace: str, domain: str, 출력파일: Path) -> int:
    """DB thesaurus 내보내기 — services.dict_export_service로 위임."""
    from services.dict_export_service import export_db_thesaurus_to_file
    return export_db_thesaurus_to_file(workspace, domain, 출력파일)


def _sync_synonym(file_path: str, domain: str, workspace_dir: str) -> str:
    """check_synonyms: work/transform.txt → work/synonym.txt"""
    from phase1.synonym_checker import check_synonyms
    ws = Path(workspace_dir)
    ws_name = ws.name
    work_dir = ws / "build" / "work"
    os.makedirs(work_dir, exist_ok=True)
    입력 = work_dir / "transform.txt"
    출력 = work_dir / "synonym.txt"
    # synonym 사전: 파일 우선 (정책 #3) → 없으면 DB 폴백
    syn_candidates = [
        ws / "synonym.UTF-8",                  # WS 루트 (최우선)
        ws / "txt_resrc" / "synonym.UTF-8",
        ws / "jiana" / "synonym.UTF-8",
        ws / "synonym_full_v2.txt",            # 레거시
    ]
    syn_path = None
    for p in syn_candidates:
        if p.exists():
            syn_path = p
            logger.info(f"synonym 파일 우선 사용: {p}")
            break
    if syn_path is None:
        # 파일 없으면 DB 폴백
        db_syn_path = ws / "synonym_full_v2.txt"
        cnt = _export_db_thesaurus_to_file(ws_name, domain, db_syn_path)
        if cnt > 0:
            syn_path = db_syn_path
            logger.info(f"WS DB thesaurus({ws_name}/{domain}) → {db_syn_path}: {cnt}건")
        else:
            syn_path = Path("/dev/null")
            logger.warning(f"synonym 파일 없음 + DB 폴백 실패: ws={ws_name}, domain={domain}")
    설정값 = _make_config(workspace_dir)
    result = check_synonyms(입력, syn_path, 출력, 설정값=설정값)
    import re
    with open(출력, encoding='utf-8', errors='replace') as f:
        content = f.read()
    syn_cnt = len(re.findall(r'<<.*?>>', content)) + len(re.findall(r'(?<!<)<[^<>]+>(?!>)', content))
    kw_cnt = sum(1 for line in content.splitlines() if '\t' in line and not line.strip().startswith('comp :'))
    return f"{result} ({kw_cnt}건, 유사어 {syn_cnt}건)"


def _sync_freeze(domain: str, workspace_dir: str, run_id: str = "", step_num: int = 6, step_name: str = "DB업데이트") -> str:
    """DB업데이트: 배치 INSERT + 진행률 publish."""
    from core.database import 세션팩토리
    from services.assignment_service import ensure_kw_table
    from sqlalchemy import text
    from core.constants import WORKSPACE_BASE

    ws_name = Path(workspace_dir).name  # "A", "B" 등
    refine_path = os.path.join(WORKSPACE_BASE, ws_name, "build", "work", "refine.txt")
    if not os.path.isfile(refine_path):
        raise Exception(f"refine.txt 없음: {refine_path}")

    with open(refine_path, encoding="utf-8", errors="replace") as f:
        keywords = [line.strip() for line in f if line.strip()]

    if not keywords:
        raise Exception("키워드가 없습니다")

    tbl = f"kw_{ws_name}"
    db = 세션팩토리()
    try:
        ensure_kw_table(db, ws_name)
        db.execute(text(f"DELETE FROM {tbl} WHERE domain=:dom"), {"dom": domain})
        try:
            db.execute(text("DELETE FROM user_last_selected WHERE workspace=:ws AND domain=:dom"),
                       {"ws": ws_name, "dom": domain})
        except Exception:
            pass

        total = len(keywords)
        BATCH = 200
        inserted = 0
        for i, kw in enumerate(keywords, 1):
            db.execute(text(f"""
                INSERT INTO {tbl} (domain, line_num, keyword, analysis, full_analysis, status)
                VALUES (:dom, :num, :kw, '', '', 'pending')
            """), {"dom": domain, "num": i, "kw": kw})
            inserted += 1
            if inserted % BATCH == 0 and run_id:
                db.commit()
                pct = min(90, int(inserted / total * 90))
                _publish_phase1(run_id, step_num, step_name, pct,
                                f"INSERT {inserted}/{total}건", "running")
        db.commit()
    finally:
        db.close()

    return f"{total}건"


async def _run_python(run_id: str, step_num: int, step: dict, domain: str, file_path: str, workspace_dir: str, filter_mode: str = "rank", filter_value: int = 150000, sort_by: str = "count", rank_value: int = 150000, count_value: int = 5) -> None:
    """python 단계 — run_in_executor로 비동기 처리"""
    loop = asyncio.get_event_loop()
    func = step.get("func", "convert")
    if func == "extract":
        result = await loop.run_in_executor(None, lambda: _sync_extract(file_path, domain, workspace_dir, filter_mode, filter_value, sort_by, rank_value, count_value))
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"추출 complete: {result}", "running", elapsed)
    elif func == "refine":
        result = await loop.run_in_executor(None, _sync_refine, file_path, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"정제 complete: {result}", "running", elapsed)
    elif func == "analyze":
        result = await loop.run_in_executor(None, _sync_analyze, file_path, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"분석 complete: {result}", "running", elapsed)
    elif func == "convert":
        result = await loop.run_in_executor(None, _sync_convert, file_path, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"변환 complete: {result}", "running", elapsed)
    elif func == "synonym":
        result = await loop.run_in_executor(None, _sync_synonym, file_path, domain, workspace_dir)
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"check_synonyms complete: {result}", "running", elapsed)
    elif func == "freeze":
        result = await loop.run_in_executor(None, _sync_freeze, domain, workspace_dir, run_id, step_num, step["name"])
        elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
        _publish_phase1(run_id, step_num, step["name"], 100, f"DB업데이트 complete: {result}", "running", elapsed)


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
    """등록 단계 — run_in_executor로 동기 DB 작업 run_phase1_service"""
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(None, _sync_register, domain, file_path)
    elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
    _publish_phase1(run_id, step_num, step["name"], 100, f"등록 complete: {count}건", "running", elapsed)


async def run_phase1(run_id: str, domain: str, file_path: str, start_step: int, end_step: int, workspace: str = "A", filter_mode: str = "rank", filter_value: int = 150000, sort_by: str = "count", rank_value: int = 150000, count_value: int = 5) -> None:
    """Phase 1 전체 파이프라인 run_phase1_service — 단계별 순차 run_phase1_service"""
    workspace_dir = f"{WORKSPACE_BASE}/{workspace}"
    total_start = time.time()

    # 전체run_phase1_service(start_step=1) 시 work 폴더 initialize
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
            _publish_phase1(run_id, step_num, step["name"], 100, "파일 확인 complete", "completed")
            continue

        _step_start_times[f"{run_id}_{step_num}"] = time.time()
        _publish_phase1(run_id, step_num, step["name"], 0, "시작", "running")
        try:
            if step["type"] == "python":
                await _run_python(run_id, step_num, step, domain, file_path, workspace_dir, filter_mode, filter_value, sort_by, rank_value, count_value)
            elif step["type"] == "db":
                await _run_register(run_id, step_num, step, domain, file_path)
            elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
            _publish_phase1(run_id, step_num, step["name"], 100, "complete", "completed", elapsed)
        except Exception as e:
            elapsed = time.time() - _step_start_times.get(f"{run_id}_{step_num}", time.time())
            _publish_phase1(run_id, step_num, step["name"], -1, str(e), "failed", elapsed)
            raise
        finally:
            _step_start_times.pop(f"{run_id}_{step_num}", None)

    # 전체 complete 시그널
    total_elapsed = time.time() - total_start
    _publish_phase1(run_id, -1, "전체", 100, f"파이프라인 complete ({round(total_elapsed, 1)}초)", "completed", total_elapsed)
