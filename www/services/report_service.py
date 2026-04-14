"""report_service.py — 완료 리포트 PPT + diff 생성

요구사항 5: 완료 후 이전 백업과의 delta 리포트 + 공유 페이지용 JSON diff.
- PPT: python-pptx (전체 키워드 포함, 최대 페이지별 100개)
- diff: UI 페이지네이션용 JSON
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

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
