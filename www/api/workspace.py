from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import get_current_user
from core.database import db_session
from schemas.workspace import (
    MyPhaseRequest,
    MyPhaseResponse,
    PhaseAdvanceRequest,
    WorkspacePhaseResponse,
)
from services.workspace_service import (
    phase_forward,
    phase_backward,
    get_phase,
    list_domains_service,
    link_domain,
    delete_domain_ws,
    rename_domain,
    add_domain_service,
    get_domain_add_progress_service,
    get_domain_jiana_version,
    list_jiana_versions_service,
    unlink_domain_service,
    set_user_phase,
    get_user_phase,
    list_old_domains,
    read_user_settings,
    save_user_settings,
    change_color,
    list_workspaces_service,
    delete_workspace,
    create_workspace,
    release_workspace,
    get_progress,
    read_hotkey_settings,
    save_hotkey_settings_service,
)

라우터 = APIRouter(prefix="/workspaces", tags=["워크스페이스"])
도메인관리라우터 = APIRouter(prefix="/workspace-domains", tags=["도메인관리"])


class 워크스페이스생성요청(BaseModel):
    name: str
    color: Optional[str] = None


class 도메인연결요청(BaseModel):
    domain: str
    jiana_version: Optional[str] = None


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


def _check_super(current: dict) -> None:
    if current.get("auth") != "A":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자(A) 권한 필요")


# ─── 리터럴 경로 (/{name} 보다 먼저 정의) ───

@라우터.get("/preference")
def get_workspace_settings(
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """사용자 워크스페이스 설정 조회."""
    pref = read_user_settings(current.get("user_id", ""))
    if pref is None:
        return {"workspace": None, "domain": None, "color": None}
    return pref


@라우터.put("/preference")
def save_workspace_settings(
    요청: 워크스페이스설정요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """사용자 워크스페이스 설정 저장."""
    return save_user_settings(current.get("user_id", ""), 요청.workspace, 요청.domain, 요청.color, 요청.last_menu)


@라우터.get("/hotkeys")
def get_hotkey_settings(
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """현재 사용자의 핫키 설정 조회."""
    hotkeys = read_hotkey_settings(current.get("user_id", ""))
    return {"hotkeys": hotkeys}


@라우터.put("/hotkeys")
def save_hotkey_settings(
    요청: 핫키설정요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, str]:
    """핫키 설정 저장."""
    return save_hotkey_settings_service(current.get("user_id", ""), 요청.hotkeys)


@라우터.get("/domains")
def get_domain_list(
    _current: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """도메인 list_tasks 조회."""
    return list_domains_service()


@라우터.get("/jiana-versions")
def list_jiana_versions(
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """서버에 설치된 jiana 버전 list_tasks 조회."""
    return {"versions": list_jiana_versions_service()}


@라우터.get("/jiana-pref/{domain}")
def get_domain_jiana_settings(
    domain: str,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """도메인의 마지막 사용 jiana 버전 조회."""
    version = get_domain_jiana_version(domain)
    return {"domain": domain, "jiana_version": version}


@도메인관리라우터.get("/old-sources")
def list_old_domain_sources(
    current: dict = Depends(get_current_user),
) -> List[str]:
    """old 영역 도메인 소스 list_tasks (super 전용)."""
    _check_super(current)
    return list_old_domains()


@도메인관리라우터.get("/mysql-sources")
def list_mysql_domain_sources(
    current: dict = Depends(get_current_user),
) -> List[str]:
    """MySQL DB에서 사전이 있는 도메인 소스 list_tasks (super 전용)."""
    _check_super(current)
    from services.dictionary_service import list_mysql_domains
    return list_mysql_domains()


@도메인관리라우터.post("", status_code=status.HTTP_201_CREATED)
def add_domain_handler(
    요청: 도메인추가요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """도메인 추가 — 기존/old 소스에서 복사 + 사전 복사 옵션 (super 전용)."""
    _check_super(current)
    return add_domain_service(요청.name, 요청.base_source, 요청.base_name,
                     copy_dict_from=요청.copy_dict_from,
                     mysql_dict_from=요청.mysql_dict_from,
                     display_name=요청.display_name)


@도메인관리라우터.get("/{name}/progress")
def get_domain_add_progress(
    name: str,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """도메인 복사 진행률 조회."""
    진행 = get_domain_add_progress_service(name)
    if 진행 is None:
        return {"status": "idle"}
    return 진행


@도메인관리라우터.delete("/{name}")
def delete_domain_handler(
    name: str,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
) -> Dict[str, str]:
    """도메인 삭제 (super 전용, 연결 중 차단)."""
    _check_super(current)
    # 잔존 keyword_assignments 정리
    db.execute(text("DELETE FROM keyword_assignments WHERE domain=:dom"), {"dom": name})
    db.commit()
    delete_domain_ws(name)
    return {"message": f"도메인 삭제 complete: {name}"}


@도메인관리라우터.put("/{name}/rename")
def rename_domain_handler(
    name: str,
    요청: 도메인이름변경요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, str]:
    """도메인 이름 변경 (super 전용, 연결 중 차단)."""
    _check_super(current)
    return rename_domain(name, 요청.new_name)


# ─── 워크스페이스 CRUD ───

@라우터.get("")
def list_workspaces(
    _current: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """워크스페이스 list_tasks."""
    return list_workspaces_service()


@라우터.post("", status_code=status.HTTP_201_CREATED)
def add_workspace(
    요청: 워크스페이스생성요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스 생성 (super 전용)."""
    _check_super(current)
    return create_workspace(요청.name, 요청.color)


# ─── /{name} 파라미터 경로 (반드시 리터럴 경로 뒤에) ───

@라우터.delete("/{name}", status_code=status.HTTP_200_OK)
def remove_workspace(
    name: str,
    current: dict = Depends(get_current_user),
) -> Dict[str, str]:
    """워크스페이스 삭제 (super 전용). USED 상태면 409 반환."""
    _check_super(current)
    delete_workspace(name)
    return {"message": f"워크스페이스 삭제 complete: {name}"}


@라우터.post("/{name}/connect")
def link_domain_handler(
    name: str,
    요청: 도메인연결요청,
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """도메인 연결."""
    이름 = current.get("name", "")
    아이디 = current.get("user_id", "")
    connected_by = f"{이름}({아이디})" if 이름 else 아이디
    return link_domain(name, 요청.domain, connected_by, jiana_version=요청.jiana_version)


@라우터.post("/{name}/cancel-connect")
def unlink_domain(
    name: str,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """연결 중인 복사 작업 취소."""
    return unlink_domain_service(name)


@라우터.post("/{name}/release")
def release_workspace_handler(
    name: str,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스 해제 + kw_{ws} 테이블 DROP + 관련 데이터 정리."""
    from services.workspace_service import _read_state
    from services.assignment_service import drop_kw_table
    상태 = _read_state()
    도메인 = 상태.get(name, {}).get("domain")
    if 도메인:
        # kw_{ws} 테이블 DROP (workspace 전용 키워드 테이블)
        try:
            drop_kw_table(db, name)
        except Exception:
            pass  # 테이블 미존재 시 무시
        # 전처리 run_phase1_service 로그 (domain 매칭 + 빈 domain 레코드도 정리)
        db.execute(text("DELETE FROM phase1_logs WHERE run_id IN (SELECT run_id FROM phase1_runs WHERE domain=:dom OR domain='' OR domain IS NULL)"),
                   {"dom": 도메인})
        db.execute(text("DELETE FROM phase1_runs WHERE domain=:dom OR domain='' OR domain IS NULL"),
                   {"dom": 도메인})
        # 작업이력
        db.execute(text("DELETE FROM work_history WHERE workspace=:ws AND domain=:dom"),
                   {"ws": name, "dom": 도메인})
        # 개인 phase
        db.execute(text("DELETE FROM user_work_phase WHERE workspace=:ws AND domain=:dom"),
                   {"ws": name, "dom": 도메인})
        # 빌드 이력
        db.execute(text("DELETE FROM build_history WHERE domain=:dom"),
                   {"dom": 도메인})
        db.commit()
        # 워크스페이스 사전 테이블 DROP
        try:
            from models.dictionary import ws_drop_dict_table
            from core.database import 엔진
            ws_drop_dict_table(name, 도메인, 엔진)
        except Exception:
            pass  # 테이블 미존재 시 무시
    return release_workspace(name)


@라우터.put("/{name}/color")
def change_workspace_color(
    name: str,
    요청: 색상변경요청,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스 테마 색상 변경."""
    return change_color(name, 요청.color)


@라우터.post("/{name}/phase/advance", response_model=WorkspacePhaseResponse)
def workspace_phase_forward(
    name: str,
    요청: PhaseAdvanceRequest,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스 phase 순방향 전이."""
    return phase_forward(name, 요청.to)


@라우터.post("/{name}/phase/revert", response_model=WorkspacePhaseResponse)
def workspace_phase_backward(
    name: str,
    요청: PhaseAdvanceRequest,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스 phase 역방향 전이 + 전처리 초기화."""
    if 요청.to == "preprocess":
        from services.workspace_service import _read_state
        from services.assignment_service import truncate_kw_table
        상태 = _read_state()
        도메인 = 상태.get(name, {}).get("domain")
        if 도메인:
            # phase1_logs 먼저 삭제 (FK 의존)
            db.execute(text(
                "DELETE FROM phase1_logs WHERE run_id IN "
                "(SELECT run_id FROM phase1_runs WHERE domain=:dom)"
            ), {"dom": 도메인})
            db.execute(text("DELETE FROM phase1_runs WHERE domain=:dom"), {"dom": 도메인})
            db.commit()
        # kw_{ws} 데이터 전체 삭제 (테이블 유지)
        try:
            truncate_kw_table(db, name)
        except Exception:
            pass  # 테이블 미존재 시 무시
    return phase_backward(name, 요청.to)


@라우터.get("/{name}/phase")
def get_workspace_phase(
    name: str,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """현재 워크스페이스 phase 조회."""
    return {"phase": get_phase(name)}


@라우터.get("/{name}/my-phase", response_model=MyPhaseResponse)
def get_user_phase_handler(
    name: str,
    domain: str,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """현재 사용자의 myPhase 조회."""
    return get_user_phase(db, name, domain, current.get("user_id", ""))


@라우터.put("/{name}/my-phase", response_model=MyPhaseResponse)
def set_user_phase_handler(
    name: str,
    요청: MyPhaseRequest,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """사용자 myPhase 변경."""
    return set_user_phase(db, name, 요청.domain, current.get("user_id", ""), 요청.phase)


@라우터.get("/{name}/progress")
def get_copy_progress(
    name: str,
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """도메인 복사 진행률 조회."""
    진행 = get_progress(name)
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


@라우터.get("/{workspace_id}/members-status")
def get_members_status(
    workspace_id: str,
    db: Session = Depends(db_session),
    _current: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """워크스페이스에 할당된 사용자 목록 + 각자 오늘 처리한 건수."""
    from sqlalchemy import text as _text
    from models.account import 계정테이블
    from sqlalchemy import select

    # 오늘 날짜 기준
    rows = db.execute(_text("""
        SELECT wh.user_id, COUNT(*) as today_count
        FROM work_history wh
        WHERE wh.workspace = :ws
          AND wh.undone = 0
          AND date(wh.created_at) = date('now')
        GROUP BY wh.user_id
    """), {"ws": workspace_id}).fetchall()

    today_map = {r.user_id: r.today_count for r in rows}

    # 워크스페이스에 한번이라도 참여한 사용자 목록 (work_history 전체 기준)
    all_user_rows = db.execute(_text("""
        SELECT DISTINCT user_id FROM work_history WHERE workspace = :ws
    """), {"ws": workspace_id}).fetchall()

    user_ids = [r.user_id for r in all_user_rows]

    # 계정 이름 조회
    name_map: Dict[str, str] = {}
    if user_ids:
        name_rows = db.execute(
            select(계정테이블.c._USER_ID, 계정테이블.c._NAME)
            .where(계정테이블.c._USER_ID.in_(user_ids))
        ).fetchall()
        name_map = {r._USER_ID: r._NAME for r in name_rows}

    members = [
        {
            "user_id": uid,
            "user_name": name_map.get(uid, uid),
            "today_count": today_map.get(uid, 0),
        }
        for uid in user_ids
    ]
    members.sort(key=lambda x: x["today_count"], reverse=True)

    return {"workspace": workspace_id, "members": members}
