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
    상태[name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": color}
    _상태쓰기(상태)
    return {"name": name, "status": "IDLE", "domain": None, "connected_by": None, "color": color}


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
    try:
        # 총 파일 수 카운트
        전체파일수 = sum(len(files) for _, _, files in os.walk(도메인경로))
        if 전체파일수 == 0:
            COPY_PROGRESS[ws_name] = {"percent": 100, "status": "done", "message": ""}
            return

        복사완료 = 0
        for dirpath, dirnames, filenames in os.walk(도메인경로):
            상대경로 = os.path.relpath(dirpath, 도메인경로)
            대상디렉토리 = os.path.join(ws경로, 상대경로) if 상대경로 != "." else ws경로
            os.makedirs(대상디렉토리, exist_ok=True)
            for 파일명 in filenames:
                원본 = os.path.join(dirpath, 파일명)
                대상 = os.path.join(대상디렉토리, 파일명)
                shutil.copy2(원본, 대상)
                복사완료 += 1
                COPY_PROGRESS[ws_name]["percent"] = int(복사완료 / 전체파일수 * 100)

        COPY_PROGRESS[ws_name] = {"percent": 100, "status": "done", "message": ""}
    except Exception as e:
        COPY_PROGRESS[ws_name] = {"percent": COPY_PROGRESS.get(ws_name, {}).get("percent", 0), "status": "error", "message": str(e)}


def 도메인연결(ws_name: str, domain: str, connected_by: str | None = None) -> dict[str, Any]:
    """IDLE 체크 → 상태 즉시 USED 기록 → 백그라운드 복사 시작."""
    상태 = _상태읽기()
    ws상태 = 상태.get(ws_name, {"status": "IDLE", "domain": None})
    if ws상태.get("status") == "USED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"이미 사용 중인 워크스페이스입니다: {ws_name}",
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
    # 기존 color 유지
    기존색상 = ws상태.get("color")
    # 즉시 상태 USED + domain + connected_by 기록
    상태[ws_name] = {"status": "USED", "domain": domain, "connected_by": connected_by, "color": 기존색상}
    _상태쓰기(상태)
    # 진행률 초기화
    COPY_PROGRESS[ws_name] = {"percent": 0, "status": "copying", "message": ""}
    # 백그라운드 복사 스레드 시작
    threading.Thread(
        target=_복사작업,
        args=(ws_name, domain, 도메인경로, ws경로),
        daemon=True,
    ).start()
    return {"name": ws_name, "status": "USED", "domain": domain, "connected_by": connected_by, "color": 기존색상}


def 진행률조회(ws_name: str) -> dict[str, Any] | None:
    """복사 진행률 반환. 진행 중이면 dict, 없으면 None."""
    return COPY_PROGRESS.get(ws_name, None)


def 워크스페이스해제(ws_name: str) -> dict[str, Any]:
    """상태 IDLE + domain/connected_by null로 변경. color는 유지."""
    상태 = _상태읽기()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    기존색상 = 상태[ws_name].get("color")
    상태[ws_name] = {"status": "IDLE", "domain": None, "connected_by": None, "color": 기존색상}
    _상태쓰기(상태)
    return {"name": ws_name, "status": "IDLE", "domain": None, "connected_by": None, "color": 기존색상}


def 색상변경(ws_name: str, color: str) -> dict[str, Any]:
    """워크스페이스 테마 색상 변경."""
    상태 = _상태읽기()
    if ws_name not in 상태:
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


def 도메인목록() -> list[str]:
    """DOMAIN_DIR 폴더 목록 반환."""
    os.makedirs(DOMAIN_DIR, exist_ok=True)
    return sorted(
        항목.name
        for 항목 in Path(DOMAIN_DIR).iterdir()
        if 항목.is_dir()
    )
