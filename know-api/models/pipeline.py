# models/pipeline.py — Phase 3 파이프라인 관련 SQLAlchemy 모델 (5개 테이블)
from sqlalchemy import (
    Column, BigInteger, Integer, String, Text,
    DateTime, Enum, func
)
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from core.database import Base


class PipelineHistory(Base):
    """파이프라인 실행 이력 테이블"""
    __tablename__ = "pipeline_history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    domain = Column(String(50), nullable=False)
    status = Column(
        Enum("pending", "running", "paused", "completed", "failed", "cancelled"),
        nullable=False,
        default="pending",
    )
    current_stage = Column(String(20), nullable=True)
    celery_task_id = Column(String(200), nullable=True)
    started_at = Column(DateTime, nullable=False, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    started_by = Column(Integer, nullable=True)
    input_file = Column(String(500), nullable=True)
    result_summary = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    def __repr__(self):
        return f"<PipelineHistory id={self.id} domain={self.domain} status={self.status}>"


class PipelineStageLog(Base):
    """파이프라인 단계별 로그 테이블"""
    __tablename__ = "pipeline_stage_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    pipeline_id = Column(BigInteger, nullable=False, index=True)
    stage = Column(String(20), nullable=False)
    status = Column(
        Enum("pending", "running", "waiting_approval", "completed", "failed", "skipped"),
        nullable=False,
        default="pending",
    )
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    input_count = Column(Integer, nullable=True)
    output_count = Column(Integer, nullable=True)
    log_text = Column(MEDIUMTEXT, nullable=True)

    def __repr__(self):
        return f"<PipelineStageLog id={self.id} pipeline_id={self.pipeline_id} stage={self.stage}>"


class TaskAssignment(Base):
    """작업 분배 테이블 (담당자별 처리 범위)"""
    __tablename__ = "task_assignment"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    pipeline_id = Column(BigInteger, nullable=False)
    assignee_id = Column(Integer, nullable=True)
    assigned_at = Column(DateTime, nullable=False, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    status = Column(
        Enum("assigned", "in_progress", "completed"),
        nullable=False,
        default="assigned",
    )
    item_start = Column(Integer, nullable=False)
    item_end = Column(Integer, nullable=False)
    item_count = Column(Integer, nullable=False)

    def __repr__(self):
        return (
            f"<TaskAssignment id={self.id} pipeline_id={self.pipeline_id} "
            f"assignee_id={self.assignee_id} status={self.status}>"
        )


class BuildHistory(Base):
    """사전 빌드 이력 테이블"""
    __tablename__ = "build_history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    domain = Column(String(50), nullable=False, index=True)
    build_type = Column(String(20), nullable=False, default="full")
    status = Column(
        Enum("running", "completed", "failed"),
        nullable=False,
        default="running",
    )
    started_at = Column(DateTime, nullable=False, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    started_by = Column(Integer, nullable=True)
    output_path = Column(String(500), nullable=True)
    file_size = Column(BigInteger, nullable=True)
    entry_count = Column(Integer, nullable=True)
    log_text = Column(MEDIUMTEXT, nullable=True)

    def __repr__(self):
        return f"<BuildHistory id={self.id} domain={self.domain} status={self.status}>"


class AuditLog(Base):
    """감사 로그 테이블 (사용자 액션 추적)"""
    __tablename__ = "audit_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    action = Column(String(50), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id = Column(String(100), nullable=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, nullable=False, default=func.now(), index=True)

    def __repr__(self):
        return f"<AuditLog id={self.id} user_id={self.user_id} action={self.action}>"
