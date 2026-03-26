from __future__ import annotations
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import 설정값


엔진 = create_engine(
    설정값.DB_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=False,
)

세션팩토리 = sessionmaker(autocommit=False, autoflush=False, bind=엔진)

# ORM 모델 기반 클래스 — models/pipeline.py 등에서 사용
Base = declarative_base()

# SessionLocal: build_wrapper, tasks 등 외부 모듈에서 사용하는 별칭
SessionLocal = 세션팩토리


def DB세션():
    """FastAPI Dependency: DB 세션 generator."""
    db = 세션팩토리()
    try:
        yield db
    finally:
        db.close()


def DB연결확인() -> bool:
    """DB 연결 상태 확인."""
    try:
        with 엔진.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
