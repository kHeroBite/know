"""사전 등록 검증기 — check_after_dic.sh Python 변환.

대체 대상:
    - check_after_dic.sh: 빌드 후 사전 파일 포맷 검증
    - chk_format_cotpre.pl: 문법 검사 (subprocess 호출)
    - checkdic.pl: sdic 포맷 검사 (subprocess 호출)

추가 기능:
    - diff 비교: 이전 빌드 스냅샷과 현재 파일 라인 단위 비교
    - 누락 검출: 등록 요청 단어 vs 실제 사전 파일 미등록 확인
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class 검증결과:
    """검증 실행 결과."""

    성공: bool = True
    오류목록: list[str] = field(default_factory=list)
    경고목록: list[str] = field(default_factory=list)
    diff결과: dict[str, list[str]] = field(default_factory=dict)
    누락단어: list[str] = field(default_factory=list)

    def 오류추가(self, 메시지: str) -> None:
        self.오류목록.append(메시지)
        self.성공 = False

    def 경고추가(self, 메시지: str) -> None:
        self.경고목록.append(메시지)


class 사전등록검증기:
    """사전 등록 검증기.

    check_after_dic.sh 대체 Python 구현.
    빌드 후 사전 파일의 포맷 오류와 누락 항목을 검출.
    """

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정

    # ── 탭/공백 문자 검사 ────────────────────────────────────

    def 탭문자검사(self, 파일경로: Path) -> list[str]:
        """파일에서 탭 문자가 포함된 줄 검출 (grep '\\t' 대체).

        Returns:
            탭 문자 포함 줄 목록 (빈 목록 = 이상 없음)
        """
        결과 = []
        if not 파일경로.exists():
            return 결과
        for 번호, 줄 in enumerate(
            파일경로.read_text(encoding="utf-8", errors="ignore").splitlines(), 1
        ):
            if "\t" in 줄:
                결과.append(f"L{번호}: {줄!r}")
        return 결과

    def 공백문자검사(self, 파일경로: Path) -> list[str]:
        """파일에서 공백 문자가 포함된 줄 검출 (grep ' ' 대체).

        Returns:
            공백 포함 줄 목록
        """
        결과 = []
        if not 파일경로.exists():
            return 결과
        for 번호, 줄 in enumerate(
            파일경로.read_text(encoding="utf-8", errors="ignore").splitlines(), 1
        ):
            if " " in 줄:
                결과.append(f"L{번호}: {줄!r}")
        return 결과

    # ── 외부 스크립트 검사 ──────────────────────────────────

    def 문법검사(self, 작업경로: Path) -> subprocess.CompletedProcess:
        """chk_format_cotpre.pl 실행 (grammar check).

        Args:
            작업경로: 스크립트와 txt_resrc가 있는 디렉토리
        """
        스크립트 = 작업경로 / "chk_format_cotpre.pl"
        if not 스크립트.exists():
            return subprocess.CompletedProcess(
                [], 0, stdout="스크립트 없음 — 건너뜀", stderr=""
            )
        return subprocess.run(
            ["perl", str(스크립트)],
            cwd=str(작업경로),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    def sdic포맷검사(self, 작업경로: Path) -> subprocess.CompletedProcess:
        """checkdic.pl 실행 — sdic 포맷 검사.

        Args:
            작업경로: 스크립트와 txt_resrc/sdic/ 가 있는 디렉토리
        """
        스크립트 = 작업경로 / "checkdic.pl"
        sdic_목록 = sorted((작업경로 / "txt_resrc" / "sdic").glob("n*.dic"))
        if not 스크립트.exists() or not sdic_목록:
            return subprocess.CompletedProcess(
                [], 0, stdout="스크립트 또는 sdic 없음 — 건너뜀", stderr=""
            )
        return subprocess.run(
            ["perl", str(스크립트)] + [str(p) for p in sdic_목록],
            cwd=str(작업경로),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    # ── diff 비교 ────────────────────────────────────────────

    def diff비교(self, 이전파일: Path, 현재파일: Path) -> dict[str, list[str]]:
        """두 사전 파일 라인 단위 비교 — 추가/삭제 항목 검출.

        Returns:
            {"추가": [...], "삭제": [...]}
        """
        def _줄집합로딩(파일: Path) -> set[str]:
            if not 파일.exists():
                return set()
            return {
                줄.strip()
                for 줄 in 파일.read_text(encoding="utf-8", errors="ignore").splitlines()
                if 줄.strip() and not 줄.startswith("#")
            }

        이전 = _줄집합로딩(이전파일)
        현재 = _줄집합로딩(현재파일)

        return {
            "추가": sorted(현재 - 이전),
            "삭제": sorted(이전 - 현재),
        }

    # ── 누락 검출 ────────────────────────────────────────────

    def 누락검출(self, 등록요청: list[str], 사전파일: Path) -> list[str]:
        """등록 요청 단어가 실제 사전 파일에 존재하는지 확인.

        Args:
            등록요청: 등록해야 할 단어 목록
            사전파일: 실제 사전 파일 경로 (synonym.UTF-8 또는 user.ks)

        Returns:
            사전에서 찾을 수 없는 누락 단어 목록
        """
        if not 사전파일.exists():
            return list(등록요청)

        내용 = 사전파일.read_text(encoding="utf-8", errors="ignore")
        누락 = []
        for 단어 in 등록요청:
            # 단어 경계 검색: 공백/탭/콤마/줄바꿈 구분자
            패턴 = r"(?:^|[\s,]){}(?:[\s,]|$)".format(re.escape(단어))
            if not re.search(패턴, 내용, re.MULTILINE):
                누락.append(단어)
        return 누락

    # ── 통합 검증 ────────────────────────────────────────────

    def 검증실행(
        self,
        작업경로: Path | None = None,
        이전_synonym: Path | None = None,
        등록요청_단어: list[str] | None = None,
    ) -> 검증결과:
        """check_after_dic.sh 전체 흐름 대체 통합 실행.

        Args:
            작업경로: 스크립트/txt_resrc 기준 디렉토리
                      (None 시 설정값.base_경로 사용)
            이전_synonym: diff 비교용 이전 synonym.UTF-8 스냅샷 경로
            등록요청_단어: 누락 검출용 등록 요청 단어 목록

        Returns:
            검증결과 (성공/오류목록/경고목록/diff결과/누락단어)
        """
        작업경로 = 작업경로 or self.설정값.base_경로
        결과 = 검증결과()

        synonym = 작업경로 / "txt_resrc" / "synonym.UTF-8"
        udic = 작업경로 / "txt_resrc" / "udic" / "user.ks"

        # 1) synonym 탭 문자 검사
        for 줄 in self.탭문자검사(synonym):
            결과.오류추가(f"[synonym 탭] {줄}")

        # 2) udic 탭 문자 검사
        for 줄 in self.탭문자검사(udic):
            결과.오류추가(f"[udic 탭] {줄}")

        # 3) udic 공백 검사 (경고 수준)
        for 줄 in self.공백문자검사(udic):
            결과.경고추가(f"[udic 공백] {줄}")

        # 4) 문법 검사 (chk_format_cotpre.pl)
        문법결과 = self.문법검사(작업경로)
        if 문법결과.returncode != 0:
            결과.오류추가(
                f"[문법검사 실패] returncode={문법결과.returncode}\n"
                f"{문법결과.stderr[:500]}"
            )
        elif 문법결과.stdout.strip() and 문법결과.stdout.strip() != "스크립트 없음 — 건너뜀":
            결과.경고추가(f"[문법검사 출력]\n{문법결과.stdout[:500]}")

        # 5) sdic 포맷 검사 (checkdic.pl)
        sdic결과 = self.sdic포맷검사(작업경로)
        if sdic결과.returncode != 0:
            결과.오류추가(
                f"[sdic검사 실패] returncode={sdic결과.returncode}\n"
                f"{sdic결과.stderr[:500]}"
            )

        # 6) diff 비교 (선택적)
        if 이전_synonym and synonym.exists():
            결과.diff결과 = self.diff비교(이전_synonym, synonym)

        # 7) 누락 검출 (선택적)
        if 등록요청_단어 and synonym.exists():
            결과.누락단어 = self.누락검출(등록요청_단어, synonym)
            for 단어 in 결과.누락단어:
                결과.오류추가(f"[누락] '{단어}' — synonym에 미등록")

        return 결과
