"""사전 빌드 래퍼 — jiana_dic_add.sh + ant dic Python subprocess 대체.

대체 대상:
    - jiana_dic_add.sh: 사전 파일 준비 + ant dic 빌드 트리거
    - ant dic: build.xml 기반 사전 컴파일
"""
from __future__ import annotations

import subprocess
from pathlib import Path


class 사전빌드래퍼:
    """사전 빌드 래퍼.

    jiana_dic_add.sh + ant dic를 Python subprocess로 대체.
    """

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정

    def ant빌드(
        self,
        도메인: str = "default",
        대상: str = "dic",
        작업디렉토리: Path | None = None,
    ) -> subprocess.CompletedProcess:
        """ant 빌드 실행.

        Args:
            도메인: 도메인명
            대상: ant 빌드 대상 (dic/all/clean)
            작업디렉토리: ant 실행 디렉토리 (None이면 base_경로)

        Returns:
            subprocess.CompletedProcess

        Raises:
            FileNotFoundError: ant 또는 build.xml 없음
            RuntimeError: 빌드 실패
        """
        작업dir = 작업디렉토리 or self.설정값.base_경로

        if not self.설정값.ant_경로.exists():
            raise FileNotFoundError(f"ant 없음: {self.설정값.ant_경로}")
        if not self.설정값.build_xml경로.exists():
            raise FileNotFoundError(f"build.xml 없음: {self.설정값.build_xml경로}")

        명령 = [
            str(self.설정값.ant_경로),
            "-f", str(self.설정값.build_xml경로),
            f"-Ddomain={도메인}",
            대상,
        ]

        결과 = subprocess.run(
            명령,
            cwd=str(작업dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,  # 10분 타임아웃
        )

        if 결과.returncode != 0:
            raise RuntimeError(
                f"ant 빌드 실패 (returncode={결과.returncode})\n"
                f"stdout: {결과.stdout[-1000:]}\n"
                f"stderr: {결과.stderr[:500]}"
            )

        return 결과

    def 빌드(
        self,
        도메인: str = "default",
        대상: str = "dic",
    ) -> dict[str, str]:
        """사전 빌드 전체 실행.

        jiana_dic_add.sh 기능 통합:
        1. 사전 디렉토리 준비
        2. ant dic 빌드 실행

        Returns:
            결과 딕셔너리 {상태, 메시지, 로그}
        """
        사전경로 = self.설정값.사전경로(도메인)

        # 사전 디렉토리 없으면 생성
        if not 사전경로.exists():
            사전경로.mkdir(parents=True, exist_ok=True)

        # ant 빌드 실행
        완료결과 = self.ant빌드(도메인, 대상)

        return {
            "상태": "성공",
            "도메인": 도메인,
            "대상": 대상,
            "로그": 완료결과.stdout[-2000:],
        }

    def dry_run(self, 도메인: str = "default", 대상: str = "dic") -> str:
        """실제 실행 없이 ant 명령만 반환 (디버깅용)."""
        명령 = [
            str(self.설정값.ant_경로),
            "-f", str(self.설정값.build_xml경로),
            f"-Ddomain={도메인}",
            대상,
        ]
        return " ".join(명령)
