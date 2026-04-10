# MEMORY.md — 매 세션 인지 필수 항목

> 이 파일은 매 세션 시작 시 자동으로 읽힘. Level 2+ 교훈만 포함.

---

## DB 제약

### MariaDB 5.5 — DATETIME DEFAULT CURRENT_TIMESTAMP 불가 (L-005)
- DATETIME 타입에 DEFAULT CURRENT_TIMESTAMP 지원 안 됨
- **마이그레이션 시 TIMESTAMP 사용** (또는 application-level에서 설정)
- know 프로젝트 DB: MariaDB 5.5 (CentOS 7)

---

## 에이전트 패턴

### PLAN 상태 서브에이전트 spawn 금지 (L-027)
- PLAN 상태에서 팀에이전트/서브에이전트 spawn 시도 → no_team_agent_guard.sh 차단
- **kplan 실행 중 spawn이 필요한 경우 DEV 등 다른 상태 전환 후 시도**
- L-023(1차) → L-027(2차 재발) — PLAN 상태 spawn 불가 원칙 재확인

### 팀에이전트 spawn 시 subagent_type 반드시 명시 (L-017)
- `subagent_type` 빈 값 → no_team_agent_guard.sh 차단
- **general-purpose 포함 모든 에이전트 spawn 시 subagent_type 명시 필수**
- 차단 시 subagent_type 파라미터 확인 후 재시도

### kdone 에이전트 완료 보고 소멸 방지 (L-001)
- kdone 에이전트는 작업 시작 직후 "시작됨" 메시지 발송
- 각 단계 완료마다 중간 보고 발송 (소멸 시점 추적)

### 증거 파일 책임 분리 (L-002)
- 각 증거 파일은 해당 스킬에서만 생성 (대리 생성 금지)
- ktest_build → build_done, ktest → ui_test_done 등


---

## MySQL 외부 시스템 연동 패턴

### MySQL 원본 스키마 vs tobe SQLite 스키마 불일치 주의 (L-316)
- MySQL(Java 원본) 연동 코드 작성 시 **Java 소스에서 실제 컬럼 목록 먼저 확인** 필수
- tobe SQLite 스키마와 MySQL 원본 스키마가 다를 수 있음:
  - UDIC/CNDIC: MySQL에 `_WORD`만 존재 (tobe에는 `_MEMO`, `_USER_ID` 추가됨)
  - THESAURUS: MySQL에 `_HEAD_WORD`, `_TAIL_WORD`만 존재
- **사전 타입 확장 시** dictionary_service.py 내 4곳 동시 수정 필수:
  `get_mysql_dict_count` / `migrate_dict_from_mysql` / `copy_domain_dict` / `get_dict_db_count`
