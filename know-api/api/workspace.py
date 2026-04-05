from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import 현재사용자가져오기
from core.database import DB세션
from schemas.workspace import (
    MyPhaseRequest,
    MyPhaseResponse,
    PhaseAdvanceRequest,
    WorkspacePhaseResponse,
)
from services.workspace_service import (
    phase전이,
    phase조회,
    도메인목록,
    도메인연결,
    도메인삭제,
    도메인이름변경,
    도메인추가,
    도메인추가진행률,
    사용자phase설정,
    사용자phase조회,
    old도메인목록,
    사용자설정읽기,
    사용자설정저장,
    색상변경,
    워크스페이스목록,
    워크스페이스삭제,
    워크스페이스생성,
    워크스페이스해제,
    진행률조회,
    핫키설정읽기,
    핫키설정저장,
)

라우터 = APIRouter(prefix="/workspaces", tags=["워크스페이스"])
도메인관리라우터 = APIRouter(prefix="/workspace-domains", tags=["도메인관리"])


class 워크스페이스생성요청(BaseModel):
    name: str
    color: Optional[str] = None


class 도메인연결요청(BaseModel):
    domain: str


class 색상변경요청(BaseModel):
    color: str


class 워크스페이스설정요청(BaseModel):
    workspace: str
    domain: Optional[str] = None
    color: Optional[str] = None
    last_menu: Optional[str] = None


class 핫키설정요청(BaseModel):
    hotkeys: Dict[str, str]


class 도메인추가요청(BaseModel):
    name: str
    base_source: str  # "domain" | "old"
    base_name: str
    copy_dict_from: Optional[str] = None    # SQLite 기존 도메인에서 사전 복사
    mysql_dict_from: Optional[str] = None   # MySQL에서 사전 마이그레이션
    display_name: Optional[str] = None      # 한글 표시명 (선택사항)


class 도메인이름변경요청(BaseModel):
    new_name: str


def _super권한확인(current: dict) -> None:
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자(A) 권한 필요")


# ─── 리터럴 경로 (/{name} 보다 먼저 정의) ───

@라우터.get("/preference")
def 워크스페이스설정조회(
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """사용자 워크스페이스 설정 조회."""
    pref = 사용자설정읽기(current.get("user_id", ""))
    if pref is None:
        return {"workspace": None, "domain": None, "color": None}
    return pref


@라우터.put("/preference")
def 워크스페이스설정저장처리(
    요청: 워크스페이스설정요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """사용자 워크스페이스 설정 저장."""
    return 사용자설정저장(current.get("user_id", ""), 요청.workspace, 요청.domain, 요청.color, 요청.last_menu)


@라우터.get("/hotkeys")
def 핫키설정조회(
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """현재 사용자의 핫키 설정 조회."""
    hotkeys = 핫키설정읽기(current.get("user_id", ""))
    return {"hotkeys": hotkeys}


@라우터.put("/hotkeys")
def 핫키설정저장처리(
    요청: 핫키설정요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, str]:
    """핫키 설정 저장."""
    return 핫키설정저장(current.get("user_id", ""), 요청.hotkeys)


@라우터.get("/domains")
def 도메인목록조회(
    _current: dict = Depends(현재사용자가져오기),
) -> List[Dict[str, Any]]:
    """도메인 목록 조회."""
    return 도메인목록()


@도메인관리라우터.get("/old-sources")
def old도메인소스목록(
    current: dict = Depends(현재사용자가져오기),
) -> List[str]:
    """old 영역 도메인 소스 목록 (super 전용)."""
    _super권한확인(current)
    return old도메인목록()


@도메인관리라우터.get("/mysql-sources")
def mysql도메인소스목록(
    current: dict = Depends(현재사용자가져오기),
) -> List[str]:
    """MySQL DB에서 사전이 있는 도메인 소스 목록 (super 전용)."""
    _super권한확인(current)
    from services.dictionary_service import mysql도메인목록
    return mysql도메인목록()


@도메인관리라우터.post("", status_code=status.HTTP_201_CREATED)
def 도메인추가처리(
    요청: 도메인추가요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """도메인 추가 — 기존/old 소스에서 복사 + 사전 복사 옵션 (super 전용)."""
    _super권한확인(current)
    return 도메인추가(요청.name, 요청.base_source, 요청.base_name,
                     copy_dict_from=요청.copy_dict_from,
                     mysql_dict_from=요청.mysql_dict_from,
                     display_name=요청.display_name)


@도메인관리라우터.get("/{name}/progress")
def 도메인추가진행률조회(
    name: str,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """도메인 복사 진행률 조회."""
    진행 = 도메인추가진행률(name)
    if 진행 is None:
        return {"status": "idle"}
    return 진행


@도메인관리라우터.delete("/{name}")
def 도메인삭제처리(
    name: str,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, str]:
    """도메인 삭제 (super 전용, 연결 중 차단)."""
    _super권한확인(current)
    # 잔존 keyword_assignments 정리
    db.execute(text("DELETE FROM keyword_assignments WHERE domain=:dom"), {"dom": name})
    db.commit()
    도메인삭제(name)
    return {"message": f"도메인 삭제 완료: {name}"}


@도메인관리라우터.put("/{name}/rename")
def 도메인이름변경처리(
    name: str,
    요청: 도메인이름변경요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, str]:
    """도메인 이름 변경 (super 전용, 연결 중 차단)."""
    _super권한확인(current)
    return 도메인이름변경(name, 요청.new_name)


# ─── 워크스페이스 CRUD ───

@라우터.get("")
def 워크스페이스목록조회(
    _current: dict = Depends(현재사용자가져오기),
) -> List[Dict[str, Any]]:
    """워크스페이스 목록."""
    return 워크스페이스목록()


@라우터.post("", status_code=status.HTTP_201_CREATED)
def 워크스페이스추가(
    요청: 워크스페이스생성요청,
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 생성 (super 전용)."""
    _super권한확인(current)
    return 워크스페이스생성(요청.name, 요청.color)


# ─── /{name} 파라미터 경로 (반드시 리터럴 경로 뒤에) ───

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
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """도메인 연결."""
    return 도메인연결(name, 요청.domain, current.get("name"))


@라우터.post("/{name}/release")
def 워크스페이스해제처리(
    name: str,
    db: Session = Depends(DB세션),
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 해제 + keyword_assignments 자동 초기화."""
    from services.workspace_service import _상태읽기
    상태 = _상태읽기()
    도메인 = 상태.get(name, {}).get("domain")
    if 도메인:
        db.execute(text("DELETE FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
                   {"ws": name, "dom": 도메인})
        # 전처리 실행 로그 정리
        db.execute(text("DELETE FROM phase1_logs WHERE run_id IN (SELECT run_id FROM phase1_runs WHERE domain=:dom)"),
                   {"dom": 도메인})
        db.execute(text("DELETE FROM phase1_runs WHERE domain=:dom"),
                   {"dom": 도메인})
        db.commit()
    return 워크스페이스해제(name)


@라우터.put("/{name}/color")
def 워크스페이스색상변경(
    name: str,
    요청: 색상변경요청,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 테마 색상 변경."""
    return 색상변경(name, 요청.color)


@라우터.post("/{name}/phase/advance", response_model=WorkspacePhaseResponse)
def 워크스페이스phase전이(
    name: str,
    요청: PhaseAdvanceRequest,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """워크스페이스 phase 순방향 전이."""
    return phase전이(name, 요청.to)


@라우터.get("/{name}/phase")
def 워크스페이스phase조회(
    name: str,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """현재 워크스페이스 phase 조회."""
    return {"phase": phase조회(name)}


@라우터.get("/{name}/my-phase", response_model=MyPhaseResponse)
def 사용자phase조회처리(
    name: str,
    domain: str,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """현재 사용자의 myPhase 조회."""
    return 사용자phase조회(db, name, domain, current.get("user_id", ""))


@라우터.put("/{name}/my-phase", response_model=MyPhaseResponse)
def 사용자phase설정처리(
    name: str,
    요청: MyPhaseRequest,
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """사용자 myPhase 변경."""
    return 사용자phase설정(db, name, 요청.domain, current.get("user_id", ""), 요청.phase)


@라우터.get("/{name}/progress")
def 복사진행률조회(
    name: str,
    _current: dict = Depends(현재사용자가져오기),
) -> Dict[str, Any]:
    """도메인 복사 진행률 조회."""
    진행 = 진행률조회(name)
    if 진행 is None:
        return {"status": "idle"}
    result: Dict[str, Any] = {"percent": 진행["percent"], "status": 진행["status"]}
    if "message" in 진행:
        result["message"] = 진행["message"]
    if "elapsed" in 진행:
        result["elapsed"] = 진행["elapsed"]
    if "file_count" in 진행:
        result["file_count"] = 진행["file_count"]
    return result
