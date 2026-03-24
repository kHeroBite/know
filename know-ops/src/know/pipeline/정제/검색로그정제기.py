"""검색로그 정제기 — refine_log_spam.sh 파이썬 대체."""
import re
from pathlib import Path
from collections import Counter


class 검색로그정제기:
    """검색로그 스팸 정제기.

    refine_log_spam.sh 기능을 Python으로 대체.
    스팸 패턴 필터링 + 특수문자/단자 제거 + 중복제거.
    """

    # 정제 기본 패턴
    특수문자패턴 = re.compile(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]+')
    숫자전용패턴 = re.compile(r'^\d+$')
    단자패턴 = re.compile(r'^.$')

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정
        self._스팸패턴 = None

    @property
    def 스팸패턴목록(self) -> list[re.Pattern]:
        """스팸 패턴 파일 로딩 (lazy)."""
        if self._스팸패턴 is None:
            self._스팸패턴 = self._패턴로딩()
        return self._스팸패턴

    def _패턴로딩(self) -> list[re.Pattern]:
        """spam_kwd.pat 파일에서 패턴 목록 로딩."""
        패턴목록 = []
        경로 = self.설정값.스팸패턴경로
        if not 경로.exists():
            return 패턴목록
        with 경로.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                줄 = 줄.strip()
                if 줄 and not 줄.startswith("#"):
                    try:
                        패턴목록.append(re.compile(줄, re.IGNORECASE))
                    except re.error:
                        # 정규식 오류 시 리터럴 패턴으로 처리
                        패턴목록.append(re.compile(re.escape(줄), re.IGNORECASE))
        return 패턴목록

    def _스팸여부(self, 질의어: str) -> bool:
        """스팸 패턴 매칭 여부 확인."""
        for 패턴 in self.스팸패턴목록:
            if 패턴.search(질의어):
                return True
        return False

    def _기본필터(self, 질의어: str) -> bool:
        """기본 필터 (특수문자전용/숫자전용/단자) 제거 여부."""
        질의어 = 질의어.strip()
        if not 질의어:
            return True
        if self.숫자전용패턴.match(질의어):
            return True
        if self.단자패턴.match(질의어):
            return True
        # 특수문자만 남은 경우
        if self.특수문자패턴.sub("", 질의어).strip() == "":
            return True
        return False

    def 정제(
        self,
        입력파일: Path,
        도메인: str = "default",
        출력파일: Path | None = None,
    ) -> Path:
        """검색로그 정제 실행.

        Args:
            입력파일: 정제할 검색로그 파일 (탭 구분: 질의어\t빈도)
            도메인: 도메인명 (출력 파일명 생성에 사용)
            출력파일: 출력 경로 (None이면 입력 파일명 기반 자동 생성)

        Returns:
            정제된 파일 경로
        """
        if 출력파일 is None:
            출력파일 = 입력파일.parent / f"{입력파일.stem}_refined{입력파일.suffix}"

        원본카운터: Counter = Counter()

        # 입력 파일 파싱 (탭 구분 질의어\t빈도 형식)
        with 입력파일.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                parts = 줄.strip().split("\t")
                질의어 = parts[0].strip() if parts else ""
                빈도 = int(parts[1]) if len(parts) > 1 and parts[1].strip().isdigit() else 1

                if not 질의어:
                    continue
                원본카운터[질의어] += 빈도

        # 정제 필터링
        정제결과: Counter = Counter()
        for 질의어, 빈도 in 원본카운터.items():
            if self._기본필터(질의어):
                continue
            if self._스팸여부(질의어):
                continue
            정제결과[질의어] += 빈도

        # 빈도 내림차순 출력
        with 출력파일.open("w", encoding="utf-8") as f:
            for 질의어, 빈도 in 정제결과.most_common():
                f.write(f"{질의어}\t{빈도}\n")

        return 출력파일
