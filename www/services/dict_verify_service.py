"""verify_dict 서비스 — Java Check_Synonym_NonWorkDic.java 포팅

키워드 목록에 대해 analyze_morpheme run_phase1_service 후, cnlist(복합어 사전)과 대조하여
사전 누락 키워드를 분류합니다.

분류 로직:
  a) 분석결과에 탭 없음 → skip (형태소 분석 결과 없음)
  b) 분석결과에 공백 없음 → skip (단일 토큰)
  c) base_kwd == 분석어 AND 코드=="3" → ukall (미등록어)
  d) base_kwd == 분석어 AND 코드!="3" → skip (정상 단일어)
  e) base_kwd != 분석어 AND cnlist에 없음 → missing (복합어 등록 필요)
  f) base_kwd != 분석어 AND cnlist에 있음 → skip (이미 등록됨)
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List

from sqlalchemy import text

logger = logging.getLogger(__name__)

from core.constants import DEFAULT_JIANA_HOME, JAVA_HOME, DOMAIN_DIR as DOMAIN_BASE
MORPHEME_TIMEOUT = 120  # 배치 처리용 충분한 시간


def load_cnlist(domain: str, jiana_home: str | None = None) -> set:
    """jiana 빌드 산출물 cnlist.ks 로딩 → set 반환.

    domain 파라미터는 시그니처 유지용 (호환성). 실제로는 공통 cnlist 사용.
    """
    jh = jiana_home or DEFAULT_JIANA_HOME
    cnlist_path = os.path.join(jh, "txt_resrc", "cndic", "cnlist.ks")
    result = set()
    try:
        with open(cnlist_path, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    result.add(stripped)
    except FileNotFoundError:
        logger.warning("cnlist.ks 없음: %s", cnlist_path)
    return result


def batch_morpheme_analyze(keywords: list, jiana_home: str | None = None) -> list:
    """키워드 목록을 일괄 jiana analyze_morpheme. 반환: 원본 결과 라인 리스트."""
    if not keywords:
        return []

    jh = jiana_home or DEFAULT_JIANA_HOME
    lib_path = f"{jh}/lib"
    classpath = f"{lib_path}/jiana1.5.jar:{lib_path}/dqdic-1.0.3.jar"

    with tempfile.TemporaryDirectory(prefix="dictverify_") as tmpdir:
        input_file = Path(tmpdir) / "input.txt"
        output_file = Path(tmpdir) / "output.txt"

        input_text = "\n".join(kw.strip() for kw in keywords if kw.strip()) + "\n"
        input_file.write_text(input_text, encoding="euc-kr", errors="replace")

        env = os.environ.copy()
        env["JAVA_HOME"] = JAVA_HOME
        env["PATH"] = f"{JAVA_HOME}/bin:{env.get('PATH', '')}"

        try:
            proc = subprocess.run(
                [
                    f"{JAVA_HOME}/bin/java",
                    "-Dfile.encoding=EUC-KR",
                    "-classpath", classpath,
                    "test.LiteTest",
                    f"{jh}/",
                    "use",
                    str(input_file),
                    str(output_file),
                ],
                capture_output=True,
                text=False,
                timeout=MORPHEME_TIMEOUT,
                env=env,
                cwd=jh,
            )

            if proc.returncode != 0:
                stderr_txt = proc.stderr.decode("utf-8", errors="replace")[:500]
                logger.warning("jiana 배치 실패 (rc=%d): %s", proc.returncode, stderr_txt)
                return []

            if output_file.exists():
                raw = output_file.read_text(encoding="euc-kr", errors="replace")
                return [line for line in raw.split("\n") if line.strip()]
            return []

        except subprocess.TimeoutExpired:
            logger.error("배치 analyze_morpheme 타임아웃 (%d초)", MORPHEME_TIMEOUT)
            return []
        except Exception as e:
            logger.exception("배치 analyze_morpheme 예외: %s", e)
            return []


def verify_dict(keywords: list, domain: str, jiana_home: str | None = None) -> dict:
    """키워드 목록에 대해 사전 누락 검증 run_phase1_service.

    Args:
        keywords: 검증할 키워드 list_tasks
        domain: 도메인명 (cnlist.ks 경로 결정용)
        jiana_home: jiana 홈 경로 (None이면 기본값 사용)

    Returns:
        {
            "missing": [{"keyword": str, "analysis": str}],
            "ukall": [str],
            "skipped": [str],
            "total": int,
            "domain": str
        }
    """
    if not keywords:
        return {"missing": [], "ukall": [], "skipped": [], "total": 0, "domain": domain}

    # 1. cnlist 로딩
    cnlist = load_cnlist(domain, jiana_home=jiana_home)
    logger.info("cnlist 로딩: %d건 (도메인: %s)", len(cnlist), domain)

    # 2. 배치 analyze_morpheme
    분석결과 = batch_morpheme_analyze(keywords, jiana_home=jiana_home)

    # 3. 원본 라인 + 후속 토큰 그룹핑 파서
    # 실제 jiana 출력: 원본 키워드 라인 → 후속 "단어 코드" 토큰 라인들 → 다음 원본 반복
    키워드set = set(kw.strip() for kw in keywords if kw.strip())
    그룹: dict[str, list[str]] = {}
    현재키워드 = None
    for line in 분석결과:
        stripped = line.rstrip()
        if not stripped:
            continue
        if stripped in 키워드set:
            현재키워드 = stripped
            그룹.setdefault(현재키워드, [])
        elif 현재키워드 is not None:
            그룹[현재키워드].append(stripped)

    # 4. 분류
    missing = []
    ukall = []
    skipped = []

    for kw in keywords:
        kw = kw.strip()
        if not kw:
            continue
        tokens = 그룹.get(kw, [])

        if not tokens:
            # analyze_morpheme 결과 없음 → skip
            skipped.append(kw)
            continue

        if len(tokens) == 1:
            # 토큰 1개: "단어 코드" 또는 "단어" 형식
            parts = tokens[0].rsplit(" ", 1)
            if len(parts) == 2 and parts[1].isdigit():
                단어, 코드 = parts[0], parts[1]
                if 단어 == kw:
                    # 원본 == 분析어 (단일어로 분析됨)
                    if 코드 == "3":
                        ukall.append(kw)  # 미등록어
                    else:
                        skipped.append(kw)  # 정상 단일어
                else:
                    # 원본과 다른 단일 토큰 (부분 분析)
                    if kw not in cnlist:
                        missing.append({"keyword": kw, "analysis": tokens[0]})
                    else:
                        skipped.append(kw)
            else:
                # 코드 파싱 실패 → skip
                skipped.append(kw)
        else:
            # 토큰 여러 개: 복합어로 분解됨
            analysis = " ".join(tokens)
            if kw not in cnlist:
                if "comp : " not in kw:
                    missing.append({"keyword": kw, "analysis": analysis})
                else:
                    skipped.append(kw)
            else:
                skipped.append(kw)

    return {
        "missing": missing,
        "ukall": ukall,
        "skipped": skipped,
        "total": len(keywords),
        "domain": domain,
    }


def auto_verify_dict(db, workspace: str, domain: str, jiana_home: str | None = None) -> dict:
    """DB에서 complete 키워드 자동 로딩 → 기존 verify_dict 호출 (analyze_morpheme 기반)."""
    완료키워드 = db.execute(text(
        "SELECT DISTINCT keyword FROM keyword_assignments "
        "WHERE workspace=:ws AND domain=:dom AND status='completed'"
    ), {"ws": workspace, "dom": domain}).scalars().all()
    result = verify_dict(list(완료키워드), domain, jiana_home=jiana_home)
    result["workspace"] = workspace
    return result


def _read_ks_file(path: str) -> set:
    """*.ks 파일 → set. BOM 제거 + 주석(#) 라인 필터."""
    result = set()
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    result.add(stripped)
    except FileNotFoundError:
        logger.warning("파일 없음: %s", path)
    return result


def _read_synonym(path: str) -> set:
    """synonym.UTF-8 → head 토큰 set. 각 줄의 공백 구분 토큰 전체를 set에 추가."""
    result = set()
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if not stripped:
                    continue
                tokens = stripped.split()
                for t in tokens:
                    result.add(t)
    except FileNotFoundError:
        logger.warning("파일 없음: %s", path)
    return result


def load_file(jiana_home: str) -> tuple[set, set, set]:
    """user.ks + cnlist.ks + synonym.UTF-8 → 3 set 반환."""
    udic_path = f"{jiana_home}/txt_resrc/udic/user.ks"
    cndic_path = f"{jiana_home}/txt_resrc/cndic/cnlist.ks"
    syn_path = f"{jiana_home}/synonym.UTF-8"
    user_set = _read_ks_file(udic_path)
    cn_set = _read_ks_file(cndic_path)
    syn_set = _read_synonym(syn_path)
    logger.info("사전 파일 로딩: user=%d, cn=%d, syn=%d", len(user_set), len(cn_set), len(syn_set))
    return user_set, cn_set, syn_set


def reprocess_keywords(db, workspace: str, domain: str, keywords: List[str]) -> dict:
    """선택 키워드 pending 초기화 + 2단계 phase 역전이 (verify→build→work).

    Args:
        db: SQLAlchemy 세션
        workspace: 워크스페이스명
        domain: 도메인명
        keywords: 재처리할 키워드 목록

    Returns:
        {"updated": int, "phase": "work"}
    """
    if not keywords:
        raise ValueError("재처리할 키워드가 없습니다")

    from services.assignment_service import _kw_table
    from services.workspace_service import phase_backward

    tbl = _kw_table(workspace)
    placeholders = ",".join([f":kw{i}" for i in range(len(keywords))])
    params = {f"kw{i}": kw for i, kw in enumerate(keywords)}
    params["dom"] = domain
    db.execute(text(
        f"UPDATE {tbl} SET status='pending', assigned_to=NULL, "
        f"assigned_at=NULL, completed_at=NULL, flag='reprocess' "
        f"WHERE domain=:dom AND keyword IN ({placeholders})"
    ), params)
    db.commit()

    # verify→build→work 2단계 역전이
    phase_backward(workspace, "build")   # verify → build
    phase_backward(workspace, "work")    # build  → work

    return {"updated": len(keywords), "phase": "work"}


def verify_dict_from_file(db, workspace: str, domain: str, jiana_home: str) -> dict:
    """완료된 키워드를 3개 파일과 교차검증.

    - 단일어(공백 없음): user.ks에 있어야 함
    - 복합어(공백 포함): cnlist.ks에 있어야 함
    - 모든 키워드: synonym.UTF-8에도 있는지 확인(참고용)
    """
    완료키워드 = db.execute(text(
        "SELECT DISTINCT keyword FROM keyword_assignments "
        "WHERE workspace=:ws AND domain=:dom AND status='completed'"
    ), {"ws": workspace, "dom": domain}).scalars().all()

    user_set, cn_set, syn_set = load_file(jiana_home)

    missing_user, missing_cn, missing_syn = [], [], []
    for kw in 완료키워드:
        if " " in kw:
            if kw not in cn_set:
                missing_cn.append(kw)
        else:
            if kw not in user_set:
                missing_user.append(kw)
        if kw not in syn_set:
            missing_syn.append(kw)

    return {
        "total": len(완료키워드),
        "missing_user": missing_user,
        "missing_cn": missing_cn,
        "missing_syn": missing_syn,
        "domain": domain,
        "workspace": workspace,
        "jiana_home": jiana_home,
    }
