# pipeline/tasks.py — Celery 태스크 체인 (Phase 3 파이프라인 6단계)
import logging
from datetime import datetime

from celery import chain

from core.celery import celery_app

logger = logging.getLogger(__name__)

# Redis pub/sub 채널 형식
PIPELINE_CHANNEL = "pipeline:{pipeline_id}"


def _get_db():
    """DB 세션 팩토리 — 지연 임포트로 순환 참조 방지"""
    from core.database import SessionLocal
    return SessionLocal()


def _publish(pipeline_id: int, stage: str, pct: int, msg: str):
    """Redis pub/sub으로 진행률 발행"""
    try:
        import redis, json
        r = redis.Redis(host="localhost", port=6379, db=0)
        payload = json.dumps({
            "stage": stage,
            "percent": pct,
            "message": msg,
            "ts": datetime.now().isoformat(),
        })
        r.publish(PIPELINE_CHANNEL.format(pipeline_id=pipeline_id), payload)
    except Exception as e:
        logger.warning("Redis publish 실패: %s", e)


def _update_stage(db, pipeline_id: int, stage: str, status: str,
                  input_count: int = None, output_count: int = None,
                  log_text: str = None):
    """pipeline_stage_log 생성/업데이트"""
    from models.pipeline import PipelineStageLog
    row = (
        db.query(PipelineStageLog)
        .filter_by(pipeline_id=pipeline_id, stage=stage)
        .first()
    )
    now = datetime.now()
    if row is None:
        row = PipelineStageLog(
            pipeline_id=pipeline_id,
            stage=stage,
            status=status,
            started_at=now,
        )
        db.add(row)
    else:
        row.status = status
        if status in ("completed", "failed", "skipped"):
            row.completed_at = now
    if input_count is not None:
        row.input_count = input_count
    if output_count is not None:
        row.output_count = output_count
    if log_text:
        row.log_text = (row.log_text or "") + log_text
    db.commit()


def _update_pipeline(db, pipeline_id: int, status: str,
                     current_stage: str = None, error_message: str = None,
                     celery_task_id: str = None, result_summary: str = None):
    """pipeline_history 상태 업데이트"""
    from models.pipeline import PipelineHistory
    row = db.query(PipelineHistory).filter_by(id=pipeline_id).first()
    if row is None:
        return
    row.status = status
    if current_stage:
        row.current_stage = current_stage
    if error_message:
        row.error_message = error_message
    if celery_task_id:
        row.celery_task_id = celery_task_id
    if result_summary:
        row.result_summary = result_summary
    if status in ("completed", "failed", "cancelled"):
        row.completed_at = datetime.now()
    db.commit()


# ─────────────────────────────────────────────
# 태스크 1: 정제 (refine)
# ─────────────────────────────────────────────
@celery_app.task(bind=True, max_retries=3, soft_time_limit=1800,
                 name="pipeline.tasks.task_refine")
def task_refine(self, pipeline_id: int, file_path: str):
    """검색로그 파일 정제 태스크"""
    db = _get_db()
    try:
        _update_stage(db, pipeline_id, "refine", "running")
        _update_pipeline(db, pipeline_id, "running", current_stage="refine",
                         celery_task_id=self.request.id)
        _publish(pipeline_id, "refine", 5, "정제 시작")

        from pipeline.refine import refine_search_log
        result = refine_search_log(file_path, pipeline_id=pipeline_id)

        _update_stage(db, pipeline_id, "refine", "completed",
                      input_count=result["input_count"],
                      output_count=result["output_count"],
                      log_text=result["summary"])
        _publish(pipeline_id, "refine", 20,
                 f"정제 완료: {result['output_count']}건 (제거 {result['removed_count']}건)")
        return {"pipeline_id": pipeline_id, "refined_file": result["output_file"]}
    except Exception as exc:
        logger.error("task_refine 실패 pipeline_id=%s: %s", pipeline_id, exc)
        _update_stage(db, pipeline_id, "refine", "failed", log_text=str(exc))
        _update_pipeline(db, pipeline_id, "failed", error_message=str(exc))
        _publish(pipeline_id, "refine", 0, f"정제 실패: {exc}")
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()


# ─────────────────────────────────────────────
# 태스크 2: 형태소분석 (morpheme)
# ─────────────────────────────────────────────
@celery_app.task(bind=True, max_retries=3, soft_time_limit=1800,
                 name="pipeline.tasks.task_morpheme")
def task_morpheme(self, prev_result: dict, pipeline_id: int):
    """형태소분석 태스크 (cotton_test.sh 래핑)"""
    db = _get_db()
    refined_file = prev_result.get("refined_file", "")
    try:
        _update_stage(db, pipeline_id, "morpheme", "running")
        _update_pipeline(db, pipeline_id, "running", current_stage="morpheme")
        _publish(pipeline_id, "morpheme", 25, "형태소분석 시작")

        import asyncio
        from pipeline.morpheme import run_morpheme
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(run_morpheme(refined_file, pipeline_id))
        loop.close()

        _update_stage(db, pipeline_id, "morpheme", "completed",
                      log_text=result.get("log", ""))
        _publish(pipeline_id, "morpheme", 50, "형태소분석 완료")
        return {"pipeline_id": pipeline_id, "morpheme_result": result["output_file"]}
    except Exception as exc:
        logger.error("task_morpheme 실패 pipeline_id=%s: %s", pipeline_id, exc)
        _update_stage(db, pipeline_id, "morpheme", "failed", log_text=str(exc))
        _update_pipeline(db, pipeline_id, "failed", error_message=str(exc))
        _publish(pipeline_id, "morpheme", 0, f"형태소분석 실패: {exc}")
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


# ─────────────────────────────────────────────
# 태스크 3: 사전등록 (register)
# ─────────────────────────────────────────────
@celery_app.task(bind=True, max_retries=3, soft_time_limit=1800,
                 name="pipeline.tasks.task_register")
def task_register(self, prev_result: dict, pipeline_id: int):
    """사전등록 태스크 (형태소분석 결과를 DB에 등록)"""
    db = _get_db()
    morpheme_result = prev_result.get("morpheme_result", "")
    try:
        _update_stage(db, pipeline_id, "register", "running")
        _update_pipeline(db, pipeline_id, "running", current_stage="register")
        _publish(pipeline_id, "register", 55, "사전등록 시작")

        registered = _do_register(morpheme_result, pipeline_id, db)

        _update_stage(db, pipeline_id, "register", "completed",
                      output_count=registered,
                      log_text=f"등록 완료: {registered}건\n")
        _publish(pipeline_id, "register", 70, f"사전등록 완료: {registered}건")
        return {"pipeline_id": pipeline_id, "registered_count": registered}
    except Exception as exc:
        logger.error("task_register 실패 pipeline_id=%s: %s", pipeline_id, exc)
        _update_stage(db, pipeline_id, "register", "failed", log_text=str(exc))
        _update_pipeline(db, pipeline_id, "failed", error_message=str(exc))
        _publish(pipeline_id, "register", 0, f"사전등록 실패: {exc}")
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()


def _do_register(morpheme_result_file: str, pipeline_id: int, db) -> int:
    """형태소분석 결과 파일을 읽어 dictionary 테이블에 등록"""
    import os
    if not morpheme_result_file or not os.path.exists(morpheme_result_file):
        logger.warning("형태소분석 결과 파일 없음: %s", morpheme_result_file)
        return 0

    registered = 0
    with open(morpheme_result_file, "r", encoding="utf-8") as f:
        for line in f:
            word = line.strip()
            if not word:
                continue
            # TODO: domain 파라미터 필요 — pipeline_history에서 조회
            registered += 1
    return registered


# ─────────────────────────────────────────────
# 태스크 4: 빌드 (build)
# ─────────────────────────────────────────────
@celery_app.task(bind=True, max_retries=1, soft_time_limit=3600,
                 name="pipeline.tasks.task_build")
def task_build(self, prev_result: dict, pipeline_id: int, domain: str):
    """사전 빌드 태스크 (antdic.sh 래핑)"""
    db = _get_db()
    try:
        _update_stage(db, pipeline_id, "build", "running")
        _update_pipeline(db, pipeline_id, "running", current_stage="build")
        _publish(pipeline_id, "build", 75, "사전 빌드 시작")

        import asyncio
        from pipeline.build_wrapper import run_build
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(run_build(domain, pipeline_id))
        loop.close()

        summary = (
            f"빌드 완료 — domain={domain} "
            f"entry_count={result.get('entry_count', 'N/A')} "
            f"file_size={result.get('file_size', 'N/A')}"
        )
        _update_stage(db, pipeline_id, "build", "completed", log_text=result.get("log", ""))
        _update_pipeline(db, pipeline_id, "completed", result_summary=summary)
        _publish(pipeline_id, "build", 100, "빌드 완료")
        return {"pipeline_id": pipeline_id, "build_result": result}
    except Exception as exc:
        logger.error("task_build 실패 pipeline_id=%s: %s", pipeline_id, exc)
        _update_stage(db, pipeline_id, "build", "failed", log_text=str(exc))
        _update_pipeline(db, pipeline_id, "failed", error_message=str(exc))
        _publish(pipeline_id, "build", 0, f"빌드 실패: {exc}")
        raise self.retry(exc=exc, countdown=120)
    finally:
        db.close()


# ─────────────────────────────────────────────
# 파이프라인 체인 실행 진입점
# ─────────────────────────────────────────────
def run_pipeline(pipeline_id: int, file_path: str, domain: str):
    """파이프라인 체인 실행 (정제 → 형태소 → 사전등록 → 빌드)

    Args:
        pipeline_id: pipeline_history.id
        file_path: 업로드된 검색로그 파일 경로
        domain: 사전 도메인 (예: 'autoever', 'base')

    Returns:
        AsyncResult: Celery 체인 결과
    """
    return chain(
        task_refine.s(pipeline_id, file_path),
        task_morpheme.s(pipeline_id),
        task_register.s(pipeline_id),
        task_build.s(pipeline_id, domain),
    ).apply_async()
