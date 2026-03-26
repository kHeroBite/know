from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

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
            })
    return 결과


def 워크스페이스생성(name: str) -> dict[str, Any]:
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
    상태[name] = {"status": "IDLE", "domain": None}
    _상태쓰기(상태)
    return {"name": name, "status": "IDLE", "domain": None}


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


def 도메인연결(ws_name: str, domain: str) -> dict[str, Any]:
    """IDLE 체크 → cp -rf domain/도메인/* workspace/이름/ → 상태 USED+domain 기록."""
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
    # cp -rf domain/도메인/* workspace/이름/
    결과 = subprocess.run(
        ["cp", "-rf", f"{도메인경로}/.", ws경로],
        capture_output=True,
        text=True,
    )
    if 결과.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"도메인 복사 실패: {결과.stderr}",
        )
    상태[ws_name] = {"status": "USED", "domain": domain}
    _상태쓰기(상태)
    return {"name": ws_name, "status": "USED", "domain": domain}


def 워크스페이스해제(ws_name: str) -> dict[str, Any]:
    """상태 IDLE + domain null로 변경."""
    상태 = _상태읽기()
    if ws_name not in 상태:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"워크스페이스를 찾을 수 없습니다: {ws_name}",
        )
    상태[ws_name] = {"status": "IDLE", "domain": None}
    _상태쓰기(상태)
    return {"name": ws_name, "status": "IDLE", "domain": None}


def 도메인목록() -> list[str]:
    """DOMAIN_DIR 폴더 목록 반환."""
    os.makedirs(DOMAIN_DIR, exist_ok=True)
    return sorted(
        항목.name
        for 항목 in Path(DOMAIN_DIR).iterdir()
        if 항목.is_dir()
    )
