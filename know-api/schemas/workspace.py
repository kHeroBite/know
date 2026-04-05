from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel


# 워크스페이스 전체 phase (4단계 순방향 전이)
WorkspacePhase = Literal["preprocess", "work", "build", "verify"]

# 사용자 개인 phase (작업실 내 상태)
MyPhase = Literal["idle", "working", "done"]


class PhaseAdvanceRequest(BaseModel):
    """워크스페이스 phase 전이 요청."""
    to: WorkspacePhase


class WorkspacePhaseResponse(BaseModel):
    """워크스페이스 phase 전이 응답."""
    name: str
    phase: WorkspacePhase
    prev: Optional[WorkspacePhase] = None


class MyPhaseRequest(BaseModel):
    """사용자 개인 phase 변경 요청."""
    domain: str
    phase: MyPhase


class MyPhaseResponse(BaseModel):
    """사용자 개인 phase 응답."""
    workspace: str
    domain: str
    user_id: str
    phase: MyPhase
