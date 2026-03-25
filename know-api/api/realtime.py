"""api/realtime.py — WebSocket + SSE 실시간 스트리밍"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

라우터 = APIRouter(tags=["실시간"])

# Redis 연결 설정
_REDIS_HOST = "localhost"
_REDIS_PORT = 6379
_REDIS_DB = 0


def _redis_url() -> str:
    return f"redis://{_REDIS_HOST}:{_REDIS_PORT}/{_REDIS_DB}"


# ──────────────────────────────────────────────
# WebSocket — 파이프라인 이벤트
# ──────────────────────────────────────────────

@라우터.websocket("/ws/pipeline/{pipeline_id}")
async def pipeline_ws(pipeline_id: int, ws: WebSocket):
    """Redis pub/sub 채널 구독 → WebSocket으로 메시지 전달

    채널명: pipeline:{pipeline_id}
    """
    await ws.accept()
    channel = f"pipeline:{pipeline_id}"
    redis_client = aioredis.from_url(_redis_url(), decode_responses=True)
    pubsub = redis_client.pubsub()

    try:
        await pubsub.subscribe(channel)
        logger.info("WebSocket 연결: channel=%s", channel)

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = message["data"]
                await ws.send_text(data)
            except WebSocketDisconnect:
                logger.info("WebSocket 연결 종료: channel=%s", channel)
                break
            except Exception as exc:
                logger.warning("WebSocket 전송 오류: %s", exc)
                break
    except WebSocketDisconnect:
        logger.info("WebSocket 클라이언트 연결 해제: channel=%s", channel)
    except Exception as exc:
        logger.error("WebSocket 오류: channel=%s, err=%s", channel, exc)
        try:
            await ws.send_text(json.dumps({"error": str(exc)}))
        except Exception:
            pass
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await redis_client.aclose()
        except Exception:
            pass


# ──────────────────────────────────────────────
# WebSocket — 빌드 로그 스트리밍
# ──────────────────────────────────────────────

@라우터.websocket("/ws/build/{domain}")
async def build_ws(domain: str, ws: WebSocket):
    """빌드 로그 실시간 스트리밍

    채널명: build:{domain}
    """
    await ws.accept()
    channel = f"build:{domain}"
    redis_client = aioredis.from_url(_redis_url(), decode_responses=True)
    pubsub = redis_client.pubsub()

    try:
        await pubsub.subscribe(channel)
        logger.info("빌드 WebSocket 연결: channel=%s", channel)

        # ping 태스크 (30초 간격 연결 유지)
        async def _ping():
            while True:
                await asyncio.sleep(30)
                try:
                    await ws.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break

        ping_task = asyncio.create_task(_ping())

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    await ws.send_text(message["data"])
                except WebSocketDisconnect:
                    break
                except Exception as exc:
                    logger.warning("빌드 WebSocket 전송 오류: %s", exc)
                    break
        finally:
            ping_task.cancel()

    except WebSocketDisconnect:
        logger.info("빌드 WebSocket 클라이언트 연결 해제: channel=%s", channel)
    except Exception as exc:
        logger.error("빌드 WebSocket 오류: channel=%s, err=%s", channel, exc)
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await redis_client.aclose()
        except Exception:
            pass


# ──────────────────────────────────────────────
# SSE fallback — 파이프라인 스트리밍
# ──────────────────────────────────────────────

@라우터.get("/api/stream/pipeline/{pipeline_id}")
async def stream_pipeline(pipeline_id: int):
    """Server-Sent Events (SSE) fallback

    WebSocket 미지원 환경을 위한 SSE 폴백 엔드포인트.
    Accept: text/event-stream 으로 호출.
    """
    channel = f"pipeline:{pipeline_id}"

    async def _event_generator() -> AsyncGenerator[str, None]:
        redis_client = aioredis.from_url(_redis_url(), decode_responses=True)
        pubsub = redis_client.pubsub()
        try:
            await pubsub.subscribe(channel)
            # 연결 확인 이벤트
            yield f"data: {json.dumps({'type': 'connected', 'pipeline_id': pipeline_id})}\n\n"

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = message["data"]
                # SSE 포맷
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("SSE 스트리밍 오류: channel=%s, err=%s", channel, exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
                await redis_client.aclose()
            except Exception:
                pass

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
