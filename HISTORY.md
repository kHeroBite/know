# HISTORY.md — 작업 이력

## 2026-04-02 — 워크스페이스 초기화 완전삭제 + 키워드추출 필터링/정렬 옵션 추가

### 수정 내용

**건1: 워크스페이스 초기화 API 확장** (`know-api/api/assignment.py`)
- `POST /api/assignment/reset` — DB 6테이블 완전 삭제 + 파일시스템 정리
  - phase1_logs (자식 테이블 선삭제) → phase1_runs → build_history → keyword_assignments → work_history
  - 파일시스템: popular/, fails/ 폴더 내 파일 삭제 + work/ 디렉토리 재생성

**건2: 키워드추출 필터링/정렬 옵션** (Backend 3파일 + Frontend 3파일)

*Backend*
- **know-api/api/phase1.py**: `Phase1실행요청` 모델에 `filter_mode`, `filter_value`, `sort_by` 파라미터 추가
- **know-api/phase1/executor.py**: `_sync_extract` 함수 — rank/count 필터링 + count/rank 정렬 로직 추가
- **know-api/services/phase1_service.py**: `phase1_실행()` 호출 시 3개 파라미터 전달

*Frontend*
- **know-api/frontend/src/api/phase1.ts**: `RunParams` 인터페이스에 `filter_mode`, `filter_value`, `sort_by` 추가
- **know-api/frontend/src/components/phase1/ControlPanel.tsx**: 키워드추출 단계 하단 옵션 UI — 추출기준(상위N개/최소N회이상) + 프리셋 태그 + 정렬(검색횟수순/등수순)
- **know-api/frontend/src/pages/Phase1Pipeline.tsx**: filterMode/filterValue/sortBy 상태 관리 + ControlPanel props 전달

### 특이사항
- 없음

---

## 2026-04-01 — 워크스페이스/도메인관리 UI 7건 개선 + BuildHistory 회귀 수정

### 수정 내용

**Backend**
- **know-api/services/workspace_service.py**: 도메인 메타 JSON 관리 (`domains_meta.json`) — display_name 저장/조회
- **know-api/api/workspace.py**: 도메인추가 요청에 `display_name` 필드 추가, 도메인목록 응답에 `{id, name}` 구조 반환

**Frontend**
- **workspace.ts**: `DomainItem {id, name}` 타입 추가, 도메인목록/도메인추가 API 타입 정의
- **Workspace.tsx**: 색상버튼 표시, 도메인 선택 메시지 개선, 연결해제 비활성화 조건, 도메인 표시명 렌더링
- **DomainManage.tsx**: 도메인 이름+ID 분리 표시, 텍스트 변경, 소스 자동입력
- **Phase1Pipeline.tsx**: "다음 단계로" 버튼 추가
- **ControlPanel.tsx**: 프리징 step6 제거
- **BuildHistory.tsx**: 도메인목록 타입 회귀 수정 (`string[]` → `DomainItem[]`)

### 특이사항
- BuildHistory.tsx 호출처 누락 → 타입 회귀 수정 (L-020 교훈 기록)

---

## 2026-04-01 — KnowledgeWork.tsx 작업실 8대 기능 이전 (파일 대상 오류 수정)

### 수정 내용
- **Workspace.tsx**: 6ed616a 원본 복원 (작업실 8대 기능 잘못 적용 수정)
- **KnowledgeWork.tsx**: 작업실 8대 기능 이전 적용 (배너+포커스스타일+레이아웃+AI분석+작업이력+단축키15개+핫키설정)
- **dist/**: 프론트엔드 재빌드 반영

### 배경
- 2eae0c4 커밋에서 작업실 8대 기능이 Workspace.tsx에 잘못 적용됨
- KnowledgeWork.tsx(지식관리 작업실)가 실제 대상 파일이었으나 Workspace.tsx(워크스페이스 관리)에 적용하는 파일 대상 오류 발생
- Workspace.tsx를 6ed616a 원본으로 복원하고, KnowledgeWork.tsx에 8대 기능 재적용

---

## 2026-04-01 — 작업실(Workspace) 8대 기능 구현

### 수정 내용

**Backend (신규)**
- **[신규] know-api/services/work_history_service.py**: 작업이력 CRUD + undo/rollback (SQLite work_history 테이블)
- **[신규] know-api/api/work_history.py**: 작업이력 REST API (`GET/POST /api/work-history`, `POST /api/work-history/undo/{id}`)
- **[신규] know-api/services/ai_analysis_service.py**: Google/Perplexity 웹스크래핑 AI 분석 서비스
- **[신규] know-api/api/ai_analysis.py**: AI 분석 REST API (`GET /api/ai-analysis/search`)

**Backend (수정)**
- **know-api/init_db.py**: work_history 테이블 생성 추가 (12컬럼 + 인덱스)
- **know-api/services/workspace_service.py**: 핫키 설정 저장/조회 (hotkeys JSON), workspace preference 확장
- **know-api/api/workspace.py**: 핫키 API 추가 (`GET/PUT /api/workspaces/hotkeys`)
- **know-api/main.py**: work_history, ai_analysis 라우터 등록
- **know-api/requirements.txt**: requests, beautifulsoup4 의존성 추가

**Frontend (신규)**
- **[신규] know-api/frontend/src/components/workspace/AIAnalysis.tsx**: AI 분석 패널 (Google+Perplexity 결과 탭)
- **[신규] know-api/frontend/src/components/workspace/WorkHistory.tsx**: 작업이력 패널 + undo 버튼
- **[신규] know-api/frontend/src/components/workspace/HotkeySettings.tsx**: 핫키 설정 모달 (15개 단축키)

**Frontend (수정)**
- **know-api/frontend/src/pages/Workspace.tsx**: 전면 재구성 — 상단 배너+⚙아이콘, 3컬럼 레이아웃(키워드|분석결과|AI분석+작업이력), 포스트잇 포커스 스타일, 키보드 단축키 15개
- **know-api/frontend/src/api/workspace.ts**: 작업이력/AI분석/핫키 API 클라이언트 추가

### 구현된 8대 기능
1. 상단 배너/타이틀바 (⚙ 핫키설정 버튼)
2. 분석결과 포스트잇 노란색 포커스 스타일 + 깊은 그림자
3. 분석결과 타이틀 단순화
4. 3컬럼 레이아웃 재구성 (키워드 | 분석결과 | AI분석+작업이력)
5. AI분석 웹스크래핑 (Google+Perplexity 병렬 검색)
6. 작업이력 + undo/rollback (DB 영구 저장)
7. 키보드 단축키 15개 (vi-like: j/k 이동, /, gg, G, Ctrl+D/U 등)
8. 개인별 핫키 설정 모달

### 버그 수정
- AC-004: work_history_service.py 이력취소() OperationalError 미처리 → `except OperationalError` 추가 (L-018)

---

## 2026-04-01 — 워크스페이스 연결 해제 symlink 안전 처리 + UI 개선

### 수정 내용
- **know-api/services/workspace_service.py**: 연결 해제 시 `shutil.rmtree` → `islink()` 체크 후 `os.unlink()` 안전 처리 (L-016); `_복사작업` 내 dirnames symlink 재현 로직 추가 (재발방지)
- **know-api/api/workspace.py**: `connected_by` 응답 필드에 `user_id` 대신 `name` 전달 (사용자 이름 표시)
- **know-api/frontend/src/pages/Workspace.tsx**: 연결 해제 버튼 `!isSelected` 조건 추가 (미선택 시에만 활성화); 색상 버튼 선택 시 흰색 outline 추가

### 배경
- symlink 디렉토리에 `shutil.rmtree` 사용 시 OSError 발생 → `os.path.islink()` 체크로 안전 처리
- 복사 작업 시 symlink가 일반 디렉토리로 복사되던 버그 수정 — `os.symlink()` 재현 로직 추가
- `connected_by`에 사용자 ID 대신 이름을 표시하여 가독성 향상

## 2026-03-31 — 지식작업실 3파티션+하단4탭 재설계 + 형태소분석 API + 마지막메뉴 저장

### 수정 내용
- **[신규] know-api/services/morpheme_service.py**: jiana 1.5.12 Java 직접 호출 기반 형태소분석 서비스 (EUC-KR 인코딩, cotton_test.sh 경유 방식 불채택)
- **[신규] know-api/api/morpheme.py**: 형태소분석 REST 엔드포인트 (`POST /api/morpheme/analyze`)
- **know-api/main.py**: morpheme 라우터 등록
- **know-api/services/assignment_service.py**: `assigned_to` 필터 추가 (로그인 사용자별 키워드 목록 조회)
- **know-api/api/assignment.py**: `assigned_to` 쿼리파라미터 수신
- **know-api/services/workspace_service.py**: `last_menu` 필드 추가 (워크스페이스 preference 확장)
- **know-api/api/workspace.py**: preference API 확장 (last_menu 저장/조회)
- **know-api/frontend/src/pages/KnowledgeWork.tsx**: 전면 재작성 — 3파티션(좌:키워드목록/중:분석결과/우:AI placeholder) + 하단 4탭(형태소/사용자사전/복합명사사전/유사어사전)
- **know-api/frontend/src/api/assignment.ts**: `assigned_to` 파라미터 추가
- **know-api/frontend/src/stores/workspaceStore.ts**: `lastMenu` 상태 추가
- **know-api/frontend/src/components/Layout.tsx**: 메뉴 변경 시 lastMenu 추적
- **know-api/frontend/src/App.tsx**: DefaultRoute에서 lastMenu 복원 로직

### 배경
- 지식작업실을 단순 목록에서 분석 도구 중심으로 전면 재설계
- 형태소분석은 jiana 1.5.12 기반 Java 직접 호출 방식 채택 (cotton_test.sh 경유 실패 — L-014)
- 마지막 방문 메뉴 저장으로 새로고침 후에도 마지막 메뉴 유지
- assigned_to 필터로 로그인 사용자에게 할당된 키워드만 노출

## 2026-03-27 — 설계안 갭 전면 해소: executor CLI 통합 + 워크스페이스 경로 + 미구현 모듈 4개 추가

### 수정 내용
- **know-api/phase1/executor.py**: 쉘 스크립트 호출 완전 제거 → Python 모듈 직접 호출로 전환 (SCRIPTS_DIR/JIANA_DIR → WORKSPACE_BASE), `workspace` 파라미터 추가, `_run_shell` 제거, `_run_python` 확장, `_sync_convert()` 인수 불일치 버그 수정
- **know-api/api/phase1.py**: `workspace` 파라미터 수신 추가
- **know-api/services/phase1_service.py**: `workspace` 인수 executor로 전달
- **know-api/frontend/src/api/phase1.ts**: `workspace` 파라미터 추가
- **know-api/frontend/src/pages/Phase1Pipeline.tsx**: stepRange 기본값 `[1,3]` 변경 (0단계 제거)
- **know-api/frontend/src/components/phase1/ControlPanel.tsx**: step0 noop UI 제거
- **[신규] know-ops/src/know/pipeline/검증/__init__.py**: 검증 패키지 초기화
- **[신규] know-ops/src/know/pipeline/검증/사전등록검증기.py**: check_after_dic.sh Python 포팅 (탭/공백 검사, 문법검사, diff비교, 누락검출)
- **[신규] know-ops/src/know/pipeline/공통/__init__.py**: 공통 패키지 초기화
- **[신규] know-ops/src/know/pipeline/공통/텍스트유틸.py**: 인코딩감지, UTF-8변환, 정렬/필터/정규화 유틸 모음
- **[신규] know-ops/src/know/pipeline/유사어/목록변환기.py**: pair2list.pl Python 포팅
- **[신규] know-ops/src/know/pipeline/유사어/차이비교기.py**: fdiff.pl Python 포팅

### 배경
- executor.py의 쉘 스크립트 경유 방식(이원화)을 Python 모듈 직접 호출로 통합
- 워크스페이스별 동적 경로 지원 (`/home/know/apps/know-ops/workspace/{workspace}`)
- 미구현으로 남아있던 검증·공통·유사어 서브모듈 4개를 이번 작업에서 일괄 구현
- 데이터전처리 UI에서 step0(noop) 제거 — 사용자에게는 1~3단계만 노출

---

## 2026-03-27 — modify_cotton 파이썬 변환 + 파이프라인 4단계 구성

### 수정 내용
- **[신규] know-ops/src/know/pipeline/변환/__init__.py**: 변환 패키지 초기화
- **[신규] know-ops/src/know/pipeline/변환/형태소결과변환기.py**: modify_cotton.sh → Python 변환 구현
- **know-ops/src/know/cli.py**: `transform` 명령 추가 + pipeline 4단계 구성
- **know-api/phase1/executor.py**: PHASE1_STEPS 4단계 정의 + `_run_python` 메서드 추가
- **know-api/frontend/src/components/phase1/ControlPanel.tsx**: stepRange 0~3 업데이트
- **know-api/frontend/src/pages/Phase1Pipeline.tsx**: stepRange [0,3] 기본값 변경
- **know-api/frontend/src/components/phase1/LogPanel.tsx**: 단계이름 4단계 매핑

### 배경
- 기존 Bash 스크립트(modify_cotton.sh)의 형태소 결과 변환 로직을 Python으로 포팅
- 파이프라인 4단계 확정: 파일선택 → 정제 → 형태소분석 → 결과변환
- synonym/build는 코드 유지, 파이프라인에서 분리 (별도 실행)

---

## 2026-03-26 — kplaywright 스킬 Windows Chrome CDP 전환

### 수정 내용
- **kplaywright SKILL.md**: Windows Chrome CDP 연결(기본) + WSL 번들 Chromium(fallback) 방식으로 전환
  - 1순위: Chrome CDP (`--remote-debugging-port=9222`)
  - 2순위: WSL Chromium fallback (playwright-cli 기존 방식)

### 배경
- 기존 WSL Headless Chromium 방식에서 Windows 네이티브 Chrome CDP 방식으로 전환
- Windows 네이티브 렌더링으로 한글 폰트 완벽 지원 + WSLg 오버헤드 제거

---

## 2026-03-26 — UI 전면 개편: 디자인 애니메이션 + 워크스페이스 Progress + 메뉴 2단 구조

### 수정 내용
- **workspace_service.py**: 도메인 연결 비동기 복사 + COPY_PROGRESS 상태 추가
- **api/workspace.py**: 진행률(progress) API 엔드포인트 추가
- **[신규] frontend/src/stores/workspaceStore.ts**: Zustand 전역 상태 관리 (워크스페이스 선택/목록)
- **frontend/src/api/workspace.ts**: 진행률 API 클라이언트 추가
- **frontend/src/components/Layout.tsx**: 헤더 "지식작업소(워크스페이스명)" 동적 표시 + 메뉴 2단(지식작업/관리) 구조
- **frontend/src/main.tsx**: index.css 전역 import 추가
- **[신규] frontend/src/index.css**: 전반 디자인 CSS — glassmorphism, 그라데이션, 애니메이션(fadeIn/fadeInUp/slideIn/pulse)
- **frontend/src/pages/Workspace.tsx**: Card Grid UX 전면 개편 + 버튼 로직(IDLE/USED) + 진행률 Progress 표시

### 배경
- 워크스페이스 도메인 연결 시 파일 복사 진행률을 실시간으로 표시 (0~100%)
- 전반적인 UI 디자인 개편: 다크 사이드바 그라데이션, glassmorphism 헤더, 카드 hover 애니메이션
- 메뉴를 "지식작업"과 "관리" 2단 그룹으로 분리하여 가독성 향상
- 헤더에 현재 선택된 워크스페이스명을 동적으로 표시

---

## 2026-03-26 워크스페이스 메뉴 신설 + 데이터전처리 재설계

### 변경 사항
- **신규**: 워크스페이스 관리 페이지 (생성/삭제/선택/해제, JSON 상태 영속화)
  - know-api/api/workspace.py (6개 엔드포인트: GET/POST/DELETE /workspaces, POST/DELETE /workspaces/select)
  - know-api/services/workspace_service.py (파일 기반 상태 관리)
  - know-api/frontend/src/api/workspace.ts
  - know-api/frontend/src/pages/Workspace.tsx
- **수정**: 데이터전처리 페이지 재설계
  - DomainPanel.tsx 제거 (domain 관리를 워크스페이스로 이전)
  - Phase1Pipeline.tsx: 4패널 레이아웃 (파일선택 좌우 패널 + 파이프라인 + 로그)
  - FilePanel.tsx: 탭 구조 제거
  - ControlPanel.tsx: 도메인/파일선택 UI 제거
- **수정**: 사이드바 — 워크스페이스 메뉴 항목 추가
- **수정**: phase1.py/phase1_service.py — 도메인/워크스페이스 관련 코드 제거
- **삭제**: DomainPanel.tsx

### 커밋
- 미확정 (kdone_git에서 생성)

---

## 2026-03-26 — 워크스페이스 N개 확장 + 도메인 복사/적용 기능 재설계 (커밋: TBD)

### 수정 내용
- **워크스페이스 CRUD**: `/preprocess/workspaces` GET/POST/DELETE 엔드포인트 신설. 생성 시 6개 서브디렉토리 자동 생성 (`build/popular`, `build/fails`, `fail_log`, `pop_log`, `work`)
- **도메인 복사**: `/preprocess/domains/copy` POST — `shutil.copytree`로 소스→타겟 복사. 중복/보호폴더 409/400 오류 처리
- **도메인 적용**: `/preprocess/domains/{name}/apply` POST — 도메인 파일 → 워크스페이스 복사 + 서브디렉토리 보장
- **도메인 생성 제거 → 복사 방식으로 전환**: 기존 도메인 생성 UI 제거, 소스 선택 후 복사 방식 채택
- **DomainPanel.tsx 전체 재설계**: 복사행(소스 선택+이름 입력+복사), 워크스페이스행(선택+생성+삭제), 도메인 테이블(적용/삭제), 워크스페이스 테이블로 구성
- **phase1.ts**: 워크스페이스/도메인 API 클라이언트 7개 추가 (도메인복사, 도메인적용, 워크스페이스목록/생성/삭제)

### 배경
- 기존 단일 도메인 → 워크스페이스 A/B/C 등 N개 병렬 운영 필요
- 도메인을 복사해서 워크스페이스에 적용하는 워크플로로 UI 재설계

---

## 2026-03-26 — 데이터 전처리 리네이밍 + 도메인 관리 기능 + 업로드 버그 수정 (커밋: TBD)

### 수정 내용
- **URL 리네이밍**: `/phase1/*` → `/preprocess/*` (api/phase1.py 전체 엔드포인트)
- **사이드바**: "Phase 1 파이프라인" → "데이터 전처리" (Layout.tsx)
- **Route path**: `/phase1` → `/preprocess` (App.tsx)
- **도메인 관리 신설**: DomainPanel.tsx (신규), phase1.ts API 추가, phase1_service.py 도메인 CRUD, api/phase1.py 도메인 엔드포인트 3개
- **경로 분리**: WORKS_DIR/BUILD_DIR → BUILD_DIR + DOMAIN_DIR + WORKSPACE_DIR (phase1_service.py, executor.py)
- **드래그&드롭 버그 수정**: FilePanel.tsx — `info.fileList[0]?.originFileObj` → `info.file as File`, `info.file.status !== undefined` 조건 추가

### 배경
- Phase1 기능이 데이터 전처리 용도로 확정되어 UI/URL 일관성을 위해 리네이밍
- 도메인 관리 기능 신설로 사용자가 직접 도메인 폴더 추가/삭제 가능
- antd Upload의 onChange가 status 이벤트도 발생시켜 드래그&드롭 시 파일 미인식 버그 발생

---

## 2026-03-26 — Phase1 타이틀 변경 + 업로드 파일명 제한 완화 (커밋: TBD)

### 수정 내용
- **Phase1Pipeline.tsx**: 페이지 타이틀 "Phase 1 파이프라인" → "데이터 전처리" 변경
- **FilePanel.tsx**: FILENAME_PATTERN 제거, 파일명 형식 검증 삭제. 크기 체크(500MB)만 유지. 힌트 텍스트 "텍스트 형식 파일 (최대 500MB)"로 변경
- **phase1.py**: FILENAME_PATTERN(re 모듈) 삭제 → content_type 기반 필터로 전환 (image/audio/video 거부). logging 모듈 추가 및 업로드 시 디버깅 로그(파일명, 크기, content_type) 출력

### 배경
- 기존 파일명 패턴(`popularKeyword.YYYYMMDD.UTF-8`)이 너무 엄격하여 다양한 텍스트 형식 업로드 불가
- 텍스트 계열 파일은 모두 허용, 미디어 파일(image/audio/video)만 서버 측 거부로 변경

---

## 2026-03-26 — Phase 3 완전 통합 파이프라인 구현 (커밋: TBD)

### 수정 내용

**백엔드 신규 파일:**
- know-api/models/pipeline.py (PipelineHistory, BuildHistory 등 5개 ORM)
- know-api/core/celery.py (Celery 앱 설정 + 동기 fallback)
- know-api/migrations/001_phase3_tables.sql (Phase 3 테이블 마이그레이션)
- know-api/pipeline/tasks.py, refine.py, morpheme.py, build_wrapper.py (파이프라인 태스크)
- know-api/api/pipeline.py, knowledge.py, build.py, realtime.py (신규 라우터 4개)
- know-api/services/pipeline_service.py, knowledge_service.py, build_service.py
- know-api/scripts/install_redis.sh, know-api/know_celery.service

**백엔드 수정:**
- know-api/main.py: 신규 라우터 4개 등록 (/api/pipeline, /api/knowledge, /api/build, /api/realtime)
- know-api/requirements.txt: celery, redis, aiofiles, openpyxl 추가

**프론트엔드 신규:**
- frontend/src/pages/Pipeline.tsx (파이프라인 대시보드)
- frontend/src/pages/Knowledge.tsx (지식작업 워크플로우)
- frontend/src/pages/BuildHistory.tsx (빌드 이력)
- frontend/src/api/pipeline.ts
- frontend/src/stores/pipelineStore.ts

**프론트엔드 수정:**
- frontend/src/App.tsx: 라우트 3개 추가 (/pipeline, /knowledge, /build-history)
- frontend/src/components/Layout.tsx: 메뉴 3개 추가

### 주요 이슈 및 해결
- MariaDB 5.5: DATETIME DEFAULT CURRENT_TIMESTAMP 불가 → TIMESTAMP 사용으로 해결
- CentOS 7 sudo 없음: Redis systemctl 설치 불가 → Celery 동기 fallback으로 서비스 운영
- ktest에서 core/database.py Base import 누락 패치 → kDev 단계 Base import 확인 필요

---

## 2026-03-26 — SQLAlchemy 예외처리 추가 (커밋: c4bc22b)

### 수정 내용
- dictionary_service.py `사전목록조회`, `유의어목록조회`: OperationalError/ProgrammingError try-except 추가
- category_service.py `카테고리목록조회`: 동일 예외처리 추가
- 테이블 미존재 시 500 에러 → 200 OK + 빈 목록(`{"items":[],"total":0}`) 반환

### 배경
- 신규 사이트 등록 직후 사전/유의어/카테고리 테이블이 아직 생성되지 않은 상태에서 목록 조회 시 500 에러 발생
- 방어적 예외처리로 빈 목록 반환 → 프론트엔드가 정상 렌더링 가능

---

## 2026-03-25 — know-api 로직 검증 수정 (커밋: 7833006)

### 수정 내용 (P0/P1/P2 총 7건)
- **P0-1**: LoginResponse에 user_id/name/auth 필드 추가, /login 응답 확장 (schemas/auth.py, api/auth.py)
- **P0-2**: 401 인터셉터에 zustand persist localStorage 정리 추가 (frontend/src/api/client.ts)
- **P0-3**: thesaurus 사전 타입 허용목록에서 제거 — {"udic","cndic"}만 허용 (services/dictionary_service.py)
- **P1-5**: 카테고리명 strip() 정규화 (services/category_service.py)
- **P2-6**: .dict() → .model_dump() Pydantic v2 전환 (api/dictionary.py, api/category.py)
- **P2-7**: datetime.utcnow() → datetime.now(timezone.utc) (core/security.py)
- **P2-9**: DELETE 권한 체크(W/A) 추가 (api/dictionary.py, api/category.py)

### 폐기 항목
- MetaData 캐싱, JWT 블랙리스트 — 현 단계에서 불필요로 폐기

---

## 2026-03-26 — API 이중 경로 버그 수정 + 도메인 목록 경로 변경

### 수정 내용
- **phase1.ts**: `/api/preprocess/...` → `/preprocess/...` (이중 `/api/` 접두사 제거 — 8곳)
- **phase1_service.py**: `DOMAIN_DIR` = `/home/know/apps/know-ops` (루트 경로로 변경)
- **phase1_service.py**: `PROTECTED_DIRS = {"build", "workspace", ".venv", "src", "site"}` 보호 로직 추가

### 배경
- API 클라이언트 베이스URL에 `/api`가 포함된 상태에서 엔드포인트에도 `/api/`가 중복 기재되어 `/api/api/preprocess/` 이중 경로 버그 발생
- 도메인 목록을 `BUILD_DIR(/build)` 하위에서 조회하던 것을 `know-ops` 루트로 변경 (도메인 폴더가 루트에 위치)
- 시스템 디렉토리(build/workspace/.venv/src/site) 도메인 목록 노출 방지

---

## 2026-03-25 — know-api 버그 수정

### 수정 내용
- 프론트엔드 페이지네이션 응답 처리: `res.data` → `res.data?.items || []` (DomainList, CategoryManage, DictionaryManage)
- Statistics.tsx DomainStat 인터페이스 필드명 수정: `udic_count` → `udic` 등 4개
- category_service.py: `{SITE}_CATEGORY` 테이블 미존재 시 500 에러 → 200 + 빈 목록 반환
- kplaywright 스킬: Windows CDP → WSL Headless Chromium 전환

### 배경
- Playwright 테스트 중 `.some is not a function` JS 오류 발견 → API 응답이 `{items:[...]}` 객체인데 배열로 처리하던 버그
- bcrypt 5.0.0 + passlib 호환성 문제는 이전 세션에서 수정 완료 (bcrypt==3.2.2 다운그레이드)
