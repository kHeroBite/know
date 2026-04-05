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

WORKSPACE_DIR = "/home/know/apps/know-ops/workspace"
DOMAIN_DIR = "/home/know/apps/know-ops/domain"
STATE_FILE = "/home/know/apps/know-ops/workspace/.state.json"
USER_PREF_FILE = "/home/know/apps/know-ops/workspace/.user_pref.json"
DOMAIN_META_FILE = "/home/know/apps/know-ops/domain/.meta.json"

# 워크스페이스 phase 순서 (preprocess → work → build → verify)
PHASES = ["preprocess", "work", "build", "verify"]
PHASE_ORDER = {p: i for i, p in enumerate(PHASES)}


def _상태읽기() -> dict[str, Any]:
    """STATE_FILE 읽어서 dict 반환 (없으면 {})."""
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _상태쓰기(data: dict[str, Any]) -> None:
    """STATE_FILE에 JSON 저장."""
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _도메인메타읽기() -> dict[str, str]:
    """DOMAIN_META_FILE 읽어서 dict 반환 (없으면 {})."""
    try:
        with open(DOMAIN_META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _도메인메타쓰기(data: dict[str, str]) -> None:
    """DOMAIN_META_FILE에 JSON 저장."""
    os.makedirs(os.path.dirname(DOMAIN_META_FILE), exist_ok=True)
    with open(DOMAIN_META_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def 워크스페이스목록() -> list[dict[str, Any]]:
    """폴더 목록 + 상태 JSON merge."""
    os.makedirs(WORKSPACE_DIR, exist_ok=True)
    상태 = _상태읽기()
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


def 워크스페이스생성(name: str, color: str | None = None) -> dict[str, Any]:
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

    상태 = _상태읽기()
    상태[name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": color, "phase": "preprocess"}
    _상태쓰기(상태)
    return {"name": name, "status": "IDLE", "domain": None, "connected_by": None, "color": color, "phase": "preprocess"}


def 워크스페이스삭제(name: str) -> None:
    """USED 체크 → shutil.rmtree + 상태 제거."""
    상태 = _상태읽기()
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
        _상태쓰기(상태)


def _복사작업(ws_name: str, domain: str, 도메인경로: str, ws경로: str) -> None:
    """백그라운드 스레드에서 파일 순회 복사 + 진행률 업데이트."""
    import time
    시작시간 = time.time()
    try:
        전체파일수 = sum(len(files) for _, _, files in os.walk(도메인경로))
        if 전체파일수 == 0:
            경과 = round(time.time() - 시작시간, 1)
            COPY_PROGRESS[ws_name] = {"percent": 100, "status": "done", "message": "", "elapsed": 경과, "file_count": 0}
            상태 = _상태읽기()
            if ws_name in 상태:
                상태[ws_name]["status"] = "USED"
                _상태쓰기(상태)
            return

        복사완료 = 0
        for dirpath, dirnames, filenames in os.walk(도메인경로):
            상대경로 = os.path.relpath(dirpath, 도메인경로)
            대상디렉토리 = os.path.join(ws경로, 상대경로) if 상대경로 != "." else ws경로
            os.makedirs(대상디렉토리, exist_ok=True)
            for dirname in dirnames:
                원본_항목 = os.path.join(dirpath, dirname)
                if os.path.islink(원본_항목):
                    링크_대상 = os.readlink(원본_항목)
                    대상_링크 = os.path.join(대상디렉토리, dirname)
                    if not os.path.lexists(대상_링크):
                        os.symlink(링크_대상, 대상_링크)
            for 파일명 in filenames:
                원본 = os.path.join(dirpath, 파일명)
                대상 = os.path.join(대상디렉토리, 파일명)
                shutil.copy2(원본, 대상)
                복사완료 += 1
                COPY_PROGRESS[ws_name]["percent"] = int(복사완료 / 전체파일수 * 100)


        경과 = round(time.time() - 시작시간, 1)
        COPY_PROGRESS[ws_name] = {"percent": 100, "status": "done", "message": "", "elapsed": 경과, "file_count": 전체파일수}
        상태 = _상태읽기()
        if ws_name in 상태:
            상태[ws_name]["status"] = "USED"
            _상태쓰기(상태)
    except Exception as e:
        경과 = round(time.time() - 시작시간, 1)
        COPY_PROGRESS[ws_name] = {"percent": COPY_PROGRESS.get(ws_name, {}).get("percent", 0), "status": "error", "message": str(e), "elapsed": 경과}
        상태 = _상태읽기()
        if ws_name in 상태:
            상태[ws_name]["status"] = "FAILED"
            _상태쓰기(상태)


def 도메인연결(ws_name: str, domain: str, connected_by: str | None = None) -> dict[str, Any]:
    """IDLE 체크 → 상태 즉시 CONNECTING → 백그라운드 복사 → 성공:USED / 실패:FAILED."""
    상태 = _상태읽기()
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
                detail=f"다른 워크스페이스({other_name})가 연결 중입니다. 완료 후 시도하세요.",
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
    기존색상 = ws상태.get("color")
    # 즉시 CONNECTING 상태로 기록
    상태[ws_name] = {"status": "CONNECTING", "domain": domain, "connected_by": connected_by, "color": 기존색상}
    _상태쓰기(상태)
    COPY_PROGRESS[ws_name] = {"percent": 0, "status": "copying", "message": ""}
    threading.Thread(
        target=_복사작업,
        args=(ws_name, domain, 도메인경로, ws경로),
        daemon=True,
    ).start()
    return {"name": ws_name, "status": "CONNECTING", "domain": domain, "connected_by": connected_by, "color": 기존색상}


def 진행률조회(ws_name: str) -> dict[str, Any] | None:
    """복사 진행률 반환. 진행 중이면 dict, 없으면 None."""
    return COPY_PROGRESS.get(ws_name, None)


def 워크스페이스해제(ws_name: str) -> dict[str, Any]:
    """상태 IDLE + domain/connected_by null로 변경. color는 유지. 디렉토리 전체 정리 후 기본 구조 재생성."""
    상태 = _상태읽기()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    기존색상 = 상태[ws_name].get("color")
    상태[ws_name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": 기존색상}
    _상태쓰기(상태)
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


def 색상변경(ws_name: str, color: str) -> dict[str, Any]:
    """워크스페이스 테마 색상 변경."""
    상태 = _상태읽기()
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
    _상태쓰기(상태)
    ws상태 = 상태[ws_name]
    return {
        "name": ws_name,
        "status": ws상태.get("status", "IDLE"),
        "domain": ws상태.get("domain"),
        "connected_by": ws상태.get("connected_by"),
        "color": color,
    }


def 사용자설정읽기(user_id: str) -> dict[str, Any] | None:
    """사용자 워크스페이스 설정 읽기."""
    try:
        with open(USER_PREF_FILE, "r", encoding="utf-8") as f:
            prefs = json.load(f)
        return prefs.get(user_id)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def 사용자설정저장(user_id: str, workspace: str, domain: str | None, color: str | None,
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
    "prevKeyword": "ArrowUp",
    "nextKeyword": "ArrowDown",
    "prevAnalysis": "ArrowLeft",
    "nextAnalysis": "ArrowRight",
    "registerUdic": "1",
    "registerCndic": "2",
    "registerThesaurus": "3",
    "analyzeKeyword": "0",
    "focusAnalysis": "Home",
    "tabUdic": "Alt+1",
    "tabCndic": "Alt+2",
    "tabThesaurus": "Alt+3",
    "tabMorpheme": "Alt+0",
    "aiAnalysis": "/",
    "undoHistory": "Escape",
}


def 핫키설정읽기(user_id: str) -> dict[str, Any]:
    """사용자 핫키 설정 읽기. 없으면 기본값 반환."""
    try:
        with open(USER_PREF_FILE, "r", encoding="utf-8") as f:
            prefs = json.load(f)
        user_pref = prefs.get(user_id, {})
        return user_pref.get("hotkeys", _기본핫키.copy())
    except (FileNotFoundError, json.JSONDecodeError):
        return _기본핫키.copy()


def 핫키설정저장(user_id: str, hotkeys: dict[str, str]) -> dict[str, Any]:
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
    return {"message": "저장 완료"}


OLD_DOMAIN_DIR = "/home/know/apps/jiana_admin_server"


def old도메인목록() -> list[str]:
    """OLD_DOMAIN_DIR 폴더 목록 반환 (복사 소스)."""
    if not os.path.isdir(OLD_DOMAIN_DIR):
        return []
    skip = {"bin", "lib", "conf", "nohup.out", "nohup.out.bak", "start.sh", "stop.sh"}
    return sorted(
        항목.name
        for 항목 in Path(OLD_DOMAIN_DIR).iterdir()
        if 항목.is_dir() and 항목.name not in skip
    )


DOMAIN_PROGRESS_DIR = "/tmp/know_domain_progress"


def _도메인진행률쓰기(name: str, data: dict[str, Any]) -> None:
    """진행률을 파일에 기록 (멀티워커 간 공유)."""
    os.makedirs(DOMAIN_PROGRESS_DIR, exist_ok=True)
    with open(os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.json"), "w") as f:
        json.dump(data, f)


def _도메인진행률읽기(name: str) -> dict[str, Any] | None:
    """진행률 파일 읽기."""
    try:
        with open(os.path.join(DOMAIN_PROGRESS_DIR, f"{name}.json"), "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _도메인복사작업(name: str, 원본: str, 대상: str,
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
            복사완료 = 0
            for dirpath, dirnames, filenames in os.walk(원본):
                상대경로 = os.path.relpath(dirpath, 원본)
                대상디렉토리 = os.path.join(대상, 상대경로) if 상대경로 != "." else 대상
                os.makedirs(대상디렉토리, exist_ok=True)
                for 파일명 in filenames:
                    shutil.copy2(os.path.join(dirpath, 파일명), os.path.join(대상디렉토리, 파일명))
                    복사완료 += 1
                    _도메인진행률쓰기(name, {"percent": int(복사완료 / 전체파일수 * 90), "status": "copying", "file_count": 전체파일수})

        # 사전 테이블 생성 + 사전 복사 (파일 복사 완료 후)
        dict_result = None
        if copy_dict_from or mysql_dict_from:
            _도메인진행률쓰기(name, {"percent": 92, "status": "dict_copying", "file_count": 전체파일수})
            from models.dictionary import 도메인테이블생성
            from core.database import 엔진, 세션팩토리
            도메인테이블생성(name.upper(), 엔진)

            if copy_dict_from:
                from services.dictionary_service import 도메인사전복사
                db = 세션팩토리()
                try:
                    dict_result = 도메인사전복사(db, copy_dict_from, name)
                finally:
                    db.close()
            elif mysql_dict_from:
                from services.dictionary_service import mysql에서사전마이그레이션
                dict_result = mysql에서사전마이그레이션(name, mysql_dict_from)

        경과 = round(time.time() - 시작시간, 1)
        결과 = {"percent": 100, "status": "done", "elapsed": 경과, "file_count": 전체파일수}
        if dict_result:
            결과["dict_result"] = dict_result
        _도메인진행률쓰기(name, 결과)
    except Exception as e:
        경과 = round(time.time() - 시작시간, 1)
        _도메인진행률쓰기(name, {"percent": -1, "status": "error", "message": str(e), "elapsed": 경과})
        if os.path.exists(대상):
            shutil.rmtree(대상, ignore_errors=True)


def 도메인추가(name: str, base_source: str, base_name: str,
              copy_dict_from: str | None = None,
              mysql_dict_from: str | None = None,
              display_name: str | None = None) -> dict[str, Any]:
    """도메인 추가 — 비동기 복사 시작 (즉시 반환). 사전 복사 옵션 포함."""
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
        메타 = _도메인메타읽기()
        메타[name] = display_name
        _도메인메타쓰기(메타)
    _도메인진행률쓰기(name, {"percent": 0, "status": "copying", "file_count": 0})
    threading.Thread(
        target=_도메인복사작업,
        args=(name, 원본, 대상, copy_dict_from, mysql_dict_from),
        daemon=True,
    ).start()
    return {"name": name, "source": f"{base_source}/{base_name}"}


def 도메인추가진행률(name: str) -> dict[str, Any] | None:
    """도메인 복사 진행률 반환 (파일 기반)."""
    return _도메인진행률읽기(name)


def 도메인삭제(name: str) -> None:
    """도메인 삭제 — 연결 중이면 차단."""
    상태 = _상태읽기()
    for ws_name, ws_state in 상태.items():
        if ws_state.get("domain") == name and ws_state.get("status") in ("USED", "CONNECTING"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"워크스페이스 '{ws_name}'에 연결된 도메인은 삭제할 수 없습니다")
    경로 = os.path.join(DOMAIN_DIR, name)
    if not os.path.isdir(경로):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"도메인을 찾을 수 없습니다: {name}")
    shutil.rmtree(경로)
    메타 = _도메인메타읽기()
    if name in 메타:
        del 메타[name]
        _도메인메타쓰기(메타)


def 도메인이름변경(old_name: str, new_name: str) -> dict[str, str]:
    """도메인 이름 변경 — 연결 중이면 차단."""
    상태 = _상태읽기()
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
    메타 = _도메인메타읽기()
    if old_name in 메타:
        메타[new_name] = 메타.pop(old_name)
        _도메인메타쓰기(메타)
    return {"old_name": old_name, "new_name": new_name}


def 도메인목록() -> list[dict[str, str | None]]:
    """DOMAIN_DIR 폴더 목록 반환 (id + display_name)."""
    os.makedirs(DOMAIN_DIR, exist_ok=True)
    메타 = _도메인메타읽기()
    return [
        {"id": 항목.name, "name": 메타.get(항목.name)}
        for 항목 in sorted(Path(DOMAIN_DIR).iterdir())
        if 항목.is_dir()
    ]


# ============================================================================
# 워크스페이스 Phase 관리 (preprocess → work → build → verify)
# ============================================================================

def phase조회(ws_name: str) -> str:
    """워크스페이스의 현재 phase 조회. 없으면 기본값 'preprocess'."""
    상태 = _상태읽기()
    ws상태 = 상태.get(ws_name, {})
    return ws상태.get("phase", "preprocess")


def phase전이(ws_name: str, next_phase: str) -> dict[str, Any]:
    """워크스페이스 phase 순방향 전이. 역전이/건너뛰기는 409."""
    if next_phase not in PHASE_ORDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 phase: {next_phase}",
        )
    상태 = _상태읽기()
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
    _상태쓰기(상태)
    return {"name": ws_name, "phase": next_phase, "prev": 현재}


def 사용자phase조회(db, ws: str, dom: str, uid: str) -> str:
    """user_work_phase 테이블에서 사용자 phase 조회. 없으면 'idle'."""
    from sqlalchemy import text
    row = db.execute(
        text("SELECT phase FROM user_work_phase WHERE workspace=:ws AND domain=:dom AND user_id=:uid"),
        {"ws": ws, "dom": dom, "uid": uid},
    ).fetchone()
    phase = row[0] if row else "idle"
    return {"workspace": ws, "domain": dom, "user_id": uid, "phase": phase}


def 사용자phase설정(db, ws: str, dom: str, uid: str, phase: str) -> None:
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


def _phase자동마이그레이션(db) -> None:
    """기존 워크스페이스 중 phase 필드가 없는 항목에 대해 keyword_assignments 카운트 기반 추론.

    추론 규칙:
      - total=0 → preprocess
      - assigned>0 (pending/assigned 존재) → work
      - completed>0 AND assigned=0 (모두 완료) → build
    """
    from sqlalchemy import text
    상태 = _상태읽기()
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
        _상태쓰기(상태)
