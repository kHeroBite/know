from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import DB세션
from api.auth import 현재사용자가져오기
from services import assignment_service

라우터 = APIRouter()

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
