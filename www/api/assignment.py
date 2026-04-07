import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import DB세션
from api.auth import 현재사용자가져오기
from services import assignment_service
from services.work_history_service import 이력전체삭제
from services.workspace_service import phase전이, phase조회, 사용자phase설정, 사용자phase조회

라우터 = APIRouter()

@라우터.get("/status")
def 작업상태(workspace: str = Query(...), domain: str = Query(...),
            db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    """현재 워크스페이스 phase + 사용자 myPhase + 통계 반환."""
    stats = assignment_service.통계(db, workspace, domain)
    user_id = current["user_id"]

    ws_phase = phase조회(workspace)
    my_phase = 사용자phase조회(db, workspace, domain, user_id)

    phase_val = ws_phase.get("phase") if isinstance(ws_phase, dict) else ws_phase
    my_phase_val = my_phase.get("phase") if isinstance(my_phase, dict) else my_phase

    return {"phase": phase_val, "my_phase": my_phase_val, "stats": stats}

@라우터.post("/freeze")
def 프리징(workspace: str = Query(...), domain: str = Query(...),
          db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    return assignment_service.프리징(db, workspace, domain)

@라우터.get("/list")
def 목록(workspace: str = Query(...), domain: str = Query(...),
         filter: str = Query("pending"), page: int = Query(1), size: int = Query(50),
         assigned_to: Optional[str] = Query(None),
         db: Session = Depends(DB세션), _: dict = Depends(현재사용자가져오기)):
    return assignment_service.키워드목록(db, workspace, domain, filter, page, size, assigned_to=assigned_to)

@라우터.get("/last-read")
def 마지막읽은위치(workspace: str = Query(...), domain: str = Query(...),
                   size: int = Query(100),
                   db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    """마지막으로 읽은 키워드의 위치(페이지) 반환."""
    return assignment_service.마지막읽은위치(db, workspace, domain, current["user_id"], size)

@라우터.get("/stats")
def 통계(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(DB세션), _: dict = Depends(현재사용자가져오기)):
    return assignment_service.통계(db, workspace, domain)

@라우터.post("/assign")
def 할당(workspace: str = Query(...), domain: str = Query(...),
         from_line: int = Query(...), to_line: int = Query(...),
         db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    result = assignment_service.할당받기(db, workspace, domain, from_line, to_line, current["user_id"])
    # 사이드이펙트: 할당 성공 시 myPhase → working
    사용자phase설정(db, workspace, domain, current["user_id"], "working")
    return result

@라우터.put("/flag")
def flag_업데이트처리(
    keyword_id: int = Query(...),
    flag: str = Query(...),
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """키워드 읽음/작업완료 flag 업데이트."""
    return assignment_service.flag_업데이트(db, keyword_id, flag, current["user_id"])

def _완료후_사이드이펙트(db: Session, workspace: str, domain: str, user_id: str) -> None:
    """완료 이벤트 후 myPhase=done + 100% 완료 시 phase→build 전이."""
    사용자phase설정(db, workspace, domain, user_id, "done")
    stats = assignment_service.통계(db, workspace, domain)
    total = stats.get("total", 0)
    completed = stats.get("completed", 0)
    if total > 0 and completed >= total:
        try:
            phase전이(workspace, "build")
        except Exception:
            # 이미 build 이상이거나 전이 불가 상태면 무시
            pass


@라우터.post("/complete")
def 완료(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    result = assignment_service.완료처리(db, workspace, domain, current["user_id"])
    _완료후_사이드이펙트(db, workspace, domain, current["user_id"])
    return result


class 완료모드요청(BaseModel):
    workspace: str
    domain: str
    mode: str  # all_complete | all_incomplete | by_history


@라우터.post("/complete-with-mode")
def 완료처리_모드(body: 완료모드요청, db: Session = Depends(DB세션),
                  current: dict = Depends(현재사용자가져오기)):
    """작업완료 모드별 처리: all_complete / all_incomplete / by_history."""
    result = assignment_service.작업완료모드처리(db, body.workspace, body.domain, current["user_id"], body.mode)
    _완료후_사이드이펙트(db, body.workspace, body.domain, current["user_id"])
    mode_labels = {
        "all_complete": "전체 완료처리",
        "all_incomplete": "전체 미완료처리",
        "by_history": "작업이력대로 완료처리",
    }
    return {"success": True, "message": mode_labels.get(body.mode, body.mode), **result}

@라우터.post("/reset")
def 초기화(workspace: str = Query(...), domain: str = Query(...),
          db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    """데이터 전처리 데이터 완전 삭제: keyword_assignments + phase1 + build_history + work_history + 파일."""
    # 1. phase1_logs 삭제 (phase1_runs 자식 테이블 — 선 삭제)
    db.execute(text(
        "DELETE FROM phase1_logs WHERE run_id IN "
        "(SELECT run_id FROM phase1_runs WHERE domain=:dom)"
    ), {"dom": domain})

    # 2. phase1_runs 삭제
    db.execute(text("DELETE FROM phase1_runs WHERE domain=:dom"), {"dom": domain})

    # 3. build_history 삭제
    db.execute(text("DELETE FROM build_history WHERE domain=:dom"), {"dom": domain})

    # 4. keyword_assignments 삭제
    db.execute(text("DELETE FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
               {"ws": workspace, "dom": domain})

    db.commit()

    # 5. work_history 삭제 (서비스 내부에서 commit 처리)
    이력전체삭제(db, workspace, domain)

    # 6. 업로드 파일 정리 (popular / fails 폴더 내 파일 삭제)
    WORKSPACE_BASE = "/home/know/apps/know-ops/workspace"
    for folder in ("popular", "fails"):
        dir_path = os.path.join(WORKSPACE_BASE, workspace, "build", folder)
        if os.path.isdir(dir_path):
            for fname in os.listdir(dir_path):
                fpath = os.path.join(dir_path, fname)
                if os.path.isfile(fpath):
                    os.remove(fpath)

    # 7. work 디렉토리 재생성
    work_dir = os.path.join(WORKSPACE_BASE, workspace, "build", "work")
    if os.path.isdir(work_dir):
        shutil.rmtree(work_dir)
    os.makedirs(work_dir, exist_ok=True)

    return {"reset": True, "workspace": workspace, "domain": domain}
