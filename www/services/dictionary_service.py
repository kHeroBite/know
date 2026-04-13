from __future__ import annotations
import glob
import os
import re
import threading
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func, case, MetaData, bindparam
from sqlalchemy.exc import OperationalError, ProgrammingError
from fastapi import HTTPException
from models.dictionary import validate_site_name, get_dict_table

from core.constants import DOMAIN_DIR

# 사전 타입 허용 list_tasks
_허용사전타입 = {"udic", "cndic"}


def normalize_word(word: str) -> str:
    """Java modifyWord() 동일 로직: 대문자 + BOM/쉼표/공백 제거."""
    if not word:
        return word
    result = word.upper()
    result = result.replace('\ufeff', '')   # BOM 제거
    result = result.replace(',', '')        # 쉼표 제거
    result = re.sub(r'\s', '', result)      # 공백/탭/줄바꿈 제거
    return result


def _dict_table(db: Session, site: str, dic_type: str):
    """세션 바인드 엔진의 메타데이터로 사전 테이블 반환."""
    meta = MetaData()
    return get_dict_table(site.upper(), dic_type, meta)


def _validate_type(dic_type: str) -> None:
    if dic_type not in _허용사전타입:
        raise HTTPException(status_code=400, detail=f"알 수 없는 사전 타입: {dic_type} (허용: {_허용사전타입})")


# ─── UDIC / CNDIC ──────────────────────────────────────────────────

def get_dict_list(
    db: Session,
    site: str,
    dic_type: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = None,
) -> dict:
    """사전 항목 list_tasks 페이지네이션 조회 (udic/cndic)."""
    _validate_type(dic_type)
    validate_site_name(site)
    tbl = _dict_table(db, site, dic_type)
    offset = (page - 1) * size

    where_clause = []
    if search:
        키워드 = normalize_word(search)
        where_clause.append(tbl.c._WORD.like(f"%{키워드}%"))

    cnt_stmt = select(func.count()).select_from(tbl)
    lst_stmt = select(tbl).offset(offset).limit(size)
    if where_clause:
        cnt_stmt = cnt_stmt.where(*where_clause)
        lst_stmt = lst_stmt.where(*where_clause)
        # 완전일치 최상위 정렬: exact match → 접두일치 → 나머지
        lst_stmt = lst_stmt.order_by(
            case((tbl.c._WORD == 키워드, 0), else_=1),
            tbl.c._WORD.asc(),
        )
    else:
        lst_stmt = lst_stmt.order_by(tbl.c._WORD.asc())

    try:
        total = db.execute(cnt_stmt).scalar() or 0
        rows = db.execute(lst_stmt).mappings().all()
        items = [{"word": r["_WORD"], "memo": r.get("_MEMO")} for r in rows]
    except (OperationalError, ProgrammingError):
        return {"items": [], "total": 0, "page": page, "size": size}
    return {"items": items, "total": total, "page": page, "size": size}


def add_dict_item_service(db: Session, site: str, dic_type: str, word: str, memo: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """사전 항목 추가 (normalize_word 적용)."""
    _validate_type(dic_type)
    validate_site_name(site)
    tbl = _dict_table(db, site, dic_type)
    정규화단어 = normalize_word(word)

    # 중복 확인
    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 단어: {정규화단어}")

    db.execute(insert(tbl).values(_WORD=정규화단어, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now()))
    db.commit()
    return {"word": 정규화단어, "memo": memo}


def update_dict_item_service(db: Session, site: str, dic_type: str, word: str, memo: Optional[str] = None) -> dict:
    """사전 항목 메모 수정."""
    _validate_type(dic_type)
    validate_site_name(site)
    tbl = _dict_table(db, site, dic_type)
    정규화단어 = normalize_word(word)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"단어를 찾을 수 없음: {정규화단어}")

    db.execute(update(tbl).where(tbl.c._WORD == 정규화단어).values(_MEMO=memo, _UPDATED=datetime.now()))
    db.commit()
    return {"word": 정규화단어, "memo": memo}


def delete_dict_item_service(db: Session, site: str, dic_type: str, word: str) -> None:
    """사전 항목 삭제."""
    _validate_type(dic_type)
    validate_site_name(site)
    tbl = _dict_table(db, site, dic_type)
    정규화단어 = normalize_word(word)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"단어를 찾을 수 없음: {정규화단어}")

    db.execute(delete(tbl).where(tbl.c._WORD == 정규화단어))
    db.commit()


def bulk_add_items(
    db: Session,
    site: str,
    dic_type: str,
    items: List[dict],
    user_id: Optional[str] = None,
) -> dict:
    """사전 항목 일괄 등록 (각 word 정규화 후 INSERT, 중복은 건너뜀)."""
    _validate_type(dic_type)
    validate_site_name(site)
    tbl = _dict_table(db, site, dic_type)
    성공 = 0
    건너뜀 = 0
    for item in items:
        정규화단어 = normalize_word(item.get("word", ""))
        if not 정규화단어:
            건너뜀 += 1
            continue
        존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
        if 존재:
            건너뜀 += 1
            continue
        db.execute(insert(tbl).values(
            _WORD=정규화단어,
            _MEMO=item.get("memo"),
            _USER_ID=user_id,
            _UPDATED=datetime.now(),
        ))
        성공 += 1
    db.commit()
    return {"inserted": 성공, "skipped": 건너뜀}


# ─── THESAURUS (_HEAD_WORD PK, _TAIL_WORD = 쉼표 구분 list_tasks) ────────

def get_synonym_list(db: Session, site: str, page: int = 1, size: int = 50, search: Optional[str] = None) -> dict:
    """유의어 list_tasks 페이지네이션 조회."""
    validate_site_name(site)
    tbl = _dict_table(db, site, "thesaurus")
    offset = (page - 1) * size

    where_clause = []
    if search:
        키워드 = normalize_word(search)
        where_clause.append(tbl.c._HEAD_WORD.like(f"%{키워드}%"))

    cnt_stmt = select(func.count()).select_from(tbl)
    lst_stmt = select(tbl).offset(offset).limit(size)
    if where_clause:
        cnt_stmt = cnt_stmt.where(*where_clause)
        lst_stmt = lst_stmt.where(*where_clause)
        # 완전일치 최상위 정렬: exact match → 접두일치 → 나머지
        lst_stmt = lst_stmt.order_by(
            case((tbl.c._HEAD_WORD == 키워드, 0), else_=1),
            tbl.c._HEAD_WORD.asc(),
        )
    else:
        lst_stmt = lst_stmt.order_by(tbl.c._HEAD_WORD.asc())

    try:
        total = db.execute(cnt_stmt).scalar() or 0
        rows = db.execute(lst_stmt).mappings().all()
        items = [{"head_word": r["_HEAD_WORD"], "tail_word": r["_TAIL_WORD"], "memo": r.get("_MEMO")} for r in rows]
    except (OperationalError, ProgrammingError):
        return {"items": [], "total": 0, "page": page, "size": size}
    return {"items": items, "total": total, "page": page, "size": size}


def add_synonym_service(db: Session, site: str, head_word: str, tail_word: str, memo: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """유의어 추가."""
    validate_site_name(site)
    tbl = _dict_table(db, site, "thesaurus")
    정규화head = normalize_word(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 유의어 헤드: {정규화head}")
    db.execute(insert(tbl).values(_HEAD_WORD=정규화head, _TAIL_WORD=tail_word, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now()))
    db.commit()
    return {"head_word": 정규화head, "tail_word": tail_word, "memo": memo}


def update_synonym_service(db: Session, site: str, head_word: str, tail_word: str, memo: Optional[str] = None) -> dict:
    """유의어 수정."""
    validate_site_name(site)
    tbl = _dict_table(db, site, "thesaurus")
    정규화head = normalize_word(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"유의어를 찾을 수 없음: {정규화head}")
    db.execute(update(tbl).where(tbl.c._HEAD_WORD == 정규화head).values(_TAIL_WORD=tail_word, _MEMO=memo, _UPDATED=datetime.now()))
    db.commit()
    return {"head_word": 정규화head, "tail_word": tail_word, "memo": memo}


def delete_synonym_service(db: Session, site: str, head_word: str) -> None:
    """유의어 삭제."""
    validate_site_name(site)
    tbl = _dict_table(db, site, "thesaurus")
    정규화head = normalize_word(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"유의어를 찾을 수 없음: {정규화head}")
    db.execute(delete(tbl).where(tbl.c._HEAD_WORD == 정규화head))
    db.commit()


def bulk_add_synonyms_service(db: Session, site: str, items: List[dict], user_id: Optional[str] = None) -> dict:
    """유의어 일괄 등록."""
    validate_site_name(site)
    tbl = _dict_table(db, site, "thesaurus")
    성공 = 0
    건너뜀 = 0
    for item in items:
        정규화head = normalize_word(item.get("head_word", ""))
        if not 정규화head:
            건너뜀 += 1
            continue
        존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
        if 존재:
            건너뜀 += 1
            continue
        db.execute(insert(tbl).values(
            _HEAD_WORD=정규화head,
            _TAIL_WORD=item.get("tail_word", ""),
            _MEMO=item.get("memo"),
            _USER_ID=user_id,
            _UPDATED=datetime.now(),
        ))
        성공 += 1
    db.commit()
    return {"inserted": 성공, "skipped": 건너뜀}


# ─── 파일에서 사전 임포트 ─────────────────────────────────────────

def _find_dict_file(도메인경로: str, patterns: List[str], 추가경로: Optional[List[str]] = None) -> Optional[str]:
    """도메인 디렉토리에서 패턴에 맞는 사전 파일 찾기. 추가경로도 탐색."""
    탐색경로list_tasks = [도메인경로]
    if 추가경로:
        탐색경로list_tasks.extend(추가경로)
    # 패턴 우선순위가 경로보다 높음 (quasisynonym이 addedsyn보다 우선)
    for pattern in patterns:
        for 경로 in 탐색경로list_tasks:
            if not os.path.isdir(경로):
                continue
            # 루트에서 먼저 탐색
            matches = glob.glob(os.path.join(경로, pattern))
            if matches:
                return sorted(matches)[-1]  # 가장 최신 파일
            # 1단계 하위 디렉토리에서 탐색
            matches = glob.glob(os.path.join(경로, "*", pattern))
            if matches:
                return sorted(matches)[-1]
            # 2단계 하위 디렉토리에서 탐색
            matches = glob.glob(os.path.join(경로, "*", "*", pattern))
            if matches:
                return sorted(matches)[-1]
    return None


def _read_file(파일경로: str) -> List[str]:
    """파일을 읽어 줄 list_tasks 반환 (빈줄 제거, BOM/CR 처리)."""
    줄list_tasks = []
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(파일경로, "r", encoding=enc) as f:
                for line in f:
                    줄 = line.rstrip("\r\n").strip()
                    if 줄:
                        줄list_tasks.append(줄)
            return 줄list_tasks
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 줄list_tasks


# ─── 파일 건수 미리보기 ──────────────────────────────────────────

# thesaurus 절대 경로: /home/know/apps/know-ops/domain/{site}/txt_resrc/synonym.UTF-8
# (DOMAIN_DIR = /home/know/apps/know-ops/domain, _find_dict_file이 DOMAIN_DIR/{site}/ 기준 탐색)
_사전파일패턴 = {
    "udic": ["user.ks", "user*.ks"],
    "cndic": ["cnlist.ks", "cnlist*.ks"],
    "thesaurus": ["txt_resrc/synonym.UTF-8"],  # DOMAIN_DIR/{site}/ 기준 상대 경로
}


def _extra_search_paths(site: str) -> List[str]:
    """사이트별 추가 탐색 경로 list_tasks 반환."""
    db경로 = f"/home/know/apps/data/{site.lower()}_db"
    return [db경로] if os.path.isdir(db경로) else []


def get_dict_db_count(db: Session, site: str) -> dict:
    """도메인 사전 DB 건수 반환 (udic/cndic/thesaurus/category)."""
    from sqlalchemy import func, select
    결과 = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    for dic_type in ("udic", "cndic", "thesaurus", "category"):
        try:
            tbl = _dict_table(db, site, dic_type)
            결과[dic_type] = db.execute(select(func.count()).select_from(tbl)).scalar() or 0
        except Exception:
            pass
    return 결과


def _file_unique_words(파일경로: str) -> set:
    """파일에서 normalize_word + 중복 제거된 유일 단어 집합 반환 (udic/cndic용)."""
    중복set: set = set()
    for 줄 in _read_file(파일경로):
        parts = 줄.split("\t", 1)
        word = normalize_word(parts[0].strip())
        if word:
            중복set.add(word)
    return 중복set


def _file_unique_word_memo(파일경로: str) -> dict:
    """파일에서 {word: memo} 맵 반환 (udic/cndic용, 동일 word는 마지막 등장 memo 사용)."""
    결과: dict = {}
    for 줄 in _read_file(파일경로):
        parts = 줄.split("\t", 1)
        word = normalize_word(parts[0].strip())
        memo = parts[1].strip() if len(parts) > 1 else None
        if word and word not in 결과:
            결과[word] = memo
    return 결과


def preview_dict_file_count(site: str) -> dict:
    """도메인 사전 파일의 예상 insert 건수를 반환 (실제 import와 동일 로직).

    udic/cndic: normalize_word + 중복 제거 후 유일한 단어 개수
    thesaurus: 줄 수 (tab 구분) 또는 그룹 단위
    DB 접근 없음.
    """
    결과 = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    도메인경로 = os.path.join(DOMAIN_DIR, site.lower())
    추가경로 = _extra_search_paths(site)
    if not os.path.isdir(도메인경로) and not 추가경로:
        return 결과
    for dic_type, patterns in _사전파일패턴.items():
        파일경로 = _find_dict_file(도메인경로, patterns, 추가경로=추가경로)
        if 파일경로 and os.path.isfile(파일경로):
            try:
                if dic_type in ("udic", "cndic"):
                    결과[dic_type] = len(_file_unique_words(파일경로))
                else:
                    # thesaurus: 단순 줄 수 (빈 줄 제외)
                    with open(파일경로, 'rb') as f:
                        결과[dic_type] = sum(1 for line in f if line.strip())
            except Exception:
                pass
    return 결과


def preview_dict_import_diff(db: Session, site: str) -> dict:
    """파일 vs 현재 DB 대조 미리보기 — (key, value) 완전일치 기준.

    분류 (udic/cndic/thesaurus 공통):
      - new: DB에 키 자체가 없음 → INSERT 대상
      - modified: 키는 있지만 값(메모/tail)이 다름 → overwrite 시 UPDATE, append 시 SKIP
      - same: 키+값이 완전 일치 → 어떤 모드에서도 변경 없음
      - duplicate = modified + same (기존 호환 필드, '키 이미있음' 의미)

    반환 형식:
      {
        "udic":  {"file": N, "db": M, "new": X, "modified": Y, "same": Z, "duplicate": Y+Z},
        "cndic": {...},
        "thesaurus": {...}
      }
    """
    결과 = {
        "udic": {"file": 0, "db": 0, "new": 0, "modified": 0, "same": 0, "duplicate": 0},
        "cndic": {"file": 0, "db": 0, "new": 0, "modified": 0, "same": 0, "duplicate": 0},
        "thesaurus": {"file": 0, "db": 0, "new": None, "modified": None, "same": None, "duplicate": None},
    }
    도메인경로 = os.path.join(DOMAIN_DIR, site.lower())
    추가경로 = _extra_search_paths(site)
    if not os.path.isdir(도메인경로) and not 추가경로:
        return 결과

    for dic_type in ("udic", "cndic"):
        파일경로 = _find_dict_file(도메인경로, _사전파일패턴[dic_type], 추가경로=추가경로)
        if not (파일경로 and os.path.isfile(파일경로)):
            continue
        try:
            파일맵 = _file_unique_word_memo(파일경로)  # {word: memo}
            tbl = _dict_table(db, site, dic_type)
            db맵 = {r[0]: r[1] for r in db.execute(select(tbl.c._WORD, tbl.c._MEMO)).all()}

            new_count = 0
            modified_count = 0
            same_count = 0
            for word, memo in 파일맵.items():
                if word not in db맵:
                    new_count += 1
                elif db맵[word] != memo:
                    modified_count += 1
                else:
                    same_count += 1

            결과[dic_type] = {
                "file": len(파일맵),
                "db": len(db맵),
                "new": new_count,
                "modified": modified_count,
                "same": same_count,
                "duplicate": modified_count + same_count,
            }
        except Exception:
            pass

    # thesaurus: (head, tail, memo) 완전 일치 기준
    thes_파일 = _find_dict_file(도메인경로, _사전파일패턴["thesaurus"], 추가경로=추가경로)
    if thes_파일 and os.path.isfile(thes_파일):
        try:
            # 파일 파싱: 단순 라인 수는 빠르게 셈 (그룹/탭 형식은 미리보기에서 정확 대조 생략)
            with open(thes_파일, 'rb') as f:
                thes_cnt = sum(1 for line in f if line.strip())
            tbl = _dict_table(db, site, "thesaurus")
            thes_db = db.execute(select(func.count()).select_from(tbl)).scalar() or 0
            결과["thesaurus"] = {
                "file": thes_cnt,
                "db": thes_db,
                "new": None,
                "modified": None,
                "same": None,
                "duplicate": None,
            }
        except Exception:
            pass

    return 결과





# ─── 비동기 임포트 + 진행률 추적 ────────────────────────────────

_임포트진행률: dict = {}
_임포트취소: dict = {}  # site -> bool (취소 요청 플래그)


class _ImportCancelled(Exception):
    """임포트 취소 요청 감지 시 발생."""
    pass


def request_import_cancel(site: str) -> bool:
    """임포트 작업 취소 요청. 진행 중이면 True, 아니면 False."""
    진행 = _임포트진행률.get(site)
    if not 진행 or 진행.get("status") != "running":
        return False
    _임포트취소[site] = True
    return True


def _check_cancelled(site: Optional[str]) -> None:
    """취소 요청 확인. 요청됐으면 _ImportCancelled 예외 발생."""
    if site and _임포트취소.get(site):
        raise _ImportCancelled()


def start_async_file_import(site: str, user_id: str = None,
                      import_udic: bool = True, import_cndic: bool = True, import_thesaurus: bool = True,
                      mode: str = "create") -> str:
    """백그라운드 스레드에서 임포트 시작. run_id 반환."""
    import uuid as uuid_mod
    run_id = uuid_mod.uuid4().hex[:8]
    미리보기 = preview_dict_file_count(site)
    전체건수 = 0
    if import_udic:
        전체건수 += 미리보기.get("udic", 0)
    if import_cndic:
        전체건수 += 미리보기.get("cndic", 0)
    if import_thesaurus:
        전체건수 += 미리보기.get("thesaurus", 0)
    _임포트진행률[site] = {
        "status": "running", "total": 전체건수, "current": 0,
        "percent": 0, "stage": "preparing", "result": None, "run_id": run_id,
    }
    _임포트취소.pop(site, None)  # 이전 취소 플래그 정리

    def _task():
        from core.database import 세션팩토리
        db = None
        try:
            db = 세션팩토리()
            결과 = _sync_file_import(db, site, user_id=user_id, progress_site=site,
                              import_udic=import_udic, import_cndic=import_cndic, import_thesaurus=import_thesaurus,
                              mode=mode)
            _임포트진행률[site]["status"] = "done"
            _임포트진행률[site]["percent"] = 100
            _임포트진행률[site]["result"] = 결과
        except _ImportCancelled:
            if db:
                try: db.rollback()
                except Exception: pass
            _임포트진행률[site]["status"] = "cancelled"
            _임포트진행률[site]["result"] = {"message": "사용자 취소"}
        except Exception as e:
            if db:
                try: db.rollback()
                except Exception: pass
            _임포트진행률[site]["status"] = "error"
            _임포트진행률[site]["result"] = {"error": str(e)}
        finally:
            if db:
                try: db.close()
                except Exception: pass
            _임포트취소.pop(site, None)

    threading.Thread(target=_task, daemon=True).start()
    return run_id


def get_import_progress_service(site: str) -> dict:
    """진행률 조회. complete/오류 시 해당 결과도 포함."""
    return _임포트진행률.get(site, {"status": "idle"})


def _update_progress(progress_site: str, current: int, stage: str = None):
    """진행률 딕셔너리 갱신 헬퍼."""
    진행 = _임포트진행률.get(progress_site)
    if not 진행:
        return
    진행["current"] = current
    if stage:
        진행["stage"] = stage
    진행["percent"] = int(current / 진행["total"] * 100) if 진행["total"] > 0 else 0


def _import_udic_cndic_file(
    db: Session, site: str, dic_type: str, 파일경로: str,
    user_id: Optional[str] = None,
    progress_site: Optional[str] = None, progress_offset: int = 0,
    mode: str = "create",
) -> dict:
    """udic/cndic .ks 파일을 읽어 DB에 INSERT.

    최적화(2026-04-13): DB 단어 집합을 1회만 로드해 메모리 set 대조 + bulk INSERT/UPDATE.
    - mode=create: DELETE ALL → 파일 전량 bulk INSERT (DB 조회 불필요)
    - mode=overwrite: DB 집합 1회 로드 → 신규는 INSERT, 기존은 UPDATE(_MEMO 변경 시만)
    - mode=append: DB 집합 1회 로드 → 신규만 INSERT, 기존은 SKIP

    진행률(stage): loading_db / matching / inserting / updating
    """
    tbl = _dict_table(db, site, dic_type)
    BATCH = 2000

    # 1) 파일에서 유일 단어 목록 추출
    _check_cancelled(progress_site)
    if progress_site:
        _update_progress(progress_site, progress_offset, f"{dic_type}_reading")
    줄list_tasks = _read_file(파일경로)
    파일항목: list = []  # (word, memo)
    중복set: set = set()
    for 줄 in 줄list_tasks:
        parts = 줄.split("\t", 1)
        word = normalize_word(parts[0].strip())
        memo = parts[1].strip() if len(parts) > 1 else None
        if not word or word in 중복set:
            continue
        중복set.add(word)
        파일항목.append((word, memo))
    파일총수 = len(파일항목)

    삽입수 = 0; 업데이트수 = 0; 스킵수 = 0

    if mode == "create":
        # 기존 전체 삭제 후 파일 전량 INSERT
        _check_cancelled(progress_site)
        if progress_site:
            _update_progress(progress_site, progress_offset, f"{dic_type}_deleting")
        db.execute(delete(tbl))

        if progress_site:
            _update_progress(progress_site, progress_offset, f"{dic_type}_inserting")
        now = datetime.now()
        batch: list = []
        처리수 = 0
        for word, memo in 파일항목:
            _check_cancelled(progress_site)
            batch.append({"_WORD": word, "_MEMO": memo, "_USER_ID": user_id, "_UPDATED": now})
            if len(batch) >= BATCH:
                db.execute(insert(tbl), batch)
                batch = []
            처리수 += 1
            if progress_site and 처리수 % 1000 == 0:
                _update_progress(progress_site, progress_offset + 처리수)
        if batch:
            db.execute(insert(tbl), batch)
        삽입수 = 파일총수

    else:
        # overwrite/append: DB 집합 1회 로드 → 메모리 set 대조
        _check_cancelled(progress_site)
        if progress_site:
            _update_progress(progress_site, progress_offset, f"{dic_type}_loading_db")
        # _WORD + _MEMO 함께 로드 (overwrite 모드에서 _MEMO 비교용)
        rows = db.execute(select(tbl.c._WORD, tbl.c._MEMO)).all()
        db맵: dict = {r[0]: r[1] for r in rows}

        _check_cancelled(progress_site)
        if progress_site:
            _update_progress(progress_site, progress_offset, f"{dic_type}_matching")

        new_batch: list = []
        update_batch: list = []
        now = datetime.now()
        처리수 = 0

        for word, memo in 파일항목:
            _check_cancelled(progress_site)
            if word in db맵:
                if mode == "overwrite":
                    # _MEMO 변경된 경우만 UPDATE
                    if db맵[word] != memo:
                        update_batch.append({"word_": word, "_MEMO": memo, "_USER_ID": user_id, "_UPDATED": now})
                        업데이트수 += 1
                    else:
                        스킵수 += 1
                else:  # append
                    스킵수 += 1
            else:
                new_batch.append({"_WORD": word, "_MEMO": memo, "_USER_ID": user_id, "_UPDATED": now})
                삽입수 += 1
            처리수 += 1
            if progress_site and 처리수 % 2000 == 0:
                _update_progress(progress_site, progress_offset + 처리수)

        # bulk INSERT (신규)
        if new_batch:
            _check_cancelled(progress_site)
            if progress_site:
                _update_progress(progress_site, progress_offset + 처리수, f"{dic_type}_inserting")
            for i in range(0, len(new_batch), BATCH):
                _check_cancelled(progress_site)
                db.execute(insert(tbl), new_batch[i:i + BATCH])

        # bulk UPDATE (_MEMO 변경된 기존)
        if update_batch:
            _check_cancelled(progress_site)
            if progress_site:
                _update_progress(progress_site, progress_offset + 처리수, f"{dic_type}_updating")
            upd_stmt = update(tbl).where(tbl.c._WORD == bindparam("word_")).values(
                _MEMO=bindparam("_MEMO"), _USER_ID=bindparam("_USER_ID"), _UPDATED=bindparam("_UPDATED"),
            )
            for i in range(0, len(update_batch), BATCH):
                _check_cancelled(progress_site)
                db.execute(upd_stmt, update_batch[i:i + BATCH])

    if progress_site:
        _update_progress(progress_site, progress_offset + 파일총수)
    db.commit()
    return {"inserted": 삽입수, "updated": 업데이트수, "skipped": 스킵수}


def _import_thesaurus_file(
    db: Session, site: str, 파일경로: str,
    user_id: Optional[str] = None,
    progress_site: Optional[str] = None, progress_offset: int = 0,
    mode: str = "create",
) -> dict:
    """addedsyn/synonym.UTF-8 파일을 읽어 thesaurus DB에 INSERT.

    최적화(2026-04-13): DB 집합 1회 로드 + 메모리 dict 대조 + bulk INSERT/UPDATE.
    - mode=create: DELETE ALL → 파일 전량 bulk INSERT
    - mode=overwrite: DB dict 1회 로드 → 신규 INSERT, 기존은 _TAIL_WORD/_MEMO 변경 시만 UPDATE
    - mode=append: DB 집합 1회 로드 → 신규만 INSERT, 기존은 SKIP

    지원 형식:
    1) 탭 구분: head_word\\ttail_word[\\tmemo]
    2) 쉼표 구분: head,tail1,tail2,...
    3) 그룹 형식: 빈줄로 구분된 단어 그룹 (첫 단어=head, 나머지=tail 쉼표 결합)
    """
    tbl = _dict_table(db, site, "thesaurus")
    BATCH = 2000

    # 1) 파일 읽기
    _check_cancelled(progress_site)
    if progress_site:
        _update_progress(progress_site, progress_offset, "thesaurus_reading")

    빈줄포함list_tasks = []
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(파일경로, "r", encoding=enc) as f:
                for line in f:
                    stripped = line.rstrip("\r\n")
                    빈줄포함list_tasks.append(stripped.strip())
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    # 형식 감지 (첫 10줄 기준)
    비공백줄 = [l for l in 빈줄포함list_tasks if l]
    탭형식 = any("\t" in l for l in 비공백줄[:10])
    쉼표형식 = not 탭형식 and any("," in l for l in 비공백줄[:10])

    # 2) 파일에서 유일 항목 추출 (head 중복 제거)
    파일항목: list = []  # (head, tail, memo)
    중복set: set = set()

    if 쉼표형식:
        for 줄 in 비공백줄:
            parts = 줄.split(",")
            head = normalize_word(parts[0].strip())
            tail_parts = [p.strip() for p in parts[1:] if p.strip()]
            tail = ",".join(tail_parts)
            if not head or not tail or head in 중복set:
                continue
            중복set.add(head)
            파일항목.append((head, tail, None))
    elif 탭형식:
        for 줄 in 비공백줄:
            parts = 줄.split("\t")
            if len(parts) < 2:
                continue
            head = normalize_word(parts[0].strip())
            tail = parts[1].strip()
            memo = parts[2].strip() if len(parts) > 2 else None
            if not head or not tail or head in 중복set:
                continue
            중복set.add(head)
            파일항목.append((head, tail, memo))
    else:
        빈줄있음 = any(l == "" for l in 빈줄포함list_tasks)
        if 빈줄있음:
            groups: List[List[str]] = []
            현재그룹: List[str] = []
            for 줄 in 빈줄포함list_tasks:
                if 줄:
                    현재그룹.append(줄)
                else:
                    if 현재그룹:
                        groups.append(현재그룹)
                        현재그룹 = []
            if 현재그룹:
                groups.append(현재그룹)
            for grp in groups:
                head = normalize_word(grp[0])
                tail_words = [normalize_word(w) for w in grp[1:] if w.strip()]
                if not head or head in 중복set:
                    continue
                중복set.add(head)
                파일항목.append((head, ",".join(tail_words) if tail_words else "", None))
        else:
            for 줄 in 비공백줄:
                word = normalize_word(줄)
                if not word or word in 중복set:
                    continue
                중복set.add(word)
                파일항목.append((word, "", None))

    파일총수 = len(파일항목)
    삽입수 = 0; 업데이트수 = 0; 스킵수 = 0

    if mode == "create":
        # 전체 삭제 후 파일 전량 bulk INSERT
        _check_cancelled(progress_site)
        if progress_site:
            _update_progress(progress_site, progress_offset, "thesaurus_deleting")
        db.execute(delete(tbl))

        if progress_site:
            _update_progress(progress_site, progress_offset, "thesaurus_inserting")
        now = datetime.now()
        batch: list = []
        처리수 = 0
        for head, tail, memo in 파일항목:
            _check_cancelled(progress_site)
            batch.append({
                "_HEAD_WORD": head, "_TAIL_WORD": tail, "_MEMO": memo,
                "_USER_ID": user_id, "_UPDATED": now,
            })
            if len(batch) >= BATCH:
                db.execute(insert(tbl), batch)
                batch = []
            처리수 += 1
            if progress_site and 처리수 % 1000 == 0:
                _update_progress(progress_site, progress_offset + 처리수)
        if batch:
            db.execute(insert(tbl), batch)
        삽입수 = 파일총수

    else:
        # overwrite/append: DB (_HEAD_WORD, _TAIL_WORD, _MEMO) 1회 로드
        _check_cancelled(progress_site)
        if progress_site:
            _update_progress(progress_site, progress_offset, "thesaurus_loading_db")
        db_rows = db.execute(select(tbl.c._HEAD_WORD, tbl.c._TAIL_WORD, tbl.c._MEMO)).all()
        db맵: dict = {r[0]: (r[1], r[2]) for r in db_rows}

        _check_cancelled(progress_site)
        if progress_site:
            _update_progress(progress_site, progress_offset, "thesaurus_matching")

        new_batch: list = []
        update_batch: list = []
        now = datetime.now()
        처리수 = 0

        for head, tail, memo in 파일항목:
            _check_cancelled(progress_site)
            if head in db맵:
                if mode == "overwrite":
                    cur_tail, cur_memo = db맵[head]
                    # _TAIL_WORD 또는 _MEMO 변경된 경우만 UPDATE
                    if cur_tail != tail or cur_memo != memo:
                        update_batch.append({
                            "head_": head, "_TAIL_WORD": tail, "_MEMO": memo,
                            "_USER_ID": user_id, "_UPDATED": now,
                        })
                        업데이트수 += 1
                    else:
                        스킵수 += 1
                else:  # append
                    스킵수 += 1
            else:
                new_batch.append({
                    "_HEAD_WORD": head, "_TAIL_WORD": tail, "_MEMO": memo,
                    "_USER_ID": user_id, "_UPDATED": now,
                })
                삽입수 += 1
            처리수 += 1
            if progress_site and 처리수 % 2000 == 0:
                _update_progress(progress_site, progress_offset + 처리수)

        # bulk INSERT (신규)
        if new_batch:
            _check_cancelled(progress_site)
            if progress_site:
                _update_progress(progress_site, progress_offset + 처리수, "thesaurus_inserting")
            for i in range(0, len(new_batch), BATCH):
                _check_cancelled(progress_site)
                db.execute(insert(tbl), new_batch[i:i + BATCH])

        # bulk UPDATE (변경된 기존)
        if update_batch:
            _check_cancelled(progress_site)
            if progress_site:
                _update_progress(progress_site, progress_offset + 처리수, "thesaurus_updating")
            upd_stmt = update(tbl).where(tbl.c._HEAD_WORD == bindparam("head_")).values(
                _TAIL_WORD=bindparam("_TAIL_WORD"), _MEMO=bindparam("_MEMO"),
                _USER_ID=bindparam("_USER_ID"), _UPDATED=bindparam("_UPDATED"),
            )
            for i in range(0, len(update_batch), BATCH):
                _check_cancelled(progress_site)
                db.execute(upd_stmt, update_batch[i:i + BATCH])

    if progress_site:
        _update_progress(progress_site, progress_offset + 파일총수)
    db.commit()
    return {"inserted": 삽입수, "updated": 업데이트수, "skipped": 스킵수}


def _sync_file_import(db: Session, site: str, user_id: Optional[str] = None, progress_site: Optional[str] = None,
                   import_udic: bool = True, import_cndic: bool = True, import_thesaurus: bool = True,
                   mode: str = "create") -> dict:
    """도메인 디렉토리에서 사전 파일을 읽어 DB에 임포트.

    mode: create(DELETE ALL→INSERT), overwrite(UPDATE+INSERT), append(INSERT OR IGNORE).
    반환: {"udic": {...}, "cndic": {...}, "thesaurus": {...}}
    """
    validate_site_name(site)
    도메인경로 = os.path.join(DOMAIN_DIR, site.lower())
    추가경로 = _extra_search_paths(site)
    if not os.path.isdir(도메인경로) and not 추가경로:
        raise HTTPException(status_code=404, detail=f"도메인 디렉토리를 찾을 수 없음: {site}")

    _빈결과 = {"inserted": 0, "updated": 0, "skipped": 0}
    결과 = {"udic": dict(_빈결과), "cndic": dict(_빈결과), "thesaurus": dict(_빈결과)}
    누적 = 0

    # UDIC: user.ks 또는 user*.ks
    if import_udic:
        if progress_site:
            _update_progress(progress_site, 누적, "udic")
        udic파일 = _find_dict_file(도메인경로, ["user.ks", "user*.ks"], 추가경로=추가경로)
        if udic파일:
            결과["udic"] = _import_udic_cndic_file(db, site, "udic", udic파일, user_id, progress_site, 누적, mode=mode)
            누적 += 결과["udic"]["inserted"] + 결과["udic"]["updated"] + 결과["udic"]["skipped"]

    # CNDIC: cnlist.ks 또는 cnlist*.ks
    if import_cndic:
        if progress_site:
            _update_progress(progress_site, 누적, "cndic")
        cndic파일 = _find_dict_file(도메인경로, ["cnlist.ks", "cnlist*.ks"], 추가경로=추가경로)
        if cndic파일:
            결과["cndic"] = _import_udic_cndic_file(db, site, "cndic", cndic파일, user_id, progress_site, 누적, mode=mode)
            누적 += 결과["cndic"]["inserted"] + 결과["cndic"]["updated"] + 결과["cndic"]["skipped"]

    # THESAURUS: quasisynonym 또는 addedsyn
    if import_thesaurus:
        if progress_site:
            _update_progress(progress_site, 누적, "thesaurus")
        thesaurus파일 = _find_dict_file(도메인경로, _사전파일패턴["thesaurus"], 추가경로=추가경로)
        if thesaurus파일:
            결과["thesaurus"] = _import_thesaurus_file(db, site, thesaurus파일, user_id, progress_site, 누적, mode=mode)

    return 결과


def import_dict_from_file(db: Session, site: str, user_id: Optional[str] = None) -> dict:
    """동기 임포트 래퍼 (기존 호환)."""
    return _sync_file_import(db, site, user_id=user_id)


# ─── 도메인 사전 복사 ─────────────────────────────────────────────

def copy_domain_dict(db: Session, source_site: str, target_site: str) -> dict:
    """기존 SQLite 도메인의 사전 4종(UDIC/CNDIC/THESAURUS/CATEGORY)을 새 도메인으로 복사."""
    validate_site_name(source_site)
    validate_site_name(target_site)
    결과 = {}
    for dic_type in ("udic", "cndic", "thesaurus", "category"):
        src_tbl = _dict_table(db, source_site, dic_type)
        tgt_tbl = _dict_table(db, target_site, dic_type)
        db.execute(delete(tgt_tbl))
        rows = db.execute(select(src_tbl)).mappings().all()
        if dic_type in ("udic", "cndic"):
            for r in rows:
                db.execute(insert(tgt_tbl).values(
                    _WORD=r["_WORD"], _MEMO=r.get("_MEMO"),
                    _USER_ID=r.get("_USER_ID"), _UPDATED=datetime.now(),
                ))
        elif dic_type == "thesaurus":
            for r in rows:
                db.execute(insert(tgt_tbl).values(
                    _HEAD_WORD=r["_HEAD_WORD"], _TAIL_WORD=r.get("_TAIL_WORD"),
                    _MEMO=r.get("_MEMO"), _USER_ID=r.get("_USER_ID"), _UPDATED=datetime.now(),
                ))
        else:  # category
            for r in rows:
                db.execute(insert(tgt_tbl).values(
                    _WORD=r["_WORD"],
                    _DISPLAY_CATEGORY=r.get("_DISPLAY_CATEGORY"),
                    _DELETE_CATEGORY=r.get("_DELETE_CATEGORY"),
                    _USER_ID=r.get("_USER_ID"), _UPDATED=datetime.now(),
                ))
        결과[dic_type] = len(rows)
    db.commit()
    return 결과


def list_mysql_domains() -> list:
    """MySQL know_mng에서 _THESAURUS 테이블이 존재하는 도메인명 목록 반환."""
    import pymysql
    try:
        conn = pymysql.connect(
            host="localhost", user="root", password="@!roqkftjqj#",
            database="know_mng", charset="utf8",
        )
        cur = conn.cursor()
        cur.execute(
            "SELECT DISTINCT REPLACE(TABLE_NAME, '_THESAURUS', '') "
            "FROM information_schema.tables "
            "WHERE TABLE_SCHEMA = 'know_mng' AND TABLE_NAME LIKE '%\\_THESAURUS'"
        )
        domains = sorted(r[0] for r in cur.fetchall())
        conn.close()
        return domains
    except Exception:
        return []


def get_mysql_dict_count(site: str) -> dict:
    """MySQL에서 도메인 사전 4종 건수 반환 (udic/cndic/thesaurus/category)."""
    import pymysql
    결과 = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    try:
        conn = pymysql.connect(
            host="localhost", user="root", password="@!roqkftjqj#",
            database="know_mng", charset="utf8",
        )
        cur = conn.cursor()
        for dic_type, suffix in [("udic", "_UDIC"), ("cndic", "_CNDIC"), ("thesaurus", "_THESAURUS"), ("category", "_CATEGORY")]:
            try:
                cur.execute(f"SELECT COUNT(*) FROM `{site}{suffix}`")
                결과[dic_type] = cur.fetchone()[0]
            except Exception:
                결과[dic_type] = 0
        conn.close()
    except Exception:
        pass
    return 결과


def migrate_dict_from_mysql(
    target_site: str,
    mysql_site: str,
    progress_callback: "Callable[[int], None] | None" = None,
) -> dict:
    """MySQL의 사전 4종(UDIC/CNDIC/THESAURUS/CATEGORY)을 SQLite 새 도메인으로 마이그레이션.

    Args:
        progress_callback: 진행률(0~100) 콜백. 각 사전 처리 완료 시 호출.
    """
    import pymysql
    from core.database import 세션팩토리

    validate_site_name(target_site)

    mysql_conn = pymysql.connect(
        host="localhost", user="root", password="@!roqkftjqj#",
        database="know_mng", charset="utf8",
    )
    db = 세션팩토리()

    # 4종 사전 처리 단계별 진행률 구간: (시작%, 종료%)
    # 92%에서 시작해 udic→cndic→thesaurus→category 순으로 99%까지
    _단계구간 = [(50, 62), (62, 75), (75, 99), (99, 99)]
    _배치크기 = 10000
    결과 = {}
    try:
        for idx, (dic_type, suffix) in enumerate([("udic", "_UDIC"), ("cndic", "_CNDIC"), ("thesaurus", "_THESAURUS"), ("category", "_CATEGORY")]):
            mysql_tbl = f"{mysql_site}{suffix}"
            tgt_tbl = _dict_table(db, target_site, dic_type)
            pct_start, pct_end = _단계구간[idx]

            try:
                cur = mysql_conn.cursor()
                cur.execute(f"SELECT COUNT(*) FROM `{mysql_tbl}`")
                cnt = cur.fetchone()[0]

                if cnt == 0:
                    결과[dic_type] = 0
                else:
                    db.execute(delete(tgt_tbl))

                    if dic_type in ("udic", "cndic"):
                        cur.execute(f"SELECT _WORD FROM `{mysql_tbl}`")
                    elif dic_type == "thesaurus":
                        cur.execute(f"SELECT _HEAD_WORD, _TAIL_WORD FROM `{mysql_tbl}`")
                    else:  # category
                        cur.execute(f"SELECT _WORD, _DISPLAY_CATEGORY, _DELETE_CATEGORY FROM `{mysql_tbl}`")

                    처리건수 = 0
                    while True:
                        rows = cur.fetchmany(_배치크기)
                        if not rows:
                            break
                        for r in rows:
                            if dic_type in ("udic", "cndic"):
                                db.execute(insert(tgt_tbl).values(
                                    _WORD=r[0], _UPDATED=datetime.now(),
                                ))
                            elif dic_type == "thesaurus":
                                db.execute(insert(tgt_tbl).values(
                                    _HEAD_WORD=r[0], _TAIL_WORD=r[1], _UPDATED=datetime.now(),
                                ))
                            else:  # category
                                db.execute(insert(tgt_tbl).values(
                                    _WORD=r[0], _DISPLAY_CATEGORY=r[1],
                                    _DELETE_CATEGORY=r[2], _UPDATED=datetime.now(),
                                ))
                        db.commit()
                        처리건수 += len(rows)
                        # 배치 완료마다 구간 내 세분화된 진행률 콜백
                        if progress_callback and pct_end > pct_start and cnt > 0:
                            구간내비율 = min(처리건수 / cnt, 1.0)
                            세분퍼센트 = int(pct_start + (pct_end - pct_start) * 구간내비율)
                            progress_callback(세분퍼센트)

                    결과[dic_type] = 처리건수

            except Exception as e:
                결과[dic_type] = f"오류: {e}"

            # 각 사전 완료 후 종료 퍼센트 콜백
            if progress_callback:
                progress_callback(pct_end)

        return 결과
    finally:
        db.close()
        mysql_conn.close()
