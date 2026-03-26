from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.auth import 현재사용자가져오기
from services.workspace_service import (
    도메인목록,
    도메인연결,
    워크스페이스목록,
    워크스페이스삭제,
    워크스페이스생성,
    워크스페이스해제,
    진행률조회,
)

라우터 = APIRouter(prefix="/workspaces", tags=["워크스페이스"])


class 워크스페이스생성요청(BaseModel):
    name: str


class 도메인연결요청(BaseModel):
    domain: str


def _super권한확인(current: dict) -> None:
    if current.get("user_id") != "super":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="super 권한 필요")


@라우터.get("/domains")
def 도메인목록조회(
    _current: dict = Depends(현재사용자가져오기),
) -> List[str]:
    """도메인 목록 조회 (/home/know/apps/know-ops/domain 폴더 목록)."""
    return 도메인목록()


@라우터.get("")
def 워크스페이스목록조회(
    _current: dict = Depends(현재사용자가져오기),
) -> List[Dict[str, Any]]:
    """워크스페이스 목록 (이름, 상태 USED/IDLE, 연결 도메인)."""
    return 워크스페이스목록()


@라우터.post("", status_code=status.HTTP_201_CREATED)
def 워크스페이스추가(
    요청: 워크스페이스생성요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 생성 (super 전용). 하위 폴더 자동 생성."""
    _super권한확인(current)
    return 워크스페이스생성(요청.name)


@라우터.delete("/{name}", status_code=status.HTTP_200_OK)
def 워크스페이스제거(
    name: str,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, str]:
    """워크스페이스 삭제 (super 전용). USED 상태면 409 반환."""
    _super권한확인(current)
    워크스페이스삭제(name)
    return {"message": f"워크스페이스 삭제 완료: {name}"}


@라우터.post("/{name}/connect")
def 도메인연결처리(
    name: str,
    요청: 도메인연결요청,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """도메인 연결. USED 상태면 409 반환. domain 폴더를 workspace로 cp."""
    return 도메인연결(name, 요청.domain)


@라우터.post("/{name}/release")
def 워크스페이스해제처리(
    name: str,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 해제 (IDLE 상태로 변경)."""
    return 워크스페이스해제(name)


@라우터.get("/{name}/progress")
def 복사진행률조회(
    name: str,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """도메인 복사 진행률 조회. 진행 중이면 percent/status 반환, 없으면 idle."""
    진행 = 진행률조회(name)
    if 진행 is None:
        return {"status": "idle"}
    return {"percent": 진행["percent"], "status": 진행["status"]}
