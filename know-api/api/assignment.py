import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import DB세션
from api.auth import 현재사용자가져오기
from services import assignment_service
from services.work_history_service import 이력전체삭제

라우터 = APIRouter()

@라우터.get("/status")
def 작업상태(workspace: str = Query(...), domain: str = Query(...),
            db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    """현재 워크스페이스의 프리징/할당 상태 반환."""
    stats = assignment_service.통계(db, workspace, domain)
    user_id = current["user_id"]

    # 프리징 여부: keyword_assignments에 데이터가 1건 이상 존재
    is_frozen = stats["total"] > 0

    # 할당 여부: 현재 사용자에게 assigned 상태인 키워드가 1건 이상
    assigned_count = db.execute(text(
        "SELECT COUNT(*) FROM keyword_assignments WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'"
    ), {"ws": workspace, "dom": domain, "uid": user_id}).scalar() or 0
    is_assigned = assigned_count > 0

    return {"is_frozen": is_frozen, "is_assigned": is_assigned, "stats": stats}

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

@라우터.get("/stats")
def 통계(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(DB세션), _: dict = Depends(현재사용자가져오기)):
    return assignment_service.통계(db, workspace, domain)

@라우터.post("/assign")
def 할당(workspace: str = Query(...), domain: str = Query(...),
         from_line: int = Query(...), to_line: int = Query(...),
         db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    return assignment_service.할당받기(db, workspace, domain, from_line, to_line, current["user_id"])

@라우터.put("/flag")
def flag_업데이트처리(
    keyword_id: int = Query(...),
    flag: str = Query(...),
    db: Session = Depends(DB세션),
    current: dict = Depends(현재사용자가져오기),
):
    """키워드 읽음/작업완료 flag 업데이트."""
    return assignment_service.flag_업데이트(db, keyword_id, flag, current["user_id"])

@라우터.post("/complete")
def 완료(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    return assignment_service.완료처리(db, workspace, domain, current["user_id"])

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
