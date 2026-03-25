"""services/pipeline_service.py — 파이프라인 비즈니스 로직 서비스"""
from __future__ import annotations
import logging
from typing import Optional
import redis
from fastapi import HTTPException
from sqlalchemy.orm import Session
from models.pipeline import PipelineHistory, PipelineStageLog

logger = logging.getLogger(__name__)
_APPROVE_KEY = "approve:{pipeline_id}:{stage}"

def _redis_client() -> redis.Redis:
    return redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)

class PipelineService:
    def 파이프라인시작(self, db: Session, domain: str, file_path: str, started_by=None) -> dict:
        실행중 = (db.query(PipelineHistory).filter(PipelineHistory.domain == domain).filter(PipelineHistory.status.in_(["pending","running","paused"])).first())
        if 실행중:
            raise HTTPException(status_code=409, detail=f"도메인 '{domain}'에 이미 실행 중인 파이프라인이 있습니다. (id={실행중.id})")
        pipeline = PipelineHistory(domain=domain, status="pending", input_file=file_path, started_by=started_by)
        db.add(pipeline); db.commit(); db.refresh(pipeline)
        try:
            from pipeline.tasks import run_pipeline
            async_result = run_pipeline(pipeline_id=pipeline.id, file_path=file_path, domain=domain)
            pipeline.celery_task_id = async_result.id; pipeline.status = "running"; db.commit()
        except Exception as exc:
            logger.error("파이프라인 시작 실패 pipeline_id=%s: %s", pipeline.id, exc)
            pipeline.status = "failed"; pipeline.error_message = str(exc); db.commit()
            raise HTTPException(status_code=500, detail=f"파이프라인 시작 오류: {exc}")
        return {"pipeline_id": pipeline.id, "domain": pipeline.domain, "status": pipeline.status, "celery_task_id": pipeline.celery_task_id}

    def 파이프라인상태(self, db: Session, pipeline_id: int) -> dict:
        pipeline = db.query(PipelineHistory).filter_by(id=pipeline_id).first()
        if not pipeline:
            raise HTTPException(status_code=404, detail=f"파이프라인 id={pipeline_id} 없음")
        stage_logs = db.query(PipelineStageLog).filter_by(pipeline_id=pipeline_id).order_by(PipelineStageLog.id).all()
        return {
            "pipeline_id": pipeline.id, "domain": pipeline.domain, "status": pipeline.status,
            "current_stage": pipeline.current_stage, "celery_task_id": pipeline.celery_task_id,
            "started_at": pipeline.started_at.isoformat() if pipeline.started_at else None,
            "completed_at": pipeline.completed_at.isoformat() if pipeline.completed_at else None,
            "started_by": pipeline.started_by, "input_file": pipeline.input_file,
            "result_summary": pipeline.result_summary, "error_message": pipeline.error_message,
            "stages": [{"stage": s.stage, "status": s.status, "started_at": s.started_at.isoformat() if s.started_at else None, "completed_at": s.completed_at.isoformat() if s.completed_at else None, "input_count": s.input_count, "output_count": s.output_count} for s in stage_logs],
        }

    def 파이프라인승인(self, db: Session, pipeline_id: int, stage: str, approved_by: str) -> dict:
        pipeline = db.query(PipelineHistory).filter_by(id=pipeline_id).first()
        if not pipeline:
            raise HTTPException(status_code=404, detail=f"파이프라인 id={pipeline_id} 없음")
        if pipeline.status == "cancelled":
            raise HTTPException(status_code=400, detail="취소된 파이프라인은 승인할 수 없습니다.")
        try:
            r = _redis_client()
            key = _APPROVE_KEY.format(pipeline_id=pipeline_id, stage=stage)
            r.set(key, approved_by, ex=86400)
            logger.info("파이프라인 승인 설정 key=%s by=%s", key, approved_by)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Redis 승인 처리 오류: {exc}")
        return {"pipeline_id": pipeline_id, "stage": stage, "approved_by": approved_by, "message": f"'{stage}' 단계 승인 완료"}

    def 파이프라인취소(self, db: Session, pipeline_id: int) -> dict:
        pipeline = db.query(PipelineHistory).filter_by(id=pipeline_id).first()
        if not pipeline:
            raise HTTPException(status_code=404, detail=f"파이프라인 id={pipeline_id} 없음")
        if pipeline.status in ("completed", "failed", "cancelled"):
            raise HTTPException(status_code=400, detail=f"이미 종료된 파이프라인입니다. (status={pipeline.status})")
        if pipeline.celery_task_id:
            try:
                from core.celery import celery_app
                celery_app.control.revoke(pipeline.celery_task_id, terminate=True)
            except Exception as exc:
                logger.warning("Celery revoke 실패: %s", exc)
        from datetime import datetime
        pipeline.status = "cancelled"; pipeline.completed_at = datetime.now()
        pipeline.error_message = "사용자 요청으로 취소"; db.commit()
        return {"pipeline_id": pipeline_id, "status": "cancelled", "message": "파이프라인이 취소되었습니다."}

    def 파이프라인이력(self, db: Session, page: int = 1, size: int = 20) -> dict:
        if page < 1: page = 1
        if size < 1 or size > 100: size = 20
        offset = (page - 1) * size
        total = db.query(PipelineHistory).count()
        rows = db.query(PipelineHistory).order_by(PipelineHistory.id.desc()).offset(offset).limit(size).all()
        return {"total": total, "page": page, "size": size, "items": [{"pipeline_id": r.id, "domain": r.domain, "status": r.status, "current_stage": r.current_stage, "started_at": r.started_at.isoformat() if r.started_at else None, "completed_at": r.completed_at.isoformat() if r.completed_at else None, "started_by": r.started_by, "input_file": r.input_file, "result_summary": r.result_summary} for r in rows]}

pipeline_service = PipelineService()
