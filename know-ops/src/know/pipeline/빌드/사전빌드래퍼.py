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

    ant dic를 Python subprocess로 실행.
    build.xml은 base_경로/build.xml, 실행 위치는 base_경로.

    build.xml dic 타깃 처리 순서:
        makeTag → makeDCD → makeCnDCD → bigPrefer → clearTemp → core
    산출물: base_경로/data/*.dcd (형태소 분석기 바이너리 사전)
    """

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정

    def ant빌드(
        self,
        대상: str = "dic",
    ) -> subprocess.CompletedProcess:
        """ant 빌드 실행.

        Args:
            대상: ant 빌드 대상 (dic/all/clean)

        Returns:
            subprocess.CompletedProcess

        Raises:
            FileNotFoundError: ant 또는 build.xml 없음
            RuntimeError: 빌드 실패
        """
        if not self.설정값.ant_경로.exists():
            raise FileNotFoundError(f"ant 없음: {self.설정값.ant_경로}")
        if not self.설정값.build_xml경로.exists():
            raise FileNotFoundError(f"build.xml 없음: {self.설정값.build_xml경로}")

        명령 = [
            str(self.설정값.ant_경로),
            "-f", str(self.설정값.build_xml경로),
            대상,
        ]

        결과 = subprocess.run(
            명령,
            cwd=str(self.설정값.base_경로),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=1800,  # 30분 타임아웃 (대용량 사전 빌드)
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
        대상: str = "dic",
    ) -> dict[str, str]:
        """사전 빌드 실행.

        ant dic를 base_경로에서 실행.
        산출물: base_경로/data/*.dcd

        Returns:
            결과 딕셔너리 {상태, 대상, 로그}
        """
        완료결과 = self.ant빌드(대상)

        return {
            "상태": "성공",
            "대상": 대상,
            "로그": 완료결과.stdout[-2000:],
        }

    def dry_run(self, 대상: str = "dic") -> str:
        """실제 실행 없이 ant 명령만 반환 (디버깅용)."""
        명령 = [
            str(self.설정값.ant_경로),
            "-f", str(self.설정값.build_xml경로),
            대상,
        ]
        return " ".join(명령)
