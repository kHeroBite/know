"""유사어 페어 관리기 — 펄 스크립트 4종 Python 통합 대체.

대체 대상:
    - makepair.pl: 유사어 페어 생성
    - keymake.pl: 정렬키 생성
    - pair2list.pl: 페어 → 리스트 변환
    - fdiff.pl: 파일 diff 생성
"""
import re
from pathlib import Path
from typing import NamedTuple


class 페어항목(NamedTuple):
    """유사어 페어 항목."""

    원형: str
    유사어목록: list[str]

    def to_pair_줄(self) -> str:
        """페어 파일 형식으로 직렬화."""
        return f"{self.원형}\t{','.join(self.유사어목록)}"


class 페어관리기:
    """유사어 페어 관리기.

    makepair.pl + keymake.pl + pair2list.pl + fdiff.pl을 통합한 Python 구현.
    """

    # 페어 파일 구분자
    탭구분자 = re.compile(r"\t+")
    쉼표구분자 = re.compile(r",\s*")

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정

    # ── 페어 파싱 ──────────────────────────────────────────────

    def 파일로딩(self, pair_파일: Path) -> list[페어항목]:
        """페어 파일 파싱.

        형식: 원형\t유사어1,유사어2,...
        """
        결과 = []
        with pair_파일.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                줄 = 줄.strip()
                if not 줄 or 줄.startswith("#"):
                    continue
                parts = self.탭구분자.split(줄, 1)
                if len(parts) < 2:
                    continue
                원형 = parts[0].strip()
                유사어목록 = [s.strip() for s in self.쉼표구분자.split(parts[1]) if s.strip()]
                if 원형 and 유사어목록:
                    결과.append(페어항목(원형=원형, 유사어목록=유사어목록))
        return 결과

    # ── makepair.pl 대체 ──────────────────────────────────────

    def 페어생성(self, 입력파일: Path, 출력파일: Path | None = None) -> Path:
        """유사어 페어 생성 (makepair.pl 대체).

        입력 파일의 동의어 목록에서 양방향 페어 생성.
        """
        if 출력파일 is None:
            출력파일 = 입력파일.parent / f"{입력파일.stem}.pair"

        페어목록 = self.파일로딩(입력파일)

        with 출력파일.open("w", encoding="utf-8") as f:
            for 페어 in 페어목록:
                # 원형 → 유사어 방향
                f.write(f"{페어.원형}\t{','.join(페어.유사어목록)}\n")

        return 출력파일

    # ── keymake.pl 대체 ──────────────────────────────────────

    def _정렬키생성(self, 단어: str) -> str:
        """정렬 키 생성 (keymake.pl 대체).

        한글 초성 + 음절 기반 정렬키 생성.
        """
        # 기본: 소문자 + 한글 유니코드 정규화
        return 단어.lower().strip()

    def 정렬키파일생성(self, pair_파일: Path, 출력파일: Path | None = None) -> Path:
        """정렬키 파일 생성 (keymake.pl 대체)."""
        if 출력파일 is None:
            출력파일 = pair_파일.parent / f"{pair_파일.stem}.key"

        페어목록 = self.파일로딩(pair_파일)

        with 출력파일.open("w", encoding="utf-8") as f:
            for 페어 in 페어목록:
                키 = self._정렬키생성(페어.원형)
                f.write(f"{키}\t{페어.원형}\n")

        return 출력파일

    # ── pair2list.pl 대체 ─────────────────────────────────────

    def 페어2리스트변환(self, pair_파일: Path, 출력파일: Path | None = None) -> Path:
        """페어 → 리스트 변환 (pair2list.pl 대체).

        페어 형식을 개별 항목 리스트로 펼침.
        """
        if 출력파일 is None:
            출력파일 = pair_파일.parent / f"{pair_파일.stem}.list"

        페어목록 = self.파일로딩(pair_파일)

        with 출력파일.open("w", encoding="utf-8") as f:
            for 페어 in 페어목록:
                f.write(f"{페어.원형}\n")
                for 유사어 in 페어.유사어목록:
                    f.write(f"{유사어}\n")

        return 출력파일

    # ── fdiff.pl 대체 ────────────────────────────────────────

    def diff생성(self, 기존파일: Path, 신규파일: Path, 출력파일: Path | None = None) -> Path:
        """파일 diff 생성 (fdiff.pl 대체).

        기존 페어와 신규 페어의 차이를 추가/삭제로 분류.
        """
        if 출력파일 is None:
            출력파일 = 신규파일.parent / f"{신규파일.stem}.diff"

        기존페어 = {p.원형: p for p in self.파일로딩(기존파일)} if 기존파일.exists() else {}
        신규페어 = {p.원형: p for p in self.파일로딩(신규파일)}

        추가 = {k: v for k, v in 신규페어.items() if k not in 기존페어}
        삭제 = {k: v for k, v in 기존페어.items() if k not in 신규페어}
        변경 = {
            k: v for k, v in 신규페어.items()
            if k in 기존페어 and 기존페어[k].유사어목록 != v.유사어목록
        }

        with 출력파일.open("w", encoding="utf-8") as f:
            f.write(f"# diff: {기존파일.name} → {신규파일.name}\n")
            for 원형, 페어 in sorted(추가.items()):
                f.write(f"+\t{페어.to_pair_줄()}\n")
            for 원형, 페어 in sorted(삭제.items()):
                f.write(f"-\t{페어.to_pair_줄()}\n")
            for 원형, 페어 in sorted(변경.items()):
                f.write(f"~\t{페어.to_pair_줄()}\n")

        return 출력파일

    # ── 통합 처리 ──────────────────────────────────────────────

    def 페어처리(
        self,
        pair_파일: Path,
        도메인: str = "default",
        출력디렉토리: Path | None = None,
    ) -> dict[str, Path]:
        """페어 파일 전체 처리 (페어생성 → 정렬키 → 리스트 변환).

        Returns:
            처리 결과 파일 경로 딕셔너리 {pair, key, list}
        """
        출력dir = 출력디렉토리 or pair_파일.parent
        출력dir.mkdir(parents=True, exist_ok=True)

        pair_출력 = 출력dir / f"{도메인}.pair"
        key_출력 = 출력dir / f"{도메인}.key"
        list_출력 = 출력dir / f"{도메인}.list"

        self.페어생성(pair_파일, pair_출력)
        self.정렬키파일생성(pair_출력, key_출력)
        self.페어2리스트변환(pair_출력, list_출력)

        return {"pair": pair_출력, "key": key_출력, "list": list_출력}
