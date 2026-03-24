"""know-ops 설정 모듈."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class 설정:
    """know-ops 전역 설정."""

    # ── JAR/JDK 경로 ──────────────────────────────────────────
    jiana_jar경로: Path = field(
        default_factory=lambda: Path(
            "/home/know/apps/jiana_admin_server/base_1.5/lib/jiana1.5.jar"
        )
    )
    dqdic_jar경로: Path = field(
        default_factory=lambda: Path(
            "/home/know/apps/jiana_admin_server/base_1.5/lib/dqdic-1.0.3.jar"
        )
    )
    jdk7_경로: Path = field(
        default_factory=lambda: Path("/usr/lib/jvm/java-1.7.0-openjdk-amd64")
    )

    # ── 기본 경로 ─────────────────────────────────────────────
    base_경로: Path = field(
        default_factory=lambda: Path("/home/know/apps/jiana_admin_server/base_1.5")
    )
    사전_루트경로: Path = field(
        default_factory=lambda: Path("/home/know/apps/jiana_admin_server/base_1.5/dic")
    )

    # ── 스팸/패턴 파일 ────────────────────────────────────────
    스팸패턴경로: Path = field(
        default_factory=lambda: Path(
            "/home/know/apps/jiana_admin_server/base_1.5/spam_kwd.pat"
        )
    )

    # ── 형태소 분석 설정 ──────────────────────────────────────
    # TODO: SSH 접속 후 정확한 메인클래스명 확인 필요 (cotton_test.sh 참조)
    분석_메인클래스: str = "com.diquest.jiana.test.CottonTest"
    분석_java옵션: list = field(
        default_factory=lambda: [
            "-Xmx512m",
            "-Dfile.encoding=UTF-8",
        ]
    )

    # ── Ant 빌드 설정 ─────────────────────────────────────────
    ant_경로: Path = field(default_factory=lambda: Path("/usr/bin/ant"))
    build_xml경로: Path = field(
        default_factory=lambda: Path(
            "/home/know/apps/jiana_admin_server/base_1.5/build.xml"
        )
    )

    # ── 스크립트 경로 ──────────────────────────────────────────
    bin_경로: Path = field(
        default_factory=lambda: Path("/home/know/apps/bin")
    )

    @property
    def java_실행파일(self) -> Path:
        """JDK 7 java 실행파일 경로."""
        return self.jdk7_경로 / "bin" / "java"

    @property
    def classpath(self) -> str:
        """형태소 분석 classpath."""
        return f"{self.jiana_jar경로}:{self.dqdic_jar경로}"

    def 사전경로(self, 도메인: str) -> Path:
        """도메인별 사전 디렉토리 경로."""
        return self.사전_루트경로 / 도메인

    def 검증(self) -> list[str]:
        """설정 유효성 검사. 오류 메시지 목록 반환."""
        오류들 = []
        if not self.jiana_jar경로.exists():
            오류들.append(f"jiana.jar 없음: {self.jiana_jar경로}")
        if not self.java_실행파일.exists():
            오류들.append(f"java 실행파일 없음: {self.java_실행파일}")
        return 오류들


# 전역 기본 설정 인스턴스
기본설정 = 설정()
