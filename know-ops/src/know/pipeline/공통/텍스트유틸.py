"""텍스트 유틸리티 — 파이프라인 공통 텍스트 처리 모음.

파이프라인 전 단계에서 공통으로 사용하는 텍스트 처리 함수.
인코딩 변환, 정렬, 필터, 중복 제거 등 7가지 유틸리티 제공.
"""
from __future__ import annotations

import unicodedata
from pathlib import Path


# ── 인코딩 변환 ──────────────────────────────────────────────


def 인코딩감지(데이터: bytes) -> str:
    """바이트열 인코딩 자동 감지 (chardet 사용).

    Returns:
        감지된 인코딩 문자열 (예: 'utf-8', 'euc-kr')
        감지 실패 시 'utf-8' 반환
    """
    try:
        import chardet
        감지 = chardet.detect(데이터)
        return 감지.get("encoding") or "utf-8"
    except ImportError:
        return "utf-8"


def 파일텍스트로딩(파일경로: Path, 폴백인코딩: str = "euc-kr") -> str:
    """파일을 텍스트로 읽기 — 인코딩 자동 감지 후 UTF-8 변환.

    Args:
        파일경로: 읽을 파일 경로
        폴백인코딩: chardet 감지 실패 시 사용할 인코딩

    Returns:
        UTF-8 디코딩된 텍스트
    """
    바이트 = 파일경로.read_bytes()
    인코딩 = 인코딩감지(바이트) or 폴백인코딩
    try:
        return 바이트.decode(인코딩, errors="replace")
    except (LookupError, UnicodeDecodeError):
        return 바이트.decode(폴백인코딩, errors="replace")


def utf8변환저장(텍스트: str, 출력파일: Path) -> Path:
    """텍스트를 UTF-8 (BOM 없음)으로 저장.

    Args:
        텍스트: 저장할 텍스트
        출력파일: 저장 경로

    Returns:
        저장된 파일 경로
    """
    출력파일.write_text(텍스트, encoding="utf-8")
    return 출력파일


# ── 정렬 ─────────────────────────────────────────────────────


def 사전순정렬(줄목록: list[str], 대소문자무시: bool = True) -> list[str]:
    """줄 목록 사전 순 정렬.

    Args:
        줄목록: 정렬할 줄 목록
        대소문자무시: True면 대소문자 구분 없이 정렬

    Returns:
        정렬된 줄 목록
    """
    if 대소문자무시:
        return sorted(줄목록, key=lambda s: s.casefold())
    return sorted(줄목록)


def 길이순정렬(줄목록: list[str], 내림차순: bool = False) -> list[str]:
    """줄 목록을 길이 순으로 정렬.

    Args:
        줄목록: 정렬할 줄 목록
        내림차순: True면 긴 것부터

    Returns:
        길이 순 정렬된 줄 목록
    """
    return sorted(줄목록, key=len, reverse=내림차순)


# ── 필터 ─────────────────────────────────────────────────────


def 빈줄제거(줄목록: list[str]) -> list[str]:
    """빈 줄과 공백만 있는 줄 제거.

    Returns:
        내용 있는 줄만 포함한 목록
    """
    return [줄 for 줄 in 줄목록 if 줄.strip()]


def 주석줄제거(줄목록: list[str], 주석기호: str = "#") -> list[str]:
    """주석 기호로 시작하는 줄 제거.

    Args:
        줄목록: 처리할 줄 목록
        주석기호: 주석 시작 기호 (기본값 '#')

    Returns:
        주석 없는 줄 목록
    """
    return [줄 for 줄 in 줄목록 if not 줄.lstrip().startswith(주석기호)]


def 길이필터(줄목록: list[str], 최소: int = 1, 최대: int | None = None) -> list[str]:
    """줄 길이 범위 필터.

    Args:
        줄목록: 처리할 줄 목록
        최소: 최소 길이 (기본 1)
        최대: 최대 길이 (None이면 제한 없음)

    Returns:
        길이 조건을 만족하는 줄 목록
    """
    결과 = [줄 for 줄 in 줄목록 if len(줄.strip()) >= 최소]
    if 최대 is not None:
        결과 = [줄 for 줄 in 결과 if len(줄.strip()) <= 최대]
    return 결과


# ── 중복 제거 ────────────────────────────────────────────────


def 중복제거(줄목록: list[str], 공백정규화: bool = True) -> list[str]:
    """중복 줄 제거 (삽입 순서 유지).

    Args:
        줄목록: 처리할 줄 목록
        공백정규화: True면 앞뒤 공백 제거 후 비교

    Returns:
        중복 제거된 줄 목록 (첫 등장 순서 유지)
    """
    seen: set[str] = set()
    결과 = []
    for 줄 in 줄목록:
        키 = 줄.strip() if 공백정규화 else 줄
        if 키 not in seen:
            seen.add(키)
            결과.append(줄)
    return 결과


# ── 정규화 ───────────────────────────────────────────────────


def 유니코드정규화(텍스트: str, 형식: str = "NFC") -> str:
    """유니코드 정규화.

    Args:
        텍스트: 정규화할 텍스트
        형식: 'NFC' | 'NFD' | 'NFKC' | 'NFKD'

    Returns:
        정규화된 텍스트
    """
    return unicodedata.normalize(형식, 텍스트)


def 전각반각변환(텍스트: str) -> str:
    """전각 ASCII 문자를 반각으로 변환 (NFKC 정규화 적용).

    예: 'Ａ' → 'A', '１' → '1'
    """
    return unicodedata.normalize("NFKC", 텍스트)


# ── 파일 단위 통합 처리 ──────────────────────────────────────


def 파일정규화처리(
    입력파일: Path,
    출력파일: Path,
    *,
    중복제거여부: bool = True,
    정렬여부: bool = True,
    주석제거여부: bool = False,
    빈줄제거여부: bool = True,
) -> int:
    """파일 내 텍스트 정규화 통합 처리.

    Args:
        입력파일: 원본 파일 경로 (인코딩 자동 감지)
        출력파일: 결과 저장 경로 (UTF-8)
        중복제거여부: 중복 줄 제거 여부
        정렬여부: 사전순 정렬 여부
        주석제거여부: '#' 주석 줄 제거 여부
        빈줄제거여부: 빈 줄 제거 여부

    Returns:
        처리 후 줄 수
    """
    텍스트 = 파일텍스트로딩(입력파일)
    줄목록 = 텍스트.splitlines()

    if 빈줄제거여부:
        줄목록 = 빈줄제거(줄목록)
    if 주석제거여부:
        줄목록 = 주석줄제거(줄목록)
    if 중복제거여부:
        줄목록 = 중복제거(줄목록)
    if 정렬여부:
        줄목록 = 사전순정렬(줄목록)

    출력파일.write_text("\n".join(줄목록) + "\n", encoding="utf-8")
    return len(줄목록)
