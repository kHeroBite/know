# core/celery.py — Celery 앱 설정 (broker: Redis, backend: Redis)
from celery import Celery

celery_app = Celery(
    "know",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)

celery_app.conf.update(
    # 워커 동시성: subprocess 형태소분석/빌드가 CPU 집약적이므로 1로 제한
    worker_concurrency=1,
    # 직렬화 설정
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # 타임아웃: soft 30분, hard 1시간
    task_soft_time_limit=1800,
    task_time_limit=3600,
    # 결과 보존 시간: 24시간
    result_expires=86400,
    # 태스크 추적 활성화
    task_track_started=True,
    # 워커 prefetch 비활성화 (순차 처리 보장)
    worker_prefetch_multiplier=1,
    # timezone
    timezone="Asia/Seoul",
    enable_utc=False,
)
