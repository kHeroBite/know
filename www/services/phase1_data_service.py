"""Phase 1 데이터기반 전처리 서비스 — 범용 SGML 컬럼 선택 방식 (로컬 Python 스트리밍)

기존 SSH/scp 원격 파이프라인 완전 제거. Perl(extquery_*.pl) + refine_dbdata.sh 로직을
Python으로 이식하여 workspace 로컬에서 처리한다.

핵심 함수:
  - extract_columns_from_sgml(filepath) -> List[str]
      SGML 파일에서 모든 `(COLUMN_NAME` 패턴의 컬럼명 합집합 반환.
      `(DQ_DOC` 같은 최상위 wrapper는 제외.

  - extract_column_values(filepath, column_name) -> Iterator[str]
      Perl state machine(isquery/isfirst) 이식. (COL 직후 첫 줄 스킵.

  - refine_keywords(values, split_delimiter=None) -> List[str]
      refine_dbdata.sh 정규화 이식: 괄호→newline, tab/space split, uppercase,
      ASCII 경계 split, dedup + sort.

  - run_data_universal(run_id, workspace, filenames, columns)
      선택 컬럼만 추출+정규화하여 workspace/build/data_input/output/{col}.txt 저장.

폴더 구조:
  workspace/build/data_input/*.sgml            ← 업로드된 SGML 파일 (비재귀)
  workspace/build/data_input/output/*.txt      ← 컬럼별 정규화 결과
"""
import os
import asyncio
import logging
import json
import re
import time
from datetime import datetime
from typing import Dict, Iterable, Iterator, List, Optional, Set

from core.constants import WORKSPACE_DIR
from core.database import 세션팩토리

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 경로 헬퍼
# ──────────────────────────────────────────────

def _workspace_input_dir(workspace: str) -> str:
    """워크스페이스별 data_input 폴더 경로 반환 (비재귀 루트)."""
    ws = workspace or "default"
    return os.path.join(WORKSPACE_DIR, ws, "build", "data_input")


def _workspace_output_dir(workspace: str) -> str:
    """컬럼별 정규화 결과 저장 폴더."""
    return os.path.join(_workspace_input_dir(workspace), "output")


# ──────────────────────────────────────────────
# SGML 파싱 / 정규화 (Perl + shell 이식)
# ──────────────────────────────────────────────

# 컬럼명: 대문자/숫자/언더스코어, 첫 문자는 대문자 또는 언더스코어
_COL_PATTERN = re.compile(r'^\(([A-Z_][A-Z0-9_]*)$')

# 최상위 wrapper 블록 (컬럼이 아님) — 파싱 시 제외
_WRAPPER_BLOCKS = {"DQ_DOC"}

# refine_keywords 내부 정규식
_BRACKET_RE = re.compile(r'[\(\[\]\)]')
_BOUNDARY_RE1 = re.compile(r'([^A-Z0-9])([A-Z])')
_BOUNDARY_RE2 = re.compile(r'([^A-Z0-9])([0-9])')


def extract_columns_from_sgml(filepath: str) -> List[str]:
    """SGML 파일에서 모든 컬럼명 추출 (라인 단위 스트리밍).

    - `^\\(COL$` 패턴 매칭 시 컬럼명 수집 (set으로 중복 제거)
    - DQ_DOC 같은 wrapper 블록은 제외
    - 1GB 파일에서도 메모리 폭주 방지를 위해 line-by-line read
    """
    columns: Set[str] = set()
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                stripped = line.rstrip('\r\n')
                m = _COL_PATTERN.match(stripped)
                if m:
                    col = m.group(1)
                    if col not in _WRAPPER_BLOCKS:
                        columns.add(col)
    except FileNotFoundError:
        return []
    return sorted(columns)


def extract_column_values(filepath: str, column_name: str) -> Iterator[str]:
    """Perl extquery_*.pl 로직 이식 — (COL 직후 첫 줄 스킵, )COL 까지 yield.

    원 Perl 로직:
        isquery=0, isfirst=0
        if line == "(COL":       isquery=1, isfirst=1, next
        elif line ~ /^\\)COL/:    isquery=0, next
        if (isquery==1 and isfirst==0): print line
        isfirst=0   # loop 끝에서 항상 0으로
    """
    open_tag = f'({column_name}'
    close_tag = f'){column_name}'
    isquery = False
    isfirst = False
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                stripped = line.rstrip('\r\n')
                if stripped == open_tag:
                    isquery = True
                    isfirst = True
                    # (COL 라인 자체는 yield하지 않음 (Perl의 next)
                    continue
                elif stripped.startswith(close_tag):
                    isquery = False
                    # )COL 라인 자체도 yield하지 않음 (Perl의 next)
                    continue
                if isquery and not isfirst:
                    yield stripped
                # 매 루프 끝에서 isfirst를 False로 리셋 (Perl과 동일)
                isfirst = False
    except FileNotFoundError:
        return


def refine_keywords(values: Iterable[str], split_delimiter: Optional[str] = None) -> List[str]:
    """refine_dbdata.sh 이식 — 괄호/탭/공백 split + uppercase + 경계 split + dedup sort.

    단계:
      1. split_delimiter 있으면 line.split(delimiter)
      2. 괄호 [ ] ( ) → newline
      3. tab/space → newline
      4. 앞 -_ 제거 (lstrip)
      5. uppercase
      6. ASCII 경계 split: (non-ALNUM)(ALPHA) 및 (non-ALNUM)(DIGIT) 사이에 newline 삽입
      7. set으로 dedupe + sort
    """
    result: Set[str] = set()
    # split_delimiter=None/"" 모두 split 미적용으로 처리 (Python str.split("")은 ValueError)
    use_split = bool(split_delimiter)
    for v in values:
        if v is None:
            continue
        # 1. split_delimiter 적용
        if use_split:
            parts = v.split(split_delimiter)
        else:
            parts = [v]
        for p in parts:
            # 2. 괄호 → newline
            p = _BRACKET_RE.sub('\n', p)
            # 3. tab/space → newline
            p = p.replace('\t', '\n').replace(' ', '\n')
            for tok in p.split('\n'):
                tok = tok.strip()
                if not tok:
                    continue
                # 4. 앞 -_ 제거
                tok = tok.lstrip('-_')
                if not tok:
                    continue
                # 5. uppercase
                tok = tok.upper()
                # 6. 경계 split
                tok = _BOUNDARY_RE1.sub(r'\1\n\2', tok)
                tok = _BOUNDARY_RE2.sub(r'\1\n\2', tok)
                for t in tok.split('\n'):
                    t = t.strip()
                    if t:
                        result.add(t)
    return sorted(result)


def sample_column_values(
    filepath: str, columns: List[str], max_samples: int = 5
) -> Dict[str, List[str]]:
    """여러 컬럼의 샘플값을 한 번의 스트리밍으로 수집.

    - 모든 컬럼이 max_samples에 도달하면 즉시 break
    - 빈 문자열은 샘플에서 제외
    """
    if not columns:
        return {}
    target_cols = set(columns)
    samples: Dict[str, List[str]] = {col: [] for col in columns}
    # 현재 열려있는 컬럼 (open_tag 매칭 시 진입)
    current: Optional[str] = None
    isfirst = False
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                stripped = line.rstrip('\r\n')
                # 열림 태그?
                m_open = _COL_PATTERN.match(stripped)
                if m_open:
                    col = m_open.group(1)
                    if col in target_cols:
                        current = col
                        isfirst = True
                        continue
                    else:
                        current = None
                        continue
                # 닫힘 태그?
                if current and stripped.startswith(f'){current}'):
                    current = None
                    isfirst = False
                    continue
                # 값 라인
                if current and not isfirst:
                    if stripped and len(samples[current]) < max_samples:
                        samples[current].append(stripped)
                isfirst = False
                # 종료 조건: 모든 타겟 컬럼이 max_samples 도달
                if all(len(samples[c]) >= max_samples for c in target_cols):
                    break
    except FileNotFoundError:
        pass
    return samples


# ──────────────────────────────────────────────
# Redis pub/sub + DB 로그
# ──────────────────────────────────────────────

def _publish_data(run_id: str, step_num: int, step_name: str, percent: int,
                  message: str, status: str, elapsed_sec: float = 0) -> None:
    """Redis pub/sub 발행 + DB 저장."""
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


# ──────────────────────────────────────────────
# Phase1Data 서비스 클래스
# ──────────────────────────────────────────────

class Phase1Data서비스:

    @staticmethod
    async def list_files(workspace: str = "") -> Dict:
        """workspace/build/data_input/ 직계 파일만 비재귀 조회."""
        loop = asyncio.get_event_loop()

        def _list():
            dir_path = _workspace_input_dir(workspace)
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
            return {"files": files}
        return await loop.run_in_executor(None, _list)

    @staticmethod
    async def save_file(filename: str, content: bytes, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()

        def _write():
            dir_path = _workspace_input_dir(workspace)
            os.makedirs(dir_path, exist_ok=True)
            safe = os.path.basename(filename or "")
            file_path = os.path.join(dir_path, safe)
            with open(file_path, 'wb') as f:
                f.write(content)
            stat = os.stat(file_path)
            return {
                "filename": safe,
                "size": stat.st_size,
                "saved_path": file_path,
                "uploaded_at": datetime.now().isoformat()
            }
        return await loop.run_in_executor(None, _write)

    @staticmethod
    async def delete_file(filename: str, workspace: str = "") -> Dict:
        loop = asyncio.get_event_loop()

        def _delete():
            safe = os.path.basename(filename or "")
            file_path = os.path.join(_workspace_input_dir(workspace), safe)
            if not os.path.exists(file_path):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"파일 없음: {safe}")
            os.remove(file_path)
            return {"deleted": True, "filename": safe}
        return await loop.run_in_executor(None, _delete)

    @staticmethod
    async def analyze_columns(filenames: List[str], workspace: str = "") -> Dict:
        """업로드된 SGML 파일들에서 컬럼명을 추출하고 각 컬럼의 샘플 5개를 반환.

        - 여러 파일의 컬럼명은 합집합
        - 샘플은 첫 번째로 컬럼이 등장하는 파일에서 최대 5개
        """
        loop = asyncio.get_event_loop()

        def _analyze():
            dir_path = _workspace_input_dir(workspace)
            # 컬럼명 합집합
            all_columns: Set[str] = set()
            valid_paths: List[str] = []
            for fname in filenames:
                safe = os.path.basename(fname or "")
                fp = os.path.join(dir_path, safe)
                if not os.path.isfile(fp):
                    continue
                valid_paths.append(fp)
                for col in extract_columns_from_sgml(fp):
                    all_columns.add(col)
            sorted_cols = sorted(all_columns)
            # 샘플 수집: 컬럼별로 첫 번째로 값이 있는 파일에서 5개까지
            samples: Dict[str, List[str]] = {col: [] for col in sorted_cols}
            remaining = set(sorted_cols)
            for fp in valid_paths:
                if not remaining:
                    break
                needed = sorted(remaining)
                partial = sample_column_values(fp, needed, max_samples=5)
                for col, vals in partial.items():
                    if vals:
                        samples[col] = vals
                        remaining.discard(col)
            result_columns = [
                {"name": col, "samples": samples.get(col, [])}
                for col in sorted_cols
            ]
            return {"columns": result_columns}
        return await loop.run_in_executor(None, _analyze)

    @staticmethod
    async def register_execution_db(run_id: str, workspace: str,
                                    filenames: List[str], columns: List[Dict]) -> None:
        """phase1_data_runs 테이블에 실행 레코드 등록.

        범용 모드에서는 folder 컬럼에 빈 문자열("") 저장 (NOT NULL 제약 유지).
        """
        from sqlalchemy import text
        db = 세션팩토리()
        try:
            db.execute(text("""
                INSERT INTO phase1_data_runs (run_id, folder, workspace, status)
                VALUES (:run_id, :folder, :workspace, 'pending')
            """), {
                "run_id": run_id,
                "folder": "",
                "workspace": workspace or "",
            })
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    async def run_data_service(run_id: str, workspace: str,
                               filenames: List[str], columns: List[Dict]) -> None:
        """범용 데이터기반 전처리 실행 — 로컬 Python 스트리밍 파이프라인.

        진행률:
          0~10%   입력 검증
          10~90%  컬럼별 처리 (컬럼 수만큼 균등 분할)
          90~100% 저장 완료
        """
        loop = asyncio.get_event_loop()
        start_time = time.time()

        def _update_status(status: str, error: Optional[str] = None):
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

            _publish_data(run_id, 1, "초기화", 5, "범용 전처리 준비 중", "running")

            # Step 1: 입력 검증
            input_dir = _workspace_input_dir(workspace)
            output_dir = _workspace_output_dir(workspace)
            os.makedirs(output_dir, exist_ok=True)

            valid_files: List[str] = []
            for fname in filenames:
                safe = os.path.basename(fname or "")
                fp = os.path.join(input_dir, safe)
                if os.path.isfile(fp):
                    valid_files.append(fp)

            if not valid_files:
                raise ValueError("입력 파일 없음 — 업로드된 SGML 파일을 선택해주세요")
            if not columns:
                raise ValueError("선택된 컬럼 없음")

            _publish_data(run_id, 1, "검증완료", 10,
                          f"입력 파일 {len(valid_files)}개, 컬럼 {len(columns)}개 확인", "running")

            # Step 2: 컬럼별 처리
            total_cols = len(columns)
            progress_span = 80  # 10 ~ 90

            def _process_column(col_spec: Dict, idx: int) -> None:
                col_name = col_spec.get("name")
                split_delim = col_spec.get("split_delimiter")
                if not col_name:
                    return

                col_values: List[str] = []
                for fp in valid_files:
                    for v in extract_column_values(fp, col_name):
                        col_values.append(v)

                keywords = refine_keywords(col_values, split_delim)

                out_path = os.path.join(output_dir, f"{col_name}.txt")
                # UTF-8 without BOM, LF
                with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
                    for kw in keywords:
                        f.write(kw + '\n')

                percent = 10 + int((idx + 1) / total_cols * progress_span)
                _publish_data(
                    run_id, 2, "컬럼처리", percent,
                    f"[{idx+1}/{total_cols}] {col_name} → {len(keywords)}개 키워드",
                    "running"
                )

            for idx, col_spec in enumerate(columns):
                await loop.run_in_executor(None, _process_column, col_spec, idx)

            # Step 3: 저장 완료
            _publish_data(run_id, 3, "저장완료", 95,
                          f"output/ 하위 {total_cols}개 파일 생성 완료", "running")

            elapsed = round(time.time() - start_time, 1)
            _publish_data(run_id, -1, "완료", 100,
                          f"데이터기반 전처리 완료 ({elapsed}초)", "completed",
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

    @staticmethod
    async def get_config(domain: str) -> Dict:
        """도메인별 컬럼 선택 설정 조회."""
        loop = asyncio.get_event_loop()

        def _get():
            from sqlalchemy import text
            db = 세션팩토리()
            try:
                row = db.execute(text(
                    "SELECT selected_columns FROM data_preprocess_config WHERE domain = :domain"
                ), {"domain": domain}).fetchone()
                if row and row[0]:
                    try:
                        cols = json.loads(row[0])
                    except Exception:
                        cols = []
                else:
                    cols = []
                return {"domain": domain, "selected_columns": cols}
            finally:
                db.close()
        return await loop.run_in_executor(None, _get)

    @staticmethod
    async def save_config(domain: str, selected_columns: List[Dict]) -> Dict:
        """도메인별 컬럼 선택 설정 저장 (UPSERT)."""
        loop = asyncio.get_event_loop()

        def _save():
            from sqlalchemy import text
            db = 세션팩토리()
            try:
                payload = json.dumps(selected_columns or [], ensure_ascii=False)
                # SQLite UPSERT
                db.execute(text("""
                    INSERT INTO data_preprocess_config (domain, selected_columns, updated_at)
                    VALUES (:domain, :cols, CURRENT_TIMESTAMP)
                    ON CONFLICT(domain) DO UPDATE SET
                        selected_columns = excluded.selected_columns,
                        updated_at = CURRENT_TIMESTAMP
                """), {"domain": domain, "cols": payload})
                db.commit()
                return {"saved": True, "domain": domain}
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()
        return await loop.run_in_executor(None, _save)
