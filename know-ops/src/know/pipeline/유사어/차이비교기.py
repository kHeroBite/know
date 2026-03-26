"""유사어 차이비교기 — fdiff.pl 대체.

Python difflib 활용하여 두 파일의 차이를 비교.
추가/삭제/변경 행을 unified diff 형식으로 출력.

두 가지 비교 모드:
  - 기본: difflib 기반 unified diff (범용 라인 비교)
  - --synonym: 동의어 그룹 특화 diff (페어관리기.diff생성 래퍼, fdiff.pl 방식)

사용:
    python -m know.pipeline.유사어.차이비교기 기존.txt 신규.txt [출력.diff]
    python -m know.pipeline.유사어.차이비교기 --synonym 기존.group 신규.group 출력.diff
"""
from __future__ import annotations

import difflib
import sys
from pathlib import Path

from know.pipeline.유사어.페어관리기 import 페어관리기


def 라인diff(기존파일: Path, 신규파일: Path, 출력파일: Path | None = None) -> str:
    """difflib 기반 unified diff: 두 파일의 추가/삭제/변경 행 출력.

    Args:
        기존파일: 비교 기준 파일 (before)
        신규파일: 비교 대상 파일 (after)
        출력파일: 결과 저장 경로 (None이면 반환만)

    Returns:
        unified diff 결과 문자열
    """
    기존_라인들 = 기존파일.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    신규_라인들 = 신규파일.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)

    diff = difflib.unified_diff(
        기존_라인들,
        신규_라인들,
        fromfile=str(기존파일),
        tofile=str(신규파일),
    )
    결과 = "".join(diff)

    if 출력파일:
        출력파일.write_text(결과, encoding="utf-8")

    return 결과


def 동의어그룹diff(
    기존파일: Path,
    신규파일: Path,
    출력파일: Path,
    단어파일: Path | None = None,
) -> Path:
    """페어관리기.diff생성 래퍼: 동의어 그룹 파일 특화 비교 (fdiff.pl 방식).

    일부/전체 추가/삭제 섹션으로 분류하여 출력.
    사전 빌드 전후 비교, 유사어 사전 변경 비교에 활용.

    Args:
        기존파일: 이전 그룹 파일 (공백 구분 동의어 그룹)
        신규파일: 신규 그룹 파일
        출력파일: diff 결과 파일
        단어파일: 단어별 추가/삭제 목록 파일 (선택적)

    Returns:
        출력파일 경로
    """
    관리기 = 페어관리기()
    return 관리기.diff생성(기존파일, 신규파일, 출력파일, 단어파일)


def _요약출력(diff문자열: str) -> None:
    """diff 결과 요약 (추가/삭제 라인 수) 출력."""
    추가 = sum(1 for l in diff문자열.splitlines() if l.startswith("+") and not l.startswith("+++"))
    삭제 = sum(1 for l in diff문자열.splitlines() if l.startswith("-") and not l.startswith("---"))
    print(f"  추가: +{추가}줄  삭제: -{삭제}줄")


def main() -> None:
    인자 = sys.argv[1:]

    동의어모드 = "--synonym" in 인자
    if 동의어모드:
        인자.remove("--synonym")

    if len(인자) < 2:
        print(
            f"사용법: {sys.argv[0]} [--synonym] <기존파일> <신규파일> [출력파일]",
            file=sys.stderr,
        )
        sys.exit(1)

    기존 = Path(인자[0])
    신규 = Path(인자[1])
    출력 = Path(인자[2]) if len(인자) >= 3 else None

    for 파일 in (기존, 신규):
        if not 파일.exists():
            print(f"오류: 파일 없음 — {파일}", file=sys.stderr)
            sys.exit(1)

    if 동의어모드:
        if 출력 is None:
            print("오류: --synonym 모드는 출력파일 필수", file=sys.stderr)
            sys.exit(1)
        결과파일 = 동의어그룹diff(기존, 신규, 출력)
        print(f"완료 (동의어 그룹 diff): {결과파일}")
    else:
        diff결과 = 라인diff(기존, 신규, 출력)
        if 출력:
            print(f"완료 (unified diff): {출력}")
        else:
            print(diff결과, end="")
        _요약출력(diff결과)


if __name__ == "__main__":
    main()
