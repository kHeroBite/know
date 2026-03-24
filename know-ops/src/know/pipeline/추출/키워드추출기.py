"""키워드 추출기 — pop_log/fail_log 원시파일 → 정제 키워드 파일."""
from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path


class 키워드추출기:
    """인기/실패 검색어 원시 파일에서 키워드를 추출·정제한다."""

    def __init__(self, 설정=None):
        from know.core.config import 기본설정
        self.설정 = 설정 or 기본설정

    def 추출(
        self,
        pop_경로: Path,
        fail_경로: Path,
        출력_경로: Path,
        모드: str = "rank",
        n: int = 150000,
    ) -> Path:
        """pop_log + fail_log → 통합 키워드 파일 생성.

        Args:
            pop_경로: 인기 검색어 로그 디렉토리
            fail_경로: 실패 검색어 로그 디렉토리
            출력_경로: 결과 파일 경로
            모드: "rank" (상위 n개) 또는 "count" (n회 이상)
            n: 등수(rank) 또는 최소 횟수(count)

        Returns:
            출력 파일 경로
        """
        pop_카운터 = self._디렉토리_읽기(pop_경로)
        fail_카운터 = self._디렉토리_읽기(fail_경로)

        # 모드별 필터링 후 키워드만 추출
        pop_키워드 = self._필터링(pop_카운터, 모드, n)
        fail_키워드 = self._필터링(fail_카운터, 모드, n)

        # 합집합 (중복 제거)
        통합_키워드 = list(set(pop_키워드) | set(fail_키워드))

        # 스팸 정제 적용
        from know.pipeline.정제.검색로그정제기 import 검색로그정제기
        정제기 = 검색로그정제기(self.설정)
        정제된_키워드들 = 정제기.키워드_정제(통합_키워드)

        # 출력 파일 저장
        출력_경로.parent.mkdir(parents=True, exist_ok=True)
        with 출력_경로.open("w", encoding="utf-8") as f:
            for 키워드 in sorted(정제된_키워드들):
                f.write(f"{키워드}\n")

        return 출력_경로

    def _필터링(self, 카운터: Counter, 모드: str, n: int) -> list[str]:
        """모드에 따라 키워드 필터링."""
        if 모드 == "rank":
            return [키워드 for 키워드, _ in 카운터.most_common(n)]
        else:  # count
            return [키워드 for 키워드, 횟수 in 카운터.items() if 횟수 >= n]

    def _디렉토리_읽기(self, 경로: Path) -> Counter:
        """경로 내 모든 파일을 포맷 자동감지하여 키워드-카운트 Counter 반환."""
        합산 = Counter()
        if not 경로.exists():
            return 합산
        for 파일 in sorted(경로.iterdir()):
            if 파일.is_file():
                합산 += self._파일_읽기(파일)
        return 합산

    def _파일_읽기(self, 파일: Path) -> Counter:
        """단일 파일 읽기 — 포맷1(TSV)/포맷2(CSV) 자동감지."""
        카운터 = Counter()
        인코딩 = self._인코딩_감지(파일)
        try:
            with 파일.open(encoding=인코딩, errors="ignore") as f:
                첫줄 = f.readline()
                if not 첫줄.strip():
                    return 카운터
                포맷 = self._포맷_감지(첫줄)
                # 첫 줄부터 다시 처리
                f.seek(0)
                if 포맷 == "tsv":
                    self._tsv_파싱(f, 카운터)
                else:
                    self._csv_파싱(f, 카운터)
        except (OSError, UnicodeDecodeError):
            pass
        return 카운터

    def _tsv_파싱(self, f, 카운터: Counter) -> None:
        """TSV 포맷 파싱 (컬럼: 키워드\t횟수)."""
        for 줄 in f:
            줄 = 줄.strip()
            if not 줄:
                continue
            parts = 줄.split("\t")
            # 헤더 스킵
            if parts[0] in ("KEYWORDS", "keywords", "키워드"):
                continue
            키워드 = parts[0].strip()
            횟수 = 1
            if len(parts) > 1:
                try:
                    횟수 = int(parts[1].strip())
                except ValueError:
                    continue
            if 키워드:
                카운터[키워드] += 횟수

    def _csv_파싱(self, f, 카운터: Counter) -> None:
        """CSV 포맷 파싱 (5컬럼: 순위,검색어,변동폭,횟수,검색점유율)."""
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 4:
                continue
            # 헤더 스킵: 첫 컬럼이 숫자가 아니면 헤더
            if not row[0].strip().isdigit():
                continue
            키워드 = row[1].strip()
            횟수_문자열 = re.sub(r'[^\d]', '', row[3])
            try:
                횟수 = int(횟수_문자열) if 횟수_문자열 else 1
            except ValueError:
                횟수 = 1
            if 키워드:
                카운터[키워드] += 횟수

    def _포맷_감지(self, 첫줄: str) -> str:
        """'tsv' or 'csv' 반환."""
        if "\t" in 첫줄:
            return "tsv"
        if "," in 첫줄:
            return "csv"
        return "tsv"

    def _인코딩_감지(self, 파일: Path) -> str:
        """EUC-KR/UTF-8 자동감지. chardet 없으면 순차 시도."""
        try:
            import chardet
            raw = 파일.read_bytes()[:4096]
            결과 = chardet.detect(raw)
            return 결과.get("encoding", "utf-8") or "utf-8"
        except ImportError:
            pass
        # chardet 없으면 순차 시도
        for 인코딩 in ("utf-8", "euc-kr"):
            try:
                with 파일.open(encoding=인코딩) as f:
                    f.read(1024)
                return 인코딩
            except (UnicodeDecodeError, OSError):
                continue
        return "utf-8"
