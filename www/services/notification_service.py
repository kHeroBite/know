"""services/notification_service.py — WebSocket 사용자 알림 매니저"""
from __future__ import annotations

from typing import Dict, Optional, Set

from fastapi import WebSocket


class NotificationManager:
    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}
        # 전역작업 현재 상태 (서버 메모리 — 새로고침 시 클라이언트 복원용)
        self._global_task: Optional[dict] = None

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = set()
        self.connections[user_id].add(websocket)
        # 연결 직후 현재 전역작업 상태 전송 (새로고침/신규 접속 복원)
        if self._global_task:
            try:
                await websocket.send_json(self._global_task)
            except Exception:
                pass

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.connections:
            self.connections[user_id].discard(websocket)
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        if user_id not in self.connections:
            return
        dead: Set[WebSocket] = set()
        for ws in list(self.connections[user_id]):
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self.connections[user_id] -= dead

    async def broadcast(self, message: dict):
        for user_id in list(self.connections.keys()):
            await self.send_to_user(user_id, message)

    async def broadcast_global_task(self, task: Optional[dict]):
        """전역작업 상태 변경 시 모든 클라이언트에 브로드캐스트 + 서버 상태 저장."""
        self._global_task = task
        msg = {"type": "global_task", "task": task}
        await self.broadcast(msg)

    def get_global_task(self) -> Optional[dict]:
        return self._global_task

    def connected_users(self) -> list[str]:
        return list(self.connections.keys())


notification_manager = NotificationManager()
