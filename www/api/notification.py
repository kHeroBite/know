"""api/notification.py — WebSocket 사용자 알림 엔드포인트"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from api.auth import get_current_user
from services.notification_service import notification_manager

라우터 = APIRouter(prefix="/api/notifications", tags=["알림"])


@라우터.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """사용자별 WebSocket 알림 채널 연결.

    연결 후 ping 메시지를 수신하면 pong 응답.
    """
    await notification_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notification_manager.disconnect(websocket, user_id)
    except Exception:
        notification_manager.disconnect(websocket, user_id)


@라우터.post("/broadcast")
async def broadcast_notification(
    message: dict,
    _current: dict = Depends(get_current_user),
):
    """관리자용 전체 사용자 브로드캐스트."""
    await notification_manager.broadcast(message)
    return {"sent": True, "connected_users": notification_manager.connected_users()}


@라우터.post("/send/{user_id}")
async def send_to_user(
    user_id: str,
    message: dict,
    _current: dict = Depends(get_current_user),
):
    """특정 사용자에게 알림 전송."""
    await notification_manager.send_to_user(user_id, message)
    return {"sent": True, "user_id": user_id}


@라우터.get("/connections")
def get_connections(
    _current: dict = Depends(get_current_user),
):
    """현재 연결된 사용자 목록 조회."""
    return {"connected_users": notification_manager.connected_users()}
