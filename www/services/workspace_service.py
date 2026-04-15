from __future__ import annotations

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

# 비동기 복사 진행률 추적: {ws_name: {"percent": 0~100, "status": "copying"|"done"|"error", "message": ""}}
COPY_PROGRESS: dict[str, dict[str, Any]] = {}
# 복사 취소 플래그: {ws_name: threading.Event()}
COPY_CANCEL: dict[str, threading.Event] = {}

from core.constants import (
    WORKSPACE_DIR, DOMAIN_DIR, JIANA_BASE_DIR,
    STATE_FILE, USER_PREF_FILE, DOMAIN_META_FILE, DOMAIN_JIANA_PREF_FILE,
    OLD_DOMAIN_DIR, DOMAIN_PROGRESS_DIR,
)

# 워크스페이스 phase 순서 (preprocess → work → build → verify → complete → finished)
# finished: 터미널 상태. 되돌리기 절대 금지(phase_backward에서 하드 블록).
PHASES = ["preprocess", "work", "build", "verify", "complete", "finished"]
PHASE_ORDER = {p: i for i, p in enumerate(PHASES)}


def list_jiana_versions_service() -> list[str]:
    """JIANA_BASE_DIR 하위 버전 폴더 list_tasks 반환."""
    import glob
    if not os.path.isdir(JIANA_BASE_DIR):
        return []
    return sorted([
        os.path.basename(d.rstrip("/"))
        for d in glob.glob(f"{JIANA_BASE_DIR}/*/")
        if os.path.isdir(d)
    ])


def get_jiana_home_path(workspace: str) -> str:
    """워크스페이스의 jiana 홈 경로 반환."""
    return os.path.join(WORKSPACE_DIR, workspace, "jiana")


def _read_domain_jiana_config() -> dict[str, str]:
    """도메인별 마지막 jiana 버전 기억 파일 읽기."""
    try:
        with open(DOMAIN_JIANA_PREF_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_domain_jiana_config(data: dict[str, str]) -> None:
    """도메인별 마지막 jiana 버전 기억 파일 저장."""
    os.makedirs(os.path.dirname(DOMAIN_JIANA_PREF_FILE), exist_ok=True)
    with open(DOMAIN_JIANA_PREF_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_domain_jiana_version(domain: str) -> str | None:
    """도메인의 마지막 사용 jiana 버전 반환. 없으면 None."""
    return _read_domain_jiana_config().get(domain)


def _save_domain_jiana_version(domain: str, version: str) -> None:
    """도메인의 마지막 사용 jiana 버전 저장."""
    data = _read_domain_jiana_config()
    data[domain] = version
    _write_domain_jiana_config(data)


def _read_state() -> dict[str, Any]:
    """STATE_FILE 읽어서 dict 반환 (없으면 {})."""
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_state(data: dict[str, Any]) -> None:
    """STATE_FILE에 JSON 저장."""
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _read_domain_meta() -> dict[str, str]:
    """DOMAIN_META_FILE 읽어서 dict 반환 (없으면 {})."""
    try:
        with open(DOMAIN_META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_domain_meta(data: dict[str, str]) -> None:
    """DOMAIN_META_FILE에 JSON 저장."""
    os.makedirs(os.path.dirname(DOMAIN_META_FILE), exist_ok=True)
    with open(DOMAIN_META_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def list_workspaces_service() -> list[dict[str, Any]]:
    """폴더 list_tasks + 상태 JSON merge."""
    os.makedirs(WORKSPACE_DIR, exist_ok=True)
    상태 = _read_state()
    결과 = []
    for 항목 in sorted(Path(WORKSPACE_DIR).iterdir()):
        if 항목.is_dir() and not 항목.name.startswith("."):
            ws상태 = 상태.get(항목.name, {"status": "IDLE", "domain": None})
            결과.append({
                "name": 항목.name,
                "status": ws상태.get("status", "IDLE"),
                "domain": ws상태.get("domain"),
                "connected_by": ws상태.get("connected_by"),
                "color": ws상태.get("color"),
                "site_code": ws상태.get("site_code"),
            })
    return 결과


def create_workspace(name: str, color: str | None = None) -> dict[str, Any]:
    """mkdir + 하위 폴더 생성 + 상태 IDLE 등록."""
    ws경로 = os.path.join(WORKSPACE_DIR, name)
    if os.path.exists(ws경로):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"워크스페이스 이미 존재: {name}",
        )
    # 하위 폴더 자동 생성
    for 하위 in ["build/fail_log", "build/pop_log", "work"]:
        os.makedirs(os.path.join(ws경로, 하위), exist_ok=True)

    상태 = _read_state()
    상태[name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": color, "phase": "preprocess"}
    _write_state(상태)
    return {"name": name, "status": "IDLE", "domain": None, "connected_by": None, "color": color, "phase": "preprocess"}


def delete_workspace(name: str) -> None:
    """USED 체크 → shutil.rmtree + 상태 제거."""
    상태 = _read_state()
    ws상태 = 상태.get(name, {})
    if ws상태.get("status") == "USED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"사용 중인 워크스페이스는 삭제할 수 없습니다: {name}",
        )
    ws경로 = os.path.join(WORKSPACE_DIR, name)
    if os.path.exists(ws경로):
        shutil.rmtree(ws경로)
    if name in 상태:
        del 상태[name]
        _write_state(상태)


def _count_folder_files(경로: str) -> int:
    """폴더 내 전체 파일 수 카운트."""
    return sum(len(files) for _, _, files in os.walk(경로))


def _copy_folder(원본경로: str, 대상경로: str, ws_name: str, 복사complete: int, 전체파일수: int) -> int:
    """폴더를 순회 복사하며 진행률 업데이트. 복사complete 카운트 반환. 취소 시 -1 반환."""
    cancel_event = COPY_CANCEL.get(ws_name)
    for dirpath, dirnames, filenames in os.walk(원본경로):
        if cancel_event and cancel_event.is_set():
            return -1
        상대경로 = os.path.relpath(dirpath, 원본경로)
        대상디렉토리 = os.path.join(대상경로, 상대경로) if 상대경로 != "." else 대상경로
        os.makedirs(대상디렉토리, exist_ok=True)
        for dirname in dirnames:
            원본_항목 = os.path.join(dirpath, dirname)
            if os.path.islink(원본_항목):
                링크_대상 = os.readlink(원본_항목)
                대상_링크 = os.path.join(대상디렉토리, dirname)
                if not os.path.lexists(대상_링크):
                    os.symlink(링크_대상, 대상_링크)
        for 파일명 in filenames:
            if cancel_event and cancel_event.is_set():
                return -1
            원본 = os.path.join(dirpath, 파일명)
            대상 = os.path.join(대상디렉토리, 파일명)
            shutil.copy2(원본, 대상)
            복사complete += 1
            if 전체파일수 > 0:
                COPY_PROGRESS[ws_name]["percent"] = int(복사complete / 전체파일수 * 100)
    return 복사complete


def _copy_task(ws_name: str, domain: str, 도메인경로: str, ws경로: str, jiana원본경로: str | None = None) -> None:
    """백그라운드 스레드에서 도메인+jiana 파일 순회 복사 + 진행률 업데이트."""
    import time
    시작시간 = time.time()
    try:
        # 전체 파일 수 계산 (도메인 + jiana)
        도메인파일수 = _count_folder_files(도메인경로)
        jiana파일수 = _count_folder_files(jiana원본경로) if jiana원본경로 else 0
        전체파일수 = 도메인파일수 + jiana파일수

        if 전체파일수 == 0:
            경과 = round(time.time() - 시작시간, 1)
            COPY_PROGRESS[ws_name] = {"percent": 100, "status": "done", "message": "", "elapsed": 경과, "file_count": 0}
            상태 = _read_state()
            if ws_name in 상태:
                상태[ws_name]["status"] = "USED"
                _write_state(상태)
            return

        COPY_PROGRESS[ws_name]["message"] = "도메인 파일 복사 중..."
        복사complete = _copy_folder(도메인경로, ws경로, ws_name, 0, 전체파일수)

        # 취소 체크
        if 복사complete == -1:
            raise InterruptedError("사용자 취소")

        # jiana 폴더 복사
        if jiana원본경로:
            COPY_PROGRESS[ws_name]["message"] = "jiana 복사 중..."
            jiana대상 = os.path.join(ws경로, "jiana")
            os.makedirs(jiana대상, exist_ok=True)
            복사complete = _copy_folder(jiana원본경로, jiana대상, ws_name, 복사complete, 전체파일수)
            if 복사complete == -1:
                raise InterruptedError("사용자 취소")

        # 사전 DB 복사 (도메인 → 워크스페이스)
        COPY_PROGRESS[ws_name]["message"] = "사전 DB 복사 중..."
        COPY_PROGRESS[ws_name]["percent"] = 95
        try:
            from models.dictionary import ws_create_dict_table, ws_copy_dict_data
            from core.database import 엔진
            ws_create_dict_table(ws_name, domain, 엔진)
            db_rows = ws_copy_dict_data(ws_name, domain, 엔진)
            COPY_PROGRESS[ws_name]["message"] = f"사전 DB 복사 complete ({db_rows}건)"
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("사전 DB 복사 실패 (무시): %s", e)

        경과 = round(time.time() - 시작시간, 1)
        COPY_PROGRESS[ws_name] = {"percent": 100, "status": "done", "message": "", "elapsed": 경과, "file_count": 전체파일수}
        상태 = _read_state()
        if ws_name in 상태:
            상태[ws_name]["status"] = "USED"
            _write_state(상태)
        # snapshot_before 기록 (완료 대시보드용 — 도메인 연결 직후 기준선)
        try:
            from services import snapshot_service
            from core.database import SessionLocal
            _sess = SessionLocal()
            try:
                snapshot_service.take_snapshot(ws_name, domain, "before", _sess)
            finally:
                _sess.close()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("_copy_task snapshot_before 실패 (무시): %s", e)
    except InterruptedError:
        경과 = round(time.time() - 시작시간, 1)
        COPY_PROGRESS[ws_name] = {"percent": 0, "status": "cancelled", "message": "사용자 취소", "elapsed": 경과}
        # 복사된 파일 정리 + 기본 구조 재생성
        _cleanup_workspace(ws경로)
        상태 = _read_state()
        if ws_name in 상태:
            상태[ws_name]["status"] = "IDLE"
            상태[ws_name]["domain"] = None
            상태[ws_name]["connected_by"] = None
            _write_state(상태)
    except Exception as e:
        경과 = round(time.time() - 시작시간, 1)
        COPY_PROGRESS[ws_name] = {"percent": COPY_PROGRESS.get(ws_name, {}).get("percent", 0), "status": "error", "message": str(e), "elapsed": 경과}
        상태 = _read_state()
        if ws_name in 상태:
            상태[ws_name]["status"] = "FAILED"
            _write_state(상태)
    finally:
        COPY_CANCEL.pop(ws_name, None)


def link_domain(ws_name: str, domain: str, connected_by: str | None = None, jiana_version: str | None = None, site_code: str | None = None) -> dict[str, Any]:
    """IDLE 체크 → 상태 즉시 CONNECTING → 백그라운드 복사(도메인+jiana) → 성공:USED / 실패:FAILED."""
    # 대소문자 무시 매칭 — 실제 DOMAIN_DIR 폴더명으로 교체
    actual_domains = os.listdir(DOMAIN_DIR) if os.path.isdir(DOMAIN_DIR) else []
    matched = next((d for d in actual_domains if d.lower() == domain.lower()), None)
    if matched is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"도메인을 찾을 수 없습니다: {domain}",
        )
    domain = matched  # 실제 폴더명으로 교체
    상태 = _read_state()
    ws상태 = 상태.get(ws_name, {"status": "IDLE", "domain": None})
    if ws상태.get("status") in ("USED", "CONNECTING"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"이미 사용 중이거나 연결 중인 워크스페이스입니다: {ws_name}",
        )
    # 다른 워크스페이스가 연결 중이면 차단
    for other_name, other_state in 상태.items():
        if other_name != ws_name and other_state.get("status") == "CONNECTING":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"다른 워크스페이스({other_name})가 연결 중입니다. complete 후 시도하세요.",
            )
    도메인경로 = os.path.join(DOMAIN_DIR, domain)
    if not os.path.exists(도메인경로):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"도메인을 찾을 수 없습니다: {domain}",
        )
    ws경로 = os.path.join(WORKSPACE_DIR, ws_name)
    if not os.path.exists(ws경로):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    # jiana 버전 검증
    jiana원본경로 = None
    if jiana_version:
        jiana원본경로 = os.path.join(JIANA_BASE_DIR, jiana_version)
        if not os.path.isdir(jiana원본경로):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"jiana 버전 경로 없음: {jiana원본경로}",
            )
        # 도메인별 jiana 버전 기억
        _save_domain_jiana_version(domain, jiana_version)

    기존색상 = ws상태.get("color")
    from datetime import datetime as _dt
    _connected_at = _dt.now().isoformat()
    # 즉시 CONNECTING 상태로 기록 (jiana_version, site_code, connected_at 포함)
    상태[ws_name] = {
        "status": "CONNECTING", "domain": domain, "connected_by": connected_by,
        "color": 기존색상, "jiana_version": jiana_version, "site_code": site_code,
        "connected_at": _connected_at,
    }
    _write_state(상태)
    COPY_PROGRESS[ws_name] = {"percent": 0, "status": "copying", "message": ""}
    COPY_CANCEL[ws_name] = threading.Event()
    threading.Thread(
        target=_copy_task,
        args=(ws_name, domain, 도메인경로, ws경로, jiana원본경로),
        daemon=True,
    ).start()
    return {"name": ws_name, "status": "CONNECTING", "domain": domain, "connected_by": connected_by, "color": 기존색상, "jiana_version": jiana_version, "site_code": site_code, "connected_at": _connected_at}


def _cleanup_workspace(ws경로: str) -> None:
    """워크스페이스 디렉토리 정리 후 기본 구조 재생성."""
    if os.path.isdir(ws경로):
        for 항목 in os.listdir(ws경로):
            항목경로 = os.path.join(ws경로, 항목)
            if os.path.islink(항목경로):
                os.unlink(항목경로)
            elif os.path.isdir(항목경로):
                shutil.rmtree(항목경로)
            else:
                os.remove(항목경로)
        for 하위 in ["build/fail_log", "build/pop_log", "work"]:
            os.makedirs(os.path.join(ws경로, 하위), exist_ok=True)


def unlink_domain_service(ws_name: str) -> dict[str, Any]:
    """CONNECTING 상태 워크스페이스의 복사 작업 취소."""
    상태 = _read_state()
    ws상태 = 상태.get(ws_name, {})
    if ws상태.get("status") != "CONNECTING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"연결 중인 상태가 아닙니다: {ws_name} (현재: {ws상태.get('status')})",
        )
    cancel_event = COPY_CANCEL.get(ws_name)
    if cancel_event:
        cancel_event.set()
    return {"name": ws_name, "status": "cancelling", "message": "연결 취소 요청됨"}


def get_progress(ws_name: str) -> dict[str, Any] | None:
    """복사 진행률 반환. 진행 중이면 dict, 없으면 None."""
    return COPY_PROGRESS.get(ws_name, None)


def release_workspace(ws_name: str) -> dict[str, Any]:
    """상태 IDLE + domain/connected_by null로 변경. color는 유지. 디렉토리 전체 정리 후 기본 구조 재생성."""
    상태 = _read_state()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    기존색상 = 상태[ws_name].get("color")
    상태[ws_name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": 기존색상}
    _write_state(상태)
    # 워크스페이스 디렉토리 전체 정리 후 기본 구조 재생성
    ws경로 = os.path.join(WORKSPACE_DIR, ws_name)
    if os.path.isdir(ws경로):
        for 항목 in os.listdir(ws경로):
            항목경로 = os.path.join(ws경로, 항목)
            if os.path.islink(항목경로):
                os.unlink(항목경로)
            elif os.path.isdir(항목경로):
                shutil.rmtree(항목경로)
            else:
                os.remove(항목경로)
        for 하위 in ["build/fail_log", "build/pop_log", "work"]:
            os.makedirs(os.path.join(ws경로, 하위), exist_ok=True)
    return {"name": ws_name, "status": "IDLE", "domain": None, "connected_by": None, "color": 기존색상}


def change_color(ws_name: str, color: str) -> dict[str, Any]:
    """워크스페이스 테마 색상 변경."""
    상태 = _read_state()
    if ws_name not in 상태:
        ws경로 = os.path.join(WORKSPACE_DIR, ws_name)
        if os.path.isdir(ws경로):
            상태[ws_name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": None}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
            )
    상태[ws_name]["color"] = color
    _write_state(상태)
    ws상태 = 상태[ws_name]
    return {
        "name": ws_name,
        "status": ws상태.get("status", "IDLE"),
        "domain": ws상태.get("domain"),
        "connected_by": ws상태.get("connected_by"),
        "color": color,
    }


def read_user_settings(user_id: str) -> dict[str, Any] | None:
    """사용자 워크스페이스 설정 읽기."""
    try:
        with open(USER_PREF_FILE, "r", encoding="utf-8") as f:
            prefs = json.load(f)
        return prefs.get(user_id)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_user_settings(user_id: str, workspace: str, domain: str | None, color: str | None,
                  last_menu: str | None = None) -> dict[str, Any]:
    """사용자 워크스페이스 설정 저장."""
    try:
        with open(USER_PREF_FILE, "r", encoding="utf-8") as f:
            prefs = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        prefs = {}
    existing = prefs.get(user_id, {})
    prefs[user_id] = {
        "workspace": workspace,
        "domain": domain,
        "color": color,
        "last_menu": last_menu if last_menu is not None else existing.get("last_menu"),
    }
    os.makedirs(os.path.dirname(USER_PREF_FILE), exist_ok=True)
    with open(USER_PREF_FILE, "w", encoding="utf-8") as f:
        json.dump(prefs, f, ensure_ascii=False, indent=2)
    return prefs[user_id]


_기본핫키 = {
    "prevAnalysis": "ArrowLeft",
    "nextAnalysis": "ArrowRight",
    "prevLine": "ArrowUp",
    "nextLine": "ArrowDown",
    "registerUdic": "a",
    "registerCndic": "s",
    "registerThesaurus": "d",
    "analyzeKeyword": "e",
    "focusAnalysisSimple": "Home",
    "focusAnalysisFull": "End",
    "toggleAnalysisTab": "Tab",
    "focusKeywordSearch": "q",
    "aiAnalysis": "r",
    "undoHistory": "Escape",
    "aiTabAI": "PageUp",
    "aiTabWikipedia": "PageDown",
}


def read_hotkey_settings(user_id: str) -> dict[str, Any]:
    """사용자 핫키 설정 읽기. 없으면 기본값 반환."""
    try:
        with open(USER_PREF_FILE, "r", encoding="utf-8") as f:
            prefs = json.load(f)
        user_pref = prefs.get(user_id, {})
        return user_pref.get("hotkeys", _기본핫키.copy())
    except (FileNotFoundError, json.JSONDecodeError):
        return _기본핫키.copy()


def save_hotkey_settings_service(user_id: str, hotkeys: dict[str, str]) -> dict[str, Any]:
    """사용자 핫키 설정 저장."""
    try:
        with open(USER_PREF_FILE, "r", encoding="utf-8") as f:
            prefs = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        prefs = {}
    if user_id not in prefs:
        prefs[user_id] = {}
    prefs[user_id]["hotkeys"] = hotkeys
    os.makedirs(os.path.dirname(USER_PREF_FILE), exist_ok=True)
    with open(USER_PREF_FILE, "w", encoding="utf-8") as f:
        json.dump(prefs, f, ensure_ascii=False, indent=2)
    return {"message": "저장 complete"}





def list_old_domains() -> list[str]:
    """OLD_DOMAIN_DIR 폴더 list_tasks 반환 (복사 소스)."""
    if not os.path.isdir(OLD_DOMAIN_DIR):
        return []
    skip = {"bin", "lib", "conf", "nohup.out", "nohup.out.bak", "start.sh", "stop.sh"}
    return sorted(
        항목.name
        for 항목 in Path(OLD_DOMAIN_DIR).iterdir()
        if 항목.is_dir() and 항목.name not in skip
    )





def reset_domain_progress_on_startup() -> None:
    """서버 시작 시 진행 중 상태인 progress 파일을 error로 초기화.
    서버가 강제 종료되면 copying/dict_copying 상태가 영구 잔류해 다음 추가를 차단하는 문제 방지.
    """
    if not os.path.isdir(DOMAIN_PROGRESS_DIR):
        return
    for pf in Path(DOMAIN_PROGRESS_DIR).glob("*.json"):
        try:
            with open(pf, "r") as f:
                prog = json.load(f)
            if prog.get("status") not in ("done", "error", None):
                prog["status"] = "error"
                prog["message"] = "서버 재시작으로 중단됨"
                with open(pf, "w") as f:
                    json.dump(prog, f)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass


def _write_domain_progress(name: str, data: dict[str, Any]) -> None:
    """진행률을 파일에 기록 (멀티워커 간 공유)."""
    os.makedirs(DOMAIN_PROGRESS_DIR, exist_ok=True)
    with open(os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.json"), "w") as f:
        json.dump(data, f)


def _read_domain_progress(name: str) -> dict[str, Any] | None:
    """진행률 파일 읽기."""
    try:
        with open(os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.json"), "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _is_cancel_requested(name: str) -> bool:
    """취소 플래그 파일 존재 여부 확인."""
    cancel_path = os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.cancel")
    return os.path.exists(cancel_path)


def _clear_cancel_flag(name: str) -> None:
    """취소 플래그 파일 제거."""
    cancel_path = os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.cancel")
    try:
        os.remove(cancel_path)
    except FileNotFoundError:
        pass


def cancel_domain_add_service(name: str) -> dict[str, Any]:
    """도메인 추가 취소 — 취소 플래그 파일 생성."""
    prog = _read_domain_progress(name)
    if not prog or prog.get("status") not in ("copying", "dict_copying"):
        return {"status": "not_running"}
    os.makedirs(DOMAIN_PROGRESS_DIR, exist_ok=True)
    cancel_path = os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.cancel")
    with open(cancel_path, "w") as f:
        f.write("cancel")
    return {"status": "cancel_requested"}


def _copy_domain_task(name: str, 원본: str, 대상: str,
                   copy_dict_from: str | None = None,
                   mysql_dict_from: str | None = None) -> None:
    """백그라운드 스레드에서 도메인 파일 순회 복사 + 진행률 업데이트 + 사전 복사."""
    import time
    시작시간 = time.time()
    try:
        전체파일수 = sum(len(files) for _, _, files in os.walk(원본))
        if 전체파일수 == 0:
            shutil.copytree(원본, 대상)
        else:
            os.makedirs(대상, exist_ok=True)
            복사complete = 0
            for dirpath, dirnames, filenames in os.walk(원본):
                상대경로 = os.path.relpath(dirpath, 원본)
                대상디렉토리 = os.path.join(대상, 상대경로) if 상대경로 != "." else 대상
                os.makedirs(대상디렉토리, exist_ok=True)
                for 파일명 in filenames:
                    if _is_cancel_requested(name):
                        _clear_cancel_flag(name)
                        _write_domain_progress(name, {"percent": 0, "status": "cancelled"})
                        if os.path.exists(대상):
                            shutil.rmtree(대상, ignore_errors=True)
                        return
                    shutil.copy2(os.path.join(dirpath, 파일명), os.path.join(대상디렉토리, 파일명))
                    복사complete += 1
                    _write_domain_progress(name, {"percent": int(복사complete / 전체파일수 * 50), "status": "copying", "file_count": 전체파일수})

        # 사전 테이블 생성 + 사전 복사 (파일 복사 complete 후)
        dict_result = None
        if copy_dict_from or mysql_dict_from:
            _write_domain_progress(name, {"percent": 50, "status": "dict_copying", "file_count": 전체파일수})
            from models.dictionary import create_domain_table
            from core.database import 엔진, 세션팩토리
            create_domain_table(name.upper(), 엔진)

            if copy_dict_from:
                from services.dictionary_service import copy_domain_dict
                db = 세션팩토리()
                try:
                    dict_result = copy_domain_dict(db, copy_dict_from, name)
                finally:
                    db.close()
            elif mysql_dict_from:
                from services.dictionary_service import migrate_dict_from_mysql
                def _mysql_진행률콜백(pct: int) -> None:
                    _write_domain_progress(name, {"percent": pct, "status": "dict_copying", "file_count": 전체파일수})
                dict_result = migrate_dict_from_mysql(name, mysql_dict_from, progress_callback=_mysql_진행률콜백)

        경과 = round(time.time() - 시작시간, 1)
        결과 = {"percent": 100, "status": "done", "elapsed": 경과, "file_count": 전체파일수}
        if dict_result:
            결과["dict_result"] = dict_result
        _write_domain_progress(name, 결과)
    except Exception as e:
        경과 = round(time.time() - 시작시간, 1)
        _write_domain_progress(name, {"percent": -1, "status": "error", "message": str(e), "elapsed": 경과})
        if os.path.exists(대상):
            shutil.rmtree(대상, ignore_errors=True)


_도메인이름패턴 = re.compile(r'^[A-Za-z0-9_.]+$')


def add_domain_service(name: str, base_source: str, base_name: str,
              copy_dict_from: str | None = None,
              mysql_dict_from: str | None = None,
              display_name: str | None = None) -> dict[str, Any]:
    """도메인 추가 — 비동기 복사 시작 (즉시 반환). 사전 복사 옵션 포함."""
    # 이름 유효성 검증 (SQL Injection 방지, 영문자/숫자/언더스코어/점만 허용)
    if not _도메인이름패턴.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 도메인 이름: '{name}' (영문자/숫자/언더스코어/점만 허용, 예: my_domain, base_1.5)"
        )
    if os.path.isdir(DOMAIN_PROGRESS_DIR):
        for pf in Path(DOMAIN_PROGRESS_DIR).glob("*.json"):
            if pf.stem == name:
                continue  # 같은 도메인 재추가 시 기존 progress 무시
            prog = _read_domain_progress(pf.stem)
            if prog and prog.get("status") not in ("done", "error", "cancelled", None):
                raise HTTPException(
                    status_code=409,
                    detail=f"다른 도메인({pf.stem})이 추가 중입니다. 완료 후 시도하세요."
                )
    대상 = os.path.join(DOMAIN_DIR, name)
    if os.path.exists(대상):
        # 취소 후 재추가: progress가 완료/취소/오류/진행 중(취소 타이밍)이면 부분 폴더 정리 후 재시도 허용
        prev_prog = _read_domain_progress(name)
        prev_status = prev_prog.get("status") if prev_prog else None
        if prev_status in ("cancelled", "error", "copying", "dict_copying"):
            _clear_cancel_flag(name)  # 혹시 남은 취소 플래그도 정리
            shutil.rmtree(대상, ignore_errors=True)
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"이미 존재하는 도메인: {name}")
    if base_source == "old":
        원본 = os.path.join(OLD_DOMAIN_DIR, base_name)
    else:
        원본 = os.path.join(DOMAIN_DIR, base_name)
    if not os.path.isdir(원본):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"원본 폴더 없음: {원본}")
    if display_name:
        메타 = _read_domain_meta()
        메타[name] = display_name
        _write_domain_meta(메타)
    _write_domain_progress(name, {"percent": 0, "status": "copying", "file_count": 0})
    threading.Thread(
        target=_copy_domain_task,
        args=(name, 원본, 대상, copy_dict_from, mysql_dict_from),
        daemon=True,
    ).start()
    return {"name": name, "source": f"{base_source}/{base_name}"}


def get_domain_add_progress_service(name: str) -> dict[str, Any] | None:
    """도메인 복사 진행률 반환 (파일 기반)."""
    return _read_domain_progress(name)


def list_active_domain_adds() -> list[dict[str, Any]]:
    """현재 copying/dict_copying 상태인 도메인 추가 목록 반환 (페이지 복귀 시 폴링 복원용)."""
    if not os.path.isdir(DOMAIN_PROGRESS_DIR):
        return []
    결과 = []
    for pf in Path(DOMAIN_PROGRESS_DIR).glob("*.json"):
        prog = _read_domain_progress(pf.stem)
        if prog and prog.get("status") in ("copying", "dict_copying"):
            결과.append({"name": pf.stem, "percent": prog.get("percent", 0), "status": prog["status"]})
    return 결과


def delete_domain_ws(name: str) -> None:
    """도메인 삭제 — 연결 중이면 차단."""
    상태 = _read_state()
    for ws_name, ws_state in 상태.items():
        if ws_state.get("domain") == name and ws_state.get("status") in ("USED", "CONNECTING"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"워크스페이스 '{ws_name}'에 연결된 도메인은 삭제할 수 없습니다")
    경로 = os.path.join(DOMAIN_DIR, name)
    if not os.path.isdir(경로):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"도메인을 찾을 수 없습니다: {name}")
    shutil.rmtree(경로)
    메타 = _read_domain_meta()
    if name in 메타:
        del 메타[name]
        _write_domain_meta(메타)


def rename_domain(old_name: str, new_name: str) -> dict[str, str]:
    """도메인 이름 변경 — 연결 중이면 차단."""
    상태 = _read_state()
    for ws_name, ws_state in 상태.items():
        if ws_state.get("domain") == old_name and ws_state.get("status") in ("USED", "CONNECTING"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"워크스페이스 '{ws_name}'에 연결된 도메인은 이름을 변경할 수 없습니다")
    old_path = os.path.join(DOMAIN_DIR, old_name)
    new_path = os.path.join(DOMAIN_DIR, new_name)
    if not os.path.isdir(old_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"도메인을 찾을 수 없습니다: {old_name}")
    if os.path.exists(new_path):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"이미 존재하는 이름: {new_name}")
    os.rename(old_path, new_path)
    메타 = _read_domain_meta()
    if old_name in 메타:
        메타[new_name] = 메타.pop(old_name)
        _write_domain_meta(메타)
    return {"old_name": old_name, "new_name": new_name}


def rename_domain_display(domain_id: str, display_name: str) -> dict[str, str]:
    """도메인 표시이름(한글명)만 변경 — 도메인 ID/폴더는 그대로 유지."""
    domain_path = os.path.join(DOMAIN_DIR, domain_id)
    if not os.path.isdir(domain_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"도메인을 찾을 수 없습니다: {domain_id}")
    메타 = _read_domain_meta()
    if display_name.strip():
        메타[domain_id] = display_name.strip()
    else:
        # 빈 문자열이면 표시이름 제거 (ID로만 표시)
        메타.pop(domain_id, None)
    _write_domain_meta(메타)
    return {"domain_id": domain_id, "display_name": display_name.strip()}


def list_domains_service() -> list[dict[str, str | None]]:
    """DOMAIN_DIR 폴더 list_tasks 반환 (id + display_name). 복사 진행 중인 도메인 제외."""
    os.makedirs(DOMAIN_DIR, exist_ok=True)
    메타 = _read_domain_meta()
    결과 = []
    for 항목 in sorted(Path(DOMAIN_DIR).iterdir()):
        if not 항목.is_dir():
            continue
        진행 = _read_domain_progress(항목.name)
        if 진행 and 진행.get("status") not in ("done", "error", "cancelled", None):
            continue  # 복사 진행 중 — 목록 제외
        결과.append({"id": 항목.name, "name": 메타.get(항목.name)})
    return 결과


# ============================================================================
# 워크스페이스 Phase 관리 (preprocess → work → build → verify)
# ============================================================================

def get_phase(ws_name: str) -> str:
    """워크스페이스의 현재 phase 조회. 없으면 기본값 'preprocess'."""
    상태 = _read_state()
    ws상태 = 상태.get(ws_name, {})
    return ws상태.get("phase", "preprocess")


def phase_forward(ws_name: str, next_phase: str) -> dict[str, Any]:
    """워크스페이스 phase 순방향 전이. 역전이/건너뛰기는 409."""
    if next_phase not in PHASE_ORDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 phase: {next_phase}",
        )
    상태 = _read_state()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    현재 = 상태[ws_name].get("phase", "preprocess")
    현재순서 = PHASE_ORDER.get(현재, 0)
    다음순서 = PHASE_ORDER[next_phase]
    # 순방향 1단계 전이만 허용 (역전이/건너뛰기 금지)
    if 다음순서 != 현재순서 + 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"phase 전이 불가: {현재} → {next_phase} (순방향 1단계만 허용)",
        )
    상태[ws_name]["phase"] = next_phase
    _write_state(상태)
    return {"name": ws_name, "phase": next_phase, "prev": 현재}


def phase_backward(ws_name: str, prev_phase: str) -> dict[str, Any]:
    """워크스페이스 phase 역방향 1단계 전이."""
    if prev_phase not in PHASE_ORDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 phase: {prev_phase}",
        )
    상태 = _read_state()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    현재 = 상태[ws_name].get("phase", "preprocess")
    # 하드 블록: finished는 터미널 상태 — 어떤 이전 상태로도 되돌릴 수 없음
    if 현재 == "finished":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="finished 상태에서는 되돌리기 불가 (터미널 상태)",
        )
    현재순서 = PHASE_ORDER.get(현재, 0)
    이전순서 = PHASE_ORDER[prev_phase]
    if 이전순서 != 현재순서 - 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"phase 역전이 불가: {현재} → {prev_phase} (역방향 1단계만 허용)",
        )
    상태[ws_name]["phase"] = prev_phase
    _write_state(상태)

    # kw_{ws} 데이터 삭제는 api/workspace.py workspace_phase_backward에서 처리

    return {"name": ws_name, "phase": prev_phase, "prev": 현재}


def get_user_phase(db, ws: str, dom: str, uid: str) -> str:
    """user_work_phase 테이블에서 사용자 phase 조회. 없으면 'idle'."""
    from sqlalchemy import text
    row = db.execute(
        text("SELECT phase FROM user_work_phase WHERE workspace=:ws AND domain=:dom AND user_id=:uid"),
        {"ws": ws, "dom": dom, "uid": uid},
    ).fetchone()
    phase = row[0] if row else "idle"
    return {"workspace": ws, "domain": dom, "user_id": uid, "phase": phase}


def set_user_phase(db, ws: str, dom: str, uid: str, phase: str) -> None:
    """user_work_phase UPSERT (INSERT OR REPLACE)."""
    from sqlalchemy import text
    db.execute(
        text("""
            INSERT OR REPLACE INTO user_work_phase (workspace, domain, user_id, phase, updated_at)
            VALUES (:ws, :dom, :uid, :phase, CURRENT_TIMESTAMP)
        """),
        {"ws": ws, "dom": dom, "uid": uid, "phase": phase},
    )
    db.commit()
    return {"workspace": ws, "domain": dom, "user_id": uid, "phase": phase}


def _auto_migrate_phase(db) -> None:
    """기존 워크스페이스 중 phase 필드가 없는 항목에 대해 keyword_assignments 카운트 기반 추론.

    추론 규칙:
      - total=0 → preprocess
      - assigned>0 (pending/assigned 존재) → work
      - completed>0 AND assigned=0 (모두 complete) → build
    """
    from sqlalchemy import text
    상태 = _read_state()
    변경 = False
    for ws_name, ws_state in 상태.items():
        if "phase" in ws_state:
            continue
        도메인 = ws_state.get("domain")
        if not 도메인:
            ws_state["phase"] = "preprocess"
            변경 = True
            continue
        try:
            total = db.execute(
                text("SELECT COUNT(*) FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
                {"ws": ws_name, "dom": 도메인},
            ).scalar() or 0
            assigned = db.execute(
                text("""
                    SELECT COUNT(*) FROM keyword_assignments
                    WHERE workspace=:ws AND domain=:dom AND status IN ('pending','assigned')
                """),
                {"ws": ws_name, "dom": 도메인},
            ).scalar() or 0
            completed = db.execute(
                text("""
                    SELECT COUNT(*) FROM keyword_assignments
                    WHERE workspace=:ws AND domain=:dom AND status='completed'
                """),
                {"ws": ws_name, "dom": 도메인},
            ).scalar() or 0
        except Exception:
            ws_state["phase"] = "preprocess"
            변경 = True
            continue
        if total == 0:
            추론 = "preprocess"
        elif assigned > 0:
            추론 = "work"
        elif completed > 0 and assigned == 0:
            추론 = "build"
        else:
            추론 = "preprocess"
        ws_state["phase"] = 추론
        변경 = True
    if 변경:
        _write_state(상태)


def prepare_complete(ws_name: str, domain: str, db) -> dict:
    """완료 1단계 — phase만 verify → complete 로 전환하고 snapshot_before 확정.

    - 백업/역방향 복사 절대 금지 (사용자가 대시보드 확인 후 다시 되돌릴 수 있어야 함).
    - phase=verify 가 아니면 409.
    - snapshot_before 는 _copy_task 단계에서 이미 기록되었으나, 없으면 fallback 으로 지금 기록.
    """
    상태 = _read_state()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    현재 = 상태[ws_name].get("phase", "preprocess")
    if 현재 != "verify":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"prepare_complete 는 verify 상태에서만 호출 가능합니다 (현재: {현재})",
        )

    # snapshot_before 보장 (없으면 지금 기록)
    snapshot_before = None
    try:
        from services import snapshot_service
        snapshot_before = snapshot_service.get_snapshot(ws_name, "before", db)
        if snapshot_before is None:
            snapshot_before = snapshot_service.take_snapshot(ws_name, domain, "before", db)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("prepare_complete snapshot_before 실패 (무시): %s", e)

    # phase 전이: verify → complete
    phase_forward(ws_name, "complete")

    from datetime import datetime
    prepared_at = datetime.now().isoformat(sep=" ", timespec="seconds")
    상태 = _read_state()
    상태[ws_name]["prepared_at"] = prepared_at
    _write_state(상태)

    return {
        "name": ws_name,
        "phase": "complete",
        "snapshot_before": snapshot_before,
        "prepared_at": prepared_at,
    }


def finalize_complete(
    ws_name: str,
    domain: str,
    db,
    skip_backup: bool = False,
    backup_folder: str | None = None,
    site_id: int | None = None,
) -> dict:
    """완료 2단계 — 실제 백업 + 역방향 복사 + snapshot_after + phase complete → finished.

    - phase=complete 가 아니면 409.
    - 실패 시 phase 는 complete 유지 (사용자가 재시도 가능).
    """
    import shutil
    from datetime import datetime
    from pathlib import Path
    from core.constants import DICT_BACKUP_DIR, WORKSPACE_BASE, DOMAIN_DIR

    상태 = _read_state()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    현재 = 상태[ws_name].get("phase", "preprocess")
    if 현재 != "complete":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"finalize_complete 는 complete 상태에서만 호출 가능합니다 (현재: {현재})",
        )

    domain_path = Path(DOMAIN_DIR) / domain
    ws_path = Path(WORKSPACE_BASE) / ws_name
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")

    backup_path: Path | None = None
    dict_counts_backup: dict[str, int] = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    backup_files: list[str] = []

    # 1. 백업 단계
    if not skip_backup:
        base_name = backup_folder.strip() if backup_folder else f"{domain}_{timestamp_str}"
        backup_path = Path(DICT_BACKUP_DIR) / base_name
        if backup_path.exists():
            for i in range(1, 100):
                backup_path = Path(DICT_BACKUP_DIR) / f"{base_name}_{i:03d}"
                if not backup_path.exists():
                    break
        backup_path.mkdir(parents=True, exist_ok=True)

        for item in ["data", "txt_resrc"]:
            src = domain_path / item
            if src.exists():
                shutil.copytree(str(src), str(backup_path / item), dirs_exist_ok=True)
                backup_files.append(item)
        syn_src = domain_path / "synonym.UTF-8"
        if syn_src.exists():
            shutil.copy2(str(syn_src), str(backup_path / "synonym.UTF-8"))
            backup_files.append("synonym.UTF-8")

        backup_db_files: list[str] = []
        try:
            from sqlalchemy import text as _sql_text
            dst_site = domain.upper()
            type_map = [
                ("udic", "_UDIC"),
                ("cndic", "_CNDIC"),
                ("thesaurus", "_THESAURUS"),
                ("category", "_CATEGORY"),
            ]
            for type_key, suffix in type_map:
                src_table = f"{dst_site}{suffix}"
                try:
                    rows = db.execute(_sql_text(f"SELECT * FROM {src_table}")).mappings().all()
                    data = [dict(r) for r in rows]
                    json_filename = f"db{suffix}.json"
                    json_path = backup_path / json_filename
                    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                    dict_counts_backup[type_key] = len(data)
                    backup_db_files.append(json_filename)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("DB 백업 실패 %s: %s", src_table, e)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("DB 백업 전체 실패 (무시): %s", e)

        metadata = {
            "domain": domain,
            "ws_name": ws_name,
            "timestamp": datetime.now().isoformat(),
            "dict_counts": dict_counts_backup,
            "backup_files": backup_db_files,
            "files": backup_files,
            "site_id": site_id,
        }
        try:
            with open(backup_path / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("metadata.json 기록 실패: %s", e)

    # 2. 역방향 파일 복사
    copied_files: list[str] = []
    for item in ["data", "txt_resrc"]:
        src = ws_path / item
        if src.exists():
            shutil.copytree(str(src), str(domain_path / item), dirs_exist_ok=True)
            copied_files.append(item)
    ws_syn = ws_path / "synonym.UTF-8"
    if ws_syn.exists():
        shutil.copy2(str(ws_syn), str(domain_path / "synonym.UTF-8"))
        copied_files.append("synonym.UTF-8")

    # 3. DB 역방향 복사
    db_copy_counts: dict[str, int] = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    try:
        from models.dictionary import ws_reverse_copy_dict_data
        db_copy_counts = ws_reverse_copy_dict_data(ws_name, domain, db.get_bind())
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("ws_reverse_copy_dict_data 실패 (무시): %s", e)

    # 4. snapshot_after 기록
    snapshot_after = None
    try:
        from services import snapshot_service
        snapshot_after = snapshot_service.take_snapshot(ws_name, domain, "after", db)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("snapshot_after 실패 (무시): %s", e)

    # 5. phase → finished
    phase_forward(ws_name, "finished")

    finished_at = datetime.now().isoformat(sep=" ", timespec="seconds")
    상태 = _read_state()
    상태[ws_name]["finished_at"] = finished_at
    if site_id is not None:
        상태[ws_name]["site_id"] = site_id
    if backup_path is not None:
        상태[ws_name]["last_backup_folder"] = backup_path.name
    _write_state(상태)

    return {
        "name": ws_name,
        "phase": "finished",
        "backup_path": str(backup_path) if backup_path else None,
        "backup_folder": backup_path.name if backup_path else None,
        "copied_files": copied_files,
        "db_copy_counts": db_copy_counts,
        "snapshot_after": snapshot_after,
        "skip_backup": skip_backup,
        "site_id": site_id,
        "finished_at": finished_at,
    }


def get_participants_stats(ws_name: str, db) -> list[dict]:
    """kw_{ws} 테이블에서 assignee 별 R/W count 수집.

    - R count: flag LIKE '%R'  (읽기 전용)
    - W count: flag NOT LIKE '%R' OR flag IS NULL  (등록/수정)
    - users 테이블에서 name 조회 (없으면 user_id 를 그대로 사용)
    """
    from sqlalchemy import text as _sql_text

    safe_ws = "".join(c if c.isalnum() or c == "_" else "_" for c in ws_name)
    kw_table = f"kw_{safe_ws}"

    # 테이블 존재 여부 확인
    exists = db.execute(
        _sql_text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {"t": kw_table},
    ).fetchone()
    if not exists:
        return []

    try:
        rows = db.execute(
            _sql_text(
                f"SELECT assignee AS user_id, "
                f"SUM(CASE WHEN flag LIKE '%R' THEN 1 ELSE 0 END) AS r_count, "
                f"SUM(CASE WHEN (flag NOT LIKE '%R' OR flag IS NULL) THEN 1 ELSE 0 END) AS w_count "
                f"FROM {kw_table} "
                f"WHERE assignee IS NOT NULL AND assignee != '' "
                f"GROUP BY assignee "
                f"ORDER BY assignee"
            )
        ).mappings().all()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("get_participants_stats 쿼리 실패: %s", e)
        return []

    result: list[dict] = []
    for row in rows:
        uid = row["user_id"]
        name = uid
        try:
            u = db.execute(
                _sql_text("SELECT name FROM users WHERE user_id=:uid"),
                {"uid": uid},
            ).fetchone()
            if u and u[0]:
                name = u[0]
        except Exception:
            pass
        result.append({
            "user_id": uid,
            "name": name,
            "r_count": int(row["r_count"] or 0),
            "w_count": int(row["w_count"] or 0),
        })
    return result


def step_log_service(workspace: str, domain: str, phase: str, action: str, user_id: str | None = None) -> dict:
    """페이지 진입/이탈 단계 로그 기록."""
    from core.database import 엔진
    from sqlalchemy import text as _sql_text

    with 엔진.connect() as conn:
        conn.execute(_sql_text("""
            INSERT INTO workspace_step_log (workspace, domain, phase, action, user_id)
            VALUES (:ws, :dom, :phase, :action, :uid)
        """), {"ws": workspace, "dom": domain, "phase": phase, "action": action, "uid": user_id})
        conn.commit()
    return {"ok": True}


def step_report_service(workspace: str, domain: str) -> dict:
    """workspace/domain 기준 단계별 체류시간 리포트."""
    from core.database import 엔진
    from sqlalchemy import text as _sql_text

    with 엔진.connect() as conn:
        rows = conn.execute(_sql_text("""
            SELECT id, workspace, domain, phase, action, user_id, created_at
            FROM workspace_step_log
            WHERE workspace = :ws AND domain = :dom
            ORDER BY created_at ASC
        """), {"ws": workspace, "dom": domain}).mappings().all()

    logs = [dict(r) for r in rows]

    # phases 계산: enter/leave 쌍 매칭
    from datetime import datetime as _dt

    phases: dict[str, dict] = {}
    # phase별 열린 enter 스택
    open_enters: dict[str, list[str]] = {}

    for row in logs:
        ph = row["phase"]
        action = row["action"]
        ts = row["created_at"]

        if ph not in phases:
            phases[ph] = {
                "first_enter": None,
                "last_leave": None,
                "total_seconds": 0,
                "visit_count": 0,
            }

        if action == "enter":
            if phases[ph]["first_enter"] is None:
                phases[ph]["first_enter"] = ts
            phases[ph]["visit_count"] += 1
            open_enters.setdefault(ph, []).append(ts)
        elif action == "leave":
            phases[ph]["last_leave"] = ts
            if open_enters.get(ph):
                enter_ts = open_enters[ph].pop(0)
                try:
                    enter_dt = _dt.fromisoformat(enter_ts)
                    leave_dt = _dt.fromisoformat(ts)
                    diff = (leave_dt - enter_dt).total_seconds()
                    if diff > 0:
                        phases[ph]["total_seconds"] += int(diff)
                except Exception:
                    pass

    return {"logs": logs, "phases": phases}


def session_event_service(workspace: str, domain: str, user_id: str, event: str, menu: str | None = None) -> dict:
    """세션 이벤트(login/logout/heartbeat) 기록."""
    from core.database import 엔진
    from sqlalchemy import text as _sql_text

    with 엔진.connect() as conn:
        conn.execute(_sql_text("""
            INSERT INTO user_session_log (workspace, domain, user_id, event, menu)
            VALUES (:ws, :dom, :uid, :event, :menu)
        """), {"ws": workspace, "dom": domain, "uid": user_id, "event": event, "menu": menu})
        conn.commit()
    return {"ok": True}


def participant_stats_service(workspace: str, domain: str) -> list[dict]:
    """user_session_log 기반 참여자 체류시간 집계 + kw/dict 건수/시간 산출."""
    from core.database import 엔진
    from sqlalchemy import text as _sql_text
    from datetime import datetime as _dt

    with 엔진.connect() as conn:
        rows = conn.execute(_sql_text("""
            SELECT user_id, event, created_at
            FROM user_session_log
            WHERE workspace = :ws AND domain = :dom
            ORDER BY user_id, created_at ASC
        """), {"ws": workspace, "dom": domain}).mappings().all()

        # kw_{ws} 테이블에서 키워드 건수 조회
        kw_table = f"kw_{workspace}"
        try:
            kw_count = conn.execute(_sql_text(
                f"SELECT COUNT(*) FROM {kw_table}"
            )).scalar() or 0
        except Exception:
            kw_count = 0

        # work_history에서 dict 작업 건수 조회 (action_type='add', undone=0)
        try:
            dict_count = conn.execute(_sql_text("""
                SELECT COUNT(*) FROM work_history
                WHERE workspace = :ws AND action_type = 'add' AND undone = 0
            """), {"ws": workspace}).scalar() or 0
        except Exception:
            dict_count = 0

    # connected_at 기반 경과 시간 계산
    _state = _read_state()
    _ws_state = _state.get(workspace, {})
    connected_at_str = _ws_state.get("connected_at") or _ws_state.get("created_at")
    elapsed_hours = 0.0
    if connected_at_str:
        try:
            elapsed_hours = (_dt.now() - _dt.fromisoformat(connected_at_str)).total_seconds() / 3600
        except Exception:
            elapsed_hours = 0.0

    kw_per_hour = round(kw_count / elapsed_hours, 2) if elapsed_hours > 0 else 0.0
    dict_per_hour = round(dict_count / elapsed_hours, 2) if elapsed_hours > 0 else 0.0

    # 사용자별 집계
    from collections import defaultdict
    user_events: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        user_events[row["user_id"]].append({"event": row["event"], "created_at": row["created_at"]})

    result: list[dict] = []
    for uid, events in user_events.items():
        first_login = None
        last_activity = None
        total_seconds = 0
        pending_login: str | None = None

        for ev in events:
            ts = ev["created_at"]
            if last_activity is None or ts > last_activity:
                last_activity = ts
            if ev["event"] == "login":
                if first_login is None:
                    first_login = ts
                pending_login = ts
            elif ev["event"] in ("logout", "force_exit"):
                if pending_login:
                    try:
                        s = (_dt.fromisoformat(ts) - _dt.fromisoformat(pending_login)).total_seconds()
                        if s > 0:
                            total_seconds += int(s)
                    except Exception:
                        pass
                    pending_login = None
            elif ev["event"] == "heartbeat" and pending_login:
                # heartbeat으로 체류시간 누적 (login→heartbeat 간격)
                try:
                    s = (_dt.fromisoformat(ts) - _dt.fromisoformat(pending_login)).total_seconds()
                    if 0 < s <= 120:  # 120초 이하인 경우만 누적 (타임아웃 방지)
                        total_seconds += int(s)
                except Exception:
                    pass
                pending_login = ts  # 다음 heartbeat의 기준점을 최신 heartbeat으로 이동

        total_minutes = total_seconds // 60
        result.append({
            "user_id": uid,
            "first_login": first_login,
            "last_activity": last_activity,
            "total_minutes": total_minutes,
            "items_per_hour": kw_per_hour,
            "kw_count": kw_count,
            "kw_per_hour": kw_per_hour,
            "dict_count": dict_count,
            "dict_per_hour": dict_per_hour,
        })

    result.sort(key=lambda x: x["total_minutes"], reverse=True)
    return result


def complete_workspace(ws_name: str, domain: str, db, skip_backup: bool = False) -> dict:
    """
    6.1 백업 단계 (skip_backup=False일 때만):
        - 파일: DOMAIN_DIR/{domain}/{data,txt_resrc,synonym.UTF-8}
          → DICT_BACKUP_DIR/{domain}_{YYYYMMDD_HHMMSS}/
        - DB: 도메인 사전 테이블 4개 → BAK_{TS}_{DOMAIN}_{TYPE}
          (CREATE TABLE AS SELECT 사용)
        - metadata.json 기록 (dict_counts, backup_tables, files, timestamp)
    6.2 역방향 복사 (항상 수행):
        - 파일: WS→도메인
        - DB: ws_reverse_copy_dict_data 호출
    6.3 phase → 'complete' 전이 (phase_forward 호출)

    Returns:
        {"backup_path": str|None, "copied_files": list[str], "db_copy_counts": dict,
         "phase": "complete", "skip_backup": bool}
    """
    import shutil
    from datetime import datetime
    from pathlib import Path
    from core.constants import DICT_BACKUP_DIR, WORKSPACE_BASE, DOMAIN_DIR

    domain_path = Path(DOMAIN_DIR) / domain
    ws_path = Path(WORKSPACE_BASE) / ws_name
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")

    backup_path: Path | None = None
    dict_counts_backup: dict[str, int] = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    backup_files: list[str] = []

    # 6.1 백업 단계
    if not skip_backup:
        base_name = f"{domain}_{timestamp_str}"
        backup_path = Path(DICT_BACKUP_DIR) / base_name
        # 동일 타임스탬프 충돌 시 suffix (드물지만 안전장치)
        if backup_path.exists():
            for i in range(1, 100):
                backup_path = Path(DICT_BACKUP_DIR) / f"{base_name}_{i:03d}"
                if not backup_path.exists():
                    break
        backup_path.mkdir(parents=True, exist_ok=True)

        # 파일 백업
        for item in ["data", "txt_resrc"]:
            src = domain_path / item
            if src.exists():
                shutil.copytree(str(src), str(backup_path / item), dirs_exist_ok=True)
                backup_files.append(item)
        syn_src = domain_path / "synonym.UTF-8"
        if syn_src.exists():
            shutil.copy2(str(syn_src), str(backup_path / "synonym.UTF-8"))
            backup_files.append("synonym.UTF-8")

        # DB 백업: 사전 테이블을 JSON 파일로 저장
        backup_db_files: list[str] = []
        try:
            from sqlalchemy import text as _sql_text
            dst_site = domain.upper()
            type_map = [
                ("udic", "_UDIC"),
                ("cndic", "_CNDIC"),
                ("thesaurus", "_THESAURUS"),
                ("category", "_CATEGORY"),
            ]
            for type_key, suffix in type_map:
                src_table = f"{dst_site}{suffix}"
                try:
                    rows = db.execute(_sql_text(f"SELECT * FROM {src_table}")).mappings().all()
                    data = [dict(r) for r in rows]
                    json_filename = f"db{suffix}.json"
                    json_path = backup_path / json_filename
                    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                    dict_counts_backup[type_key] = len(data)
                    backup_db_files.append(json_filename)
                    import logging
                    logging.getLogger(__name__).info("DB 백업 파일 생성: %s (%d rows)", json_path, len(data))
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("DB 백업 실패 %s: %s", src_table, e)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("DB 백업 전체 실패 (무시): %s", e)

        # metadata.json 기록
        metadata = {
            "domain": domain,
            "ws_name": ws_name,
            "timestamp": datetime.now().isoformat(),
            "dict_counts": dict_counts_backup,
            "backup_files": backup_db_files,
            "files": backup_files,
        }
        try:
            with open(backup_path / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("metadata.json 기록 실패: %s", e)

    # 6.2 역방향 복사 (항상 수행)
    copied_files: list[str] = []
    for item in ["data", "txt_resrc"]:
        src = ws_path / item
        if src.exists():
            shutil.copytree(str(src), str(domain_path / item), dirs_exist_ok=True)
            copied_files.append(item)
    ws_syn = ws_path / "synonym.UTF-8"
    if ws_syn.exists():
        shutil.copy2(str(ws_syn), str(domain_path / "synonym.UTF-8"))
        copied_files.append("synonym.UTF-8")

    # DB 역방향 복사
    db_copy_counts: dict[str, int] = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}
    try:
        from models.dictionary import ws_reverse_copy_dict_data
        db_copy_counts = ws_reverse_copy_dict_data(ws_name, domain, db.get_bind())
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("ws_reverse_copy_dict_data 실패 (무시): %s", e)

    # 6.3 phase → complete
    phase_forward(ws_name, "complete")

    return {
        "backup_path": str(backup_path) if backup_path else None,
        "copied_files": copied_files,
        "db_copy_counts": db_copy_counts,
        "phase": "complete",
        "skip_backup": skip_backup,
    }
