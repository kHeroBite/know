"""작업이력 서비스 — work_history 테이블 CRUD + undo 로직."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import MetaData, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from models.dictionary import 사전테이블가져오기


def 이력목록조회(db: Session, workspace: str, domain: str, user_id: str) -> dict:
    """사용자별 작업이력 목록 조회 + 현재 할당 시작시간."""
    rows = db.execute(
        text(
            "SELECT id, workspace, domain, user_id, action_type, dic_type, "
            "word, memo, head_word, tail_word, undone, created_at "
            "FROM work_history "
            "WHERE workspace=:ws AND domain=:dom AND user_id=:uid "
            "ORDER BY id DESC"
        ),
        {"ws": workspace, "dom": domain, "uid": user_id},
    ).mappings().all()
    items = [dict(r) for r in rows]
    # 현재 할당 세션의 시작시간 (가장 이른 assigned_at)
    assigned_at = db.execute(
        text(
            "SELECT MIN(assigned_at) FROM keyword_assignments "
            "WHERE workspace=:ws AND domain=:dom AND assigned_to=:uid AND status='assigned'"
        ),
        {"ws": workspace, "dom": domain, "uid": user_id},
    ).scalar()
    return {"items": items, "total": len(items), "assigned_at": assigned_at}


def 이력추가(
    db: Session,
    workspace: str,
    domain: str,
    user_id: str,
    action_type: str,
    dic_type: str,
    word: Optional[str] = None,
    memo: Optional[str] = None,
    head_word: Optional[str] = None,
    tail_word: Optional[str] = None,
) -> dict:
    """작업이력 기록 추가."""
    result = db.execute(
        text(
            "INSERT INTO work_history "
            "(workspace, domain, user_id, action_type, dic_type, word, memo, head_word, tail_word) "
            "VALUES (:ws, :dom, :uid, :act, :dic, :word, :memo, :hw, :tw)"
        ),
        {
            "ws": workspace,
            "dom": domain,
            "uid": user_id,
            "act": action_type,
            "dic": dic_type,
            "word": word,
            "memo": memo,
            "hw": head_word,
            "tw": tail_word,
        },
    )
    db.commit()
    return {"id": result.lastrowid, "message": "기록 완료"}


def 이력취소(db: Session, history_id: int, user_id: str) -> dict:
    """작업 취소/롤백 — undo 로직.

    1. work_history에서 해당 id 조회
    2. action_type='add'이면 → 사전에서 해당 단어 DELETE
    3. action_type='delete'이면 → 사전에 해당 단어 INSERT
    4. undone=1로 마킹
    """
    row = db.execute(
        text("SELECT * FROM work_history WHERE id=:id AND user_id=:uid"),
        {"id": history_id, "uid": user_id},
    ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="작업이력을 찾을 수 없습니다",
        )

    if row["undone"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 취소된 작업입니다",
        )

    domain = row["domain"]
    dic_type = row["dic_type"]
    action_type = row["action_type"]
    meta = MetaData()

    if dic_type in ("udic", "cndic"):
        tbl = 사전테이블가져오기(domain.upper(), dic_type, meta)
        # word NULL 시 head_word → tail_word 순서로 fallback
        word_to_use = row["word"] or row["head_word"] or row["tail_word"]
        try:
            if action_type == "add":
                # 추가했던 단어를 삭제 — NULL = NULL은 SQL에서 FALSE이므로 word_to_use 사용
                if word_to_use:
                    db.execute(tbl.delete().where(tbl.c._WORD == word_to_use))
            elif action_type == "delete":
                # 삭제했던 단어를 복원
                if word_to_use:
                    db.execute(tbl.insert().values(
                        _WORD=word_to_use,
                        _MEMO=row["memo"],
                        _USER_ID=user_id,
                        _UPDATED=datetime.now(),
                    ))
        except OperationalError:
            pass  # 테이블 미존재 시 graceful 처리
    elif dic_type == "thesaurus":
        tbl = 사전테이블가져오기(domain.upper(), "thesaurus", meta)
        try:
            if action_type == "add":
                db.execute(tbl.delete().where(tbl.c._HEAD_WORD == row["head_word"]))
            elif action_type == "delete":
                db.execute(tbl.insert().values(
                    _HEAD_WORD=row["head_word"],
                    _TAIL_WORD=row["tail_word"],
                    _MEMO=row["memo"],
                    _USER_ID=user_id,
                    _UPDATED=datetime.now(),
                ))
        except OperationalError:
            pass  # 테이블 미존재 시 graceful 처리

    # undone 마킹
    db.execute(
        text("UPDATE work_history SET undone=1 WHERE id=:id"),
        {"id": history_id},
    )
    db.commit()

    reversed_action = "delete" if action_type == "add" else "add"
    return {"message": "취소 완료", "reversed_action": reversed_action}


def 이력전체삭제(db: Session, workspace: str, domain: str) -> dict:
    """워크스페이스 해제 시 전체 이력 삭제."""
    result = db.execute(
        text("DELETE FROM work_history WHERE workspace=:ws AND domain=:dom"),
        {"ws": workspace, "dom": domain},
    )
    db.commit()
    return {"message": f"이력 {result.rowcount}건 삭제 완료"}
