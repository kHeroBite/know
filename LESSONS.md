# LESSONS.md — 자기 개선 교훈 로그

---

## 교훈 항목

### L-001: kdone 에이전트 완료 보고 없이 소멸 패턴 (2026-03-25)

**현상**: kdone 에이전트가 2회 연속 완료 보고(SendMessage) 없이 소멸.
**원인**: 에이전트가 작업 중 컨텍스트 소진 또는 예외로 종료되면서 SendMessage를 호출하지 못함.
**재발방지**: kdone 에이전트는 작업 시작 직후 "시작됨" 메시지를 발송하고, 각 단계 완료마다 중간 보고를 발송하여 소멸 시점을 추적 가능하게 함.
**Level**: 2 (MEMORY.md 반영)

### L-002: 증거 파일은 해당 스킬에서 생성해야 hook 차단 방지 (2026-03-25)

**현상**: ui_test_done/ui_test_winforms_done 증거 파일을 잘못된 단계에서 생성하여 hook이 차단.
**원인**: 증거 파일 생성 책임이 ktest에 있는데 다른 단계에서 생성 시도.
**재발방지**: 각 증거 파일은 해당 스킬(ktest_build → build_done, ktest → ui_test_done 등)에서만 생성. 다른 스킬에서 대리 생성 금지.
**Level**: 2 (MEMORY.md 반영)

### L-003: 팀 재spawn 시 TeamDelete → TeamCreate 선행 필요 (2026-03-25)

**현상**: 기존 팀이 남아있는 상태에서 TeamCreate 시도 시 충돌.
**원인**: 이전 팀이 정리되지 않은 상태에서 동일 이름으로 재생성 시도.
**재발방지**: 팀 재spawn 전 반드시 TeamDelete로 기존 팀 정리 후 TeamCreate 실행.
**Level**: 1

### L-004: 메인 세션 직접 파일 수정(L-171) 11회 반복 (2026-03-26)

**현상**: Phase 3 구현 중 메인 세션에서 직접 Edit/Write 시도가 11회 hook에 차단됨.
**원인**: DEV/TEST 파이프라인 상태에서는 메인 직접 수정이 금지됨을 인지하지 못하고 반복 시도.
**재발방지**: 파이프라인 상태(DEV/TEST) 진입 시 반드시 에이전트 spawn 후 파일 수정 위임. hook이 차단하면 즉시 에이전트 경유로 전환.
**Level**: 3 (hook 이미 물리 차단 중 — LESSONS.md 인지 강화)

### L-005: MariaDB 5.5에서 DATETIME DEFAULT CURRENT_TIMESTAMP 불가 (2026-03-26)

**현상**: Phase 3 마이그레이션 SQL에서 DATETIME DEFAULT CURRENT_TIMESTAMP 구문 오류.
**원인**: MariaDB 5.5에서는 DATETIME 타입에 DEFAULT CURRENT_TIMESTAMP 지원 안 됨 — TIMESTAMP 타입만 가능.
**재발방지**: MariaDB 5.5 대상 마이그레이션 작성 시 날짜 컬럼은 TIMESTAMP 사용, DATETIME 사용 시 DEFAULT 없이 application-level에서 설정.
**Level**: 2 (MEMORY.md 반영)

### L-006: CentOS 7 + sudo 없는 환경에서 Redis 설치 불가 (2026-03-26)

**현상**: CentOS 7 서버에서 sudo 없이 Redis 설치 시도 실패 — Celery 동기 fallback으로 대체.
**원인**: CentOS 7 기본 yum repos에 Redis 패키지 없음 + know 계정에 sudo 권한 없음.
**재발방지**: CentOS 7 sudo 없는 환경 Redis 필요 시 서버 관리자에게 사전 요청 또는 소스 빌드. 기능은 동기 fallback으로 먼저 구현 후 Redis 추가.
**Level**: 1

### L-007: 프론트엔드 API baseURL 이중 접두사 버그 (2026-03-26)

**현상**: phase1.ts 리네이밍(phase1→preprocess) 시 엔드포인트에 `/api/` 접두사를 중복 기재하여 `/api/api/preprocess/` 이중 경로 버그 발생. 커밋 7316a5e(역라우팅)에서 수정.
**원인**: axios 클라이언트 `client.ts`의 `baseURL: '/api'`를 인지 못하고 기존 경로의 `/api/` 접두사를 그대로 복사-치환.
**재발방지**: API 엔드포인트 경로 수정 시 `src/api/client.ts`의 `baseURL` 설정 먼저 확인. 기존 경로 복사-치환 시 접두사 중복 검증 필수.
**Level**: 1 (1회 발생, docs 기록)

### L-008: ktest 에이전트가 ktest_done 증거 파일 미생성 (2026-03-26)

**현상**: ktest-1 에이전트가 ktest 모든 단계 완료 후 `evidence/ktest_done` 파일을 생성하지 않음.
**원인**: ktest_quality 완료 후 `touch evidence/ktest_done` 단계 누락.
**재발방지**: ktest 완료 직후 evidence/ktest_done 생성 필수. `ktest_done_guard.sh`(L-009)로 kdone spawn 시 물리 차단됨.
**Level**: 2 (MEMORY.md 반영)

### L-009: ktest_done_guard.sh silent pass — trap 'exit 0' ERR 제거 (2026-03-26)

**현상**: `ktest_done_guard.sh`에 `trap 'exit 0' ERR`이 있어 UUID 해석 실패 등 내부 오류 발생 시 무조건 exit 0 통과.
**원인**: ERR trap이 UUID 해석 실패를 조용히 pass시켜 ktest_done 없어도 kdone spawn 허용.
**재발방지**: `trap 'exit 0' ERR` 제거. UUID 해석 실패 시 `_unknown/logs/pipeline_errors.log`에 명시적 기록 후 exit 0. 차단 경로에 `log_hook_error` 추가. (이미 kdone_hooks에서 수정 완료)
**Level**: 3 (hook 수정 완료)

---

## 반영 추적 테이블

| 교훈 ID | 교훈 요약 | 반영 대상 | 반영 위치 | 반영일 | 검증 |
|---------|-----------|-----------|-----------|--------|------|
| L-001 | kdone 소멸 패턴 | MEMORY | MEMORY.md | 2026-03-25 | ✅ |
| L-002 | 증거 파일 책임 분리 | MEMORY | MEMORY.md | 2026-03-25 | ✅ |
| L-004 | 메인 직접 수정 11회 반복 | LESSONS (hook 이미 차단) | LESSONS.md | 2026-03-26 | ✅ |
| L-005 | MariaDB 5.5 DATETIME 제약 | MEMORY | MEMORY.md | 2026-03-26 | ✅ |
| L-007 | API baseURL 이중 접두사 버그 | LESSONS | LESSONS.md | 2026-03-26 | ✅ |
| L-008 | ktest_done 증거파일 미생성 | MEMORY | MEMORY.md | 2026-03-26 | ✅ |
| L-009 | ktest_done_guard silent pass | hook | ktest_done_guard.sh | 2026-03-26 | ✅ |
