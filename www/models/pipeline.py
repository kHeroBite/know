# models/pipeline.py — Phase 3 파이프라인 관련 SQLAlchemy 모델 (5개 테이블)
from sqlalchemy import (
    Column, Integer, String, Text,
    DateTime, func
)
from core.database import Base


class PipelineHistory(Base):
    __tablename__ = "pipeline_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    current_stage = Column(String(20), nullable=True)
    celery_task_id = Column(String(200), nullable=True)
    started_at = Column(DateTime, nullable=False, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    started_by = Column(Integer, nullable=True)
    input_file = Column(String(500), nullable=True)
    result_summary = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    approved_stages = Column(Text, nullable=True)


class PipelineStageLog(Base):
    __tablename__ = "pipeline_stage_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_id = Column(Integer, nullable=False, index=True)
    stage = Column(String(20), nullable=False)
    status = Column(String(30), nullable=False, default="pending")
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    input_count = Column(Integer, nullable=True)
    output_count = Column(Integer, nullable=True)
    log_text = Column(Text, nullable=True)


class TaskAssignment(Base):
    __tablename__ = "task_assignment"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_id = Column(Integer, nullable=False)
    assignee_id = Column(Integer, nullable=True)
    assigned_at = Column(DateTime, nullable=False, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="assigned")
    item_start = Column(Integer, nullable=False)
    item_end = Column(Integer, nullable=False)
    item_count = Column(Integer, nullable=False)


class BuildHistory(Base):
    """빌드 이력 감사 로그 — 누적 영구 보존 (reset/release에서 삭제 금지)"""
    __tablename__ = "build_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String(50), nullable=False, index=True)
    build_type = Column(String(20), nullable=False, default="full")
    status = Column(String(20), nullable=False, default="running")
    started_at = Column(DateTime, nullable=False, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    started_by = Column(Integer, nullable=True)
    output_path = Column(String(500), nullable=True)
    file_size = Column(Integer, nullable=True)
    entry_count = Column(Integer, nullable=True)
    log_text = Column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    action = Column(String(50), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id = Column(String(100), nullable=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, nullable=False, default=func.now(), index=True)
