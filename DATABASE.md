# DATABASE.md — know 프로젝트 DB 스키마 및 쿼리 기록

> MariaDB 5.5 (know_mng) + SQLite (know-api/know.db)

---

## SQLite 스키마 (know.db)

### work_history 테이블 (2026-04-01 신규)

```sql
CREATE TABLE IF NOT EXISTS work_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL,        -- 작업실 이름
    domain TEXT NOT NULL,           -- 도메인 (예: EPOST)
    user_id TEXT NOT NULL,          -- 작업자 ID
    action_type TEXT NOT NULL,      -- 작업 유형 (add/delete/modify 등)
    dic_type TEXT NOT NULL,         -- 사전 유형 (udic/cndic 등)
    word TEXT,                      -- 처리 대상 단어
    memo TEXT,                      -- 메모
    head_word TEXT,                 -- 복합명사 앞단어 (CNDIC용)
    tail_word TEXT,                 -- 복합명사 뒷단어 (CNDIC용)
    undone INTEGER DEFAULT 0,       -- undo 여부 (0: 정상, 1: 취소됨)
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_wh_ws ON work_history(workspace, domain, user_id);
```

**목적**: 작업실에서 수행된 사전 편집 이력 영구 저장 + undo/rollback 지원  
**주요 쿼리**:
- 조회: `SELECT * FROM work_history WHERE workspace=? AND domain=? ORDER BY id DESC LIMIT 50`
- 등록: `INSERT INTO work_history (workspace, domain, user_id, action_type, dic_type, word, ...) VALUES (...)`
- undo: `UPDATE work_history SET undone=1 WHERE id=?` + 역방향 DB 작업 실행

**주의**: `action_type`에 따라 undo 시 다른 역방향 작업 수행 (add → delete, delete → add)  
**OperationalError 예외처리 필수**: 사전 테이블 없는 도메인(테스트 등) 접근 시 `except OperationalError` graceful pass (L-018)

---

## MariaDB 스키마 (know_mng)

> 기존 JSP 관리도구가 사용하는 DB. know-api에서 read-only 참조.

### 주요 사전 테이블 패턴

```sql
-- 도메인별 4개 테이블 (예: EPOST 도메인)
EPOST_UDIC       -- 사용자 사전 (단어, 품사)
EPOST_CNDIC      -- 복합명사 사전 (head_word, tail_word, result_word)
EPOST_THESAURUS  -- 유사어 사전 (word, synonym)
EPOST_CATEGORY   -- 카테고리 사전 (word, category)
```

**타입 허용목록**: `{"udic", "cndic"}` (thesaurus 제외)

---

## 변경 이력

| 날짜 | 변경 내용 | 파일 |
|------|-----------|------|
| 2026-04-01 | work_history 테이블 신규 생성 | init_db.py |
