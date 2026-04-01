"""검색로그 정제기 — refine_log_spam.sh 파이썬 대체."""
from __future__ import annotations

import re
from pathlib import Path


class 검색로그정제기:
    """검색로그 스팸 정제기.

    refine_log_spam.sh 기능을 Python으로 대체.
    스팸 패턴 필터링 + 특수문자/단자 제거 + 중복제거.
    """

    # [수정1] 소괄호/대괄호 각각 분리 (원본 sh: ()와 [] 모두 분리)
    소괄호패턴 = re.compile(r"\([^()]+\)")
    대괄호패턴 = re.compile(r"\[[^\[\]]+\]")
    공백패턴 = re.compile(r"\s+")
    특수문자패턴 = re.compile(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]+")
    숫자전용패턴 = re.compile(r"^\d+$")
    단자패턴 = re.compile(r"^.$")
    # [수정2] sed /^regex$/d 형식 파싱용 패턴
    _SED_삭제패턴 = re.compile(r"^/(.+)/d$")
    # [수정3] ^[A-Z0-9\-]{6,}$ 제거 — 영문 단어(NIKESHOES 등) 오탐 원인
    기본_상품코드패턴목록 = [
        re.compile(r"^[A-Z]{1,5}\d{3,}$"),
        re.compile(r"^\d{2,}[A-Z]{1,5}\d*$"),
        re.compile(r"^[A-Z]{2,}-\d{2,}$"),
    ]

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정
        self._스팸패턴 = None
        self._상품코드패턴 = None

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
            return []
        with 경로.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                줄 = 줄.strip()
                if 줄 and not 줄.startswith("#"):
                    패턴목록.append(self._정규식_컴파일(줄))
        return 패턴목록

    def _정규식_컴파일(self, 패턴문자열: str) -> re.Pattern:
        원문 = 패턴문자열.strip()
        if 원문.lower().startswith("re:"):
            정규식 = 원문[3:].strip()
            try:
                return re.compile(정규식, re.IGNORECASE)
            except re.error:
                return re.compile(re.escape(정규식), re.IGNORECASE)
        return re.compile(re.escape(원문), re.IGNORECASE)

    @property
    def 상품코드패턴목록(self) -> list[re.Pattern]:
        if self._상품코드패턴 is None:
            self._상품코드패턴 = self._상품코드패턴로딩()
        return self._상품코드패턴

    @classmethod
    def _sed삭제패턴_파싱(cls, 줄: str) -> re.Pattern | None:
        """sed /^regex$/d 형식 → Python re.Pattern 변환.

        prodcode_pat.cmd 파일의 각 줄을 파싱.
        예: /^[A-Z][A-Z]*[0-9][0-9][0-9][0-9][0-9][0-9]*$/d
        """
        줄 = 줄.strip()
        if not 줄 or 줄.startswith("#"):
            return None
        매치 = cls._SED_삭제패턴.match(줄)
        if not 매치:
            return None
        정규식 = 매치.group(1)
        try:
            return re.compile(정규식, re.IGNORECASE)
        except re.error:
            return None

    def _상품코드패턴로딩(self) -> list[re.Pattern]:
        """prodcode_pat.cmd(sed 형식) 로딩 + 기본 패턴 병합."""
        패턴목록 = list(self.기본_상품코드패턴목록)
        경로 = getattr(self.설정값, "상품코드패턴경로", None)
        if not 경로:
            return 패턴목록
        경로 = Path(경로)
        if not 경로.exists():
            return 패턴목록
        # [수정2] sed /^regex$/d 형식 파싱 (기존: re.escape로 잘못 처리)
        with 경로.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                패턴 = self._sed삭제패턴_파싱(줄)
                if 패턴:
                    패턴목록.append(패턴)
        return 패턴목록

    def _스팸여부(self, 질의어: str) -> bool:
        """스팸 패턴 매칭 여부 확인."""
        for 패턴 in self.스팸패턴목록:
            if 패턴.search(질의어):
                return True
        return False

    def _상품코드여부(self, 질의어: str) -> bool:
        for 패턴 in self.상품코드패턴목록:
            if 패턴.search(질의어):
                return True
        return False

    def _전처리_변형(self, 질의어: str) -> list[str]:
        원본 = 질의어.strip()
        후보 = {원본}
        while True:
            변경됨 = False
            새후보 = set()
            for 항목 in 후보:
                # [수정1] 소괄호/대괄호 모두 처리 (원본 sh: ()와 [] 둘 다 분리)
                매치 = self.소괄호패턴.search(항목) or self.대괄호패턴.search(항목)
                if not 매치:
                    새후보.add(항목)
                    continue
                변경됨 = True
                괄호내부 = 매치.group(0)[1:-1].strip()
                괄호제거 = (항목[: 매치.start()] + 항목[매치.end() :]).strip()
                if 괄호제거:
                    새후보.add(괄호제거)
                if 괄호내부:
                    새후보.add(괄호내부)
            후보 = 새후보 if 변경됨 else 후보
            if not 변경됨:
                break

        결과 = set()
        for 항목 in 후보:
            공백제거 = self.공백패턴.sub("", 항목)
            대문자변환 = 공백제거.upper()
            if 대문자변환:
                결과.add(대문자변환)
        return sorted(결과)

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
            if 입력파일.name == "keywords.txt":
                출력파일 = 입력파일.parent / "refine.txt"
            else:
                출력파일 = 입력파일.parent / f"{입력파일.stem}_refined{입력파일.suffix}"

        원본키워드목록: list[str] = []

        # 입력 파일 파싱 (라인 기반, 탭 구분이면 첫 컬럼을 키워드로 사용)
        with 입력파일.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                parts = 줄.strip().split("\t")
                질의어 = parts[0].strip() if parts else ""
                if not 질의어:
                    continue
                원본키워드목록.append(질의어)

        # 정제 필터링
        정제결과: set[str] = set()
        for 질의어 in 원본키워드목록:
            for 전처리된_질의어 in self._전처리_변형(질의어):
                if self._기본필터(전처리된_질의어):
                    continue
                if self._상품코드여부(전처리된_질의어):
                    continue
                if self._스팸여부(전처리된_질의어):
                    continue
                정제결과.add(전처리된_질의어)

        # 키워드만 출력 (중복 제거)
        with 출력파일.open("w", encoding="utf-8") as f:
            for 질의어 in sorted(정제결과):
                f.write(f"{질의어}\n")

        return 출력파일

    def 키워드_정제(self, 키워드_목록: list[str]) -> list[str]:
        """키워드 목록에서 스팸/특수문자/숫자/단자 제거 후 반환."""
        결과 = set()
        for 키워드 in 키워드_목록:
            for 전처리된_키워드 in self._전처리_변형(키워드):
                if self._기본필터(전처리된_키워드):
                    continue
                if self._상품코드여부(전처리된_키워드):
                    continue
                if self._스팸여부(전처리된_키워드):
                    continue
                결과.add(전처리된_키워드)
        return sorted(결과)
