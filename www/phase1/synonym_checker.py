"""유사어 체크 — Java DataCheckExt_SynDB_jianareslist_v2 포팅

형태소 분석 결과 파일(transform.txt)에서 각 키워드의 유사어를 찾아 표시.

input:  work/transform.txt
output: work/synonym.txt
"""
from __future__ import annotations

import logging
import shutil
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

from core.constants import KNOW_OPS_SRC


def _ensure_know_ops_path() -> None:
    if KNOW_OPS_SRC not in sys.path:
        sys.path.insert(0, KNOW_OPS_SRC)


def _load_synonym_dict(synonym_path: Path) -> dict:
    """synonym 파일을 읽어 {키워드: "유사어1, 유사어2"} 딕셔너리 반환.

    두 가지 포맷 자동 감지:
    1. CSV: head,syn1,syn2,...  (synonym_full_v2.txt)
    2. 그룹: HEAD가 2줄 연속 → 이후 줄이 유사어 (synonym_full.txt, synonym_full_v2)
    """
    사전 = {}
    if not synonym_path.exists():
        logger.warning(f"유사어 사전 없음: {synonym_path}")
        return 사전

    with open(synonym_path, "r", encoding="utf-8-sig", errors="replace") as f:
        lines = [line.strip() for line in f if line.strip()]

    if not lines:
        return 사전

    # 포맷 감지: 첫 50줄 중 콤마가 있으면 CSV
    sample = lines[:50]
    csv_count = sum(1 for l in sample if "," in l)
    is_csv = csv_count > len(sample) * 0.3

    if is_csv:
        # CSV 포맷: head,syn1,syn2,...
        for line in lines:
            if "\t" in line:
                line = line.split("\t")[0]
            if "," in line:
                parts = line.split(",")
                head = parts[0].strip()
                syns = [p.strip() for p in parts[1:3] if p.strip()]
                if syns:
                    사전[head] = ", ".join(syns)
    else:
        # 그룹 포맷: HEAD가 연속 2줄 동일 → 이후 줄이 유사어
        current_head = None
        current_syns = []
        prev_line = None

        for line in lines:
            if line == prev_line:
                # 새 HEAD 시작 — 이전 HEAD 저장
                if current_head and current_syns:
                    사전[current_head] = ", ".join(current_syns[:2])
                current_head = line
                current_syns = []
            elif current_head is not None:
                # 현재 HEAD의 유사어
                current_syns.append(line)
            prev_line = line

        # 마지막 그룹 저장
        if current_head and current_syns:
            사전[current_head] = ", ".join(current_syns[:2])

    return 사전


def _batch_morpheme_analyze(설정값, 유사어list_tasks: list, work_dir: Path) -> dict:
    """유사어 목록을 jiana로 analyze_morpheme하여 {키워드: [출력줄, ...]} dict 반환.

    Args:
        설정값: know-ops 설정 객체
        유사어list_tasks: 분석할 유사어 키워드 list_tasks
        work_dir: 임시 파일 작업 디렉토리

    Returns:
        {키워드: [변환결과줄, ...]} — comp 라인 포함
    """
    _ensure_know_ops_path()
    from know.pipeline.분석.analyze_morpheme래퍼 import analyze_morpheme래퍼
    from know.pipeline.변환.형태소결과변환기 import 형태소결과변환기

    tmp_input = work_dir / "_syn_morph_input.txt"
    tmp_analyzed = work_dir / "_syn_morph_analyzed.txt"
    tmp_transform = work_dir / "_syn_morph_transform.txt"

    try:
        # 임시 입력파일 작성
        with open(tmp_input, "w", encoding="utf-8") as f:
            for kw in 유사어list_tasks:
                f.write(f"{kw}\n")

        # analyze_morpheme
        래퍼 = analyze_morpheme래퍼(설정값=설정값)
        래퍼.분석(tmp_input, "", 출력파일=tmp_analyzed)

        # 결과변환
        변환기 = 형태소결과변환기()
        raw_result = 변환기.변환(tmp_analyzed)  # → _syn_morph_analyzed.txt.5
        shutil.copy2(str(raw_result), str(tmp_transform))

        # 파싱: {키워드: [출력줄, ...]}
        결과: dict = {}
        current_kw: str | None = None
        current_lines: list = []

        with open(tmp_transform, "r", encoding="utf-8", errors="replace") as f:
            for raw_line in f:
                line = raw_line.rstrip("\n\r").strip()
                if not line:
                    if current_kw and current_lines:
                        결과.setdefault(current_kw, []).extend(current_lines)
                        current_kw = None
                        current_lines = []
                    continue
                if "\t" in line and not line.startswith("comp :"):
                    if current_kw and current_lines:
                        결과.setdefault(current_kw, []).extend(current_lines)
                    current_kw = line.split("\t")[0].strip()
                    current_lines = [line]
                else:
                    if current_kw:
                        current_lines.append(line)

        if current_kw and current_lines:
            결과.setdefault(current_kw, []).extend(current_lines)

        return 결과

    finally:
        for p in [tmp_input, tmp_analyzed, tmp_transform,
                  Path(str(tmp_analyzed) + ".5")]:
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass


def check_single_synonym(keyword: str, 분석결과: str, 유사어사전경로: Path, 설정값=None) -> str:
    """단일 키워드의 analyze_morpheme 결과에 유사어를 찾아 표시.

    Args:
        keyword: 원본 키워드
        분석결과: analyze_morpheme+결과변환 후 텍스트 (transform.txt 1블록 형식)
        유사어사전경로: synonym_full_v2.txt 경로
        설정값: know-ops 설정 객체 (유사어 analyze_morpheme용)

    Returns:
        유사어 마킹된 분석결과 텍스트 (synonym.txt 1블록과 동일 포맷)
    """
    import tempfile

    사전 = _load_synonym_dict(유사어사전경로)

    # 1패스: 분석결과에서 유사어 집합 수집 (<<...>> 용)
    유사어_집합: set = set()
    if 설정값 is not None:
        for raw_line in 분석결과.splitlines():
            s = raw_line.strip()
            if not s or "\t" not in s or s.startswith("comp :"):
                continue
            headkwd = s.split("\t")[0].strip()
            if headkwd in 사전:
                for syn in 사전[headkwd].split(","):
                    syn = syn.strip()
                    if syn:
                        유사어_집합.add(syn)

    # jiana analyze_morpheme 일괄 run_phase1_service
    analyze_morpheme결과: dict = {}
    if 설정값 is not None and 유사어_집합:
        try:
            with tempfile.TemporaryDirectory(prefix="syn_single_") as tmpdir:
                analyze_morpheme결과 = _batch_morpheme_analyze(설정값, sorted(유사어_집합), Path(tmpdir))
        except Exception as e:
            logger.warning(f"단일 유사어 analyze_morpheme 실패, 스킵: {e}")

    # 2패스: 마킹 처리 (파일 대신 텍스트 입출력)
    syncnt = 0
    subpartcnt = 0
    compsyncnt = 0
    출력줄들 = []
    linecnt = 0

    for raw_line in 분석결과.splitlines():
        s = raw_line.rstrip()
        if not s.strip():
            continue

        s = s.strip()
        printinfo = ""
        chkfull = 0

        if "\t" not in s:
            printinfo = s + "\t"
            linecnt = 1

            if "comp : " in s:
                divS = s.split(" ")
                k = 2
                while k < len(divS):
                    headkwd = divS[k]
                    k += 6
                    if headkwd in 사전:
                        compsyncnt += 1
                        printinfo += "\t<" + 사전[headkwd] + ">\t"

            printinfo += "\n"

        else:
            divS = s.split("\t")
            headkwd = divS[0].strip()
            kwdsyncnt = len(divS)

            jianares = ""
            subTail2 = ""

            if "comp : " in headkwd:
                printinfo = s + "\t"
                linecnt = 1

                for i in range(kwdsyncnt):
                    parts = divS[i].split(" ")
                    if len(parts) >= 3:
                        sub = parts[2]
                        if sub in 사전:
                            compsyncnt += 1
                            printinfo += "\t<" + 사전[sub] + ">\t"
                printinfo += "\n"

            else:
                for i in range(1, kwdsyncnt):
                    parts = divS[i].split(" ")
                    subTail = parts[0] if parts else ""

                    if subTail == headkwd:
                        chkfull = 1

                    if chkfull == 0:
                        if subTail in 사전:
                            subpartcnt += 1
                            jianares += "\t" + divS[i]
                            subTail2 += subTail + " <" + 사전[subTail] + ">\n"
                        else:
                            jianares += "\t" + divS[i]
                    else:
                        jianares += "\t" + divS[i]

                if not subTail2:
                    printinfo = headkwd + jianares + "\n"
                else:
                    printinfo = headkwd + jianares + "\n" + subTail2

                if headkwd in 사전:
                    syncnt += 1
                    printinfo += "<<" + 사전[headkwd] + ">>\n"
                    for syn in 사전[headkwd].split(","):
                        syn = syn.strip()
                        if syn and syn in analyze_morpheme결과:
                            for morph_line in analyze_morpheme결과[syn]:
                                printinfo += morph_line + "\n"

        if linecnt == 1:
            출력줄들.append(printinfo)
            linecnt = 0
        else:
            출력줄들.append("\n" + printinfo)

    logger.info(f"단일 check_synonyms complete: 전체유사어={syncnt}, 부분유사어={subpartcnt}, 복합어유사어={compsyncnt}")
    return "".join(출력줄들)


def check_synonyms(입력파일: Path, 유사어사전경로: Path, 출력파일: Path, 설정값=None) -> Path:
    """형태소 분석 결과에서 유사어를 찾아 표시.

    Args:
        입력파일: transform.txt (형태소 분석 결과 .5 포맷)
        유사어사전경로: synonym_full_v2.txt 또는 synonym_full.txt
        출력파일: synonym.txt
        설정값: know-ops 설정 객체. None이면 jiana 호출 스킵 (하위 호환).
    """
    사전 = _load_synonym_dict(유사어사전경로)
    logger.info(f"유사어 사전 로드: {len(사전)}개")

    출력파일.parent.mkdir(parents=True, exist_ok=True)

    # 1패스: 입력파일 스캔 → <<...>>에 들어갈 유사어 수집
    유사어_집합: set = set()
    if 설정값 is not None:
        with open(입력파일, "r", encoding="utf-8-sig", errors="replace") as fin:
            for raw_line in fin:
                s = raw_line.rstrip("\n\r").strip()
                if not s or "\t" not in s or s.startswith("comp :"):
                    continue
                headkwd = s.split("\t")[0].strip()
                if headkwd in 사전:
                    for syn in 사전[headkwd].split(","):
                        syn = syn.strip()
                        if syn:
                            유사어_집합.add(syn)

    # jiana analyze_morpheme 일괄 run_phase1_service
    analyze_morpheme결과: dict = {}
    if 설정값 is not None and 유사어_집합:
        try:
            analyze_morpheme결과 = _batch_morpheme_analyze(설정값, sorted(유사어_집합), 출력파일.parent)
            logger.info(f"유사어 analyze_morpheme: {len(유사어_집합)}건 → {len(analyze_morpheme결과)}건")
        except Exception as e:
            logger.warning(f"유사어 analyze_morpheme 실패, 스킵: {e}")

    # 2패스: 출력 파일 생성
    syncnt = 0
    subpartcnt = 0
    compsyncnt = 0
    chkcnt = 0

    with open(입력파일, "r", encoding="utf-8-sig", errors="replace") as fin, \
         open(출력파일, "w", encoding="utf-8") as fout:

        linecnt = 0

        for raw_line in fin:
            s = raw_line.rstrip("\n\r")
            if not s.strip():
                continue

            s = s.strip()
            printinfo = ""
            chkfull = 0

            if "\t" not in s:
                # 탭 없음 → comp 라인이거나 형태소 결과 없는 라인
                printinfo = s + "\t"
                linecnt = 1

                if "comp : " in s:
                    divS = s.split(" ")
                    k = 2
                    while k < len(divS):
                        headkwd = divS[k]
                        k += 6
                        if headkwd in 사전:
                            compsyncnt += 1
                            printinfo += "\t<" + 사전[headkwd] + ">\t"

                printinfo += "\n"

            else:
                # 탭 있음 → 형태소 분석 결과 라인
                divS = s.split("\t")
                headkwd = divS[0].strip()
                kwdsyncnt = len(divS)

                jianares = ""
                subTail2 = ""

                if "comp : " in headkwd:
                    printinfo = s + "\t"
                    linecnt = 1

                    for i in range(kwdsyncnt):
                        parts = divS[i].split(" ")
                        if len(parts) >= 3:
                            sub = parts[2]
                            if sub in 사전:
                                compsyncnt += 1
                                printinfo += "\t<" + 사전[sub] + ">\t"
                    printinfo += "\n"

                else:
                    for i in range(1, kwdsyncnt):
                        parts = divS[i].split(" ")
                        subTail = parts[0] if parts else ""

                        if subTail == headkwd:
                            chkfull = 1

                        if chkfull == 0:
                            if subTail in 사전:
                                subpartcnt += 1
                                jianares += "\t" + divS[i]
                                subTail2 += subTail + " <" + 사전[subTail] + ">\n"
                            else:
                                jianares += "\t" + divS[i]
                        else:
                            jianares += "\t" + divS[i]

                    if not subTail2:
                        printinfo = headkwd + jianares + "\n"
                    else:
                        printinfo = headkwd + jianares + "\n" + subTail2

                    if headkwd in 사전:
                        syncnt += 1
                        printinfo += "<<" + 사전[headkwd] + ">>\n"
                        # 각 유사어의 analyze_morpheme 결과줄 추가
                        for syn in 사전[headkwd].split(","):
                            syn = syn.strip()
                            if syn and syn in analyze_morpheme결과:
                                for morph_line in analyze_morpheme결과[syn]:
                                    printinfo += morph_line + "\n"

            chkcnt += 1

            if linecnt == 1:
                fout.write(printinfo)
                linecnt = 0
            else:
                fout.write("\n" + printinfo)

    logger.info(f"유사어 체크 complete: 검사={chkcnt}건, 전체유사어={syncnt}, 부분유사어={subpartcnt}, 복합어유사어={compsyncnt}")
    return 출력파일
