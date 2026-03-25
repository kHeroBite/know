"""형태소 분석 래퍼 — cotton_test.sh Python subprocess 대체.

jiana1.5.jar의 CottonTest 클래스를 JDK 7로 실행하는 subprocess 래퍼.
SSH 서버에서 직접 실행하거나 로컬 환경에서 JAR 접근 시 사용.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


class 형태소분석래퍼:
    """형태소 분석 래퍼.

    cotton_test.sh 기능을 Python subprocess로 대체.
    jiana1.5.jar를 JDK 7로 직접 실행.
    """

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정

    def 설정검증(self) -> list[str]:
        """실행 전 설정 유효성 검사.

        Returns:
            오류 메시지 목록 (비어있으면 정상)
        """
        return self.설정값.검증()

    def 분석(
        self,
        입력파일: Path,
        도메인: str = "default",
        출력파일: Path | None = None,
    ) -> Path:
        """형태소 분석 실행.

        Args:
            입력파일: 분석할 텍스트 파일
            도메인: 도메인명 (사전 경로 결정에 사용)
            출력파일: 출력 경로 (None이면 자동 생성)

        Returns:
            분석 결과 파일 경로

        Raises:
            FileNotFoundError: JAR 또는 JDK 없음
            subprocess.TimeoutExpired: 300초 초과
            RuntimeError: 분석 실패
        """
        # 설정 검증
        오류들 = self.설정검증()
        if 오류들:
            raise FileNotFoundError(f"설정 오류: {'; '.join(오류들)}")

        if 출력파일 is None:
            출력파일 = 입력파일.parent / f"{입력파일.stem}_analyzed{입력파일.suffix}"

        # java 명령 구성
        # cotton_test.sh: java -cp ... test.LiteTest $JIANA_HOME use $1 $2
        # $JIANA_HOME = base_경로/, use = 고정, $1 = 입력파일, $2 = 출력파일(절대경로)
        명령 = [
            str(self.설정값.java_실행파일),
            *self.설정값.분석_java옵션,
            "-cp", self.설정값.classpath,
            self.설정값.분석_메인클래스,
            str(self.설정값.base_경로) + "/",  # JIANA_HOME
            "use",
            str(입력파일.resolve()),
            str(출력파일.resolve()),
        ]

        # subprocess 실행 (출력은 stdout이 아닌 출력파일에 직접 기록됨)
        결과 = subprocess.run(
            명령,
            capture_output=True,
            timeout=300,  # 5분 타임아웃
        )

        if 결과.returncode != 0:
            raise RuntimeError(
                f"형태소 분석 실패 (returncode={결과.returncode})\n"
                f"stderr: {결과.stderr[:500]}"
            )

        if not 출력파일.exists():
            raise RuntimeError(f"분석 결과 파일 생성 실패: {출력파일}")

        return 출력파일

    def 텍스트분석(self, 텍스트: str, 도메인: str = "default") -> str:
        """텍스트 문자열 직접 분석.

        임시 파일 생성 후 분석 → 결과 반환.
        """
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", encoding="utf-8", delete=False
        ) as f:
            f.write(텍스트)
            임시입력 = Path(f.name)

        결과파일 = None
        try:
            결과파일 = self.분석(임시입력, 도메인)
            return 결과파일.read_text(encoding="utf-8")
        finally:
            임시입력.unlink(missing_ok=True)
            if 결과파일 and 결과파일.exists():
                결과파일.unlink(missing_ok=True)

    def dry_run(self, 입력파일: Path, 출력파일: Path | None = None) -> str:
        """실제 실행 없이 java 명령만 반환 (디버깅용)."""
        if 출력파일 is None:
            출력파일 = 입력파일.parent / f"{입력파일.stem}_analyzed{입력파일.suffix}"
        명령 = [
            str(self.설정값.java_실행파일),
            *self.설정값.분석_java옵션,
            "-cp", self.설정값.classpath,
            self.설정값.분석_메인클래스,
            str(self.설정값.base_경로) + "/",
            "use",
            str(입력파일.resolve()),
            str(출력파일.resolve()),
        ]
        return " ".join(명령)
