from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import DB세션
from api.auth import 현재사용자가져오기
from services import assignment_service

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
         db: Session = Depends(DB세션), _: dict = Depends(현재사용자가져오기)):
    return assignment_service.키워드목록(db, workspace, domain, filter, page, size)

@라우터.get("/stats")
def 통계(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(DB세션), _: dict = Depends(현재사용자가져오기)):
    return assignment_service.통계(db, workspace, domain)

@라우터.post("/assign")
def 할당(workspace: str = Query(...), domain: str = Query(...),
         from_line: int = Query(...), to_line: int = Query(...),
         db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    return assignment_service.할당받기(db, workspace, domain, from_line, to_line, current["user_id"])

@라우터.post("/complete")
def 완료(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    return assignment_service.완료처리(db, workspace, domain, current["user_id"])

@라우터.post("/reset")
def 초기화(workspace: str = Query(...), domain: str = Query(...),
          db: Session = Depends(DB세션), current: dict = Depends(현재사용자가져오기)):
    """keyword_assignments 데이터 삭제 + 프리징 상태 해제."""
    db.execute(text("DELETE FROM keyword_assignments WHERE workspace=:ws AND domain=:dom"),
               {"ws": workspace, "dom": domain})
    db.commit()
    deleted = db.execute(text("SELECT changes()")).scalar() or 0
    return {"reset": True, "deleted": deleted, "workspace": workspace, "domain": domain}
