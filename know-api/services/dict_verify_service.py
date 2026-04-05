"""사전검증 서비스 — Java Check_Synonym_NonWorkDic.java 포팅

키워드 목록에 대해 형태소분석 실행 후, cnlist(복합어 사전)과 대조하여
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

from sqlalchemy import text

logger = logging.getLogger(__name__)

JIANA_HOME = "/home/know/jiana1.5.12"
JAVA_HOME = "/home/know/jdk1.7.0_80"
LIB_PATH = f"{JIANA_HOME}/lib"
CLASSPATH = f"{LIB_PATH}/jiana1.5.jar:{LIB_PATH}/dqdic-1.0.3.jar"
DOMAIN_BASE = "/home/know/apps/know-ops/domain"
MORPHEME_TIMEOUT = 120  # 배치 처리용 충분한 시간


def cnlist_로딩(domain: str) -> set:
    """도메인별 cnlist.ks 파일 로딩 → set 반환."""
    cnlist_path = f"{DOMAIN_BASE}/{domain}/cnlist.ks"
    result = set()
    try:
        with open(cnlist_path, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped:
                    result.add(stripped)
    except FileNotFoundError:
        logger.warning("cnlist.ks 없음: %s", cnlist_path)
    return result


def 배치_형태소분석(keywords: list) -> list:
    """키워드 목록을 일괄 jiana 형태소분석. 반환: 원본 결과 라인 리스트."""
    if not keywords:
        return []

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
                    "-classpath", CLASSPATH,
                    "test.LiteTest",
                    f"{JIANA_HOME}/",
                    "use",
                    str(input_file),
                    str(output_file),
                ],
                capture_output=True,
                text=False,
                timeout=MORPHEME_TIMEOUT,
                env=env,
                cwd=JIANA_HOME,
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
            logger.error("배치 형태소분석 타임아웃 (%d초)", MORPHEME_TIMEOUT)
            return []
        except Exception as e:
            logger.exception("배치 형태소분석 예외: %s", e)
            return []


def 사전검증(keywords: list, domain: str) -> dict:
    """키워드 목록에 대해 사전 누락 검증 실행.

    Args:
        keywords: 검증할 키워드 목록
        domain: 도메인명 (cnlist.ks 경로 결정용)

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
    cnlist = cnlist_로딩(domain)
    logger.info("cnlist 로딩: %d건 (도메인: %s)", len(cnlist), domain)

    # 2. 배치 형태소분석
    분석결과 = 배치_형태소분석(keywords)

    # 3. 분류 (Java Check_Synonym_NonWorkDic 로직)
    missing = []
    ukall = []
    skipped = []

    for line in 분석결과:
        # a) 탭 없음 → skip
        if "\t" not in line:
            continue

        parts = line.split("\t")
        base_kwd = parts[0]
        analysis = parts[1] if len(parts) > 1 else ""

        # b) 공백 없음 → skip (단일 토큰)
        if " " not in analysis:
            skipped.append(base_kwd)
            continue

        tokens = analysis.split(" ")
        analyzed_word = tokens[0]
        code = tokens[1] if len(tokens) > 1 else ""

        if base_kwd == analyzed_word:
            # c) 코드 "3" → ukall (미등록어)
            if code == "3":
                ukall.append(base_kwd)
            else:
                # d) 정상 단일어 → skip
                skipped.append(base_kwd)
        else:
            # 분석 결과가 다름 → 복합어 가능성
            if base_kwd not in cnlist:
                # e) cnlist 미등록 → missing
                if "comp : " not in base_kwd:
                    missing.append({"keyword": base_kwd, "analysis": analysis})
                else:
                    skipped.append(base_kwd)
            else:
                # f) cnlist 등록 완료 → skip
                skipped.append(base_kwd)

    return {
        "missing": missing,
        "ukall": ukall,
        "skipped": skipped,
        "total": len(keywords),
        "domain": domain,
    }


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


def 파일로딩(jiana_home: str) -> tuple[set, set, set]:
    """user.ks + cnlist.ks + synonym.UTF-8 → 3 set 반환."""
    udic_path = f"{jiana_home}/txt_resrc/udic/user.ks"
    cndic_path = f"{jiana_home}/txt_resrc/cndic/cnlist.ks"
    syn_path = f"{jiana_home}/synonym.UTF-8"
    user_set = _read_ks_file(udic_path)
    cn_set = _read_ks_file(cndic_path)
    syn_set = _read_synonym(syn_path)
    logger.info("사전 파일 로딩: user=%d, cn=%d, syn=%d", len(user_set), len(cn_set), len(syn_set))
    return user_set, cn_set, syn_set


def 파일기반사전검증(db, workspace: str, domain: str, jiana_home: str) -> dict:
    """완료된 키워드를 3개 파일과 교차검증.

    - 단일어(공백 없음): user.ks에 있어야 함
    - 복합어(공백 포함): cnlist.ks에 있어야 함
    - 모든 키워드: synonym.UTF-8에도 있는지 확인(참고용)
    """
    완료키워드 = db.execute(text(
        "SELECT DISTINCT keyword FROM keyword_assignments "
        "WHERE workspace=:ws AND domain=:dom AND status='completed'"
    ), {"ws": workspace, "dom": domain}).scalars().all()

    user_set, cn_set, syn_set = 파일로딩(jiana_home)

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
