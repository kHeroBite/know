"""유사어 목록변환기 — pair2list.pl 대체 thin wrapper.

페어관리기.페어2그룹변환()을 호출하는 래퍼.
.pair 파일의 쌍 데이터(synonym key 형식)를 그룹(key syn1 syn2 ...)으로 변환.

입력 형식: synonym key  (공백 구분 2열)
출력 형식: key syn1 syn2 ... (공백 구분 그룹)

사용:
    python -m know.pipeline.유사어.목록변환기 input.pair output.group
"""
from __future__ import annotations

import sys
from pathlib import Path

from know.pipeline.유사어.페어관리기 import 페어관리기


def 페어2목록변환(입력파일: Path, 출력파일: Path) -> Path:
    """pair2list.pl 대체: .pair 파일 → 그룹 파일 변환.

    Args:
        입력파일: synonym key 형식 .pair 파일
        출력파일: key syn1 syn2 ... 형식 그룹 파일

    Returns:
        출력파일 경로
    """
    관리기 = 페어관리기()
    return 관리기.페어2그룹변환(입력파일, 출력파일)


def main() -> None:
    if len(sys.argv) < 3:
        print(f"사용법: {sys.argv[0]} <입력.pair> <출력.group>", file=sys.stderr)
        sys.exit(1)

    입력 = Path(sys.argv[1])
    출력 = Path(sys.argv[2])

    if not 입력.exists():
        print(f"오류: 입력 파일 없음 — {입력}", file=sys.stderr)
        sys.exit(1)

    결과 = 페어2목록변환(입력, 출력)
    print(f"완료: {결과}")


if __name__ == "__main__":
    main()
