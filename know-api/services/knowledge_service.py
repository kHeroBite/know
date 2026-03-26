"""services/knowledge_service.py — 지식작업 비즈니스 로직 서비스"""
from __future__ import annotations
import csv
import io
import logging
import os
import uuid
from typing import List

import aiofiles
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from models.pipeline import TaskAssignment

logger = logging.getLogger(__name__)
_UPLOAD_DIR = "/home/know/apps/know-api/uploads/"

# 파일업로드 시 미리보기 행 수
_PREVIEW_ROWS = 5


class KnowledgeService:
    def _업로드디렉토리확인(self, upload_dir: str) -> None:
        os.makedirs(upload_dir, exist_ok=True)

    def _csv파일파싱(self, 저장경로: str) -> tuple:
        """CSV 파일을 파싱하여 (row_count, removed_count, preview) 반환.

        - row_count: 유효 데이터 행 수 (헤더 제외, 빈 행 제외)
        - removed_count: 빈 행(모든 컬럼이 비어있는 행) 수
        - preview: 상위 _PREVIEW_ROWS 개 행의 dict 목록
        """
        try:
            with open(저장경로, "r", encoding="utf-8-sig", errors="replace") as f:
                content = f.read()
        except Exception as exc:
            logger.warning("CSV 파싱 실패 %s: %s", 저장경로, exc)
            return 0, 0, []

        reader = csv.DictReader(io.StringIO(content))
        미리보기 = []
        유효행수 = 0
        제거행수 = 0
        for row in reader:
            # 모든 값이 공백이면 빈 행으로 간주
            if all(v is None or str(v).strip() == "" for v in row.values()):
                제거행수 += 1
                continue
            유효행수 += 1
            if len(미리보기) < _PREVIEW_ROWS:
                미리보기.append(dict(row))
        return 유효행수, 제거행수, 미리보기

    async def 파일업로드(self, file: UploadFile, upload_dir: str = _UPLOAD_DIR) -> dict:
        """aiofiles 비동기 저장 + UUID prefix로 파일명 충돌 방지.

        반환 형식 (프론트엔드 스펙):
          file_id: int (저장된 파일의 고유 ID — UUID hex 앞 8자리 정수)
          row_count: int (유효 데이터 행 수)
          removed_count: int (제거된 빈 행 수)
          preview: list (상위 5행 미리보기)
        """
        self._업로드디렉토리확인(upload_dir)
        원본파일명 = file.filename or "upload"
        uuid_hex = uuid.uuid4().hex
        저장파일명 = f"{uuid_hex}_{원본파일명}"
        저장경로 = os.path.join(upload_dir, 저장파일명)
        try:
            async with aiofiles.open(저장경로, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    await f.write(chunk)
        except Exception as exc:
            logger.error("파일 업로드 실패 %s: %s", 저장경로, exc)
            if os.path.exists(저장경로):
                os.remove(저장경로)
            raise HTTPException(status_code=500, detail=f"파일 저장 오류: {exc}")

        # CSV 파일인 경우 파싱하여 row_count/removed_count/preview 계산
        lower_name = 원본파일명.lower()
        if lower_name.endswith(".csv"):
            row_count, removed_count, preview = self._csv파일파싱(저장경로)
        else:
            # Excel 등 비CSV: 크기 정보만 기록하고 placeholder 반환
            파일크기 = os.path.getsize(저장경로)
            row_count = 0
            removed_count = 0
            preview = []
            logger.info("비CSV 파일 업로드: %s, 크기=%d bytes", 원본파일명, 파일크기)

        # file_id: UUID hex 앞 8자리를 16진수 정수로 변환 (고유 식별자)
        file_id = int(uuid_hex[:8], 16)

        logger.info(
            "파일업로드 완료: %s → file_id=%d, row_count=%d, removed_count=%d",
            원본파일명, file_id, row_count, removed_count,
        )
        return {
            "file_id": file_id,
            "row_count": row_count,
            "removed_count": removed_count,
            "preview": preview,
            # 내부 참조용 (프론트엔드 무관)
            "original_filename": 원본파일명,
            "saved_filename": 저장파일명,
            "saved_path": 저장경로,
        }

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
