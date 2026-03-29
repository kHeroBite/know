"""know-api SQLite DB 초기화 스크립트.

실행: cd know-api && python init_db.py
결과: know.db 파일 생성 + 전체 테이블 + 시드 데이터
"""
from __future__ import annotations
import sys
import os

# know-api 디렉토리를 path에 추가
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
from sqlalchemy import text, inspect
from core.database import 엔진, Base, 세션팩토리
from core.security import 비밀번호해시

# ORM 기반 모델 import (Base.metadata에 등록됨)
from models.pipeline import PipelineHistory, PipelineStageLog, TaskAssignment, BuildHistory, AuditLog

# Table 기반 모델 import
from models.account import 계정테이블, 메타데이터 as 계정메타
from models.domain import 도메인테이블, 메타데이터 as 도메인메타
from models.dictionary import 사전테이블가져오기, MetaData


def 테이블생성():
    """모든 테이블 생성."""
    print("=== 테이블 생성 시작 ===")
    
    # 1. ORM 기반 테이블 (pipeline_history, pipeline_stage_log, task_assignment, build_history, audit_log)
    Base.metadata.create_all(엔진)
    print("  [OK] ORM 테이블 5개 생성")
    
    # 2. Table 기반 테이블 (accounts, domains)
    계정메타.create_all(엔진)
    print("  [OK] accounts 테이블 생성")
    도메인메타.create_all(엔진)
    print("  [OK] domains 테이블 생성")
    
    # 3. phase1_runs, phase1_logs (raw SQL — ORM 모델 없음)
    with 엔진.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS phase1_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                domain TEXT,
                category TEXT,
                filename TEXT,
                start_step INTEGER,
                end_step INTEGER,
                status TEXT DEFAULT 'pending',
                current_step INTEGER DEFAULT -1,
                error_message TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS phase1_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                step_num INTEGER,
                step_name TEXT,
                percent INTEGER,
                message TEXT,
                status TEXT,
                elapsed_sec REAL,
                ts TEXT DEFAULT (datetime('now','localtime'))
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_phase1_logs_run ON phase1_logs(run_id)"))
        conn.commit()
    print("  [OK] phase1_runs, phase1_logs 테이블 생성")


def 도메인사전테이블생성(도메인목록: list[str]):
    """각 도메인에 대해 4개 사전 테이블 생성 (UDIC, CNDIC, THESAURUS, CATEGORY)."""
    for site in 도메인목록:
        meta = MetaData()
        for dic_type in ("udic", "cndic", "thesaurus", "category"):
            사전테이블가져오기(site, dic_type, meta)
        meta.create_all(엔진)
        print(f"  [OK] {site} 사전 테이블 4개 생성")


def 시드데이터():
    """초기 데이터 삽입."""
    db = 세션팩토리()
    try:
        # 1. admin 계정
        기존 = db.execute(
            계정테이블.select().where(계정테이블.c._USER_ID == "admin")
        ).first()
        if not 기존:
            db.execute(계정테이블.insert().values(
                _USER_ID="admin",
                _NAME="관리자",
                _PASSWORD=비밀번호해시("1111"),
                _AUTH="A",
                _CREATED=datetime.now(),
                _UPDATED=datetime.now(),
            ))
            print("  [OK] admin 계정 생성 (admin / 1111)")
        else:
            print("  [SKIP] admin 계정 이미 존재")
        
        # 2. 도메인 3개
        도메인목록 = [
            {"site": "EPOST", "memo": "epost 도메인"},
            {"site": "MALL", "memo": "mall 도메인"},
            {"site": "QQ", "memo": "qq 도메인"},
        ]
        for d in 도메인목록:
            기존 = db.execute(
                도메인테이블.select().where(도메인테이블.c._SITE == d["site"])
            ).first()
            if not 기존:
                db.execute(도메인테이블.insert().values(
                    _SITE=d["site"],
                    _MEMO=d["memo"],
                    _CREATED=datetime.now(),
                ))
                print(f"  [OK] 도메인 {d['site']} 등록")
            else:
                print(f"  [SKIP] 도메인 {d['site']} 이미 존재")
        
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"  [ERROR] 시드 데이터 삽입 실패: {e}")
        raise
    finally:
        db.close()


def main():
    db_path = os.path.join(os.path.dirname(__file__), "know.db")
    신규 = not os.path.exists(db_path)
    
    print(f"DB 경로: {db_path}")
    print(f"상태: {'신규 생성' if 신규 else '기존 DB 업데이트'}")
    print()
    
    # 테이블 생성
    테이블생성()
    print()
    
    # 도메인 사전 테이블 생성 (3도메인 × 4테이블 = 12개)
    print("=== 도메인 사전 테이블 생성 ===")
    도메인사전테이블생성(["EPOST", "MALL", "QQ"])
    print()
    
    # 시드 데이터
    print("=== 시드 데이터 삽입 ===")
    시드데이터()
    print()
    
    # 결과 확인
    inspector = inspect(엔진)
    전체테이블 = inspector.get_table_names()
    print(f"=== 완료: 총 {len(전체테이블)}개 테이블 ===")
    for t in sorted(전체테이블):
        print(f"  - {t}")


if __name__ == "__main__":
    main()
