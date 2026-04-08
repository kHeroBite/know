"""services/notification_service.py — WebSocket 사용자 알림 매니저"""
from __future__ import annotations

from typing import Dict, Set

from fastapi import WebSocket


class NotificationManager:
    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = set()
        self.connections[user_id].add(websocket)

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

    def connected_users(self) -> list[str]:
        return list(self.connections.keys())


notification_manager = NotificationManager()
