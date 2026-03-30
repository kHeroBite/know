"""know-api SQLite DB 초기화 스크립트.

실행: cd know-api && python init_db.py
결과: know.db 파일 생성 + 전체 테이블 + 시드 데이터

CLI:
  python3 init_db.py                              # DB 초기화
  python3 init_db.py --reset-password admin        # 비밀번호를 1111로 초기화
  python3 init_db.py --reset-password admin newpw  # 지정 비밀번호로 초기화
  python3 init_db.py --import EPOST udic /path/to/file.txt  # 사전 파일 임포트
"""
from __future__ import annotations
import sys
import os
import argparse

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
        
        # 4. keyword_assignments (데이터 할당)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS keyword_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace TEXT NOT NULL,
                domain TEXT NOT NULL,
                line_num INTEGER NOT NULL,
                keyword TEXT NOT NULL,
                analysis TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                assigned_to TEXT,
                assigned_at TEXT,
                completed_at TEXT,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_kw_workspace ON keyword_assignments(workspace, domain)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_kw_status ON keyword_assignments(status)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_kw_unique ON keyword_assignments(workspace, domain, line_num)"))
        conn.commit()
    print("  [OK] phase1_runs, phase1_logs, keyword_assignments 테이블 생성")


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


def 비밀번호리셋(user_id: str, new_password: str = "1111"):
    """계정 비밀번호를 지정 값으로 초기화."""
    db = 세션팩토리()
    try:
        row = db.execute(
            계정테이블.select().where(계정테이블.c._USER_ID == user_id)
        ).first()
        if not row:
            print(f"  [ERROR] 사용자를 찾을 수 없음: {user_id}")
            sys.exit(1)
        from sqlalchemy import update
        db.execute(update(계정테이블).where(계정테이블.c._USER_ID == user_id).values(
            _PASSWORD=비밀번호해시(new_password),
            _UPDATED=datetime.now(),
        ))
        db.commit()
        print(f"  [OK] '{user_id}' 비밀번호 초기화 완료 → '{new_password}'")
    except Exception as e:
        db.rollback()
        print(f"  [ERROR] 비밀번호 초기화 실패: {e}")
        raise
    finally:
        db.close()


def 사전임포트(도메인: str, 사전타입: str, 파일경로: str):
    """사전 파일을 읽어 DB에 INSERT (중복 스킵)."""
    if not os.path.exists(파일경로):
        print(f"  [ERROR] 파일을 찾을 수 없음: {파일경로}")
        sys.exit(1)

    meta = MetaData()
    테이블 = 사전테이블가져오기(도메인, 사전타입, meta)
    # 테이블이 존재하는지 확인
    inspector = inspect(엔진)
    if 테이블.name not in inspector.get_table_names():
        print(f"  [ERROR] 테이블이 존재하지 않음: {테이블.name} (먼저 init_db.py로 DB 초기화 필요)")
        sys.exit(1)

    db = 세션팩토리()
    삽입수 = 0
    스킵수 = 0
    try:
        with open(파일경로, "r", encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n").rstrip("\r")
                if not line.strip():
                    continue

                if 사전타입 in ("udic", "cndic"):
                    # 형식: word[\tmemo]
                    parts = line.split("\t", 1)
                    word = parts[0].strip()
                    memo = parts[1].strip() if len(parts) > 1 else None
                    if not word:
                        continue
                    # 중복 체크
                    기존 = db.execute(테이블.select().where(테이블.c._WORD == word)).first()
                    if 기존:
                        스킵수 += 1
                        continue
                    db.execute(테이블.insert().values(
                        _WORD=word,
                        _MEMO=memo,
                        _USER_ID="admin",
                        _UPDATED=datetime.now(),
                    ))
                    삽입수 += 1

                elif 사전타입 == "thesaurus":
                    # 형식: head_word\ttail_word[\tmemo]
                    parts = line.split("\t")
                    if len(parts) < 2:
                        continue
                    head = parts[0].strip()
                    tail = parts[1].strip()
                    memo = parts[2].strip() if len(parts) > 2 else None
                    if not head or not tail:
                        continue
                    기존 = db.execute(테이블.select().where(테이블.c._HEAD_WORD == head)).first()
                    if 기존:
                        스킵수 += 1
                        continue
                    db.execute(테이블.insert().values(
                        _HEAD_WORD=head,
                        _TAIL_WORD=tail,
                        _MEMO=memo,
                        _USER_ID="admin",
                        _UPDATED=datetime.now(),
                    ))
                    삽입수 += 1

                elif 사전타입 == "category":
                    # 형식: word\tdisplay_category
                    parts = line.split("\t")
                    if len(parts) < 2:
                        continue
                    word = parts[0].strip()
                    display_cat = parts[1].strip()
                    if not word or not display_cat:
                        continue
                    기존 = db.execute(테이블.select().where(테이블.c._WORD == word)).first()
                    if 기존:
                        스킵수 += 1
                        continue
                    db.execute(테이블.insert().values(
                        _WORD=word,
                        _DISPLAY_CATEGORY=display_cat,
                        _USER_ID="admin",
                        _UPDATED=datetime.now(),
                    ))
                    삽입수 += 1

        db.commit()
        print(f"  [OK] {도메인}/{사전타입} 임포트 완료: {삽입수}건 삽입, {스킵수}건 스킵 (중복)")
    except Exception as e:
        db.rollback()
        print(f"  [ERROR] 임포트 실패: {e}")
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="know-api DB 초기화 및 관리 도구")
    parser.add_argument("--reset-password", nargs="+", metavar=("USER_ID", "NEW_PW"),
                        help="계정 비밀번호 초기화 (기본: 1111)")
    parser.add_argument("--import", nargs=3, metavar=("DOMAIN", "DIC_TYPE", "FILE"),
                        dest="import_dict",
                        help="사전 파일 임포트 (예: --import EPOST udic /path/to/file.txt)")
    args = parser.parse_args()

    # --reset-password 처리
    if args.reset_password:
        user_id = args.reset_password[0]
        new_pw = args.reset_password[1] if len(args.reset_password) > 1 else "1111"
        print(f"=== 비밀번호 초기화: {user_id} ===")
        비밀번호리셋(user_id, new_pw)
        return

    # --import 처리
    if args.import_dict:
        도메인, 사전타입, 파일경로 = args.import_dict
        print(f"=== 사전 임포트: {도메인}/{사전타입} ← {파일경로} ===")
        사전임포트(도메인, 사전타입, 파일경로)
        return

    # 기본: DB 초기화
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
