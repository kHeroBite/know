import os
import shutil
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import db_session
from api.auth import get_current_user
from services import assignment_service
from services.work_history_service import delete_all_history_service
from services.workspace_service import phase_forward, get_phase, set_user_phase, get_user_phase
from services import dictionary_service

라우터 = APIRouter()

@라우터.get("/status")
def get_task_status(workspace: str = Query(...), domain: str = Query(...),
            db: Session = Depends(db_session), current: dict = Depends(get_current_user)):
    """현재 워크스페이스 phase + 사용자 myPhase + get_stats 반환."""
    stats = assignment_service.get_stats(db, workspace, domain)
    user_id = current["user_id"]

    ws_phase = get_phase(workspace)
    my_phase = get_user_phase(db, workspace, domain, user_id)

    phase_val = ws_phase.get("phase") if isinstance(ws_phase, dict) else ws_phase
    my_phase_val = my_phase.get("phase") if isinstance(my_phase, dict) else my_phase

    return {"phase": phase_val, "my_phase": my_phase_val, "stats": stats}

@라우터.post("/freeze")
def freeze_service(workspace: str = Query(...), domain: str = Query(...),
          db: Session = Depends(db_session), current: dict = Depends(get_current_user)):
    return assignment_service.freeze_service(db, workspace, domain)

@라우터.get("/list")
def list_tasks(workspace: str = Query(...), domain: str = Query(...),
         filter: str = Query("pending"), page: int = Query(1), size: int = Query(50),
         assigned_to: Optional[str] = Query(None),
         db: Session = Depends(db_session), _: dict = Depends(get_current_user)):
    return assignment_service.list_keywords(db, workspace, domain, filter, page, size, assigned_to=assigned_to)

@라우터.get("/last-read")
def get_last_read_position(workspace: str = Query(...), domain: str = Query(...),
                   size: int = Query(100),
                   db: Session = Depends(db_session), current: dict = Depends(get_current_user)):
    """마지막으로 읽은 키워드의 위치(페이지) 반환."""
    return assignment_service.get_last_read_position(db, workspace, domain, current["user_id"], size)

@라우터.get("/stats")
def get_stats(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(db_session), _: dict = Depends(get_current_user)):
    return assignment_service.get_stats(db, workspace, domain)

@라우터.post("/assign")
def assign(workspace: str = Query(...), domain: str = Query(...),
         from_line: int = Query(...), to_line: int = Query(...),
         db: Session = Depends(db_session), current: dict = Depends(get_current_user)):
    result = assignment_service.get_assignment(db, workspace, domain, from_line, to_line, current["user_id"])
    # 사이드이펙트: assign 성공 시 myPhase → working
    set_user_phase(db, workspace, domain, current["user_id"], "working")
    return result

@라우터.put("/flag")
def update_flag(
    keyword_id: int = Query(...),
    flag: str = Query(...),
    workspace: str = Query(...),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """키워드 읽음/작업complete flag 업데이트."""
    return assignment_service.update_flag_service_ws(db, workspace, keyword_id, flag, current["user_id"])

def _after_complete_side_effects(db: Session, workspace: str, domain: str, user_id: str) -> None:
    """complete 이벤트 후 myPhase=done + 100% complete 시 phase→build 전이."""
    set_user_phase(db, workspace, domain, user_id, "done")
    stats = assignment_service.get_stats(db, workspace, domain)
    total = stats.get("total", 0)
    completed = stats.get("completed", 0)
    if total > 0 and completed >= total:
        try:
            phase_forward(workspace, "build")
        except Exception:
            # 이미 build 이상이거나 전이 불가 상태면 무시
            pass


@라우터.post("/complete")
def complete(workspace: str = Query(...), domain: str = Query(...),
         db: Session = Depends(db_session), current: dict = Depends(get_current_user)):
    result = assignment_service.process_complete(db, workspace, domain, current["user_id"])
    _after_complete_side_effects(db, workspace, domain, current["user_id"])
    return result


class 완료모드요청(BaseModel):
    workspace: str
    domain: str
    mode: str  # all_complete | all_incomplete | by_history


class 일괄등록요청(BaseModel):
    domain: str  # site 이름 (예: EPOST, MALL)
    dic_type: str  # udic 또는 cndic
    keywords: List[str]  # 등록할 단어 목록


class 일괄삭제요청(BaseModel):
    domain: str  # site 이름
    dic_type: str  # udic 또는 cndic
    words: List[str]  # 삭제할 단어 목록


@라우터.post("/complete-with-mode")
def complete_mode(body: 완료모드요청, db: Session = Depends(db_session),
                  current: dict = Depends(get_current_user)):
    """작업complete 모드별 처리: all_complete / all_incomplete / by_history."""
    result = assignment_service.process_complete_mode(db, body.workspace, body.domain, current["user_id"], body.mode)
    _after_complete_side_effects(db, body.workspace, body.domain, current["user_id"])
    mode_labels = {
        "all_complete": "전체 process_complete",
        "all_incomplete": "전체 미process_complete",
        "by_history": "작업이력대로 process_complete",
    }
    return {"success": True, "message": mode_labels.get(body.mode, body.mode), **result}

@라우터.post("/bulk-register")
def bulk_register_keywords(
    body: 일괄등록요청,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """다중 키워드 일괄 사전 등록."""
    items = [{"word": w} for w in body.keywords]
    result = dictionary_service.bulk_add_items(
        db, body.domain, body.dic_type, items, user_id=current["user_id"]
    )
    return result


@라우터.post("/bulk-delete")
def bulk_delete_keywords(
    body: 일괄삭제요청,
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user),
):
    """다중 키워드 일괄 삭제."""
    deleted = 0
    errors = []
    for word in body.words:
        try:
            dictionary_service.delete_dict_item_service(db, body.domain, body.dic_type, word)
            deleted += 1
        except Exception as e:
            errors.append({"word": word, "error": str(e)})
    return {"deleted": deleted, "errors": errors}



@라우터.get("/keyword/{keyword_id}")
def get_keyword(
    keyword_id: int,
    workspace: str = Query(...),
    db: Session = Depends(db_session),
    _: dict = Depends(get_current_user),
):
    """키워드 단건 조회 — 빌드 완료 후 분석결과 즉시 갱신용."""
    row = db.execute(
        text(
            "SELECT id, line_num, keyword, analysis, full_analysis, status, "
            "assigned_to, assigned_at, completed_at, flag "
            "FROM keyword_assignments "
            "WHERE workspace=:ws AND id=:kid"
        ),
        {"ws": workspace, "kid": keyword_id},
    ).fetchone()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="키워드를 찾을 수 없습니다")
    return {
        "id": row[0],
        "line_num": row[1],
        "keyword": row[2],
        "analysis": row[3] or "",
        "full_analysis": row[4] or "",
        "status": row[5],
        "assigned_to": row[6],
        "assigned_at": str(row[7]) if row[7] else None,
        "completed_at": str(row[8]) if row[8] else None,
        "flag": row[9] or "",
    }

@라우터.put("/last-selected")
def save_last_selected_api(
    keyword_id: int = Query(...),
    workspace: str = Query(...),
    domain: str = Query(...),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user)
):
    """마지막 선택 키워드 저장"""
    from services.assignment_service import save_last_selected
    save_last_selected(db, current["user_id"], workspace, domain, keyword_id)
    return {"ok": True}


@라우터.get("/last-selected")
def get_last_selected_api(
    workspace: str = Query(...),
    domain: str = Query(...),
    db: Session = Depends(db_session),
    current: dict = Depends(get_current_user)
):
    """마지막 선택 키워드 조회"""
    from services.assignment_service import get_last_selected
    return get_last_selected(db, current["user_id"], workspace, domain)


@라우터.post("/reset")
def initialize(workspace: str = Query(...), domain: str = Query(...),
          db: Session = Depends(db_session), current: dict = Depends(get_current_user)):
    """데이터 전처리 데이터 완전 삭제: keyword_assignments + phase1 + build_history + work_history + 파일."""
    try:
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
    except Exception:
        db.rollback()
        raise

    # 5. work_history 삭제 (서비스 내부에서 commit 처리)
    delete_all_history_service(db, workspace, domain)

    # 6. 업로드 파일 정리 (popular / fails 폴더 내 파일 삭제)
    from core.constants import WORKSPACE_BASE
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
