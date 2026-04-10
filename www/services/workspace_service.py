from __future__ import annotations

from __future__ import annotations

import json
import os
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

# 워크스페이스 phase 순서 (preprocess → work → build → verify)
PHASES = ["preprocess", "work", "build", "verify"]
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


def link_domain(ws_name: str, domain: str, connected_by: str | None = None, jiana_version: str | None = None) -> dict[str, Any]:
    """IDLE 체크 → 상태 즉시 CONNECTING → 백그라운드 복사(도메인+jiana) → 성공:USED / 실패:FAILED."""
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
    # 즉시 CONNECTING 상태로 기록 (jiana_version 포함)
    상태[ws_name] = {
        "status": "CONNECTING", "domain": domain, "connected_by": connected_by,
        "color": 기존색상, "jiana_version": jiana_version,
    }
    _write_state(상태)
    COPY_PROGRESS[ws_name] = {"percent": 0, "status": "copying", "message": ""}
    COPY_CANCEL[ws_name] = threading.Event()
    threading.Thread(
        target=_copy_task,
        args=(ws_name, domain, 도메인경로, ws경로, jiana원본경로),
        daemon=True,
    ).start()
    return {"name": ws_name, "status": "CONNECTING", "domain": domain, "connected_by": connected_by, "color": 기존색상, "jiana_version": jiana_version}


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
                    shutil.copy2(os.path.join(dirpath, 파일명), os.path.join(대상디렉토리, 파일명))
                    복사complete += 1
                    _write_domain_progress(name, {"percent": int(복사complete / 전체파일수 * 90), "status": "copying", "file_count": 전체파일수})

        # 사전 테이블 생성 + 사전 복사 (파일 복사 complete 후)
        dict_result = None
        if copy_dict_from or mysql_dict_from:
            _write_domain_progress(name, {"percent": 92, "status": "dict_copying", "file_count": 전체파일수})
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
                dict_result = migrate_dict_from_mysql(name, mysql_dict_from)

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


def add_domain_service(name: str, base_source: str, base_name: str,
              copy_dict_from: str | None = None,
              mysql_dict_from: str | None = None,
              display_name: str | None = None) -> dict[str, Any]:
    """도메인 추가 — 비동기 복사 시작 (즉시 반환). 사전 복사 옵션 포함."""
    if os.path.isdir(DOMAIN_PROGRESS_DIR):
        for pf in Path(DOMAIN_PROGRESS_DIR).glob("*.json"):
            prog = _read_domain_progress(pf.stem)
            if prog and prog.get("status") not in ("done", "error", None):
                raise HTTPException(
                    status_code=409,
                    detail=f"다른 도메인({pf.stem})이 추가 중입니다. 완료 후 시도하세요."
                )
    대상 = os.path.join(DOMAIN_DIR, name)
    if os.path.exists(대상):
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


def list_domains_service() -> list[dict[str, str | None]]:
    """DOMAIN_DIR 폴더 list_tasks 반환 (id + display_name). 복사 진행 중인 도메인 제외."""
    os.makedirs(DOMAIN_DIR, exist_ok=True)
    메타 = _read_domain_meta()
    결과 = []
    for 항목 in sorted(Path(DOMAIN_DIR).iterdir()):
        if not 항목.is_dir():
            continue
        진행 = _read_domain_progress(항목.name)
        if 진행 and 진행.get("status") not in ("done", "error", None):
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
