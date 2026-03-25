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

### kdone 에이전트 완료 보고 소멸 방지 (L-001)
- kdone 에이전트는 작업 시작 직후 "시작됨" 메시지 발송
- 각 단계 완료마다 중간 보고 발송 (소멸 시점 추적)

### 증거 파일 책임 분리 (L-002)
- 각 증거 파일은 해당 스킬에서만 생성 (대리 생성 금지)
- ktest_build → build_done, ktest → ui_test_done 등

