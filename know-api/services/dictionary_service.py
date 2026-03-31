from __future__ import annotations
import glob
import os
import re
import threading
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete, func, MetaData
from sqlalchemy.exc import OperationalError, ProgrammingError
from fastapi import HTTPException
from models.dictionary import 사이트명검증, 사전테이블가져오기

DOMAIN_DIR = "/home/know/apps/know-ops/domain"

# 사전 타입 허용 목록
_허용사전타입 = {"udic", "cndic"}


def 단어정규화(word: str) -> str:
    """Java modifyWord() 동일 로직: 대문자 + BOM/쉼표/공백 제거."""
    if not word:
        return word
    result = word.upper()
    result = result.replace('\ufeff', '')   # BOM 제거
    result = result.replace(',', '')        # 쉼표 제거
    result = re.sub(r'\s', '', result)      # 공백/탭/줄바꿈 제거
    return result


def _사전테이블(db: Session, site: str, dic_type: str):
    """세션 바인드 엔진의 메타데이터로 사전 테이블 반환."""
    meta = MetaData()
    return 사전테이블가져오기(site.upper(), dic_type, meta)


def _타입검증(dic_type: str) -> None:
    if dic_type not in _허용사전타입:
        raise HTTPException(status_code=400, detail=f"알 수 없는 사전 타입: {dic_type} (허용: {_허용사전타입})")


# ─── UDIC / CNDIC ──────────────────────────────────────────────────

def 사전목록조회(
    db: Session,
    site: str,
    dic_type: str,
    page: int = 1,
    size: int = 50,
    search: Optional[str] = None,
) -> dict:
    """사전 항목 목록 페이지네이션 조회 (udic/cndic)."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    offset = (page - 1) * size

    where_clause = []
    if search:
        키워드 = 단어정규화(search)
        where_clause.append(tbl.c._WORD.like(f"%{키워드}%"))

    cnt_stmt = select(func.count()).select_from(tbl)
    lst_stmt = select(tbl).offset(offset).limit(size)
    if where_clause:
        cnt_stmt = cnt_stmt.where(*where_clause)
        lst_stmt = lst_stmt.where(*where_clause)

    try:
        total = db.execute(cnt_stmt).scalar() or 0
        rows = db.execute(lst_stmt).mappings().all()
        items = [{"word": r["_WORD"], "memo": r.get("_MEMO")} for r in rows]
    except (OperationalError, ProgrammingError):
        return {"items": [], "total": 0, "page": page, "size": size}
    return {"items": items, "total": total, "page": page, "size": size}


def 사전항목추가(db: Session, site: str, dic_type: str, word: str, memo: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """사전 항목 추가 (단어정규화 적용)."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    정규화단어 = 단어정규화(word)

    # 중복 확인
    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 단어: {정규화단어}")

    db.execute(insert(tbl).values(_WORD=정규화단어, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now()))
    db.commit()
    return {"word": 정규화단어, "memo": memo}


def 사전항목수정(db: Session, site: str, dic_type: str, word: str, memo: Optional[str] = None) -> dict:
    """사전 항목 메모 수정."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    정규화단어 = 단어정규화(word)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"단어를 찾을 수 없음: {정규화단어}")

    db.execute(update(tbl).where(tbl.c._WORD == 정규화단어).values(_MEMO=memo, _UPDATED=datetime.now()))
    db.commit()
    return {"word": 정규화단어, "memo": memo}


def 사전항목삭제(db: Session, site: str, dic_type: str, word: str) -> None:
    """사전 항목 삭제."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    정규화단어 = 단어정규화(word)

    존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == 정규화단어)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"단어를 찾을 수 없음: {정규화단어}")

    db.execute(delete(tbl).where(tbl.c._WORD == 정규화단어))
    db.commit()


def 일괄항목추가(
    db: Session,
    site: str,
    dic_type: str,
    items: List[dict],
    user_id: Optional[str] = None,
) -> dict:
    """사전 항목 일괄 등록 (각 word 정규화 후 INSERT, 중복은 건너뜀)."""
    _타입검증(dic_type)
    사이트명검증(site)
    tbl = _사전테이블(db, site, dic_type)
    성공 = 0
    건너뜀 = 0
    for item in items:
        정규화단어 = 단어정규화(item.get("word", ""))
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


# ─── THESAURUS (_HEAD_WORD PK, _TAIL_WORD = 쉼표 구분 목록) ────────

def 유의어목록조회(db: Session, site: str, page: int = 1, size: int = 50, search: Optional[str] = None) -> dict:
    """유의어 목록 페이지네이션 조회."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    offset = (page - 1) * size

    where_clause = []
    if search:
        키워드 = 단어정규화(search)
        where_clause.append(tbl.c._HEAD_WORD.like(f"%{키워드}%"))

    cnt_stmt = select(func.count()).select_from(tbl)
    lst_stmt = select(tbl).offset(offset).limit(size)
    if where_clause:
        cnt_stmt = cnt_stmt.where(*where_clause)
        lst_stmt = lst_stmt.where(*where_clause)

    try:
        total = db.execute(cnt_stmt).scalar() or 0
        rows = db.execute(lst_stmt).mappings().all()
        items = [{"head_word": r["_HEAD_WORD"], "tail_word": r["_TAIL_WORD"], "memo": r.get("_MEMO")} for r in rows]
    except (OperationalError, ProgrammingError):
        return {"items": [], "total": 0, "page": page, "size": size}
    return {"items": items, "total": total, "page": page, "size": size}


def 유의어추가(db: Session, site: str, head_word: str, tail_word: str, memo: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """유의어 추가."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    정규화head = 단어정규화(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if 존재:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 유의어 헤드: {정규화head}")
    db.execute(insert(tbl).values(_HEAD_WORD=정규화head, _TAIL_WORD=tail_word, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now()))
    db.commit()
    return {"head_word": 정규화head, "tail_word": tail_word, "memo": memo}


def 유의어수정(db: Session, site: str, head_word: str, tail_word: str, memo: Optional[str] = None) -> dict:
    """유의어 수정."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    정규화head = 단어정규화(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"유의어를 찾을 수 없음: {정규화head}")
    db.execute(update(tbl).where(tbl.c._HEAD_WORD == 정규화head).values(_TAIL_WORD=tail_word, _MEMO=memo, _UPDATED=datetime.now()))
    db.commit()
    return {"head_word": 정규화head, "tail_word": tail_word, "memo": memo}


def 유의어삭제(db: Session, site: str, head_word: str) -> None:
    """유의어 삭제."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    정규화head = 단어정규화(head_word)
    존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == 정규화head)).first()
    if not 존재:
        raise HTTPException(status_code=404, detail=f"유의어를 찾을 수 없음: {정규화head}")
    db.execute(delete(tbl).where(tbl.c._HEAD_WORD == 정규화head))
    db.commit()


def 유의어일괄추가(db: Session, site: str, items: List[dict], user_id: Optional[str] = None) -> dict:
    """유의어 일괄 등록."""
    사이트명검증(site)
    tbl = _사전테이블(db, site, "thesaurus")
    성공 = 0
    건너뜀 = 0
    for item in items:
        정규화head = 단어정규화(item.get("head_word", ""))
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

def _사전파일찾기(도메인경로: str, patterns: List[str], 추가경로: Optional[List[str]] = None) -> Optional[str]:
    """도메인 디렉토리에서 패턴에 맞는 사전 파일 찾기. 추가경로도 탐색."""
    탐색경로목록 = [도메인경로]
    if 추가경로:
        탐색경로목록.extend(추가경로)
    # 패턴 우선순위가 경로보다 높음 (quasisynonym이 addedsyn보다 우선)
    for pattern in patterns:
        for 경로 in 탐색경로목록:
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
    return None


def _파일읽기(파일경로: str) -> List[str]:
    """파일을 읽어 줄 목록 반환 (빈줄 제거, BOM/CR 처리)."""
    줄목록 = []
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(파일경로, "r", encoding=enc) as f:
                for line in f:
                    줄 = line.rstrip("\r\n").strip()
                    if 줄:
                        줄목록.append(줄)
            return 줄목록
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 줄목록


# ─── 파일 건수 미리보기 ──────────────────────────────────────────

_사전파일패턴 = {
    "udic": ["user.ks", "user*.ks"],
    "cndic": ["cnlist.ks", "cnlist*.ks"],
    "thesaurus": ["txt_resrc/synonym.UTF-8"],
}


def _추가탐색경로(site: str) -> List[str]:
    """사이트별 추가 탐색 경로 목록 반환."""
    db경로 = f"/home/know/apps/data/{site.lower()}_db"
    return [db경로] if os.path.isdir(db경로) else []


def 사전파일건수미리보기(site: str) -> dict:
    """도메인 사전 파일의 줄 수(예상 건수)를 반환. DB 접근 없음."""
    결과 = {"udic": 0, "cndic": 0, "thesaurus": 0}
    도메인경로 = os.path.join(DOMAIN_DIR, site.lower())
    추가경로 = _추가탐색경로(site)
    if not os.path.isdir(도메인경로) and not 추가경로:
        return 결과
    for dic_type, patterns in _사전파일패턴.items():
        파일경로 = _사전파일찾기(도메인경로, patterns, 추가경로=추가경로)
        if 파일경로 and os.path.isfile(파일경로):
            try:
                with open(파일경로, 'rb') as f:
                    결과[dic_type] = sum(1 for line in f if line.strip())
            except Exception:
                pass
    return 결과


# ─── 비동기 임포트 + 진행률 추적 ────────────────────────────────

_임포트진행률: dict = {}


def 비동기파일임포트시작(site: str, user_id: str = None,
                      import_udic: bool = True, import_cndic: bool = True, import_thesaurus: bool = True,
                      mode: str = "create") -> str:
    """백그라운드 스레드에서 임포트 시작. run_id 반환."""
    import uuid as uuid_mod
    run_id = uuid_mod.uuid4().hex[:8]
    미리보기 = 사전파일건수미리보기(site)
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

    def _작업():
        from core.database import 세션팩토리
        try:
            db = 세션팩토리()
            결과 = _동기파일임포트(db, site, user_id=user_id, progress_site=site,
                              import_udic=import_udic, import_cndic=import_cndic, import_thesaurus=import_thesaurus,
                              mode=mode)
            _임포트진행률[site]["status"] = "done"
            _임포트진행률[site]["percent"] = 100
            _임포트진행률[site]["result"] = 결과
            db.close()
        except Exception as e:
            _임포트진행률[site]["status"] = "error"
            _임포트진행률[site]["result"] = {"error": str(e)}

    threading.Thread(target=_작업, daemon=True).start()
    return run_id


def 임포트진행률조회(site: str) -> dict:
    """진행률 조회. 완료/오류 시 해당 결과도 포함."""
    return _임포트진행률.get(site, {"status": "idle"})


def _진행률갱신(progress_site: str, current: int, stage: str = None):
    """진행률 딕셔너리 갱신 헬퍼."""
    진행 = _임포트진행률.get(progress_site)
    if not 진행:
        return
    진행["current"] = current
    if stage:
        진행["stage"] = stage
    진행["percent"] = int(current / 진행["total"] * 100) if 진행["total"] > 0 else 0


def _udic_cndic_파일임포트(
    db: Session, site: str, dic_type: str, 파일경로: str,
    user_id: Optional[str] = None,
    progress_site: Optional[str] = None, progress_offset: int = 0,
    mode: str = "create",
) -> dict:
    """udic/cndic .ks 파일을 읽어 DB에 INSERT.
    mode: create(DELETE ALL→INSERT), overwrite(UPDATE+INSERT), append(INSERT OR IGNORE)."""
    tbl = _사전테이블(db, site, dic_type)

    if mode == "create":
        db.execute(delete(tbl))

    줄목록 = _파일읽기(파일경로)
    삽입수 = 0; 업데이트수 = 0; 스킵수 = 0
    중복set: set = set()
    처리수 = 0
    for 줄 in 줄목록:
        parts = 줄.split("\t", 1)
        word = 단어정규화(parts[0].strip())
        memo = parts[1].strip() if len(parts) > 1 else None
        if not word or word in 중복set:
            continue
        중복set.add(word)

        if mode == "create":
            db.execute(insert(tbl).values(
                _WORD=word, _MEMO=memo,
                _USER_ID=user_id, _UPDATED=datetime.now(),
            ))
            삽입수 += 1
        elif mode == "overwrite":
            존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == word)).first()
            if 존재:
                db.execute(update(tbl).where(tbl.c._WORD == word).values(
                    _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                업데이트수 += 1
            else:
                db.execute(insert(tbl).values(
                    _WORD=word, _MEMO=memo,
                    _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                삽입수 += 1
        elif mode == "append":
            존재 = db.execute(select(tbl.c._WORD).where(tbl.c._WORD == word)).first()
            if 존재:
                스킵수 += 1
            else:
                db.execute(insert(tbl).values(
                    _WORD=word, _MEMO=memo,
                    _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                삽입수 += 1

        처리수 += 1
        if progress_site and 처리수 % 1000 == 0:
            _진행률갱신(progress_site, progress_offset + 처리수)
    if progress_site:
        _진행률갱신(progress_site, progress_offset + 처리수)
    db.commit()
    return {"inserted": 삽입수, "updated": 업데이트수, "skipped": 스킵수}


def _thesaurus_파일임포트(
    db: Session, site: str, 파일경로: str,
    user_id: Optional[str] = None,
    progress_site: Optional[str] = None, progress_offset: int = 0,
    mode: str = "create",
) -> dict:
    """addedsyn 파일을 읽어 thesaurus DB에 INSERT.
    mode: create(DELETE ALL→INSERT), overwrite(UPDATE+INSERT), append(INSERT OR IGNORE).

    지원 형식:
    1) 탭 구분: head_word\\ttail_word[\\tmemo]
    2) 그룹 형식: 빈줄로 구분된 단어 그룹 (첫 단어=head, 나머지=tail 쉼표 결합)
    """
    tbl = _사전테이블(db, site, "thesaurus")

    if mode == "create":
        db.execute(delete(tbl))

    빈줄포함목록 = []
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(파일경로, "r", encoding=enc) as f:
                for line in f:
                    stripped = line.rstrip("\r\n")
                    빈줄포함목록.append(stripped.strip())
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    # 형식 감지 (첫 10줄 기준)
    비공백줄 = [l for l in 빈줄포함목록 if l]
    탭형식 = any("\t" in l for l in 비공백줄[:10])
    쉼표형식 = not 탭형식 and any("," in l for l in 비공백줄[:10])

    삽입수 = 0; 업데이트수 = 0; 스킵수 = 0
    중복set: set = set()
    처리수 = 0

    def _thesaurus_행처리(head: str, tail: str, memo: Optional[str] = None):
        nonlocal 삽입수, 업데이트수, 스킵수, 처리수
        if mode == "create":
            db.execute(insert(tbl).values(
                _HEAD_WORD=head, _TAIL_WORD=tail,
                _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now(),
            ))
            삽입수 += 1
        elif mode == "overwrite":
            존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == head)).first()
            if 존재:
                db.execute(update(tbl).where(tbl.c._HEAD_WORD == head).values(
                    _TAIL_WORD=tail, _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                업데이트수 += 1
            else:
                db.execute(insert(tbl).values(
                    _HEAD_WORD=head, _TAIL_WORD=tail,
                    _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                삽입수 += 1
        elif mode == "append":
            존재 = db.execute(select(tbl.c._HEAD_WORD).where(tbl.c._HEAD_WORD == head)).first()
            if 존재:
                스킵수 += 1
            else:
                db.execute(insert(tbl).values(
                    _HEAD_WORD=head, _TAIL_WORD=tail,
                    _MEMO=memo, _USER_ID=user_id, _UPDATED=datetime.now(),
                ))
                삽입수 += 1
        처리수 += 1
        if progress_site and 처리수 % 1000 == 0:
            _진행률갱신(progress_site, progress_offset + 처리수)

    if 쉼표형식:
        # 쉼표 구분: 대표어,유의어1,유의어2,... (quasisynonym 형식)
        for 줄 in 비공백줄:
            parts = 줄.split(",")
            head = 단어정규화(parts[0].strip())
            tail_parts = [p.strip() for p in parts[1:] if p.strip()]
            tail = ",".join(tail_parts)
            if not head or not tail or head in 중복set:
                continue
            중복set.add(head)
            _thesaurus_행처리(head, tail)
    elif 탭형식:
        for 줄 in 비공백줄:
            parts = 줄.split("\t")
            if len(parts) < 2:
                continue
            head = 단어정규화(parts[0].strip())
            tail = parts[1].strip()
            memo = parts[2].strip() if len(parts) > 2 else None
            if not head or not tail or head in 중복set:
                continue
            중복set.add(head)
            _thesaurus_행처리(head, tail, memo)
    else:
        # 그룹 형식: 빈줄로 구분
        빈줄있음 = any(l == "" for l in 빈줄포함목록)
        if 빈줄있음:
            groups: List[List[str]] = []
            현재그룹: List[str] = []
            for 줄 in 빈줄포함목록:
                if 줄:
                    현재그룹.append(줄)
                else:
                    if 현재그룹:
                        groups.append(현재그룹)
                        현재그룹 = []
            if 현재그룹:
                groups.append(현재그룹)
            for grp in groups:
                head = 단어정규화(grp[0])
                tail_words = [단어정규화(w) for w in grp[1:] if w.strip()]
                if not head or head in 중복set:
                    continue
                중복set.add(head)
                _thesaurus_행처리(head, ",".join(tail_words) if tail_words else "")
        else:
            # 빈줄 없는 그룹 형식: 각 단어를 개별 head_word로 등록
            for 줄 in 비공백줄:
                word = 단어정규화(줄)
                if not word or word in 중복set:
                    continue
                중복set.add(word)
                _thesaurus_행처리(word, "")

    if progress_site:
        _진행률갱신(progress_site, progress_offset + 처리수)
    db.commit()
    return {"inserted": 삽입수, "updated": 업데이트수, "skipped": 스킵수}


def _동기파일임포트(db: Session, site: str, user_id: Optional[str] = None, progress_site: Optional[str] = None,
                   import_udic: bool = True, import_cndic: bool = True, import_thesaurus: bool = True,
                   mode: str = "create") -> dict:
    """도메인 디렉토리에서 사전 파일을 읽어 DB에 임포트.

    mode: create(DELETE ALL→INSERT), overwrite(UPDATE+INSERT), append(INSERT OR IGNORE).
    반환: {"udic": {...}, "cndic": {...}, "thesaurus": {...}}
    """
    사이트명검증(site)
    도메인경로 = os.path.join(DOMAIN_DIR, site.lower())
    추가경로 = _추가탐색경로(site)
    if not os.path.isdir(도메인경로) and not 추가경로:
        raise HTTPException(status_code=404, detail=f"도메인 디렉토리를 찾을 수 없음: {site}")

    _빈결과 = {"inserted": 0, "updated": 0, "skipped": 0}
    결과 = {"udic": dict(_빈결과), "cndic": dict(_빈결과), "thesaurus": dict(_빈결과)}
    누적 = 0

    # UDIC: user.ks 또는 user*.ks
    if import_udic:
        if progress_site:
            _진행률갱신(progress_site, 누적, "udic")
        udic파일 = _사전파일찾기(도메인경로, ["user.ks", "user*.ks"], 추가경로=추가경로)
        if udic파일:
            결과["udic"] = _udic_cndic_파일임포트(db, site, "udic", udic파일, user_id, progress_site, 누적, mode=mode)
            누적 += 결과["udic"]["inserted"] + 결과["udic"]["updated"] + 결과["udic"]["skipped"]

    # CNDIC: cnlist.ks 또는 cnlist*.ks
    if import_cndic:
        if progress_site:
            _진행률갱신(progress_site, 누적, "cndic")
        cndic파일 = _사전파일찾기(도메인경로, ["cnlist.ks", "cnlist*.ks"], 추가경로=추가경로)
        if cndic파일:
            결과["cndic"] = _udic_cndic_파일임포트(db, site, "cndic", cndic파일, user_id, progress_site, 누적, mode=mode)
            누적 += 결과["cndic"]["inserted"] + 결과["cndic"]["updated"] + 결과["cndic"]["skipped"]

    # THESAURUS: quasisynonym 또는 addedsyn
    if import_thesaurus:
        if progress_site:
            _진행률갱신(progress_site, 누적, "thesaurus")
        thesaurus파일 = _사전파일찾기(도메인경로, _사전파일패턴["thesaurus"], 추가경로=추가경로)
        if thesaurus파일:
            결과["thesaurus"] = _thesaurus_파일임포트(db, site, thesaurus파일, user_id, progress_site, 누적, mode=mode)

    return 결과


def 파일에서사전임포트(db: Session, site: str, user_id: Optional[str] = None) -> dict:
    """동기 임포트 래퍼 (기존 호환)."""
    return _동기파일임포트(db, site, user_id=user_id)


# ─── 도메인 사전 복사 ─────────────────────────────────────────────

def 도메인사전복사(db: Session, source_site: str, target_site: str) -> dict:
    """기존 SQLite 도메인의 사전 3종(UDIC/CNDIC/THESAURUS)을 새 도메인으로 복사."""
    사이트명검증(source_site)
    사이트명검증(target_site)
    결과 = {}
    for dic_type in ("udic", "cndic", "thesaurus"):
        src_tbl = _사전테이블(db, source_site, dic_type)
        tgt_tbl = _사전테이블(db, target_site, dic_type)
        db.execute(delete(tgt_tbl))
        rows = db.execute(select(src_tbl)).mappings().all()
        if dic_type in ("udic", "cndic"):
            for r in rows:
                db.execute(insert(tgt_tbl).values(
                    _WORD=r["_WORD"], _MEMO=r.get("_MEMO"),
                    _USER_ID=r.get("_USER_ID"), _UPDATED=datetime.now(),
                ))
        else:  # thesaurus
            for r in rows:
                db.execute(insert(tgt_tbl).values(
                    _HEAD_WORD=r["_HEAD_WORD"], _TAIL_WORD=r.get("_TAIL_WORD"),
                    _MEMO=r.get("_MEMO"), _USER_ID=r.get("_USER_ID"), _UPDATED=datetime.now(),
                ))
        결과[dic_type] = len(rows)
    db.commit()
    return 결과


def mysql도메인목록() -> list:
    """MySQL know_mng DB에서 사전 테이블이 있는 도메인명 목록 반환."""
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
            "WHERE TABLE_SCHEMA = 'know_mng' AND TABLE_NAME LIKE '%%\\_THESAURUS'"
        )
        domains = sorted(r[0] for r in cur.fetchall())
        conn.close()
        return domains
    except Exception:
        return []


def mysql에서사전마이그레이션(target_site: str, mysql_site: str) -> dict:
    """MySQL의 사전 3종(UDIC/CNDIC/THESAURUS)을 SQLite 새 도메인으로 마이그레이션."""
    import pymysql
    from core.database import 세션팩토리

    사이트명검증(target_site)

    mysql_conn = pymysql.connect(
        host="localhost", user="root", password="@!roqkftjqj#",
        database="know_mng", charset="utf8",
    )
    db = 세션팩토리()

    결과 = {}
    try:
        for dic_type, suffix in [("udic", "_UDIC"), ("cndic", "_CNDIC"), ("thesaurus", "_THESAURUS")]:
            mysql_tbl = f"{mysql_site}{suffix}"
            tgt_tbl = _사전테이블(db, target_site, dic_type)

            try:
                cur = mysql_conn.cursor()
                cur.execute(f"SELECT COUNT(*) FROM `{mysql_tbl}`")
                cnt = cur.fetchone()[0]

                if cnt == 0:
                    결과[dic_type] = 0
                    continue

                db.execute(delete(tgt_tbl))

                if dic_type in ("udic", "cndic"):
                    cur.execute(f"SELECT _WORD, _MEMO, _USER_ID FROM `{mysql_tbl}`")
                    rows = cur.fetchall()
                    for r in rows:
                        db.execute(insert(tgt_tbl).values(
                            _WORD=r[0], _MEMO=r[1],
                            _USER_ID=r[2], _UPDATED=datetime.now(),
                        ))
                else:  # thesaurus
                    cur.execute(f"SELECT _HEAD_WORD, _TAIL_WORD, _MEMO, _USER_ID FROM `{mysql_tbl}`")
                    rows = cur.fetchall()
                    for r in rows:
                        db.execute(insert(tgt_tbl).values(
                            _HEAD_WORD=r[0], _TAIL_WORD=r[1],
                            _MEMO=r[2], _USER_ID=r[3], _UPDATED=datetime.now(),
                        ))

                db.commit()
                결과[dic_type] = len(rows)
            except Exception as e:
                결과[dic_type] = f"오류: {e}"

        return 결과
    finally:
        db.close()
        mysql_conn.close()
