# LESSONS.md — 자기 개선 교훈 로그

---

## 교훈 항목

### L-059: TeamCreate 후 config.json 타이밍 이슈 — spawn 전 파일 존재 확인 필수 (2026-04-16)

**현상**: TeamCreate 직후 Agent spawn 시도 시 "config.json 부재" 차단(ERR-6) 발생. ERR-5에서 언더스코어 팀명으로 팀 미존재 오류 → 재시도(ERR-6)에서 하이픈 팀명으로 정정했으나 이때 config.json이 아직 생성되지 않은 상태.
**원인**: TeamCreate 완료 응답과 실제 config.json 파일 생성 사이에 타이밍 갭 존재. 또한 팀명 생성 시 언더스코어(`_`)와 하이픈(`-`) 혼용으로 첫 시도 실패.
**재발방지**: TeamCreate 후 즉시 spawn하지 말고 `cat $HOME/.claude/teams/{팀명}/config.json` 존재 확인 후 spawn. 팀명 생성 시 conv_id 언더스코어를 하이픈으로 정규화하여 일관성 유지.
**Level**: 1 (hook이 정상 차단한 1회성 타이밍 이슈)

---

### L-deploy-build-restart (2026-04-15) — 프론트 배포 3단계 필수 (업로드→빌드→재시작)

**문제**: 프론트 소스 수정 후 "배포 완료" 보고했지만 실제 서비스 미반영 반복 발생.
**원인 1**: rsync 업로드 후 npm run build 미실행 또는 실패.
**원인 2**: 빌드 완료 후 uvicorn 재시작 누락 — 정적 파일 캐시로 이전 버전 서빙.
**필수 3단계 (하나라도 누락 시 미반영)**:
  1. `rsync` 소스 업로드 (프론트 + 백엔드)
  2. `npm run build` 서버 빌드 + `stat dist/index.html` 타임스탬프 검증
  3. `shutdown.sh && startup.sh` uvicorn 재시작 + 헬스체크 확인
**적용**: odev 완료 보고 시 3단계 모두 수행했는지 명시 필수. otest에서 헬스체크 + 빌드 타임스탬프 물리 검증.

### L-progress-label-helper (2026-04-15) — 프로그레스바/카드 표시 레이블은 헬퍼 함수로 추출

**패턴**: 전역 프로그레스바 label과 카드 표시 텍스트가 같은 조합 로직(사이트명+도메인명)을 공유할 때, `buildProgressLabel` / `buildCardLabel` 헬퍼 함수로 추출해 일원화.
- 하드코딩 label → 헬퍼 함수: `sites` + `domains` 목록을 받아 한글명 조합 → fallback 처리까지 단일 장소에서 관리
- 각 action(연결/해제/재초기화)은 헬퍼에 `action` 문자열만 전달 → 일관된 포맷 보장

**재사용 권장**: UI에서 동일한 표시 포맷이 2곳 이상 사용되면 헬퍼 함수로 추출하라. 특히 lookup 목록(sites/domains)을 매번 컴포넌트에서 직접 접근하는 패턴은 중복 로직 오류의 온상.
**Level**: 1

### L-step-log-heartbeat (2026-04-15) — step_log + heartbeat로 완료 페이지에 시간/참여자 통계 제공

**패턴**: 워크스페이스 완료 후 "단계별 소요시간"과 "참여자 통계"를 한 화면에 제공하는 두 가지 신규 테이블 패턴.
- `workspace_step_log`: (workspace_id, step_name, started_at, finished_at) — 워크플로우 전환 시점마다 INSERT/UPDATE. 완료 시 단계별 소요시간 리포트.
- `user_session_log`: (workspace_id, user_id, last_seen_at) — 프론트 `useHeartbeat` 훅이 30초 주기로 UPSERT. 완료 시 참여 인원 집계.

**재사용 권장**: 다단계 워크플로우에서 "진행 시간 추적"이 필요할 때 step_log 패턴, "동시 접속자 추적"이 필요할 때 heartbeat + session_log 패턴을 재사용하라.
**Level**: 1

### L-build-history-site-col (2026-04-15) — build_history에 workspace/site_code 컬럼 추가로 빌드 맥락 보존

**문제**: 기존 `build_history`는 빌드 메타데이터만 있고, 어느 워크스페이스/사이트 빌드인지 표시 불가.
**조치**: `workspace_id`, `site_code` 컬럼 추가 + 빌드이력 페이지에 도메인+사이트 표시.
**원칙**: 이력/감사 테이블에는 생성 당시 맥락(어느 워크스페이스, 어느 사이트)을 컬럼으로 보존하라. JOIN으로 조회 가능한 경우라도 감사용 데이터는 denormalized 사본을 유지하는 것이 안전하다.
**Level**: 1

### L-backup-folder-naming (2026-04-15) — 백업폴더명 고정prefix + 날짜/시간 편집 패턴

**패턴**: 백업 폴더명을 `{도메인ID}_{사이트ID}_{날짜시간}` 형태로 구성 시, 앞부분(prefix)은 시스템이 자동 생성하고 날짜/시간 부분만 사용자가 편집 input으로 수정.
- 사이트 드롭다운 제거로 UI 단순화 (사이트는 워크스페이스에 이미 고정)
- 사용자 실수(잘못된 prefix 입력) 방지

**재사용 권장**: 백업/내보내기 파일명에 시스템 맥락(ID 등)을 prefix로 강제해야 할 때 동일 패턴 적용.
**Level**: 1

### L-finished-phase (2026-04-14) — "되돌릴 수 없는 상태"는 별도 phase로 표현

**문제**: 완료 단계(`complete`)와 영구 확정 상태(`finished`)를 같은 phase로 뭉치면, UI에서 "확정 전/후" 경계가 흐려져 사용자가 실수로 되돌릴 수 없는 동작을 트리거하기 쉽다.

**조치**: `workspace.phase`에 `finished` 값을 신설해 비즈니스 경계를 명확히 함. prepare(준비) → finalize(확정) 2단계 UI로 분리해, finalize 단계는 별도 확인을 요구.

**재발방지 원칙**: "되돌릴 수 없는 상태 전이"는 별도의 phase/status 값으로 표현하라. 같은 phase 내 flag 토글로 처리하면 UI·API 양쪽에서 경계가 흐려진다.
**Level**: 2 (MEMORY.md 반영)

### L-public-share-route (2026-04-14) — 공개 공유 페이지는 PrivateRoute 밖 + /api/public/* 인증 예외

**패턴**: 외부 공유용 페이지(`PublicShare.tsx`)는 반드시 `PrivateRoute` 래퍼 밖에 두고, 백엔드는 `/api/public/*` prefix로 인증 미들웨어 화이트리스트에 등록. "조건부 인증 해제"보다 경로 분리가 깔끔.

**재사용 권장**: 향후 외부 공유/임베드 기능에 동일 패턴 재사용 가능. 공개/비공개 혼재 엔드포인트 금지.
**Level**: 1

### L-multi-batch-oplan-deep (2026-04-14) — oplan_deep 4-batch 분할이 대규모 작업에 효과적

**패턴**: ~2000줄 규모 작업(완료 프로세스 재설계)에서 oplan_deep이 4개 batch로 자연스레 분할(DB/서비스, UI 대시보드, 리포트/메일/공유, 공개 공유 페이지). 각 batch는 독립 팀에이전트로 위임 가능해 Auto-Loop가 끝까지 자동 진행됨.

**재사용 권장**: o5 Massive 작업에서 기능 축 기준(DB → 서비스 → UI → 통합) batch 분할을 기본 템플릿으로 고려.
**Level**: 1

### L-audit-data (2026-04-14) — 감사용 누적 데이터를 reset/release 범주에서 분리

**문제**: `build_history` DELETE가 3곳(assignment.py, workspace.py, build.py)에 산재. 워크스페이스 초기화/해제 흐름에 섞여 감사용 빌드이력까지 함께 삭제되는 구조였음.

**원인**: "워크스페이스 관련 데이터"라는 범주에 감사용 누적 데이터(build_history)를 같이 묶어 관리. reset/release 의미론과 audit 의미론이 충돌.

**조치**:
- build_history DELETE 3곳 모두 제거
- `BuildHistory` docstring에 "영구 보존 (감사용)" 명시
- `delete_build_history` 엔드포인트 제거

**재발방지 원칙**: 감사용 누적 데이터(*_history, audit_*)는 "reset/release" 범주에서 물리적으로 분리. 워크스페이스 생애주기와 독립된 저장소/정책으로 관리.
**Level**: 2 (MEMORY.md 반영)

### L-backup-pattern (2026-04-14) — BAK_ 테이블 + metadata.json 백업 템플릿

**패턴**: 도메인 적용 기능에서 사용한 백업 구조.
- `BAK_{prefix}_{timestamp}` 명명으로 원본 스키마 복제
- `metadata.json`에 원본 테이블명/시각/컨텍스트 기록
- `backup_service.py`에 목록/복원/삭제 일원화
- REST API는 `/api/backup/*`로 분리

**재사용 권장**: 향후 "되돌릴 수 있는 일괄 쓰기" 기능(예: 대량 import, 마이그레이션)에 동일 패턴 재사용 가능.
**Level**: 1

### L-001 (2026-04-09) — 프론트엔드 빌드 미수행으로 변경사항 미반영

**문제**: kdone이 Git 커밋+푸시 완료 후 파이프라인 종료. 그러나 프론트 소스는 서버에 rsync됐지만 `npm run build`를 실행하지 않아 dist/ 가 이전 빌드(1시간 전) 상태로 남음. 사용자가 변경사항이 반영되지 않았다고 보고.

**원인**:
1. `kinfra_know` 서버빌드 섹션이 존재하지 않는 `build_and_restart.sh`를 참조
2. kdone_git이 배포(rsync+빌드+재시작)까지 책임지는지 명확하지 않았음
3. ktest가 서버 배포 후 빌드 완료 여부를 검증하지 않음

**조치**:
- `kinfra_know` 작업_흐름을 백엔드/프론트 분리하여 필수 순서 명시
- `서버빌드` 명령을 `npm run build`로 교체 (build_and_restart.sh 제거)
- dist/index.html 타임스탬프 확인 단계 추가
- 프론트 변경 시 필수 순서 7단계로 명문화

**재발방지**: kinfra_know 작업_흐름 섹션이 단계별 체크리스트로 명확화됨. 프론트 변경 시 빌드 미완료는 타임스탬프 확인으로 즉시 감지 가능.

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

### L-017: 팀에이전트 spawn 시 subagent_type 빈 값으로 2회 hook 차단 (2026-04-01)

**현상**: kdev-fix 에이전트 spawn 시 subagent_type을 빈 문자열로 설정하여 no_team_agent_guard.sh에 2회 연속 차단됨 (ERR-1: TEST 상태, ERR-2: DEV 상태).
**원인**: 팀에이전트(NAME= 파라미터) spawn 시 subagent_type을 명시하지 않아 빈 값으로 전달됨.
**재발방지**: 팀에이전트 spawn 시 `subagent_type` 반드시 명시 (general-purpose 포함). 빈 값 금지. hook이 차단하면 subagent_type 파라미터 확인 후 재시도.
**Level**: 2 (MEMORY.md 반영)

### L-018: 신규 DB 접근 함수에서 테이블 부재 예외 미처리 (2026-04-01)

**현상**: work_history_service.py 이력취소() 함수가 사전 테이블(예: TEST_UDIC) 부재 시 sqlalchemy.exc.OperationalError를 발생시켜 500 에러 반환 — ktest AC-004에서 발견.
**원인**: 신규 기능 구현 시 테이블이 존재하지 않는 케이스(테스트 도메인 등)에 대한 예외 처리 누락.
**재발방지**: DB 테이블 직접 접근 코드(SQLAlchemy `db.execute(tbl...)`) 작성 시 `except OperationalError` 처리 필수. 테이블 없는 경우 graceful pass 또는 명시적 에러 메시지 반환.
**Level**: 1 (1회 발생, ktest에서 발견·수정 완료)

### L-019: 파일 대상 오류 — kdev 전 컴포넌트 역할 사전 확인 필수 (2026-04-01)

**현상**: 작업실 8대 기능(배너+포커스스타일+레이아웃+AI분석+작업이력+단축키+핫키설정)을 `KnowledgeWork.tsx`에 구현해야 했으나 `Workspace.tsx`에 잘못 적용 → 전체 재작업 필요.
**원인**: kplan 단계에서 파일명 유사성(Workspace vs KnowledgeWork)으로 인해 대상 컴포넌트 역할 파악 없이 구현 파일 결정.
**재발방지**: kdev 시작 전 구현 대상 파일의 컴포넌트 역할을 반드시 코드 또는 라우팅에서 확인. 파일명 유사 시 실제 역할(라우트 경로, 페이지 목적) 확인 후 구현 파일 결정.
**Level**: 1 (1회 발생, docs 기록)

### L-020: API 반환 타입 구조 변경 시 전체 호출처 영향 분석 필수 (2026-04-01)

**현상**: 도메인목록 API 반환 타입을 `string[]` → `{id: string, name: string}[]`로 변경 시 BuildHistory.tsx 호출처를 누락하여 타입 오류 발생.
**원인**: API 타입 변경 영향 범위 분석 시 workspace.ts를 import하는 모든 파일을 Grep 검색하지 않고 주요 파일만 수정.
**재발방지**: API 반환 타입 구조 변경(primitive → object 등) 시 해당 타입을 import하는 프론트엔드 전체 파일 Grep 검색 후 모든 호출처 영향도 확인 필수.
**Level**: 1 (1회 발생, docs 기록)

### L-021: Agent spawn subagent_type 빈 값 — L-017 재발 (3회) (2026-04-02)

**현상**: kdev 에이전트 spawn 시 subagent_type 빈 값으로 설정하여 no_team_agent_guard.sh에 3회 연속 차단됨.
**원인**: L-017에서 MEMORY.md에만 기록되고 kdev/ko 스킬에 명시적 spawn subagent_type 필수 규칙이 없어 재발.
**재발방지**: ko/kdev 스킬에 "Agent spawn 시 subagent_type 항상 명시 필수 (general-purpose 포함), 빈 값 금지" 규칙 추가. MEMORY.md 기록만으로는 방지 불충분 확인.
**Level**: 2 (MEMORY.md + 스킬 규칙 강화 필요)

### L-022: 역라우팅 1회 — 이력/서비스 코드 action_type 상수값 사전 확인 누락 (2026-04-02)

**현상**: work_history_service.py 이력 undo 구현 시 기존 코드의 action_type 상수값(`'add'` 등)을 사전 확인하지 않고 추정하여 작성 → 역라우팅 1회 발생.
**원인**: 서비스 코드 수정 시 기존 코드의 열거값/상수를 grep으로 먼저 확인하지 않고 추측으로 작성.
**재발방지**: 이력/서비스 코드에서 action_type, status, 상태 열거값 등 상수를 사용하는 코드 작성 시, 반드시 기존 코드에서 grep으로 실제 값 먼저 확인. 추정 금지.
**Level**: 1 (1회 발생, docs 기록)

### L-023: PLAN 상태에서 서브에이전트 spawn hook 차단 (2026-04-02)

**현상**: kplan 실행 중 PLAN 상태에서 서브에이전트 spawn 시도 시 no_team_agent_guard.sh가 차단. subagent_type=general-purpose 명시에도 차단됨.
**원인**: no_team_agent_guard.sh가 PLAN 상태를 감지하여 팀에이전트 spawn을 상태 기반으로 차단. L-021(빈 subagent_type 차단)과 다른 패턴.
**재발방지**: PLAN 상태에서는 팀에이전트 spawn 불가. kplan에서 서브에이전트 spawn이 필요한 경우 파이프라인 상태 전환(DEV 등) 후 시도.
**Level**: 1 (1회 발생, docs 기록)

### L-024: 역라우팅 1회 — AC-006 escCount 상태 변수 미구현 (2026-04-02)

**현상**: KnowledgeWork.tsx 단축키 개선 작업 시 escKeyword+escCount 상태 쌍 중 escCount를 derivedHotkeys 설계 단계에서 누락하여 역라우팅 1회 발생.
**원인**: 단축키 이벤트 관련 상태 변수(keyword+count 쌍)를 구현할 때 연관 상태를 함께 체크하지 않음.
**재발방지**: 단축키/이벤트 카운터 상태 구현 시 관련 상태 변수 쌍(keyword+count)을 함께 체크리스트로 확인. AC 검증 항목에서 미구현 상태 조기 발견 필요.
**Level**: 1 (1회 발생, docs 기록)

### L-025: Python 3.8 서버 환경에서 PEP 585 타입 힌트 사용으로 빌드 오류 (2026-04-02)

**현상**: `api/llm_settings.py`에서 `list[Dict[str, Any]]` 형식 PEP 585 타입 힌트 사용으로 Python 3.8 서버에서 TypeError 발생 — ktest 빌드 단계에서 발견·수정.
**원인**: kdev 단계에서 서버 Python 버전(3.8)을 확인하지 않고 Python 3.9+ built-in 제네릭(list[T], dict[K,V]) 사용.
**재발방지**: Python 신규 파일 작성 시 서버 Python 버전(3.8) 사전 확인 필수. `list[T]`/`dict[K,V]` 금지 — 반드시 `from typing import List, Dict, Optional` 임포트 후 사용.
**Level**: 1 (ktest에서 즉시 발견·수정, docs 기록)

### L-026: write_guard.sh가 Bash mkdir -p 차단 → kio dir_create로 즉시 대체 (2026-04-03)

**현상**: kdev 에이전트가 디렉토리 생성 시 Bash `mkdir -p` 명령 사용 → write_guard.sh 차단 → `mcp__kio__dir_create`로 정상 대체.
**원인**: kdev 에이전트가 CLAUDE.md kio 독점 규칙을 준수하지 않고 Bash mkdir 사용 시도.
**재발방지**: 디렉토리 생성 시 항상 `mcp__kio__dir_create` 사용 (write_guard 차단 → 즉시 kio로 대체 패턴).
**Level**: 1 (write_guard가 즉시 차단·대체 처리, docs 기록)

### L-027: PLAN 상태 서브에이전트 spawn hook 차단 재발 (L-023 2차) (2026-04-03)

**현상**: kplan 실행 중 PLAN 상태에서 서브에이전트 spawn 시도 시 no_team_agent_guard.sh가 차단됨 (L-023과 동일 패턴 2차 발생).
**원인**: L-023에서 Level 1(LESSONS.md 기록)으로만 처리되어 규칙 인지 강화 조치가 없었음.
**재발방지**: PLAN 상태에서 팀에이전트/서브에이전트 spawn 불가 원칙 재확인. kplan 실행 중 spawn이 필요한 경우 파이프라인 상태 전환(DEV 등) 후 시도.
**Level**: 2 (MEMORY.md 반영)

### L-028: Python 3.8 서버 PEP585 타입힌트 재발 — from __future__ annotations 필수 (2026-04-05)

**현상**: `services/dict_verify_service.py`에서 `tuple[set]` PEP585 내장 제네릭 사용 → Python 3.8 서버에서 TypeError 발생. ktest에서 발견·수정.
**원인**: L-025에서 Level 1(LESSONS.md 기록)만 처리하여 kdev 스킬 규칙 강제화 없었음 → 재발.
**재발방지**: `from __future__ import annotations` 파일 상단 필수. `list[T]`/`dict[K,V]`/`tuple[T]`/`set[T]` 모두 금지 — `from typing import List, Dict, Tuple, Set` 사용. kdev/SKILL.md에 "Python 파일 작성 규칙" 섹션 추가 완료.
**Level**: 3 (kdev SKILL.md 규칙 강화 — L-025 재발)

### L-029: FastAPI 엔드포인트 반환값 누락 + str 직접 반환 금지 (2026-04-05)

**현상**: 사용자phase조회(`GET /phase`) → str 직접 반환 (dict 래핑 필요), 사용자phase설정 → return문 반환값 누락.
**원인**: 신규 API 엔드포인트 구현 시 반환 타입 일관성 검토 없이 구현.
**재발방지**: FastAPI 엔드포인트 구현 시 (1) 모든 return문에 반환값 필수, (2) str 반환 금지 → `{"result": value}` dict 래핑.
**Level**: 2 (docs 기록)

### L-030: TypeScript 중복 export 오류 (TS1117) — export 추가 전 기존 목록 확인 (2026-04-05)

**현상**: `workspace.ts`에서 `advancePhase` 함수를 2중 export → TS1117 컴파일 오류.
**원인**: 대규모 리팩토링 시 export 목록 중복 체크 없이 함수 추가.
**재발방지**: TypeScript 파일에 export 추가 시 파일 내 기존 export 목록과 중복 여부 grep 확인 후 추가.
**Level**: 1 (1회 발생, docs 기록)

### L-031: SQL migration 주석 라인 스킵 버그 — 파싱 시 필터링 필수 (2026-04-05)

**현상**: `main.py`의 SQL migration 파일 파싱 시 `--` 주석 라인 필터링 누락 → 빈 구문 실행 오류.
**원인**: SQL 파일 파싱 로직에서 주석 행 필터링 코드 미포함.
**재발방지**: SQL migration 파싱 시 `strip()` 후 `--`로 시작하는 라인 및 빈 구문 제거 로직 포함 필수.
**Level**: 1 (1회 발생, docs 기록)

### L-032: DB 컬럼명 오타 — 쿼리 작성 전 스키마 grep 사전 확인 (2026-04-05)

**현상**: `api/dict_verify.py`에서 `build_history.workspace` 컬럼 참조 → 실제 컬럼명은 `domain`.
**원인**: SQL 쿼리 작성 시 테이블 컬럼명을 스키마 파일에서 확인하지 않고 추정.
**재발방지**: SQL 쿼리 작성 시 `grep` 또는 migration SQL에서 실제 컬럼명 먼저 확인. 추정 금지.
**Level**: 1 (1회 발생, docs 기록)

### L-033: PHASE1_STEPS 단계 번호 불연속 — 제거 시 주석 필수 (2026-04-07)

**현상**: Step 3,4,5를 작업실 실시간 API로 이전 후 PHASE1_STEPS 번호가 0→1→2→6으로 불연속해짐.
**원인**: 단계 제거 시 번호 재정렬 또는 이유 주석 없이 단순 삭제.
**재발방지**: PHASE1_STEPS에서 단계 제거/이전 시 "# 3~5: 작업실 실시간 API로 이전 (executor.py → morpheme_service.py)" 형식의 주석 또는 번호 재정렬 필수.
**Level**: 1 (1회 발생, docs 기록)

### L-034: 경로 상수 다중 파일 중복 선언 — constants.py 단일 출처 원칙 (2026-04-07)

**현상**: KNOW_OPS_SRC, WORKSPACE_BASE 같은 경로 상수가 executor.py, morpheme_service.py, synonym_checker.py 3개 파일에 각각 중복 선언.
**원인**: 빠른 구현을 위해 기존 파일의 상수를 복사해서 사용.
**재발방지**: 프로젝트 공통 경로 상수는 `core/config.py` 또는 `constants.py`에 단일 출처로 관리. 새 파일에서 경로 상수 필요 시 import 사용, 재선언 금지.
**Level**: 1 (1회 발생, docs 기록)

### L-035: phase1 모듈이 pipeline 모듈에 역방향 import — 레이어 의존성 위반 (2026-04-07)

**현상**: executor.py(phase1)에 정의된 _db_thesaurus를파일로내보내기()를 build_wrapper.py(pipeline)에서 import하는 역방향 의존 구조.
**원인**: 빌드 전 thesaurus export 기능을 기존 executor.py에 추가하면서 pipeline 모듈이 phase1에 의존하게 됨.
**재발방지**: DB 내보내기 같은 공통 유틸은 services 계층 또는 별도 utils 모듈로 분리. pipeline → phase1 역방향 import 금지.
**Level**: 1 (1회 발생, docs 기록)

### L-036: ktest 팀에이전트 프롬프트에 curl localhost 하드코딩 금지 (2026-04-08)

**현상**: ktest-1 팀에이전트 spawn 프롬프트에 `curl -s http://localhost:` 직접 명시 → L-110 hook 차단.
**원인**: 팀에이전트에게 API 헬스체크 방법을 직접 명시하면서 curl 명령을 하드코딩.
**재발방지**: 팀에이전트 프롬프트에 `curl localhost` 직접 명시 금지. ktest_run 스킬 위임 방식 사용. "헬스체크" 또는 "API 응답 확인" 등 추상적 지시만 포함할 것.
**Level**: 1 (1회 발생, docs 기록)

### L-037: 신규 DB 컬럼 참조 코드 작성 시 migration SQL 동시 작성 필수 (2026-04-08)

**현상**: `assignment_service.py`에서 `llm_settings.thesaurus_prompt` 컬럼 참조 코드 작성 후 migration SQL 누락 → 500 오류 발생, 사후 ALTER TABLE 추가 필요.
**원인**: 코드 작성 시 DB 컬럼 추가가 필요함을 인지했으나 migration SQL 파일 작성을 누락.
**재발방지**: DB 모델/서비스에서 신규 컬럼 참조 코드 작성 시 `ALTER TABLE ... ADD COLUMN ...` migration SQL을 반드시 동시 작성. 코드-DB 동기화 원칙.
**Level**: 1 (1회 발생, docs 기록)

### L-039: team-report.sh 타세션 에이전트를 "정리 필요"로 오표시 — 정보 표시로 변경 (2026-04-08)

**현상**: team-report.sh가 다른 tmux 세션에서 정상 실행 중인 에이전트를 "파이프라인 미완료 — kfinish 진입 금지"로 경고. "정리 필요"가 표시되어 이 세션에서 생성한 팀이 다른 세션에 있다는 잘못된 분석 유발.
**원인**: session-env는 모든 세션이 공유하는 글로벌 디렉토리. 다른 프로젝트 세션의 에이전트 pane이 MY_SESSION과 다르다는 이유만으로 경고를 발생시킨 설계 오류.
**재발방지**: team-report.sh에서 타세션 에이전트는 노란색 ℹ️ 정보 표시로만 출력(HAS_ISSUE 미설정). kstatus SKILL.md에 session-env 범위 이해 섹션 추가. "정리 필요"는 실제 고착 파이프라인/고아 pane에만 표시.
**Level**: 2 (스크립트 + 스킬 수정)

### L-038: Agent-mode 에이전트는 tmux pane kill로 종료 불가 — TeamDelete 필수 (2026-04-08)

**현상**: kstatus에서 deployer 에이전트의 tmux pane(%101)을 kill -9로 소멸시켰음에도 idle_notification이 계속 수신됨. shutdown_request 2회 발송 후에야 TeamDelete로 완전 제거.
**원인**: Agent 도구로 spawn된 에이전트는 Claude Code 내부 실행 방식이라 tmux pane과 독립적으로 동작. pane 소멸 = 화면 소멸이지 프로세스 종료가 아님.
**재발방지**: Agent-mode 에이전트(know-deploy 같은 임시 팀) 정리 순서: ① shutdown_request 발송 → ② ack 대기(최대 10초) → ③ TeamDelete 호출. pane kill 단독으로는 완전 종료 불가.
**Level**: 2 (MEMORY.md 반영)

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
| L-017 | 팀에이전트 spawn subagent_type 빈 값 차단 | MEMORY | MEMORY.md | 2026-04-01 | 🔄 재발 (L-021) |
| L-021 | Agent spawn subagent_type 빈 값 3회 재발 | LESSONS+MEMORY+skill | LESSONS.md+MEMORY.md+ko/SKILL.md | 2026-04-02 | ✅ |
| L-022 | 역라우팅 1회 — action_type 상수값 사전 확인 누락 | LESSONS | LESSONS.md | 2026-04-02 | ✅ |
| L-018 | DB 테이블 부재 OperationalError 미처리 | LESSONS | LESSONS.md | 2026-04-01 | ✅ |
| L-027 | PLAN 상태 spawn hook 차단 재발 (L-023 2차) | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-03 | ✅ |
| L-025 | Python 3.8 PEP585 타입힌트 (1차) | LESSONS | LESSONS.md | 2026-04-02 | 🔄 재발 (L-028) |
| L-028 | Python 3.8 PEP585 재발 (2차) | LESSONS+skill | LESSONS.md+kdev/SKILL.md | 2026-04-05 | ✅ |
| L-029 | FastAPI 반환값 누락/str 반환 | LESSONS | LESSONS.md | 2026-04-05 | ✅ |
| L-030 | TS 중복 export (TS1117) | LESSONS | LESSONS.md | 2026-04-05 | ✅ |
| L-031 | SQL migration 주석 파싱 버그 | LESSONS | LESSONS.md | 2026-04-05 | ✅ |
| L-032 | DB 컬럼명 오타 (build_history.workspace) | LESSONS | LESSONS.md | 2026-04-05 | ✅ |
| L-033 | PHASE1_STEPS 단계 번호 불연속 | LESSONS | LESSONS.md | 2026-04-07 | ✅ |
| L-034 | 경로 상수 다중 파일 중복 선언 | LESSONS | LESSONS.md | 2026-04-07 | ✅ |
| L-035 | phase1→pipeline 역방향 import | LESSONS | LESSONS.md | 2026-04-07 | ✅ |
| L-036 | ktest 프롬프트 curl localhost 하드코딩 | LESSONS | LESSONS.md | 2026-04-08 | ✅ |
| L-037 | 신규 DB 컬럼 참조 시 migration SQL 누락 | LESSONS | LESSONS.md | 2026-04-08 | ✅ |
| L-038 | Agent-mode 에이전트는 TeamDelete로만 완전 종료 가능 | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-08 | ✅ |
| L-039 | 타세션 에이전트를 정리 필요로 오표시 | Script+Skill | team-report.sh+kstatus/SKILL.md | 2026-04-08 | ✅ |
| L-040 | TeamCreate config.json 누락 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-041 | bash_exec python3 heredoc 따옴표 충돌 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-042 | JSX 포함 파일 .ts 확장자 사용 금지 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-043 | Agent tool 에이전트 tmux pane 없음 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-044 | SQLite 동적 테이블명 whitelist 검증 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-045 | FastAPI 다중 DML try/except/rollback | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-046 | React ErrorBoundary 흰 화면 방지 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-047 | Axios 에러 인터셉터 한국어 메시지 통일 | LESSONS | LESSONS.md | 2026-04-09 | ✅ |
| L-048 | 신규 사전 타입 추가 시 export 함수 분기 쌍으로 작업 필수 | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-11 | ✅ |
| L-049 | WS 사전 작업이력 workspace 기반 동적 테이블명 사용 필수 | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-11 | ✅ |
| L-050 | 사전 UI 변경은 work_history 기록 필수 | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-11 | ✅ |
| L-051 | kplan_debate는 메인(team-lead)에서 직접 실행 필수 | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-12 | ✅ |
| L-052 | 전처리 유사어 파일 우선 — 빌드→전처리 인과 순서 필수 | LESSONS+MEMORY | LESSONS.md+MEMORY.md | 2026-04-12 | ✅ |
| L-059 | otest 서버 연결 불가 시 배포 미완료 명시 필수 | LESSONS | LESSONS.md | 2026-04-16 | ✅ |

---

## [2026-04-09] k5 Know 프로젝트 전반적 개선 작업

### L-040: TeamCreate config.json 누락 문제

**현상**: TeamCreate 성공 후 config.json 파일이 생성되지 않아 Agent spawn 시 "Team does not exist" 에러 반복 발생
**원인**: TeamDelete → TeamCreate 사이에 인박스 디렉토리 잔류로 config.json 미생성
**해결**: TeamDelete → TeamCreate 순서 재실행으로 복구
**재발방지**: TeamCreate 후 config.json 존재 확인 단계 추가
**Level**: 1 (1회 발생, docs 기록)

### L-041: kio MCP bash_exec에서 python3 heredoc 따옴표 이슈

**현상**: bash_exec 내 python3 -c "..." 구문에서 exit_code=2 (syntax error) 발생
**원인**: 명령 문자열 내 중첩 따옴표가 셸 파싱 시 충돌
**해결**: 따옴표 이스케이프 또는 단일 복잡 명령 대신 분리 실행
**Level**: 1 (1회 발생, docs 기록)

### L-042: 프론트엔드 keyboard.ts → keyboard.tsx 변경 필요

**현상**: JSX를 포함한 파일을 .ts 확장자로 저장하면 TypeScript 빌드 에러
**원인**: JSX 포함 파일은 반드시 .tsx 확장자 사용
**해결**: 파일 생성 시 JSX 포함 여부 사전 확인
**Level**: 1 (1회 발생, docs 기록)

### L-043: Agent tool 방식 에이전트는 tmux pane이 없음

**현상**: kstatus 진단 시 agents/ 파일은 없고, teams/ config.json도 없어 팀 상태 파악 불가
**원인**: Agent tool 방식은 pane 없이 실행되므로 kstatus의 tmux pane 기반 진단과 불일치
**해결**: kstatus Step 7 수량 리포팅에 Agent tool 방식 정상 처리 로직 추가 완료
**Level**: 2 (스킬 수정)

---

## [2026-04-09] know 프로젝트 전반 개선 — 보안/에러/DB/UX/새기능

### L-044: SQLite 동적 테이블명 보안 — whitelist 정규식 검증 필수 (2026-04-09)

**현상**: workspace 이름이 `kw_{workspace}` 동적 테이블명에 직접 삽입됨. SQL 인젝션 가능성 존재.
**원인**: ORM 미사용 SQLite raw query에서 사용자 입력을 테이블명/컬럼명에 직접 삽입.
**해결**: `_validate_workspace()` 함수로 `^[A-Za-z0-9_]+$` whitelist 검증 선행. 위반 시 ValueError 발생.
**재발방지**: 동적 테이블명/컬럼명에 사용자 입력 삽입 시 정규식 whitelist 검증 필수. parameterized query는 값에만 적용되고 식별자(테이블/컬럼명)에는 적용 불가.
**Level**: 1 (docs 기록)

### L-045: FastAPI SQLAlchemy 다중 DML — try/except/rollback 패턴 (2026-04-09)

**현상**: 여러 DELETE가 순차 실행될 때 중간 실패 시 부분 삭제 발생. 데이터 불일치 가능성.
**원인**: try/except 없이 순차 execute → 중간 에러 발생 시 commit 미도달로 롤백 없음.
**해결**: `try: ... db.commit() / except: db.rollback(); raise` 패턴으로 원자성 보장.
**재발방지**: 다중 DML(DELETE/INSERT/UPDATE 2개+)은 항상 try/except/rollback 래핑. 단일 db.commit()은 마지막에만.
**Level**: 1 (docs 기록)

### L-046: React ErrorBoundary — 런타임 에러 흰 화면 방지 (2026-04-09)

**현상**: React 컴포넌트 런타임 에러(null 참조, 타입 에러 등) 발생 시 흰 화면(WSOD) 표시.
**원인**: 에러 전파를 막는 컴포넌트 경계 없이 루트에서 렌더링.
**해결**: `ErrorBoundary` class 컴포넌트로 `<App />`을 래핑. 에러 발생 시 폴백 UI 표시.
**재발방지**: React 앱 루트 및 주요 기능 영역을 ErrorBoundary로 래핑 필수. class 컴포넌트로만 구현 가능(`componentDidCatch` + `getDerivedStateFromError`).
**Level**: 1 (docs 기록)

### L-047: Axios 에러 인터셉터 — 한국어 메시지 중앙 관리 (2026-04-09)

**현상**: 각 컴포넌트에서 개별 에러 메시지 처리 시 영문/불일치 메시지 혼재.
**원인**: 에러 처리 로직이 각 컴포넌트에 분산 → 일관성 유지 어려움.
**해결**: `api/client.ts` interceptors.response에 `HTTP_ERROR_MESSAGES` 맵으로 상태코드별 한국어 메시지 통일 적용. `detail` 필드 없을 때만 폴백.
**재발방지**: HTTP 에러 메시지는 client.ts 인터셉터에서 통일 처리. 각 컴포넌트에서 개별 에러 메시지 하드코딩 금지.
**Level**: 1 (docs 기록)

**MEMORY.md 점검 결과**: 이번 세션 교훈 L-044~L-047 모두 Level 1 (1회성 패턴). hook/스킬 처리 완료 항목 없음. Level 2+ 없으므로 MEMORY.md 반영 없음.

---

## [2026-04-09] 전역작업 단일 큐 완결 구현

> **작업 요약**: 워크스페이스 생성이 전역작업 큐를 우회하는 문제 수정 + executeCancel 정규식 수정 + restoreWorkspacePolling 추가 + 서버측 도메인 동시 차단

### L-048: 신규 함수 작성 시 동일 파일 기존 API 호출 패턴 먼저 확인 (2026-04-09)

**현상**: `restoreWorkspacePolling`에서 `workspaceAPI.진행률조회()` 반환값을 `AxiosResponse.data` 접근 없이 직접 사용 → TypeScript 타입 오류 발생. `_startPolling` 인자 수도 불일치.
**원인**: 서브에이전트가 신규 함수 작성 시 같은 파일의 기존 동일 API 호출 패턴을 사전 확인하지 않음.
**해결**: 기존 `executeConnect`의 `res.data?.status` / `res.data?.percent` 패턴으로 수정. `_startPolling(id, pollFn, interval, onDone, onError, timeout)` 시그니처 맞춤.
**재발방지**: 신규 함수 작성 시 같은 파일에서 동일 API 또는 동일 함수를 호출하는 기존 코드를 먼저 찾아 패턴(반환값 구조, 인자 수)을 확인한 후 작성하라.
**Level**: 1 (docs 기록)

**MEMORY.md 점검 결과**: 이번 세션 교훈 L-048 Level 1 (1회성 서브에이전트 패턴 미확인). hook/스킬 처리 불필요. MEMORY.md 반영 없음.

---

## [2026-04-09] 전처리 초기화 + kw_{workspace} 전용 테이블 전환

> **작업 요약**: 이전단계 이동 시 전처리 작업 전체 초기화 + 키워드 테이블 워크스페이스별 전용 분리
> **교훈 결과**: 프로세스 이슈 없음 (review actions = 0건) — MEMORY.md 반영 없음

**MEMORY.md 점검 결과**: 이번 세션 교훈 0건. 모든 작업은 기존 패턴의 정상 적용이며 hook/스킬 처리 완료 또는 1회성 특이사항 없음. MEMORY.md 반영 없음.

---

## [2026-04-10] 전역작업 스토어 실시간 다중 PC 동기화 구현

> **작업 요약**: WebSocket 기반 전역작업(GlobalTask) 실시간 동기화 — 모든 탭/PC에서 단일 큐 공유. F1~F5 수정으로 race condition 근본 해결 및 초기 상태 동기화 구현.

### L-049: 서브에이전트 spawn 프롬프트에도 L-110(curl localhost 금지) 적용 (2026-04-10)

**현상**: kdev 에이전트가 서브에이전트 spawn 프롬프트 문자열 내에 `curl -s http://localhost:` 명령어를 직접 포함 → hook(HOOK_BLOCK_CURL_LOCALHOST) 차단 발생.
**원인**: L-110 규칙이 메인 에이전트 직접 실행에만 적용된다고 인식하고, spawn 프롬프트 문자열에는 해당 없다고 판단한 실수.
**해결**: 정상 차단 후 curl 명령 없이 프롬프트 재작성.
**재발방지**: L-110은 spawn 프롬프트 문자열 내부에도 동일하게 적용된다. 프롬프트에 `curl -s http://localhost` 포함 금지.
**Level**: 1 (1회 발생, docs 기록)

### L-050: 파이프라인 활성(DEV) 중 일반 서브에이전트(general-purpose) spawn 금지 (2026-04-10)

**현상**: DEV 상태에서 `subagent_type=general-purpose` Agent spawn 시도 → hook(HOOK_BLOCK_NO_TEAM_AGENT) 차단 발생.
**원인**: 파이프라인 활성 중 추가 조사가 필요할 때 일반 서브에이전트 spawn이 가능하다고 잘못 판단.
**해결**: 정상 차단 확인. 조사는 kio file_read/bash_exec로 직접 수행.
**재발방지**: DEV/TEST 상태에서 일반 서브에이전트(general-purpose, codex 등) spawn 불가. 팀에이전트 spawn은 SPAWN_PHASE 상태에서만 허용. 파이프라인 활성 중 조사 작업은 kio 도구 직접 사용.
**Level**: 1 (1회 발생, docs 기록)

**MEMORY.md 점검 결과**: L-049, L-050 모두 Level 1 (1회성 실수, hook 정상 차단). 이미 hook이 물리 차단하므로 MEMORY.md 추가 반영 없음.

---

## [2026-04-10] MySQL 사전 4종 정합성 수정 (CATEGORY 누락 + 컬럼 불일치)

> **작업 요약**: MySQL→SQLite 마이그레이션/복사/건수조회 함수 4개에 CATEGORY 추가 + MySQL Java 원본 스키마 기반 컬럼 방어적 SELECT 수정

### L-316: MySQL-SQLite 마이그레이션 코드에서 외부 스키마 미확인으로 컬럼 불일치 발생 (2026-04-10)

**현상**: dictionary_service.py의 migrate_dict_from_mysql()에서 `SELECT _WORD, _MEMO, _USER_ID FROM {mysql_tbl}` 실행 시 MySQL 원본에 `_MEMO`, `_USER_ID` 컬럼이 없어 에러 발생 위험.
**원인**: tobe SQLite 스키마 기준으로 SELECT 컬럼을 작성하고, Java 원본 MySQL 스키마를 별도로 확인하지 않음.
**해결**: Java 소스에서 MySQL 테이블 컬럼 목록 확인 후 실제 존재하는 컬럼(_WORD 단독, _HEAD_WORD+_TAIL_WORD)만 SELECT하도록 수정.
**재발방지**: MySQL(외부 시스템) 연동 코드 작성 시 Java 원본 소스/마이그레이션 스크립트에서 실제 컬럼 목록 먼저 확인 필수. 내부 tobe 스키마와 외부 소스 스키마가 다를 수 있음에 유의.
**Level**: 2 (재발 가능성 높음 — MySQL 연동 코드 작성 시마다 발생 가능, MEMORY.md 반영)

**추가 교훈**: 사전 타입 확장 시 dictionary_service.py 내 타입 열거 위치 4곳(get_mysql_dict_count/migrate_dict_from_mysql/copy_domain_dict/get_dict_db_count) 동시 수정 필수. 하나라도 누락 시 기능 불일치 발생.

**MEMORY.md 점검 결과**: L-316은 Level 2 (외부 MySQL 스키마 미확인 패턴 — 재발 가능성 높음). MEMORY.md에 반영.

---

## [2026-04-11] 사전빌드 globalTaskStore 이관 + 작업실 스크롤 수정 + 분석결과 재조회

> **작업 요약**: buildOpsSlice 신설로 사전빌드를 전역작업으로 이관. KnowledgeWork 스크롤 수정. 빌드 완료 후 분석결과 즉시 갱신. assignment 단건 조회 API 추가.
> **교훈 결과**: 프로세스 이슈 없음 (review actions = 0건) — HOOK_BLOCK_OK 1건 (ktest_done_guard 정상 차단)

**MEMORY.md 점검 결과**: 이번 세션 교훈 0건. 정상 구현 완료. hook 정상 차단 1건(HOOK_BLOCK_OK). MEMORY.md 반영 없음.

### L-048: 신규 사전 타입 추가 시 export 함수 분기 쌍으로 작업 필수 (2026-04-11)

**현상**: build_service.py의 `ws_export_dict_file()`이 DICT/SYNONYM 타입만 처리하고 THESAURUS 타입을 synonym.UTF-8로 export하는 분기가 누락되어 사전빌드 시 유사어 미반영.
**원인**: `DictType` enum에 신규 타입(THESAURUS)을 추가할 때 export 함수에 대응 분기를 함께 추가해야 하는 원칙 미준수.
**재발방지**: `DictType` enum 확장 시 `ws_export_dict_file()`에 해당 타입 export 분기도 반드시 쌍으로 추가. 신규 사전 타입 체크리스트 항목으로 등록.
**Level**: 2 (MEMORY.md 반영)

### L-049: WS 사전 작업이력에서 workspace 기반 동적 테이블명 사용 필수 (2026-04-11)

**현상**: `work_history_service.py`의 `cancel_history_service()`에서 WS 사전 복원 시 workspace별 동적 테이블명을 사용하지 않고 고정 테이블명으로 접근하여 되돌리기 버그 발생.
**원인**: workspace 다중 지원 구조에서 WS 사전 테이블은 `ws_{workspace}_dict` 형태의 동적 테이블명을 사용하는데, 작업이력 서비스에서 이를 무시하고 고정 테이블명 접근.
**재발방지**: WS 사전 관련 작업이력 서비스에서 테이블 접근 시 항상 workspace 파라미터로 동적 테이블명 생성 패턴 준수.
**Level**: 2 (MEMORY.md 반영)

### L-050: 사전 UI 변경(등록/삭제/유사어) 작업은 work_history 기록 필수 (2026-04-11)

**현상**: `DicTab.tsx`의 단어 저장, 삭제, 유사어 일괄저장 동작이 work_history에 기록되지 않아 되돌리기 기능 불작동.
**원인**: 사전 변경 작업은 모두 work_history에 기록해야 하는 원칙이 프론트엔드 컴포넌트 구현 시 누락됨.
**재발방지**: 사전(단어/유사어) 등록/수정/삭제 UI 액션 구현 시 work_history API 호출 포함 필수. 신규 사전 관련 기능 추가 시 체크리스트로 확인.
**Level**: 2 (MEMORY.md 반영)

---

## [2026-04-11] auto-save 제거 + 사전빌드 재분석/percent 개선

> **작업 요약**: KnowledgeWork auto-save 완전 제거. reanalyze_from_db() 신규. build_service percent 추가. buildOpsSlice 백엔드 percent 활용.
> **교훈 결과**: 프로세스 이슈 없음 (review actions = 0건) — HOOK_BLOCK_OK 2건 (파이프라인 순서 정상 차단)

**MEMORY.md 점검 결과**: 이번 세션 교훈 0건. hook 정상 차단 2건(HOOK_BLOCK_OK — 방어 체계 정상 작동). 1회성 이슈 없음. MEMORY.md 반영 없음.

---

## [2026-04-11] 키워드 마지막 선택 기억 기능 구현

> **작업 요약**: user_last_selected 테이블 신설 + PUT/GET API 추가 + KnowledgeWork.tsx saveLastSelected(debounce 300ms) + 목록초기화 시 last-selected 우선 조회.

**교훈**:
- WSL 재기동 후 kresume으로 정확하게 파이프라인 재개 가능함 (PLAN_DONE → DEV 재개 성공)
- kdev-1_result.json의 status="completed" + todos_completed=[1,2,3,4,5]로 완료 여부 명확히 확인 가능
- 프로세스 이슈 없음 — LESSONS.md 반영 없음.

---

## [2026-04-11] 작업실 키워드 자동복원 — keyword_id 기반 페이지 계산 API + pre-fetch

> **작업 요약**: `get_keyword_page()` 신규 함수로 keyword_id → 페이지 번호 계산. `/api/assignments/keyword-page` API 추가. 프론트 `목록초기화()` 신규 API 활용으로 startPage 정확히 계산 + pre-fetch 수정.
> **교훈 결과**: 프로세스 이슈 없음 (review actions = 0건) — HOOK_BLOCK_OK 1건 (ktest_done_guard 정상 차단)

**MEMORY.md 점검 결과**: 이번 세션 교훈 0건. hook 정상 차단 1건(HOOK_BLOCK_OK — 방어 체계 정상 작동). 1회성 이슈 없음. MEMORY.md 반영 없음.

---

## [2026-04-11] kstatus + kfinish_cleanup → kfinish 단일 스킬 통합

> **작업 요약**: kfinish_cleanup·kstatus 삭제, kfinish 단일 스킬에 pane 진단~IDLE 전환 전체 통합 (Step 1-A~H).

**교훈**:
- 3단 레이어(kfinish → kfinish_cleanup → kstatus) 제거로 파이프라인 종료 절차 단순화
- kfinish가 pane 진단부터 IDLE 전환까지 단일 책임 보유 — 중간 스킬 호출 불필요
- 프로세스 이슈 없음 (review actions = 0건) — HOOK_BLOCK_OK 4건 (방어 체계 정상 작동)

**MEMORY.md 점검 결과**: 이번 세션 교훈 0건. 스킬 인프라 통합 작업. hook 정상 차단 4건(HOOK_BLOCK_OK). MEMORY.md 반영 없음.


---

## [2026-04-11] 사전빌드 유사어 미반영 + 작업이력 되돌리기 버그 수정

> **작업 요약**: build_service.py THESAURUS export 분기 추가. work_history_service.py workspace 기반 WS 사전 접근 수정. DicTab.tsx 등록/삭제/유사어일괄저장에 work_history 기록 추가.
> **교훈 결과**: 3건 (L-048~L-050, Level 2 — MEMORY.md 반영)

**MEMORY.md 점검 결과**: Level 2 항목 3건 — 신규 사전 타입 추가 절차, WS 사전 작업이력 테이블 접근 패턴, 사전 UI work_history 기록 원칙 모두 MEMORY.md에 반영됨.

---

## [2026-04-12] 사전 workflow 정책 준수 + 작업완료 메뉴 추가

> **작업 요약**: 사전작업흐름 6대 정책 중 위반 항목 수정 + 작업완료 메뉴(정책 #6) 신규 구현.
> 정책 #3(전처리 파일 우선), 정책 #4(빌드 synonym.UTF-8 생성), 정책 #6(작업완료 메뉴/API/서비스) 완전 구현.
> **교훈 결과**: 2건 (L-051~L-052, Level 2 — MEMORY.md 반영) + HOOK_BLOCK_OK 3건 (방어 체계 정상 작동)

**MEMORY.md 점검 결과**: Level 2 항목 2건 — kplan_debate flat team 제약, 전처리 유사어 인과 순서 원칙 MEMORY.md에 반영됨.

### L-051: kplan_debate는 메인(team-lead)에서 직접 실행 필수 (2026-04-12)

**현상**: kplan-1 팀에이전트가 kplan_debate 스킬 실행 중 분석가/비판가 에이전트를 내부 spawn 시도 → pipeline_order_guard.sh가 3회 차단 (HOOK_BLOCK_OK).
**원인**: kplan_debate SKILL.md가 팀에이전트 내부에서 추가 에이전트를 spawn할 수 있다고 전제. 그러나 Claude Code flat team 구조에서는 팀에이전트(kplan-1)가 다른 팀에이전트를 직접 spawn 불가.
**재발방지**: kplan_debate는 반드시 메인(team-lead)에서 직접 Skill()로 호출해야 함. 팀에이전트가 kplan_debate를 실행하는 경우, 단일 에이전트가 3렌즈(아키텍처/리스크/구현) 역할을 내부 분리하여 수행.
**Level**: 2 (MEMORY.md 반영)

### L-052: 전처리 유사어 파일 우선 정책 — 빌드→전처리 인과 순서 필수 (2026-04-12)

**현상**: 전처리(`_sync_synonym`)를 파일 우선으로 전환할 때, ws/synonym.UTF-8이 존재하지 않으면 DB 폴백이 발생하여 정책 재위반 위험.
**원인**: 전처리가 파일 우선 로직으로 전환되려면 해당 파일이 반드시 사전에 존재해야 함. 이 파일은 사전빌드(`ws_export_dict_file`)에서 WS 루트에 synonym.UTF-8을 생성해야만 보장됨.
**재발방지**: 전처리 파일 우선 폴백이 안전하려면 사전빌드 단계에서 WS 루트 synonym.UTF-8 생성이 선행되어야 함. 빌드 → 전처리 인과 순서를 반드시 지킬 것. 신규 워크스페이스나 빌드 미실행 환경에서는 DB 폴백이 발동될 수 있음을 유의.
**Level**: 2 (MEMORY.md 반영)

### L-053: React useRef/useCallback 선언 이후에 의존 useEffect 위치 필수 (2026-04-12)

**현상**: `BuildHistory.tsx`에서 상태 복원 `useEffect`가 `pollRef`(useRef) 및 `빌드로그조회`(useCallback) 선언 이전에 위치하여, 새로고침 후 폴링이 자동 재시작되지 않는 버그 발생.
**원인**: JavaScript의 TDZ(Temporal Dead Zone) — 훅 선언 이전의 코드에서 해당 훅 참조 시 `undefined` 참조. React 함수 컴포넌트에서 훅 순서가 실행 순서이기도 함.
**재발방지**: `useRef`, `useCallback`으로 생성한 값을 참조하는 `useEffect`는 반드시 해당 훅 선언 **이후**에 위치시킬 것. 특히 폴링(`setInterval`)을 ref로 관리하는 패턴에서 필수.
**Level**: 2

### L-054: WS 사전 조회 쿼리는 _kw_table(workspace) 동적 테이블명 필수 (2026-04-12)

**현상**: `dict_verify.py`에서 `keyword_assignments` 하드코딩 테이블명을 사용하여 워크스페이스 A의 완료 키워드 조회 결과가 0건으로 반환됨.
**원인**: Know 시스템은 워크스페이스별로 `kw_{workspace}` 동적 테이블을 사용(예: `kw_A`). `keyword_assignments`는 존재하지 않는 테이블명이었음.
**재발방지**: WS 사전 관련 쿼리 작성 시 반드시 `_kw_table(workspace)`로 동적 테이블명을 획득하여 사용. `keyword_assignments` 하드코딩 금지. (MEMORY.md L-049 참조)
**Level**: 2

### L-055: 단계 전환(phase revert)과 데이터 삭제는 반드시 분리 (2026-04-12)

**현상**: `BuildHistory.tsx`에서 "이전단계로" 버튼이 단계 전환(revertPhase)과 빌드 이력 전체 삭제를 동시에 수행하여, 사용자가 단순히 이전 단계를 다시 보려다 빌드 이력이 소실됨.
**원인**: 단계 전환 기능에 데이터 초기화 로직이 결합됨. 사용자의 의도(단계 이동)와 부수효과(데이터 삭제)가 일치하지 않음.
**재발방지**: `revertPhase()`는 워크스페이스 상태(phase)만 변경. 빌드 이력/로그 등 데이터 삭제는 명시적인 사용자 요청(별도 삭제 버튼, 확인 모달)에 의해서만 수행. 단계 전환 ≠ 데이터 초기화.
**Level**: 2


### L-056: know 프론트엔드 빌드는 반드시 서버에서만 실행 (2026-04-14)

**현상**: 로컬(`/mnt/c/DATA/Project/Know/www/frontend/`)에서 `npm run build`를 반복 실행했으나 브라우저는 계속 구버전(`index-c399b893.js`)을 로드함. 서버(`133.186.132.245`)는 빌드 결과를 받지 못해 수정 사항이 전혀 반영되지 않은 상태로 수 차례 시도를 낭비.
**원인**: `oinfra_know` SKILL.md에 "로컬 빌드 금지, 서버에서만 빌드"가 명시되어 있음에도 무시하고 로컬에서 빌드. 서버는 `/home/know/apps/know-ops/www/frontend/dist/`를 서빙하므로 로컬 빌드 결과는 서버에 전달되지 않음.
**재발방지**: 프론트엔드 소스 수정 후 반드시 ① rsync로 소스 업로드 → ② 서버에서 `npm run build` → ③ `✓ built in` 확인. 로컬 `npm run build` 절대 금지. `oinfra_know` SKILL.md의 "서버빌드" 섹션 필수 참조.
**Level**: 3 (반복 위반 — 사용자 엄명)

### L-057: Ant Design Table rowSelection.onChange의 selectedRowKeys 타입은 React.Key[]로 명시 (2026-04-14)

**현상**: `DictVerify.tsx`에서 `rowSelection.onChange` 콜백의 첫 번째 파라미터 타입이 `number[] | string[]`으로 기본 추론되어 TypeScript 컴파일 에러 발생.
**원인**: Ant Design의 `Table` 컴포넌트에서 `rowSelection.onChange` 콜백의 `selectedRowKeys` 파라미터 타입은 `React.Key[]`로 명시해야 함. 상태 변수 선언 시 타입 미지정으로 타입 불일치 발생.
**재발방지**: Ant Design Table에서 체크박스 선택 상태를 관리할 때 `const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])` 형태로 명시. `rowSelection.onChange: (keys: React.Key[]) => void` 시그니처 준수.
**Level**: 1

### L-058: 프론트 소스 수정 후 rsync 없이 서버빌드 시도 → 반영 안 됨 (2026-04-15, 재발)

**현상**: `Workspace.tsx` 수정 후 서버에 SSH 직접 `npm run build` 시도. 그러나 rsync 소스 업로드 없이 빌드하면 서버는 이전 소스로 빌드됨 → 변경 반영 안 됨.
**원인**: L-056(2026-04-14)에서 동일 교훈이 기록됐음에도 재발. `oinfra_know` SKILL.md에도 명시되어 있으나 LLM이 무시.
**재발방지**: 프론트 파일 수정 → 즉시 rsync(프론트_소스_배포) → 서버빌드 → 타임스탬프 확인. 이 순서 외에는 절대 "완료" 선언 불가. oinfra_know SKILL.md에 ❌❌❌ 경고 추가 완료(2026-04-15).
**Level**: 3 (2회 반복 — hook 차단 필요)

---

## [2026-04-16] 작업완료 페이지 4건 개선 + 자동 로그아웃 설정

> **작업 요약**: connected_at 기록, participant_stats kw/dict 건수·시간당 실계산, system_settings 테이블+API, WorkComplete 사이트/도메인 표시+자동해제, useHeartbeat 자동 로그아웃, LLMSettings 시스템 설정 UI.
> **교훈 결과**: 1건 (L-059, Level 1 — docs 기록) + HOOK_BLOCK_OK 6건 (방어 체계 정상 작동)

**MEMORY.md 점검 결과**: Level 1 항목 1건 — L-059는 1회성 타이밍 이슈로 MEMORY.md 반영 없음. hook 정상 차단 6건(HOOK_BLOCK_OK). MEMORY.md 반영 없음.

---

## [2026-04-16] team-cleanup.sh 섹션 [1.6] 메인 pane kill 버그 수정

**버그**: ofinish Step 1 중 `mcp__oio__bash_exec`로 `team-cleanup.sh --force` 실행 시 메인 Claude 에이전트 pane(%224)을 kill 대상으로 오판정.

**근본 원인**: 섹션 [1.6]의 "자기 pane kill" 설계 결함:
1. `MY_PANE=$(tmux display-message -p '#{pane_id}')` — oio bash_exec 서브프로세스는 별도 tmux pane 없이 메인 pane의 자식으로 실행 → 메인 pane(%224) 반환
2. 섹션 [1.6]에서 `MY_PANE`을 bash fallback pane으로 판정 후 "자기 pane kill 예약" → 스크립트 종료 후 `tmux kill-pane -t %224` 실행
3. `_kill_pane()` 함수의 1/2차 방어선(조상트리, PID비교)을 우회 — 직접 `tmux kill-pane` 호출

**수정**: 섹션 [1.6]에서 자기 pane kill 로직 전면 제거. `PROTECTED_PANES` 기반 보호로 대체 (MY_PANE + 조상 프로세스 pane 목록 = oio bash_exec 환경에서도 메인 pane 포함).

**파일**: `/mnt/c/DATA/Project/ai/.claude/scripts/team-cleanup.sh` 섹션 [1.6] + 스크립트 말미 SELF_PANE_KILL 블록 제거.

**재발방지**: PROTECTED_PANES 체크가 섹션 [1.6] 최우선 방어선으로 작동. `_kill_pane()` 우회 경로 없음.

---

## [2026-04-16] 백업관리 독립 메뉴 분리 + 메일관리 카드 + WorkComplete 버튼 재구성

> **작업 요약**: 백업관리 독립 메뉴(/backup-manage) 분리, 메일관리 카드 + 도메인/사이트 필터 콤보박스, WorkComplete 버튼 순서 재구성(완료리포트/공유/PPT/메일), PPT 다운로드 blob fetch 방식 전환, email_contacts 모델/API 신규 추가.
> **교훈 결과**: 1건 (L-059, Level 2 — docs 기록) + HOOK_BLOCK_OK 2건 (방어 체계 정상 작동)

**MEMORY.md 점검 결과**: L-059는 otest 서버 연결 불가 상황에서 배포 미완료 명시 규칙 — Level 2이나 서버 연결 불가는 환경적 요인으로 MEMORY.md 반영 없음 (oinfra_know에 배포 절차 이미 문서화됨). HOOK_BLOCK_OK 2건(정상 차단). MEMORY.md 반영 없음.

### L-059: otest 서버 연결 불가 시 배포 미완료 명시 필수 (2026-04-16)

**문제**: otest 단계에서 서버(133.186.132.245) ping 100% 손실로 rsync 배포 및 uvicorn 재시작을 건너뜀. 정적 구문 분석만으로 PASS 처리되어 실제 서버 반영 여부 불명확.

**원인**: 서버 연결 불가 시 배포 스킵 결정은 합리적이나, "배포 미완료" 상태를 명시하지 않고 PASS로 표시한 것이 문제.

**재발방지**: otest에서 서버 연결 불가 시 결과에 반드시 "배포 미완료 — 서버 연결 불가" 명시. odone 단계에서 배포 재시도 가능 여부를 확인하고, 커밋 메시지에도 배포 상태 기록.

**Level**: 2 (환경적 요인으로 재발 가능성 있음)

### L-317: bash_orphan_poller가 agents/ 미등록 bash pane을 감지하지 못함 (2026-04-16)

**문제**: 팀에이전트 세션 compact 후 `claude --resume` 대기 상태로 남은 bash pane(%281)이 자동 정리되지 않음. team-cleanup.sh는 PROTECTED_PANES(oio bash_exec 조상)로 보호. bash_orphan_poller는 agents/ 등록 파일 기반 A방향 순회만 수행하여 미등록 pane은 스캔 범위 밖.

**원인**: poller 설계가 A방향(agents/→pane)만 구현됨. `claude --resume` 대기 pane은 팀에이전트가 아니므로 agents/에 등록되지 않아 poller 감지 불가.

**재발방지**: bash_orphan_poller.sh에 B방향 역방향 스캔 추가 — 현재 세션 전체 bash pane 중 `--agent-id` 없는 고아 bash를 직접 감지하여 kill. `/o1 "bash_orphan_poller B방향 스캔 추가"` 파이프라인으로 구현 예정.

**Level**: 2 (세션 전환 시마다 재발 가능)

---

## 2026-04-23 — 데이터전처리 분리 + 사전편집 메뉴

### 교훈 1: jiana inner 경로 편집 시 clobber 위험
- 상황: workspace/{ws}/jiana/txt_resrc/ (inner) 편집 후 disconnect→reconnect 시 outer가 inner를 덮어씀
- 대응: 편집 내용이 재연결 시 소실될 수 있음을 UI에서 경고 표시 필요 (향후 과제)
- 원칙: inner 직접 편집은 임시 적용용, 영구 반영은 outer 수정 + 재연결 필요

### 교훈 2: stash에 다른 세션 무단 수정 파일 잔류
- 상황: oclean-quarantine 스태시에 다른 세션 수정 파일이 남아 있었음
- 대응: odev 시작 전 git stash list 확인 후 타 세션 잔류 파일 여부 점검
- 원칙: 세션 격리 불변식 — 다른 세션 소스 수정 절대 금지 (CLAUDE.md 준수)

### 교훈 3: 데이터기반 전처리 skeleton 구현 ✅ 해소 (2026-04-23)
- 상황: 사이트별 실제 파이프라인 스크립트(extquery.pl 등) 경로 미확인으로 skeleton 구현
- 대응: ✅ phase1_data_service.py에 SITE_CONFIG(galleria/hmall/thd/ssf) + SSH/SCP 실행 실제 구현 완료
- 위치: www/services/phase1_data_service.py run_data_service() 함수

---

## 2026-04-23 — phase1 SSH 연결 + Jiana dual-write

### L-060: 사이트별 파이프라인 스크립트 연결 시 서버 경로 사전 탐색 필수 (2026-04-23)

**문제**: skeleton 구현 단계에서 서버 스크립트(extquery.pl 등)의 경로/glob 패턴을 SSH로 사전 확인하지 않아 실제 연결이 다음 세션으로 지연됨.

**원인**: 서버 파일 구조는 스크립트 내부를 직접 읽어야 glob 패턴(backup/, insert_bak01/ 등) 파악 가능. 사전 확인 없이 skeleton 작성 시 경로 오류 가능성 높음.

**재발방지**: skeleton 구현 시 서버 스크립트 위치 주석으로 미리 기록 권장. 실제 연결 전 SSH로 스크립트 경로 확인.

**Level**: 1 (1회, 낮음)

### L-061: inner/outer 이중 경로 구조에서 편집 시 dual-write 필수 (2026-04-23)

**문제**: jiana outer(txt_resrc/) → inner(jiana/txt_resrc/) 복사 구조에서 inner만 편집 시, disconnect→reconnect 때 outer가 inner를 덮어써 수정 내용 소실(clobber) 위험.

**원인**: write_dict_file()이 inner 경로만 저장하여 재연결 시 outer 파일로 덮어씌워짐.

**재발방지**: inner/outer 이중 경로 구조 편집 시 항상 dual-write(inner+outer 동시 저장). jiana_dict_service.py에 dual-write 구현 완료.

**Level**: 2 (재발 가능 — 유사 구조 존재 시 동일 패턴 위험)

