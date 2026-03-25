# pipeline/refine.py — 검색로그 정제 엔진 (pandas 기반)
"""
정제 단계:
  1. CSV/Excel 파일 읽기 (chardet 인코딩 자동 감지)
  2. 공백/특수문자 제거
  3. 중복 제거 (case-insensitive)
  4. 최소 길이 필터 (2자 미만 제거)
  5. 정제된 키워드 목록 저장 + 통계 반환
"""
import logging
import os
import re
import unicodedata
from typing import Dict, Any

logger = logging.getLogger(__name__)

# 정제 결과 저장 기본 디렉토리
OUTPUT_DIR = "/home/know/apps/know-api/uploads/refined"


def refine_search_log(file_path: str, pipeline_id: int = None) -> Dict[str, Any]:
    """검색로그 파일 정제

    Args:
        file_path: 업로드된 CSV/Excel 파일 경로
        pipeline_id: 파이프라인 ID (출력 파일명에 사용)

    Returns:
        dict:
            input_count   - 입력 행 수
            output_count  - 정제 후 키워드 수
            removed_count - 제거된 항목 수
            output_file   - 정제 결과 파일 경로
            summary       - 정제 요약 텍스트
    """
    import pandas as pd

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 파일 읽기
    df = _read_file(file_path)
    input_count = len(df)
    logger.info("정제 시작: 파일=%s, 행수=%d", file_path, input_count)

    # 키워드 컬럼 추출
    keyword_col = _detect_keyword_column(df)
    if keyword_col is None:
        raise ValueError(
            f"키워드 컬럼을 찾을 수 없습니다. 컬럼 목록: {list(df.columns)}"
        )

    keywords = df[keyword_col].astype(str).tolist()
    stats = {"total": len(keywords), "removed": {}}

    # 1단계: 공백 정규화 + 특수문자 제거
    cleaned, cnt = _clean_keywords(keywords)
    stats["removed"]["특수문자/공백"] = cnt

    # 2단계: 최소 길이 필터 (2자 미만)
    before = len(cleaned)
    cleaned = [w for w in cleaned if len(w) >= 2]
    stats["removed"]["길이미달(2자미만)"] = before - len(cleaned)

    # 3단계: 중복 제거 (case-insensitive, 원본 대소문자 유지)
    cleaned, cnt = _deduplicate(cleaned)
    stats["removed"]["중복"] = cnt

    # 4단계: 빈 문자열 최종 제거
    cleaned = [w for w in cleaned if w.strip()]

    output_count = len(cleaned)
    removed_count = input_count - output_count

    # 결과 파일 저장
    suffix = f"_{pipeline_id}" if pipeline_id else ""
    output_file = os.path.join(OUTPUT_DIR, f"refined{suffix}.txt")
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(cleaned))

    summary = _build_summary(input_count, output_count, stats)
    logger.info("정제 완료: 입력=%d, 출력=%d, 제거=%d", input_count, output_count, removed_count)

    return {
        "input_count": input_count,
        "output_count": output_count,
        "removed_count": removed_count,
        "output_file": output_file,
        "summary": summary,
    }


# ─────────────────────────────────────────────
# 내부 헬퍼 함수
# ─────────────────────────────────────────────

def _read_file(file_path: str):
    """CSV/Excel 파일 읽기 (인코딩 자동 감지)"""
    import pandas as pd

    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(file_path, header=0)

    # CSV: chardet로 인코딩 감지
    encoding = _detect_encoding(file_path)
    logger.debug("CSV 인코딩 감지: %s → %s", file_path, encoding)
    try:
        return pd.read_csv(file_path, encoding=encoding, on_bad_lines="skip")
    except TypeError:
        # pandas < 1.3 호환
        return pd.read_csv(file_path, encoding=encoding, error_bad_lines=False)


def _detect_encoding(file_path: str) -> str:
    """chardet로 파일 인코딩 감지"""
    try:
        import chardet
        with open(file_path, "rb") as f:
            raw = f.read(65536)  # 첫 64KB만 샘플링
        result = chardet.detect(raw)
        enc = result.get("encoding") or "utf-8"
        # EUC-KR 계열 통일
        if enc.lower() in ("euc-kr", "euc_kr", "cp949"):
            return "cp949"
        return enc
    except ImportError:
        logger.warning("chardet 미설치 — utf-8 fallback")
        return "utf-8"


def _detect_keyword_column(df) -> str | None:
    """키워드 컬럼명 자동 감지"""
    # 우선순위: keyword > query > word > search_term > 첫 번째 컬럼
    candidates = ["keyword", "query", "word", "search_term", "검색어", "키워드"]
    col_lower = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c.lower() in col_lower:
            return col_lower[c.lower()]
    # 단일 컬럼이면 그것이 키워드
    if len(df.columns) == 1:
        return df.columns[0]
    return None


def _clean_keywords(keywords: list) -> tuple[list, int]:
    """공백 정규화 및 특수문자 제거"""
    # 허용 문자: 한글, 영문, 숫자, 공백, 하이픈, 언더스코어
    pattern = re.compile(r"[^\w\s\-]", re.UNICODE)
    removed = 0
    result = []
    for kw in keywords:
        # unicode 정규화 (NFKC: 호환 문자 → 표준 문자)
        kw = unicodedata.normalize("NFKC", kw)
        # 특수문자 제거
        cleaned = pattern.sub("", kw)
        # 연속 공백 → 단일 공백
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned != kw.strip():
            removed += 1
        result.append(cleaned)
    return result, removed


def _deduplicate(keywords: list) -> tuple[list, int]:
    """대소문자 무시 중복 제거 (첫 번째 등장 값 유지)"""
    seen = set()
    result = []
    for kw in keywords:
        lower = kw.lower()
        if lower not in seen:
            seen.add(lower)
            result.append(kw)
    removed = len(keywords) - len(result)
    return result, removed


def _build_summary(input_count: int, output_count: int, stats: dict) -> str:
    """정제 요약 텍스트 생성"""
    lines = [
        f"[정제 요약]",
        f"  입력: {input_count}건",
        f"  출력: {output_count}건",
        f"  제거 상세:",
    ]
    for reason, cnt in stats.get("removed", {}).items():
        if cnt > 0:
            lines.append(f"    - {reason}: {cnt}건")
    lines.append(f"  최종 제거: {input_count - output_count}건")
    return "\n".join(lines)
