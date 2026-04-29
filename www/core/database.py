from __future__ import annotations
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import 설정값


엔진 = create_engine(
    설정값.DB_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    pool_pre_ping=True,
    echo=False,
)

# SQLite WAL 모드 + busy_timeout 설정
@event.listens_for(엔진, "connect")
def _sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

세션팩토리 = sessionmaker(autocommit=False, autoflush=False, bind=엔진)
Base = declarative_base()
SessionLocal = 세션팩토리


def db_session():
    db = 세션팩토리()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    try:
        with 엔진.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
