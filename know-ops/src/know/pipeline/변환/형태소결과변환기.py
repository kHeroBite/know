"""형태소 분석 결과 변환기 — modify_cotton.sh Python 대체.

modify_cotton.sh의 sed/perl 변환 로직을 Python으로 구현.
입력: cotton 형태소 분석 결과 파일
출력: 변환된 결과 파일 ({입력파일}.5)
"""
from __future__ import annotations

import re
from pathlib import Path


class 형태소결과변환기:
    """형태소 분석 결과 변환기.

    modify_cotton.sh 기능을 Python으로 대체.
    빈 줄로 구분된 엔트리를 1줄 형식으로 합친 후 재분리.
    """

    def 변환(self, 입력파일: Path) -> Path:
        """형태소 분석 결과 변환 실행.

        Args:
            입력파일: 형태소 분석 결과 파일 경로

        Returns:
            변환된 결과 파일 경로 ({입력파일}.5)

        Raises:
            FileNotFoundError: 입력 파일 없음
            RuntimeError: 변환 실패
        """
        if not 입력파일.exists():
            raise FileNotFoundError(f"입력파일 없음: {입력파일}")

        출력파일 = Path(str(입력파일) + ".5")

        # jiana LiteTest는 EUC-KR로 출력 → 먼저 EUC-KR 시도, 실패 시 UTF-8
        try:
            텍스트 = 입력파일.read_text(encoding="euc-kr")
        except (UnicodeDecodeError, ValueError):
            텍스트 = 입력파일.read_text(encoding="utf-8")

        # Step 1: 빈 줄 → @@, 각 줄 끝에 탭 추가
        # sed -e 's/^$/@@/' -e 's/^\(.*\)$/\1\t/'
        step1줄들 = []
        for 줄 in 텍스트.splitlines():
            if 줄 == "":
                step1줄들.append("@@\t")
            else:
                step1줄들.append(줄 + "\t")
        step1 = "\n".join(step1줄들)
        if 텍스트.endswith("\n"):
            step1 += "\n"

        # Step 2: \t\n → \t (연속 줄 이어붙임) → @@ → \n (엔트리 구분 복원)
        # perl -p -e "s|\t\n|\t|"  +  perl -p -e "s|@@|\n|g"
        step2 = step1.replace("\t\n", "\t").replace("@@", "\n")

        # Step 3: 각 줄 정리
        # sed -e 's/^\t//g' -e 's/$/\n/g' -e 's/\(comp :.*\)$/\n\1/'
        # 그 후: sed -e 's/\t$//g'
        결과줄들 = []
        for 줄 in step2.splitlines():
            # 선두 탭 제거
            줄 = re.sub(r"^\t", "", 줄)
            # comp : 로 시작하는 suffix 앞에 줄바꿈 삽입
            줄 = re.sub(r"(comp :.*)$", r"\n\1", 줄)
            # 줄 끝 탭 제거
            줄 = re.sub(r"\t$", "", 줄)
            결과줄들.append(줄)

        최종 = "\n".join(결과줄들) + "\n"
        출력파일.write_text(최종, encoding="utf-8")

        return 출력파일

    def dry_run(self, 입력파일: Path) -> str:
        """실제 실행 없이 처리 예정 파일 경로만 반환 (디버깅용)."""
        return str(Path(str(입력파일) + ".5"))
