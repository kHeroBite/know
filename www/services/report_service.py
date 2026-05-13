"""report_service.py — 완료 리포트 PPT + diff 생성

요구사항 5: 완료 후 이전 백업과의 delta 리포트 + 공유 페이지용 JSON diff.
- PPT: python-pptx (전체 키워드 포함, 최대 페이지별 100개)
- diff: UI 페이지네이션용 JSON
"""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl.styles import Font
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

from core.constants import DICT_BACKUP_DIR, KNOW_OPS_ROOT
from services.snapshot_service import get_snapshots_pair
from services.workspace_service import get_participants_stats

logger = logging.getLogger(__name__)

REPORTS_DIR = Path(KNOW_OPS_ROOT) / "www" / "reports"


# ──────────────────────────────────────────────
# 백업 JSON 로드
# ──────────────────────────────────────────────

_SUFFIX_BY_TYPE = {
    "udic": "_UDIC",
    "cndic": "_CNDIC",
    "thesaurus": "_THESAURUS",
    "category": "_CATEGORY",
}


def _load_backup_dict(backup_name: str) -> dict[str, list[dict]]:
    """백업 디렉토리에서 4개 테이블 JSON 파일 로드 → {type: [rows]}.

    없는 파일은 빈 리스트로 반환.
    """
    backup_path = Path(DICT_BACKUP_DIR) / backup_name
    result: dict[str, list[dict]] = {k: [] for k in _SUFFIX_BY_TYPE}
    if not backup_path.is_dir():
        logger.warning("백업 디렉토리 없음: %s", backup_path)
        return result
    for type_key, suffix in _SUFFIX_BY_TYPE.items():
        json_file = backup_path / f"db{suffix}.json"
        if not json_file.exists():
            continue
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            if isinstance(data, list):
                result[type_key] = data
        except Exception as e:
            logger.warning("백업 JSON 파싱 실패 %s: %s", json_file, e)
    return result


def _read_backup_metadata(backup_name: str) -> dict[str, Any]:
    """백업 metadata.json 읽기 (없으면 빈 dict)."""
    meta_path = Path(DICT_BACKUP_DIR) / backup_name / "metadata.json"
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


# ──────────────────────────────────────────────
# diff 계산
# ──────────────────────────────────────────────

def _row_key(row: dict) -> str:
    """사전 row의 식별 키 (keyword/word/term 중 우선순위).

    4개 테이블 공통 — 'keyword' 컬럼을 기본 키로 가정.
    없으면 첫 번째 문자열 필드를 사용.
    """
    for col in ("keyword", "word", "term", "name"):
        v = row.get(col)
        if v:
            return str(v)
    for v in row.values():
        if isinstance(v, str) and v:
            return v
    return ""


def _row_value(row: dict) -> str:
    """수정 판정용 값 (키 제외 나머지 필드 stringify)."""
    keys_to_skip = {"keyword", "word", "term", "name", "id"}
    parts = []
    for k, v in sorted(row.items()):
        if k in keys_to_skip:
            continue
        parts.append(f"{k}={v}")
    return "|".join(parts)


def _compute_table_diff(
    current: list[dict], previous: list[dict]
) -> dict[str, list[dict]]:
    """단일 테이블의 added/removed/modified 리스트 산출."""
    prev_map = {_row_key(r): r for r in previous if _row_key(r)}
    curr_map = {_row_key(r): r for r in current if _row_key(r)}

    prev_keys = set(prev_map.keys())
    curr_keys = set(curr_map.keys())

    added_keys = curr_keys - prev_keys
    removed_keys = prev_keys - curr_keys
    common_keys = curr_keys & prev_keys

    added = [curr_map[k] for k in sorted(added_keys)]
    removed = [prev_map[k] for k in sorted(removed_keys)]
    modified = []
    for k in sorted(common_keys):
        if _row_value(curr_map[k]) != _row_value(prev_map[k]):
            modified.append({"key": k, "before": prev_map[k], "after": curr_map[k]})

    return {"added": added, "removed": removed, "modified": modified}


def _compute_full_diff(
    current_data: dict[str, list[dict]],
    prev_data: dict[str, list[dict]],
) -> dict[str, dict[str, list[dict]]]:
    """4개 테이블 전체 diff."""
    return {
        type_key: _compute_table_diff(current_data[type_key], prev_data.get(type_key, []))
        for type_key in _SUFFIX_BY_TYPE
    }


# ──────────────────────────────────────────────
# 공개 API
# ──────────────────────────────────────────────

def get_diff(
    workspace: str,
    current_backup: str,
    prev_backup: str | None,
    category: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db=None,
) -> dict[str, Any]:
    """공유 페이지/UI에서 페이지네이션 조회용 diff.

    category: 'udic' | 'cndic' | 'thesaurus' | 'category' | None(전체 요약)
    """
    current_data = _load_backup_dict(current_backup)
    prev_data = _load_backup_dict(prev_backup) if prev_backup else {k: [] for k in _SUFFIX_BY_TYPE}

    full = _compute_full_diff(current_data, prev_data)

    # 요약 (카테고리 지정 없을 때)
    summary = {}
    for type_key in _SUFFIX_BY_TYPE:
        d = full[type_key]
        summary[type_key] = {
            "added": len(d["added"]),
            "removed": len(d["removed"]),
            "modified": len(d["modified"]),
            "total_current": len(current_data[type_key]),
            "total_previous": len(prev_data.get(type_key, [])),
        }

    result: dict[str, Any] = {
        "workspace": workspace,
        "current_backup": current_backup,
        "prev_backup": prev_backup,
        "summary": summary,
    }

    if category and category in _SUFFIX_BY_TYPE:
        d = full[category]
        # 페이지네이션
        offset = max(0, (page - 1) * page_size)
        result["category"] = category
        result["added"] = d["added"][offset : offset + page_size]
        result["removed"] = d["removed"][offset : offset + page_size]
        result["modified"] = d["modified"][offset : offset + page_size]
        result["page"] = page
        result["page_size"] = page_size
        result["total"] = {
            "added": len(d["added"]),
            "removed": len(d["removed"]),
            "modified": len(d["modified"]),
        }
    return result


def generate_pptx(
    workspace: str,
    current_backup: str,
    prev_backup: str | None,
    db,
) -> Path:
    """7 슬라이드 완료 리포트 PPT 생성.

    반환: 생성된 PPT 파일 경로.
    """
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    current_data = _load_backup_dict(current_backup)
    prev_data = _load_backup_dict(prev_backup) if prev_backup else {k: [] for k in _SUFFIX_BY_TYPE}
    current_meta = _read_backup_metadata(current_backup)
    domain = str(current_meta.get("domain") or "").upper()

    full_diff = _compute_full_diff(current_data, prev_data)

    before_snap, after_snap = get_snapshots_pair(workspace, db) if db else (None, None)
    participants = get_participants_stats(workspace, db) if db else []

    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)

    _add_slide_cover(prs, workspace, domain, current_backup, prev_backup, current_meta)
    _add_slide_summary(prs, full_diff, before_snap, after_snap)
    _add_slide_keyword_list(prs, "추가된 키워드 (Added)", full_diff, "added")
    _add_slide_keyword_list(prs, "삭제된 키워드 (Removed)", full_diff, "removed")
    _add_slide_modified_list(prs, full_diff)
    _add_slide_participants(prs, participants)
    _add_slide_metadata(prs, workspace, current_meta, current_backup)

    out_path = REPORTS_DIR / f"{workspace}_{current_backup}.pptx"
    prs.save(str(out_path))
    logger.info("리포트 PPT 생성: %s", out_path)
    return out_path


# ──────────────────────────────────────────────
# 슬라이드 빌더
# ──────────────────────────────────────────────

def _blank_slide(prs: Presentation):
    layout = prs.slide_layouts[6]  # blank
    return prs.slides.add_slide(layout)


def _add_title(slide, text: str, top_in: float = 0.3):
    tb = slide.shapes.add_textbox(Inches(0.5), Inches(top_in), Inches(12.3), Inches(0.8))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.alignment = PP_ALIGN.LEFT
    for run in p.runs:
        run.font.size = Pt(28)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)


def _add_text(slide, text: str, left_in: float, top_in: float, width_in: float, height_in: float, font_size: int = 14, bold: bool = False):
    tb = slide.shapes.add_textbox(Inches(left_in), Inches(top_in), Inches(width_in), Inches(height_in))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.text = text
    for p in tf.paragraphs:
        for run in p.runs:
            run.font.size = Pt(font_size)
            run.font.bold = bold
    return tf


def _add_slide_cover(prs, workspace, domain, current_backup, prev_backup, meta):
    slide = _blank_slide(prs)
    _add_title(slide, "워크스페이스 완료 리포트", top_in=2.0)

    _add_text(slide, f"워크스페이스: {workspace}", 0.5, 3.2, 12.3, 0.5, font_size=22, bold=True)
    _add_text(slide, f"도메인: {domain or '-'}", 0.5, 3.9, 12.3, 0.5, font_size=18)
    finished_at = meta.get("timestamp") or datetime.now().isoformat(timespec="seconds")
    _add_text(slide, f"완료일시: {finished_at}", 0.5, 4.4, 12.3, 0.5, font_size=18)
    _add_text(slide, f"기준 백업: {current_backup}", 0.5, 4.9, 12.3, 0.5, font_size=14)
    _add_text(slide, f"비교 백업: {prev_backup or '(최초 완료 — 이전 백업 없음)'}", 0.5, 5.3, 12.3, 0.5, font_size=14)


def _add_slide_summary(prs, full_diff, before_snap, after_snap):
    slide = _blank_slide(prs)
    _add_title(slide, "요약 — 테이블별 증감")

    headers = ["테이블", "추가", "삭제", "수정", "Before", "After"]
    rows = []
    name_map = {"udic": "UDIC", "cndic": "CNDIC", "thesaurus": "THESAURUS", "category": "CATEGORY"}
    snap_key_map = {
        "udic": "udic_count",
        "cndic": "cndic_count",
        "thesaurus": "thesaurus_count",
        "category": "category_count",
    }
    for type_key, label in name_map.items():
        d = full_diff[type_key]
        before_val = (before_snap or {}).get(snap_key_map[type_key], "-")
        after_val = (after_snap or {}).get(snap_key_map[type_key], "-")
        rows.append([
            label,
            str(len(d["added"])),
            str(len(d["removed"])),
            str(len(d["modified"])),
            str(before_val),
            str(after_val),
        ])

    _add_table(slide, headers, rows, left_in=0.5, top_in=1.3, width_in=12.3, row_height_in=0.5)


def _add_slide_keyword_list(prs, title: str, full_diff, kind: str):
    """kind: 'added' | 'removed' — 페이지당 100개 제한, 초과 시 요약."""
    slide = _blank_slide(prs)
    _add_title(slide, title)

    lines = []
    name_map = {"udic": "UDIC", "cndic": "CNDIC", "thesaurus": "THESAURUS", "category": "CATEGORY"}
    max_per_type = 25
    total = 0
    for type_key, label in name_map.items():
        items = full_diff[type_key][kind]
        if not items:
            continue
        lines.append(f"[{label}] {len(items)}건")
        for row in items[:max_per_type]:
            key = _row_key(row)
            if key:
                lines.append(f"  · {key}")
                total += 1
        if len(items) > max_per_type:
            lines.append(f"  … 외 {len(items) - max_per_type}건 생략 (공유 페이지에서 전체 조회)")
        lines.append("")
    if total == 0:
        lines.append("(변경 없음)")

    body = "\n".join(lines)
    _add_text(slide, body, 0.5, 1.3, 12.3, 5.8, font_size=12)


def _add_slide_modified_list(prs, full_diff):
    slide = _blank_slide(prs)
    _add_title(slide, "수정된 키워드 (Modified)")

    lines = []
    name_map = {"udic": "UDIC", "cndic": "CNDIC", "thesaurus": "THESAURUS", "category": "CATEGORY"}
    max_per_type = 20
    total = 0
    for type_key, label in name_map.items():
        items = full_diff[type_key]["modified"]
        if not items:
            continue
        lines.append(f"[{label}] {len(items)}건")
        for m in items[:max_per_type]:
            lines.append(f"  · {m.get('key', '')}")
            total += 1
        if len(items) > max_per_type:
            lines.append(f"  … 외 {len(items) - max_per_type}건 생략 (공유 페이지에서 전체 조회)")
        lines.append("")
    if total == 0:
        lines.append("(수정 없음)")

    body = "\n".join(lines)
    _add_text(slide, body, 0.5, 1.3, 12.3, 5.8, font_size=12)


def _add_slide_participants(prs, participants: list[dict]):
    slide = _blank_slide(prs)
    _add_title(slide, "참여자 R/W 통계")

    if not participants:
        _add_text(slide, "(참여자 정보 없음)", 0.5, 1.5, 12.3, 0.8, font_size=16)
        return

    headers = ["사용자", "아이디", "읽기(R)", "쓰기(W)", "합계"]
    rows = []
    for p in participants:
        r = int(p.get("r_count", 0))
        w = int(p.get("w_count", 0))
        rows.append([
            str(p.get("name", "")),
            str(p.get("user_id", "")),
            str(r),
            str(w),
            str(r + w),
        ])
    _add_table(slide, headers, rows, left_in=0.5, top_in=1.3, width_in=12.3, row_height_in=0.45)


def _add_slide_metadata(prs, workspace: str, meta: dict, current_backup: str):
    slide = _blank_slide(prs)
    _add_title(slide, "경과 시간 + 완료 메타데이터")

    lines = [
        f"워크스페이스: {workspace}",
        f"기준 백업 폴더: {current_backup}",
        f"완료 시각: {meta.get('timestamp', '-')}",
        f"파일 백업: {', '.join(meta.get('files', []) or []) or '-'}",
        f"DB 백업 파일: {', '.join(meta.get('backup_files', []) or []) or '-'}",
    ]
    counts = meta.get("dict_counts") or {}
    if counts:
        lines.append("")
        lines.append("사전 카운트 (완료 시점):")
        for k in ("udic", "cndic", "thesaurus", "category"):
            lines.append(f"  · {k.upper()}: {counts.get(k, 0)}")

    body = "\n".join(lines)
    _add_text(slide, body, 0.5, 1.3, 12.3, 5.8, font_size=14)


def _add_table(slide, headers: list[str], rows: list[list[str]], left_in: float, top_in: float, width_in: float, row_height_in: float):
    total_rows = len(rows) + 1
    total_height = row_height_in * total_rows
    table_shape = slide.shapes.add_table(
        total_rows, len(headers),
        Inches(left_in), Inches(top_in),
        Inches(width_in), Inches(total_height),
    )
    table = table_shape.table
    for c, h in enumerate(headers):
        cell = table.cell(0, c)
        cell.text = h
        for p in cell.text_frame.paragraphs:
            for run in p.runs:
                run.font.size = Pt(14)
                run.font.bold = True
    for r, row in enumerate(rows, start=1):
        for c, v in enumerate(row):
            cell = table.cell(r, c)
            cell.text = v
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(12)


# ──────────────────────────────────────────────
# Excel 리포트 생성 — 8시트 구조 (샘플 know.xlsx 기준)
# ──────────────────────────────────────────────


def _read_dict_file_first_col(filepath: str | Path) -> list[str]:
    # 텍스트 사전 파일에서 스페이스 split 첫 번째 컬럼만 추출 (cotton.dic, nq_per.dic)
    result: list[str] = []
    fpath = Path(filepath)
    if not fpath.exists():
        logger.warning("사전 파일 없음: %s", fpath)
        return result
    try:
        for line in fpath.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts:
                result.append(parts[0])
    except Exception as e:
        logger.warning("사전 파일 읽기 실패 %s: %s", fpath, e)
    return result


def _read_grammar_file(filepath: str | Path) -> list[tuple]:
    # 기분석 사전(cotton_part_prefer.list) 탭 split → (표제어, 분석_태그) 튜플 목록
    result: list[tuple] = []
    fpath = Path(filepath)
    if not fpath.exists():
        logger.warning("기분석 파일 없음: %s", fpath)
        return result
    try:
        for line in fpath.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.rstrip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            keyword = parts[0].strip() if parts else ""
            tags = "\t".join(p.strip() for p in parts[1:]) if len(parts) > 1 else ""
            if keyword:
                result.append((keyword, tags))
    except Exception as e:
        logger.warning("기분석 파일 읽기 실패 %s: %s", fpath, e)
    return result


def _build_overview_sheet(ws, data: dict) -> None:
    # [0] 작업개요 시트 — C2:J7 사전별 추가/삭제/수정 카운트 표
    bold = Font(bold=True)

    # row2: 제목 + 우측 주석
    ws.cell(row=2, column=3, value="사전작업 산출물 개요").font = bold
    ws.cell(row=2, column=10, value="*형태소 엔트리 기준")

    # row3: 헤더 (C~J)
    headers_row3 = [
        "지식사전 분류",
        "사용자 사전(단일어)",
        "복합어 사전",
        "유사어 사전(신규)",
        "유사어 사전(추가)",
        "용언 명사화사전(cotton.dic)",
        "인명 사전(nq_per.dic)",
        "기분석 사전(cotton_part_prefer.list)",
    ]
    for c, h in enumerate(headers_row3, 3):
        ws.cell(row=3, column=c, value=h).font = bold

    # row4: 추가 카운트
    ws.cell(row=4, column=3, value="추가").font = bold
    for c, key in enumerate(
        ["udic_added", "cndic_added", "thes_new_added", "thes_part_added",
         "cotton_added", "nq_per_added", "grammar_added"],
        4,
    ):
        ws.cell(row=4, column=c, value=data.get(key, 0))

    # row5: 삭제 카운트
    ws.cell(row=5, column=3, value="삭제").font = bold
    for c, key in enumerate(
        ["udic_removed", "cndic_removed", "thes_new_removed", "thes_part_removed",
         "cotton_removed", "nq_per_removed", "grammar_removed"],
        4,
    ):
        ws.cell(row=5, column=c, value=data.get(key, 0))

    # row6: 수정 카운트
    ws.cell(row=6, column=3, value="수정").font = bold
    for c, key in enumerate(
        ["udic_modified", "cndic_modified", "thes_new_modified", "thes_part_modified",
         "cotton_modified", "nq_per_modified", "grammar_modified"],
        4,
    ):
        ws.cell(row=6, column=c, value=data.get(key, 0))

    # row7: 합계 (SUM 수식)
    ws.cell(row=7, column=3, value="합계").font = bold
    col_letters = ["D", "E", "F", "G", "H", "I", "J"]
    for col_letter in col_letters:
        ws.cell(row=7, column=ord(col_letter) - ord("A") + 1,
                value=f"=SUM({col_letter}4:{col_letter}6)")


def _build_3col_sheet(ws, rows_current: list[str], rows_prev: list[str] | None) -> None:
    # 3컬럼(no/인터넷 검색/특화 검색) 시트 공통 빌더
    bold = Font(bold=True)
    headers = ["no", "인터넷 검색", "특화 검색"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=1, column=c, value=h).font = bold

    max_len = max(len(rows_current), len(rows_prev) if rows_prev else 0)
    for i in range(max_len):
        row_num = i + 2
        ws.cell(row=row_num, column=1, value=i + 1)
        if i < len(rows_current):
            ws.cell(row=row_num, column=2, value=rows_current[i])
        if rows_prev and i < len(rows_prev):
            ws.cell(row=row_num, column=3, value=rows_prev[i])


def _build_thesaurus_new_sheet(ws, rows_current: list[str], rows_prev: list[str] | None) -> None:
    # [3] 유사어 사전(신규생성) — A:C 3컬럼 (유사어쌍 문자열로)
    _build_3col_sheet(ws, rows_current, rows_prev)


def _build_thesaurus_partial_sheet(
    ws,
    rows_current: list[tuple],
    rows_prev: list[tuple] | None,
) -> None:
    # [4] 유사어 사전(부분추가) — A:E 5컬럼 (B:C 병합 + D:E 병합)
    from openpyxl.styles import Alignment

    bold = Font(bold=True)
    center = Alignment(horizontal="center", vertical="center")

    # row1: no / 인터넷 검색(B:C) / 특화 검색(D:E) — 병합
    ws.cell(row=1, column=1, value="no").font = bold
    ws.cell(row=1, column=2, value="인터넷 검색 ").font = bold
    ws.cell(row=1, column=4, value="특화 검색 ").font = bold
    ws.merge_cells("A1:A2")
    ws.merge_cells("B1:C1")
    ws.merge_cells("D1:E1")
    ws["A1"].alignment = center
    ws["B1"].alignment = center
    ws["D1"].alignment = center

    # row2: 기존 유사어쌍 / 새로 추가된 엔트리 (각 컬럼)
    ws.cell(row=2, column=2, value="기존 유사어쌍").font = bold
    ws.cell(row=2, column=3, value="새로 추가된 엔트리").font = bold
    ws.cell(row=2, column=4, value="기존 유사어쌍").font = bold
    ws.cell(row=2, column=5, value="새로 추가된 엔트리").font = bold

    # 데이터 행 (rows_current/rows_prev: (기존유사어쌍, 새추가엔트리) 튜플)
    max_len = max(len(rows_current), len(rows_prev) if rows_prev else 0)
    for i in range(max_len):
        row_num = i + 3
        ws.cell(row=row_num, column=1, value=i + 1)
        if i < len(rows_current):
            ws.cell(row=row_num, column=2, value=rows_current[i][0])
            ws.cell(row=row_num, column=3, value=rows_current[i][1])
        if rows_prev and i < len(rows_prev):
            ws.cell(row=row_num, column=4, value=rows_prev[i][0])
            ws.cell(row=row_num, column=5, value=rows_prev[i][1])


def _build_grammar_sheet(ws, rows_current: list[tuple], rows_prev: list[tuple] | None) -> None:
    # [7] 기분석 사전(cotton_part_prefer.list — 5컬럼 (B:C 병합 + D:E 병합)
    from openpyxl.styles import Alignment

    bold = Font(bold=True)
    center = Alignment(horizontal="center", vertical="center")

    # row1: no / 인터넷 검색(B:C) / 특화 검색(D:E) — 병합
    ws.cell(row=1, column=1, value="no").font = bold
    ws.cell(row=1, column=2, value="인터넷 검색").font = bold
    ws.cell(row=1, column=4, value="특화 검색").font = bold
    ws.merge_cells("A1:A2")
    ws.merge_cells("B1:C1")
    ws.merge_cells("D1:E1")
    ws["A1"].alignment = center
    ws["B1"].alignment = center
    ws["D1"].alignment = center

    # row2: 기분석_표제어 / 기분석_분석 태그
    ws.cell(row=2, column=2, value="기분석_표제어").font = bold
    ws.cell(row=2, column=3, value="기분석_분석 태그 ").font = bold
    ws.cell(row=2, column=4, value="기분석_표제어").font = bold
    ws.cell(row=2, column=5, value="기분석_분석 태그 ").font = bold

    # 데이터 행 (rows_current/rows_prev: (표제어, 태그) 튜플)
    max_len = max(len(rows_current), len(rows_prev) if rows_prev else 0)
    for i in range(max_len):
        row_num = i + 3
        ws.cell(row=row_num, column=1, value=i + 1)
        if i < len(rows_current):
            ws.cell(row=row_num, column=2, value=rows_current[i][0])
            ws.cell(row=row_num, column=3, value=rows_current[i][1])
        if rows_prev and i < len(rows_prev):
            ws.cell(row=row_num, column=4, value=rows_prev[i][0])
            ws.cell(row=row_num, column=5, value=rows_prev[i][1])


def _diff_file_list(current: list[str], prev: list[str]) -> dict[str, list[str]]:
    # 파일 기반 단어 목록 두 개를 set diff → {added, removed} 산출
    curr_set = set(current)
    prev_set = set(prev)
    added = sorted(curr_set - prev_set)
    removed = sorted(prev_set - curr_set)
    return {"added": added, "removed": removed}


def _diff_grammar_list(
    current: list[tuple], prev: list[tuple]
) -> dict[str, list[tuple]]:
    # 기분석 사전 튜플 목록 set diff → {added, removed} 산출
    curr_set = set(current)
    prev_set = set(prev)
    added = sorted(curr_set - prev_set)
    removed = sorted(prev_set - curr_set)
    return {"added": added, "removed": removed}


def _build_diff_sheet(
    ws,
    added: list[str],
    removed: list[str],
    modified: list[str] | None = None,
) -> None:
    # diff 표시 시트 공통 빌더 — no/키워드/상태 3컬럼
    bold = Font(bold=True)
    headers = ["no", "키워드", "상태"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=1, column=c, value=h).font = bold

    row_num = 2
    for kw in added:
        ws.cell(row=row_num, column=1, value=row_num - 1)
        ws.cell(row=row_num, column=2, value=kw)
        ws.cell(row=row_num, column=3, value="추가")
        row_num += 1
    for kw in removed:
        ws.cell(row=row_num, column=1, value=row_num - 1)
        ws.cell(row=row_num, column=2, value=kw)
        ws.cell(row=row_num, column=3, value="삭제")
        row_num += 1
    for kw in (modified or []):
        ws.cell(row=row_num, column=1, value=row_num - 1)
        ws.cell(row=row_num, column=2, value=kw)
        ws.cell(row=row_num, column=3, value="수정")
        row_num += 1


def _build_grammar_diff_sheet(
    ws,
    added: list[tuple],
    removed: list[tuple],
) -> None:
    # 기분석 사전 diff 시트 빌더 — no/표제어/태그들/상태 4컬럼
    bold = Font(bold=True)
    headers = ["no", "표제어", "태그들", "상태"]
    for c, h in enumerate(headers, 1):
        ws.cell(row=1, column=c, value=h).font = bold

    row_num = 2
    for kw, tags in added:
        ws.cell(row=row_num, column=1, value=row_num - 1)
        ws.cell(row=row_num, column=2, value=kw)
        ws.cell(row=row_num, column=3, value=tags)
        ws.cell(row=row_num, column=4, value="추가")
        row_num += 1
    for kw, tags in removed:
        ws.cell(row=row_num, column=1, value=row_num - 1)
        ws.cell(row=row_num, column=2, value=kw)
        ws.cell(row=row_num, column=3, value=tags)
        ws.cell(row=row_num, column=4, value="삭제")
        row_num += 1


def _thesaurus_to_pairs(thesaurus_rows: list[dict]) -> tuple[list[str], list[str]]:
    # THESAURUS 행 목록 → (신규생성 유사어쌍 문자열 목록, 부분추가 (기존쌍, 새엔트리) 튜플 목록)
    # _HEAD_WORD + _TAIL_WORD를 합쳐 하나의 유사어쌍 문자열로 반환 (신규)
    # 부분추가는 head가 이미 prev에 있고 tail에 새 항목이 추가된 케이스 — 단독 백업 시 전부 신규 처리
    new_pairs: list[str] = []
    for row in thesaurus_rows:
        head = row.get("_HEAD_WORD", "") or ""
        tail = row.get("_TAIL_WORD", "") or ""
        pair_str = f"{head} {tail}".strip() if tail else head
        new_pairs.append(pair_str)
    return new_pairs


def _thesaurus_split_new_partial(
    current_rows: list[dict],
    prev_rows: list[dict],
) -> tuple[list[str], list[tuple], list[str], list[tuple]]:
    # THESAURUS를 신규/부분추가로 분리
    # current_new_pairs: prev에 head 없는 케이스 → 유사어쌍 문자열
    # current_partial: prev에 head 있고 tail 추가된 케이스 → (기존쌍, 새엔트리) 튜플
    # prev_new_pairs / prev_partial: prev 기준 동일 분류 (None이면 빈 리스트)

    prev_head_map: dict[str, str] = {}
    for row in prev_rows:
        head = (row.get("_HEAD_WORD", "") or "").strip()
        tail = (row.get("_TAIL_WORD", "") or "").strip()
        if head:
            prev_head_map[head] = tail

    curr_new: list[str] = []
    curr_partial: list[tuple] = []
    curr_head_map: dict[str, str] = {}
    for row in current_rows:
        head = (row.get("_HEAD_WORD", "") or "").strip()
        tail = (row.get("_TAIL_WORD", "") or "").strip()
        pair_str = f"{head} {tail}".strip() if tail else head
        curr_head_map[head] = tail
        if head in prev_head_map:
            # 부분추가: 기존 쌍 + 새 추가 엔트리
            prev_tail = prev_head_map[head]
            old_pair = f"{head} {prev_tail}".strip() if prev_tail else head
            # 새 엔트리 = tail에서 prev_tail에 없는 단어
            prev_words = set(prev_tail.split()) if prev_tail else set()
            curr_words = tail.split() if tail else []
            new_entries = " ".join(w for w in curr_words if w not in prev_words)
            curr_partial.append((old_pair, new_entries))
        else:
            curr_new.append(pair_str)

    # prev 기준: prev에만 있었던 head는 prev_new로
    prev_new: list[str] = []
    prev_partial: list[tuple] = []
    for row in prev_rows:
        head = (row.get("_HEAD_WORD", "") or "").strip()
        tail = (row.get("_TAIL_WORD", "") or "").strip()
        pair_str = f"{head} {tail}".strip() if tail else head
        if head not in curr_head_map:
            # current에 없는 prev 항목 → prev_new로 취급
            prev_new.append(pair_str)
        else:
            # current에도 있으면 부분추가 prev쌍 (이미 curr_partial에서 기존쌍으로 처리)
            prev_partial.append((pair_str, ""))

    return curr_new, curr_partial, prev_new, prev_partial


def generate_excel(
    workspace: str,
    backup_folder: str,
    prev_backup: str | None = None,
    db=None,
) -> io.BytesIO:
    """8시트 완료 리포트 Excel 생성 → io.BytesIO 반환 (prev↔current diff 표시)."""
    # ── 데이터 로드 ──────────────────────────────
    current_data = _load_backup_dict(backup_folder)
    # prev=None이면 빈 집합으로 → current 전체가 "추가"로 분류
    prev_data = _load_backup_dict(prev_backup) if prev_backup else {k: [] for k in _SUFFIX_BY_TYPE}

    backup_base = Path(DICT_BACKUP_DIR) / backup_folder
    prev_base = Path(DICT_BACKUP_DIR) / prev_backup if prev_backup else None

    # ── DB 기반 사전 diff (_compute_full_diff 재활용) ────────────
    full_diff = _compute_full_diff(current_data, prev_data)
    udic_diff = full_diff["udic"]    # {added, removed, modified}
    cndic_diff = full_diff["cndic"]

    # UDIC diff: added/removed는 row dict → _WORD 추출, modified → key 사용
    udic_added = [r.get("_WORD", _row_key(r)) for r in udic_diff["added"]]
    udic_removed = [r.get("_WORD", _row_key(r)) for r in udic_diff["removed"]]
    udic_modified = [m["key"] for m in udic_diff["modified"]]

    # CNDIC diff
    cndic_added = [r.get("_WORD", _row_key(r)) for r in cndic_diff["added"]]
    cndic_removed = [r.get("_WORD", _row_key(r)) for r in cndic_diff["removed"]]
    cndic_modified = [m["key"] for m in cndic_diff["modified"]]

    # ── THESAURUS 신규/부분추가 분리 (기존 로직 유지) ──────────────
    thes_cur_rows = current_data.get("thesaurus", [])
    thes_prev_rows = prev_data.get("thesaurus", [])
    thes_new_cur, thes_part_cur, thes_new_prev, thes_part_prev = _thesaurus_split_new_partial(
        thes_cur_rows, thes_prev_rows
    )
    thes_new_prev_out = thes_new_prev if prev_backup else None
    thes_part_prev_out = thes_part_prev if prev_backup else None

    # ── 파일 기반 사전 diff (set diff) ──────────────────────────
    cotton_cur = _read_dict_file_first_col(backup_base / "txt_resrc" / "sdic" / "cotton.dic")
    cotton_prev_list = (
        _read_dict_file_first_col(prev_base / "txt_resrc" / "sdic" / "cotton.dic")
        if prev_base else []
    )
    cotton_diff = _diff_file_list(cotton_cur, cotton_prev_list)

    nq_per_cur = _read_dict_file_first_col(backup_base / "txt_resrc" / "sdic" / "nq_per.dic")
    nq_per_prev_list = (
        _read_dict_file_first_col(prev_base / "txt_resrc" / "sdic" / "nq_per.dic")
        if prev_base else []
    )
    nq_per_diff = _diff_file_list(nq_per_cur, nq_per_prev_list)

    grammar_cur = _read_grammar_file(
        backup_base / "txt_resrc" / "grammar" / "cotton_part_prefer.list"
    )
    grammar_prev_list = (
        _read_grammar_file(prev_base / "txt_resrc" / "grammar" / "cotton_part_prefer.list")
        if prev_base else []
    )
    grammar_diff = _diff_grammar_list(grammar_cur, grammar_prev_list)

    # ── 작업개요 카운트 데이터 준비 (추가/삭제/수정 카운트) ────────
    overview_data = {
        "udic_added": len(udic_added),
        "cndic_added": len(cndic_added),
        "thes_new_added": len(thes_new_cur),
        "thes_part_added": len(thes_part_cur),
        "cotton_added": len(cotton_diff["added"]),
        "nq_per_added": len(nq_per_diff["added"]),
        "grammar_added": len(grammar_diff["added"]),
        "udic_removed": len(udic_removed),
        "cndic_removed": len(cndic_removed),
        "thes_new_removed": len(thes_new_prev),
        "thes_part_removed": len(thes_part_prev),
        "cotton_removed": len(cotton_diff["removed"]),
        "nq_per_removed": len(nq_per_diff["removed"]),
        "grammar_removed": len(grammar_diff["removed"]),
        "udic_modified": len(udic_modified),
        "cndic_modified": len(cndic_modified),
        "thes_new_modified": 0,
        "thes_part_modified": 0,
        "cotton_modified": 0,
        "nq_per_modified": 0,
        "grammar_modified": 0,
    }

    # ── 워크북 생성 ──────────────────────────────
    wb = openpyxl.Workbook()

    # [0] 작업개요
    ws0 = wb.active
    ws0.title = "작업개요"
    _build_overview_sheet(ws0, overview_data)

    # [1] 사용자 단일어 사전 (diff)
    ws1 = wb.create_sheet("사용자 단일어 사전")
    _build_diff_sheet(ws1, udic_added, udic_removed, udic_modified)

    # [2] 복합어 사전 (diff)
    ws2 = wb.create_sheet("복합어 사전")
    _build_diff_sheet(ws2, cndic_added, cndic_removed, cndic_modified)

    # [3] 유사어 사전(신규생성) — 기존 diff 로직 유지
    ws3 = wb.create_sheet("유사어 사전(신규생성)")
    _build_thesaurus_new_sheet(ws3, thes_new_cur, thes_new_prev_out)

    # [4] 유사어 사전(부분추가) — 기존 diff 로직 유지
    ws4 = wb.create_sheet("유사어 사전(부분추가)")
    _build_thesaurus_partial_sheet(ws4, thes_part_cur, thes_part_prev_out)

    # [5] 용언 명사화 사전(cotton.dic) (diff)
    ws5 = wb.create_sheet("용언 명사화 사전(cotton.dic)")
    _build_diff_sheet(ws5, cotton_diff["added"], cotton_diff["removed"])

    # [6] 인명 사전(nq_per.dic) (diff)
    ws6 = wb.create_sheet("인명 사전(nq_per.dic)")
    _build_diff_sheet(ws6, nq_per_diff["added"], nq_per_diff["removed"])

    # [7] 기분석 사전(cotton_part_prefer.list  ← 괄호 누락 의도적 (샘플 그대로)
    ws7 = wb.create_sheet("기분석 사전(cotton_part_prefer.list")
    _build_grammar_diff_sheet(ws7, grammar_diff["added"], grammar_diff["removed"])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
