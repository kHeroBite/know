"""services/knowledge_service.py — 지식작업 비즈니스 로직 서비스"""
from __future__ import annotations
import logging, os, uuid
from typing import List
import aiofiles
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from models.pipeline import TaskAssignment

logger = logging.getLogger(__name__)
_UPLOAD_DIR = "/home/know/apps/know-api/uploads/"

class KnowledgeService:
    def _업로드디렉토리확인(self, upload_dir: str) -> None:
        os.makedirs(upload_dir, exist_ok=True)

    async def 파일업로드(self, file: UploadFile, upload_dir: str = _UPLOAD_DIR) -> dict:
        """aiofiles 비동기 저장 + UUID prefix로 파일명 충돌 방지"""
        self._업로드디렉토리확인(upload_dir)
        원본파일명 = file.filename or "upload"
        저장파일명 = f"{uuid.uuid4().hex}_{원본파일명}"
        저장경로 = os.path.join(upload_dir, 저장파일명)
        try:
            async with aiofiles.open(저장경로, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk: break
                    await f.write(chunk)
        except Exception as exc:
            logger.error("파일 업로드 실패 %s: %s", 저장경로, exc)
            if os.path.exists(저장경로): os.remove(저장경로)
            raise HTTPException(status_code=500, detail=f"파일 저장 오류: {exc}")
        파일크기 = os.path.getsize(저장경로)
        return {"original_filename": 원본파일명, "saved_filename": 저장파일명, "saved_path": 저장경로, "size": 파일크기}

    def 작업분배(self, db: Session, pipeline_id: int, assignments: List[dict]) -> dict:
        """TaskAssignment 복수 생성"""
        if not assignments:
            raise HTTPException(status_code=400, detail="분배 항목이 없습니다.")
        생성목록 = []
        for 항목 in assignments:
            item_start = 항목.get("item_start", 0); item_end = 항목.get("item_end", 0)
            item_count = item_end - item_start + 1 if item_end >= item_start else 0
            if item_count <= 0:
                raise HTTPException(status_code=400, detail=f"item_start({item_start}) > item_end({item_end}) 오류")
            task = TaskAssignment(pipeline_id=pipeline_id, assignee_id=항목.get("assignee_id"), item_start=item_start, item_end=item_end, item_count=item_count, status="assigned")
            db.add(task); 생성목록.append(task)
        db.commit()
        for t in 생성목록: db.refresh(t)
        return {"pipeline_id": pipeline_id, "created": len(생성목록), "assignments": [{"task_id": t.id, "assignee_id": t.assignee_id, "item_start": t.item_start, "item_end": t.item_end, "item_count": t.item_count, "status": t.status} for t in 생성목록]}

    def 내작업목록(self, db: Session, user_id: int, page: int = 1, size: int = 20) -> dict:
        """TaskAssignment 페이지네이션"""
        if page < 1: page = 1
        if size < 1 or size > 100: size = 20
        offset = (page - 1) * size
        total = db.query(TaskAssignment).filter_by(assignee_id=user_id).count()
        rows = db.query(TaskAssignment).filter_by(assignee_id=user_id).order_by(TaskAssignment.id.desc()).offset(offset).limit(size).all()
        return {"total": total, "page": page, "size": size, "items": [{"task_id": t.id, "pipeline_id": t.pipeline_id, "assignee_id": t.assignee_id, "status": t.status, "item_start": t.item_start, "item_end": t.item_end, "item_count": t.item_count, "assigned_at": t.assigned_at.isoformat() if t.assigned_at else None, "completed_at": t.completed_at.isoformat() if t.completed_at else None} for t in rows]}

knowledge_service = KnowledgeService()
