# DATABASE.md — know 프로젝트 DB 스키마 및 쿼리 기록

> MariaDB 5.5 (know_mng) + SQLite (www/know.db)

---

## SQLite 스키마 (know.db)

### keyword_assignments 테이블 (2026-04-02 flag 컬럼 추가)

```sql
CREATE TABLE IF NOT EXISTS keyword_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL,
    domain TEXT NOT NULL,
    line_num INTEGER NOT NULL,      -- 원본 순번
    keyword TEXT NOT NULL,
    analysis TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_to TEXT,
    assigned_at TEXT,
    completed_at TEXT,
    flag TEXT DEFAULT '',           -- 읽음/작업 상태: ''=미확인, 'R'=읽음, 'W'=작업완료, 'reprocess'=재처리 대상
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kw_unique ON keyword_assignments(workspace, domain, line_num);
CREATE INDEX IF NOT EXISTS idx_kw_workspace ON keyword_assignments(workspace, domain);
CREATE INDEX IF NOT EXISTS idx_kw_status ON keyword_assignments(status);
```

**목적**: 작업실 키워드 할당 관리 + 읽음/작업 상태 추적  
**주요 쿼리**:
- 목록 조회: `SELECT id, line_num, keyword, analysis, status, assigned_to, assigned_at, completed_at, flag FROM keyword_assignments WHERE workspace=? AND domain=? AND assigned_to=? ORDER BY line_num LIMIT ? OFFSET ?`
- worked_count: `SELECT COUNT(*) FROM keyword_assignments WHERE workspace=? AND domain=? AND assigned_to=? AND flag != ''`
- flag 업데이트: `UPDATE keyword_assignments SET flag=:flag WHERE id=:id AND assigned_to=:uid`

**마이그레이션**: 기존 DB는 `ALTER TABLE keyword_assignments ADD COLUMN flag TEXT DEFAULT ''` (init_db.py 자동 실행)

---

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

> 기존 JSP 관리도구가 사용하는 DB. www(FastAPI)에서 read-only 참조.

### 주요 사전 테이블 패턴

```sql
-- 도메인별 4개 테이블 (예: EPOST 도메인)
EPOST_UDIC       -- 사용자 사전 (단어, 품사)
EPOST_CNDIC      -- 복합명사 사전 (head_word, tail_word, result_word)
EPOST_THESAURUS  -- 유사어 사전 (word, synonym)
EPOST_CATEGORY   -- 카테고리 사전 (word, category)
```

**타입 허용목록**: `{"udic", "cndic", "thesaurus", "category"}` (건수조회/마이그레이션/복사 4종)

---

### llm_settings 테이블 (2026-04-02 신규)

```sql
CREATE TABLE IF NOT EXISTS llm_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,    -- 'openai' | 'claude' | 'gemini' | 'local'
    api_key TEXT DEFAULT '',           -- API 키 (로컬 LLM은 빈 값)
    model_name TEXT DEFAULT '',        -- 사용 모델명 (예: gpt-4o-mini)
    enabled INTEGER DEFAULT 0,         -- 활성화 여부 (0/1)
    extra_config TEXT DEFAULT '{}',    -- 추가 설정 JSON (base_url 등)
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**시드 데이터** (init_db.py 자동 삽입 — 최초 1회):
```sql
INSERT OR IGNORE INTO llm_settings (provider) VALUES
  ('openai'), ('claude'), ('gemini'), ('local');
```

**목적**: ChatGPT/Claude/Gemini/로컬LLM 4종 AI 엔진 설정 저장  
**주요 API**:
- 전체 조회: `GET /api/llm-settings` → 4개 provider 목록
- 저장: `PUT /api/llm-settings/{provider}` → api_key/model_name/enabled/extra_config 업데이트

---

### llm_usage_log 테이블 (2026-04-03 신규)

```sql
CREATE TABLE IF NOT EXISTS llm_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,           -- 'openai' | 'claude' | 'gemini' | 'local'
    model TEXT,                       -- 사용 모델명
    user_id TEXT,                     -- 호출자 사용자 ID
    tokens_used INTEGER DEFAULT 0,    -- 사용 토큰 수
    duration_ms INTEGER DEFAULT 0,    -- 응답 시간 (ms)
    success INTEGER DEFAULT 1,        -- 성공 여부 (0/1)
    error_msg TEXT,                   -- 오류 메시지 (실패 시)
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**목적**: LLM 호출 로그 영구 저장 → 통계 페이지에서 provider별/기간별 사용량 집계  
**주요 API**: `GET /api/stats/llm-usage` — provider별 총 호출 수/토큰/평균 응답시간 통계

---

---

### user_work_phase 테이블 (2026-04-05 신규)

```sql
CREATE TABLE IF NOT EXISTS user_work_phase (
    user_id TEXT NOT NULL,            -- 사용자 ID
    domain TEXT NOT NULL,             -- 워크스페이스 도메인
    phase TEXT NOT NULL DEFAULT 'idle', -- 'idle' | 'working' | 'done'
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (user_id, domain)
);
```

**목적**: 워크스페이스 work 단계에서 사용자별 작업 진행 상태(idle/working/done) 저장  
**주요 API**:
- 조회: `GET /api/workspaces/{domain}/my-phase` → `{"phase": "idle|working|done"}`
- 설정: `POST /api/workspaces/{domain}/my-phase` → phase 갱신
- (workspace phase가 "work"일 때만 유효)

---

### kw_{workspace} 테이블 (2026-04-09 워크스페이스별 전용 테이블 전환)

```sql
-- 워크스페이스명에 따라 동적 생성 (예: kw_EPOST, kw_NEWS 등)
CREATE TABLE IF NOT EXISTS kw_{workspace} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    line_num INTEGER NOT NULL,      -- 원본 순번
    keyword TEXT NOT NULL,
    analysis TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_to TEXT,
    assigned_at TEXT,
    completed_at TEXT,
    flag TEXT DEFAULT '',           -- 읽음/작업 상태: ''=미확인, 'R'=읽음, 'W'=작업완료, 'reprocess'=재처리 대상
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kw_{workspace}_unique ON kw_{workspace}(domain, line_num);
CREATE INDEX IF NOT EXISTS idx_kw_{workspace}_domain ON kw_{workspace}(domain);
CREATE INDEX IF NOT EXISTS idx_kw_{workspace}_status ON kw_{workspace}(status);
```

**목적**: 워크스페이스별 키워드 할당 격리 — 기존 공용 `keyword_assignments` 테이블에서 분리  
**생성 시점**: `init_db.py` 또는 워크스페이스 접근 시 동적 생성 (`CREATE TABLE IF NOT EXISTS`)  
**초기화**: 이전단계(`phase → preprocess`) 이동 시 TRUNCATE 수행  
**INSERT OR REPLACE 보장**: 전처리 DB 업데이트 시 중복 방지 + 멱등성 확보  
**주요 쿼리**:
- 목록 조회: `SELECT ... FROM kw_{workspace} WHERE domain=? AND assigned_to=? ORDER BY line_num LIMIT ? OFFSET ?`
- flag 업데이트: `UPDATE kw_{workspace} SET flag=:flag WHERE id=:id AND assigned_to=:uid`
- 초기화: `DELETE FROM kw_{workspace}` (이전단계 이동 시)

---

---

### system_settings 테이블 (2026-04-16 신규)

```sql
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
-- 기본값
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('auto_logout_minutes', '30');
```

**목적**: 전역 시스템 설정 저장 (key-value 구조로 향후 설정 확장 가능)  
**현재 키**: `auto_logout_minutes` — idle 상태 자동 로그아웃 대기 분 (기본값 30분)  
**주요 API**:
- 조회: `GET /api/system-settings` → `{"auto_logout_minutes": "30"}`
- 수정: `PUT /api/system-settings` (admin only) → `{"settings": {...}}`  
**참고**: workspace_domains.connected_at 컬럼 — link_domain() 호출 시 시작 시각 기록

### email_contacts 테이블 (2026-04-16 신규)

```sql
CREATE TABLE IF NOT EXISTS email_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**목적**: 작업완료 메일 발송 수신자 목록 관리  
**주요 API**:
- 조회: `GET /api/email-contacts` → 전체 수신자 목록
- 추가: `POST /api/email-contacts` → `{name, email}`
- 삭제: `DELETE /api/email-contacts/{id}`  
**참고**: WorkComplete 페이지 메일 발송 시 Select 컴포넌트로 수신자 선택

---

### data_preprocess_config 테이블 (2026-04-24 신규 — migration 004)

```sql
CREATE TABLE IF NOT EXISTS data_preprocess_config (
    domain TEXT PRIMARY KEY,
    selected_columns TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**목적**: 도메인별 데이터기반 전처리 컬럼 선택 설정 영속화  
**주요 API**:
- 조회: `GET /api/preprocess/data-config?domain={domain}` → `{domain, selected_columns}`
- 저장: `POST /api/preprocess/data-config` body `{domain, selected_columns: [{name, split_delimiter?}]}` (UPSERT)  
**참고**: domain은 단일 PK (워크스페이스 무관 도메인 전역 설정). selected_columns는 JSON 배열. 도메인 변경 시 자동 prefill.

---

## 변경 이력

| 날짜 | 변경 내용 | 파일 |
|------|-----------|------|
| 2026-04-24 | data_preprocess_config 테이블 신규 생성 (도메인별 SGML 컬럼 선택 설정 — domain PK + selected_columns JSON) | migrations/004_data_preprocess_config.sql |
| 2026-04-16 | email_contacts 테이블 신규 생성 (메일 수신자 관리) | init_db.py, models/email_contact.py |
| 2026-04-16 | system_settings 테이블 신규 생성 (key-value 전역 설정 + auto_logout_minutes 기본값) | init_db.py |
| 2026-04-16 | workspace_domains.connected_at 컬럼 기록 추가 — link_domain() 호출 시 시작 시각 기록 | workspace_service.py |
| 2026-04-14 | kw_{workspace}.flag 값 확장: 'reprocess' 마커 추가 (재처리 대상 키워드 식별) | dict_verify_service.py, assignment_service.py |
| 2026-04-10 | MySQL 사전 마이그레이션 4종 정합성 수정: CATEGORY 타입 추가 + Java 원본 스키마 기반 컬럼 방어적 SELECT (UDIC/CNDIC: _WORD만, THESAURUS: _HEAD_WORD+_TAIL_WORD만) + _DISPLAY_CATEGORY String(128)→String(1024) | dictionary_service.py, models/dictionary.py |
| 2026-04-09 | `trg_phase1_runs_delete` 트리거 추가 (phase1_runs 삭제 시 phase1_logs 자동 연쇄 삭제) + `idx_wh_ws_dom`(work_history), `idx_bh_domain`(build_history) 복합 인덱스 추가 | init_db.py |
| 2026-04-09 | kw_{workspace} 워크스페이스별 전용 테이블 전환 (keyword_assignments 분리) + 이전단계 이동 시 TRUNCATE | assignment_service.py, workspace_service.py, init_db.py |
| 2026-04-05 | user_work_phase 테이블 신규 생성 (user_id/domain/phase) | migrations/002_user_work_phase.sql |
| 2026-04-05 | workspace phase enum 도입 (preprocess→work→build→verify) — isFrozen/isAssigned/isBuildPhase 제거 | workspace_service.py |
| 2026-04-03 | llm_usage_log 테이블 신규 생성 (provider/model/user_id/tokens_used/duration_ms/success) | init_db.py |
| 2026-04-08 | llm_settings.thesaurus_prompt TEXT 컬럼 추가 (ALTER TABLE ADD COLUMN) | main.py migration |
| 2026-04-02 | llm_settings 테이블 신규 생성 (provider/api_key/model_name/enabled/extra_config) | init_db.py |
| 2026-04-02 | keyword_assignments.flag 컬럼 추가 (R/W/'') + API PUT /flag | init_db.py, assignment_service.py, api/assignment.py |
| 2026-04-01 | work_history 테이블 신규 생성 | init_db.py |
