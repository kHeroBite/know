"""jiana 사전 파일 직접 편집 서비스.

워크스페이스 연결(connect) 후 jiana 엔진 경로의 txt_resrc 파일을 직접 읽고 수정한다.
대상 경로: {WORKSPACE_DIR}/{ws_name}/jiana/txt_resrc/{dict_type}/

지원 사전 타입:
- grammar : Grammar.diana, *.list 등 문법 규칙 파일
- sdic    : *.dic 시스템 사전 파일
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path

from fastapi import HTTPException, status

from core.constants import WORKSPACE_DIR
from services.workspace_service import _read_state

logger = logging.getLogger(__name__)

# 허용 사전 타입
ALLOWED_DICT_TYPES = {"grammar", "sdic"}

# 파일명 안전 패턴 (경로 순회 방지)
_SAFE_FILENAME_RE = re.compile(r'^[A-Za-z0-9._-]+$')


def _require_workspace_used(ws_name: str) -> dict:
    """워크스페이스가 USED 상태인지 확인. 아니면 404/409 반환."""
    state = _read_state()
    ws_state = state.get(ws_name)
    if ws_state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    if ws_state.get("status") != "USED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"워크스페이스가 연결(USED) 상태가 아닙니다: {ws_name} (현재: {ws_state.get('status')})",
        )
    return ws_state


def _get_dict_base_path(ws_name: str, dict_type: str) -> str:
    """워크스페이스 jiana txt_resrc/{dict_type} 경로 반환."""
    if dict_type not in ALLOWED_DICT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 사전 타입입니다: {dict_type}. 허용: {sorted(ALLOWED_DICT_TYPES)}",
        )
    path = os.path.join(WORKSPACE_DIR, ws_name, "jiana", "txt_resrc", dict_type)
    return path


def _safe_file_path(base_path: str, filename: str) -> str:
    """경로 순회 공격을 방지하고 안전한 파일 경로를 반환."""
    if not _SAFE_FILENAME_RE.match(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"허용되지 않는 파일명입니다: {filename}",
        )
    full_path = os.path.realpath(os.path.join(base_path, filename))
    real_base = os.path.realpath(base_path)
    if not full_path.startswith(real_base + os.sep) and full_path != real_base:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="잘못된 파일 경로입니다.",
        )
    return full_path


def list_dict_types(ws_name: str, domain: str | None = None) -> list[str]:
    """워크스페이스 jiana txt_resrc에서 편집 가능한 사전 타입 목록 반환."""
    _require_workspace_used(ws_name)
    result = []
    for dt in sorted(ALLOWED_DICT_TYPES):
        path = os.path.join(WORKSPACE_DIR, ws_name, "jiana", "txt_resrc", dt)
        if os.path.isdir(path):
            result.append(dt)
    return result


def list_dict_files(ws_name: str, dict_type: str, domain: str | None = None) -> list[dict]:
    """사전 타입 디렉토리의 편집 가능한 파일 목록 반환."""
    _require_workspace_used(ws_name)
    base_path = _get_dict_base_path(ws_name, dict_type)
    if not os.path.isdir(base_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"사전 디렉토리가 없습니다: {base_path}",
        )
    files = []
    for entry in sorted(os.scandir(base_path), key=lambda e: e.name):
        if entry.is_file() and _SAFE_FILENAME_RE.match(entry.name):
            stat = entry.stat()
            files.append({
                "name": entry.name,
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            })
    return files


def read_dict_file(ws_name: str, dict_type: str, filename: str, domain: str | None = None) -> dict:
    """사전 파일 내용 읽기. 인코딩 자동 감지(UTF-8 → EUC-KR fallback)."""
    _require_workspace_used(ws_name)
    base_path = _get_dict_base_path(ws_name, dict_type)
    full_path = _safe_file_path(base_path, filename)
    if not os.path.isfile(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"파일을 찾을 수 없습니다: {filename}",
        )
    with open(full_path, "rb") as f:
        raw = f.read()

    encoding = "utf-8"
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            content = raw.decode("euc-kr")
            encoding = "euc-kr"
        except UnicodeDecodeError:
            content = raw.decode("utf-8", errors="replace")

    return {
        "filename": filename,
        "content": content,
        "encoding": encoding,
        "size": len(raw),
    }


def read_dict_rows(
    ws_name: str,
    dict_type: str,
    filename: str,
    page: int = 1,
    page_size: int = 150,
    q: str = "",
    domain: str | None = None,
) -> dict:
    """사전 파일을 페이징하여 행 단위로 반환. 초성(자소) 검색 지원."""
    _require_workspace_used(ws_name)
    base_path = _get_dict_base_path(ws_name, dict_type)
    full_path = _safe_file_path(base_path, filename)
    if not os.path.isfile(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"파일을 찾을 수 없습니다: {filename}",
        )

    ext = Path(filename).suffix.lower()
    sep = "\t" if ext == ".list" else " "

    with open(full_path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = raw.decode("euc-kr")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

    all_lines = text.splitlines()

    # 필터링 (단순 substring 검색)
    if q:
        filtered: list[tuple[int, str]] = []
        for idx, line in enumerate(all_lines, start=1):
            if not line.strip():
                continue
            cols = line.split(sep)
            first_col = cols[0] if cols else ""
            if q.lower() in first_col.lower():
                filtered.append((idx, line))
    else:
        filtered = [(idx, line) for idx, line in enumerate(all_lines, start=1) if line.strip()]

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    page_data = filtered[start:end]

    rows = []
    for line_num, line in page_data:
        cols = line.split(sep)
        rows.append({"line_num": line_num, "cols": cols})

    # 헤더 컬럼 수 추정 (첫 데이터 행 기준)
    col_count = max((len(r["cols"]) for r in rows), default=1)

    return {
        "filename": filename,
        "sep": sep,
        "total": total,
        "page": page,
        "page_size": page_size,
        "rows": rows,
        "col_count": col_count,
    }


def write_dict_row(
    ws_name: str,
    dict_type: str,
    filename: str,
    line_num: int,
    cols: list[str],
    domain: str | None = None,
) -> dict:
    """사전 파일의 특정 행(1-based line_num)을 수정."""
    _require_workspace_used(ws_name)
    base_path = _get_dict_base_path(ws_name, dict_type)
    full_path = _safe_file_path(base_path, filename)
    if not os.path.isfile(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"파일을 찾을 수 없습니다: {filename}",
        )

    ext = Path(filename).suffix.lower()
    sep = "\t" if ext == ".list" else " "

    with open(full_path, "rb") as f:
        raw = f.read()
    encoding = "utf-8"
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = raw.decode("euc-kr")
            encoding = "euc-kr"
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

    all_lines = text.splitlines(keepends=True)

    if line_num < 1 or line_num > len(all_lines):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 줄 번호: {line_num} (총 {len(all_lines)}줄)",
        )

    # 원본 줄 끝 문자 보존
    orig_line = all_lines[line_num - 1]
    line_ending = ""
    if orig_line.endswith("\r\n"):
        line_ending = "\r\n"
    elif orig_line.endswith("\n"):
        line_ending = "\n"
    elif orig_line.endswith("\r"):
        line_ending = "\r"

    new_line = sep.join(cols) + line_ending
    all_lines[line_num - 1] = new_line

    new_content = "".join(all_lines)

    # .bak 백업
    bak_path = full_path + ".bak"
    shutil.copy2(full_path, bak_path)

    with open(full_path, "w", encoding=encoding, newline="") as f:
        f.write(new_content)

    # dual-write outer
    try:
        outer_dir = os.path.join(WORKSPACE_DIR, ws_name, "txt_resrc", dict_type)
        outer_path = os.path.join(outer_dir, filename)
        os.makedirs(outer_dir, exist_ok=True)
        with open(outer_path, "w", encoding=encoding, newline="") as f:
            f.write(new_content)
    except Exception as _e:
        logger.warning("jiana_dict dual-write outer 실패 (무시): %s", _e)

    return {"line_num": line_num, "saved": True}


def write_dict_file(
    ws_name: str,
    dict_type: str,
    filename: str,
    content: str,
    domain: str | None = None,
) -> dict:
    """사전 파일 저장. 저장 전 .bak 백업 생성."""
    _require_workspace_used(ws_name)
    base_path = _get_dict_base_path(ws_name, dict_type)
    full_path = _safe_file_path(base_path, filename)
    if not os.path.isfile(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"파일을 찾을 수 없습니다: {filename}",
        )

    # .bak 백업 생성
    bak_path = full_path + ".bak"
    shutil.copy2(full_path, bak_path)

    # 원본 인코딩 감지
    with open(full_path, "rb") as f:
        raw = f.read()
    encoding = "utf-8"
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError:
        encoding = "euc-kr"

    # 저장 (원본 인코딩 유지)
    with open(full_path, "w", encoding=encoding, newline="") as f:
        f.write(content)

    # [dual-write] outer 경로에도 동일 내용 저장 (clobber 방지)
    # disconnect→reconnect 시 outer가 inner를 덮어쓰므로 outer도 최신 유지
    outer_path = None
    try:
        outer_dir = os.path.join(WORKSPACE_DIR, ws_name, "txt_resrc", dict_type)
        outer_path = os.path.join(outer_dir, filename)
        os.makedirs(outer_dir, exist_ok=True)
        with open(outer_path, "w", encoding=encoding, newline="") as f:
            f.write(content)
    except Exception as _e:
        logger.warning("jiana_dict dual-write outer 실패 (무시): %s — %s", outer_path, _e)

    return {
        "filename": filename,
        "backup": bak_path,
        "encoding": encoding,
        "bytes_written": len(content.encode(encoding, errors="replace")),
    }
