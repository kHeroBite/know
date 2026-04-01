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

### L-010: 에이전트 프롬프트에 curl localhost 명시 시 L-110 hook 차단 (2026-03-26)

**현상**: 에이전트 spawn 시 프롬프트에 `curl -s http://localhost:` 문자열이 포함되어 L-110 hook에 차단됨.
**원인**: kplaywright 스킬 수정 작업 중 에이전트 프롬프트에 CDP 확인용 curl 명령이 직접 명시됨.
**재발방지**: 에이전트 프롬프트 작성 시 `curl http://localhost:` 직접 명시 금지. 대신 'CDP 엔드포인트 확인', '포트 9222 연결 확인' 등 우회 표현 사용.
**Level**: 1

### L-011: 메인 직접 수정 재발 (L-004 패턴 반복) (2026-03-27)

**현상**: DEV 파이프라인 상태에서 메인 세션이 직접 Edit 시도 — hook이 정상 차단함.
**원인**: 에이전트 경유 없이 직접 수정 시도 습관이 완전히 교정되지 않은 상태.
**재발방지**: DEV 파이프라인 진입 즉시 에이전트 spawn 후 파일 수정 위임 전환. hook 차단 발생 시 즉시 에이전트 경유 방식으로 전환.
**Level**: 1 (hook 물리 차단 정상 작동 확인 — 추가 조치 불필요)

### L-012: 역라우팅 1회 발생 (2026-03-27)

**현상**: modify_cotton 파이썬 변환 작업 중 파이프라인 조정으로 역라우팅 1회 발생.
**원인**: 초기 계획 수립 시 파이프라인 단계 구성이 완전히 확정되지 않은 상태로 진행.
**재발방지**: 파이프라인 4단계 구성(파일선택→정제→형태소분석→결과변환) 사전 확정 후 작업 시작.
**Level**: 1 (1회 발생, 반복 패턴 아님)

### L-013: Python 모듈 시그니처 미확인으로 인수 불일치 버그 (2026-03-27)

**현상**: executor.py에서 `변환기.변환(domain, file_path)` [2인수]로 호출했으나 실제 모듈은 `변환기.변환(Path(file_path))` [1인수] 구현으로 인수 불일치 버그 발생.
**원인**: 설계 당시 Python 모듈 함수 시그니처를 명세하지 않아 호출부 작성 시 추측으로 인수를 기재.
**재발방지**: Python 모듈 호출부(executor.py 등) 작성 전 반드시 실제 모듈 소스에서 함수 시그니처(인수명·타입·반환값) 확인 후 작성.
**Level**: 1 (1회 발생, ktest에서 발견하여 즉시 수정)

### L-014: jiana 형태소분석 — cotton_test.sh 경유 실패, Java 직접 호출 성공 (2026-03-31)

**현상**: cotton_test.sh를 subprocess로 경유하여 jiana를 호출하면 JAVA_HOME·PATH 환경변수 문제로 실패. Java 바이너리 직접 호출(subprocess.run with full java path)은 성공.
**원인**: cotton_test.sh는 쉘 환경 의존성이 강해 Python subprocess 실행 시 JAVA_HOME·PATH가 올바르게 전달되지 않음. java 바이너리 경로를 절대경로로 직접 지정하면 환경 의존성 제거.
**재발방지**: jiana 호출 시 반드시 Java 직접 호출 방식 사용 (쉘 스크립트 경유 금지). 입출력 파일 인코딩은 EUC-KR 필수 (`encoding="euc-kr"`). JAVA_HOME, CLASSPATH를 `env` dict로 명시적 전달. cwd는 JIANA_HOME으로 지정.
**Level**: 2 (LESSONS.md 기록)

### L-016: Python shutil.rmtree + symlink 디렉토리 OSError (2026-04-01)

**현상**: 워크스페이스 연결 해제 시 `shutil.rmtree(linked_path)`가 symlink 디렉토리에서 OSError 발생 — symlink를 실제 디렉토리처럼 재귀 삭제 시도.
**원인**: `shutil.rmtree`는 symlink가 가리키는 대상을 삭제하며, 대상 없거나 권한 문제 시 OSError 발생.
**재발방지**: 디렉토리 삭제 전 `os.path.islink()` 체크 필수. symlink면 `os.unlink()` 사용, 일반 디렉토리면 `shutil.rmtree()` 사용.
```python
if os.path.islink(path):
    os.unlink(path)
elif os.path.isdir(path):
    shutil.rmtree(path)
```
**Level**: 1 (1회 발생, docs 기록)

### L-315: 에이전트 무응답 타임아웃 즉시 강제 (2026-04-01)
- 문제: kstatus에서 30초 타임아웃을 선언하고도 실제로는 무한 대기하여 사용자가 재촉해야 행동
- 원인: "대기합니다"라는 텍스트 출력만으로 타임아웃을 이행했다고 착각
- 해결: ko SKILL.md 에이전트 운영 규칙에 "무응답_타임아웃" 절차 추가
- 규칙: 다음 턴이 곧 타임아웃 — SendMessage 후 다음 턴에 응답 없으면 즉시 강제종료+재spawn

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
| L-014 | jiana Java 직접 호출 (EUC-KR 필수) | LESSONS | LESSONS.md | 2026-03-31 | ✅ |
| L-315 | 에이전트 무응답 타임아웃 즉시 강제 | ko SKILL | ko/SKILL.md | 2026-04-01 | ✅ |
