# know 프로젝트 — 프로젝트 정보

## 개요

검색엔진 지식팀 Ops 툴 고도화 프로젝트.
기존 Java/JSP 관리도구 + 수작업 쉘/펄 스크립트 파이프라인을 Python 기반으로 포팅/고도화.

---

## 서버 접속 정보

<!-- kinfra_skill: kinfra_know -->

> 서버 접속 정보/배포 명령/ntfy 등 인프라 설정: **kinfra_know** SKILL.md 참조.

### 관리 서버 (know-server)

| 항목 | 값 |
|------|-----|
| 호스트 | 133.186.132.245 |
| 사용자 | know |
| 포트 | 22 (기본) |

### SSH 접속 방법

> **주의**: 비밀번호에 `!`가 포함되어 있어 echo/printf 일반 방식으로 파일 작성 시 `\!`로 이스케이프됨.
> 반드시 **hex escape** 방식으로 비밀번호 파일을 생성해야 함.
> 또한 `sshpass -p` 직접 방식은 실패하므로 반드시 **`-f` 파일 방식** 사용.

#### 1단계: 비밀번호 파일 생성 (hex escape 필수)

```bash
# ! 문자가 포함된 비밀번호 — hex escape로 정확히 기록
printf '\x6c\x65\x64\x67\x65\x31\x32\x33\x21' > ~/.ssh/know_pass
chmod 600 ~/.ssh/know_pass

# 검증: 8바이트 (ledge123!) 확인
wc -c ~/.ssh/know_pass  # → 9
cat ~/.ssh/know_pass     # → ledge123!
```

#### 2단계: 접속 테스트

```bash
# 접속 테스트 (password 인증 강제 — 필수 옵션)
sshpass -f ~/.ssh/know_pass ssh \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  know@133.186.132.245 "echo 접속성공"
```

#### 3단계: 파일 전송 (scp)

```bash
# 파일/디렉토리 전송
sshpass -f ~/.ssh/know_pass scp \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  -r ./know-ops know@133.186.132.245:/home/know/apps/
```

#### ~/.ssh/config 등록 (선택 — 반복 접속 시 편리)

```bash
# ~/.ssh/config 에 아래 내용 추가
Host know-server
    HostName 133.186.132.245
    User know
    Port 22
    PreferredAuthentications password
    PubkeyAuthentication no

# 접속 (sshpass + config 조합)
sshpass -f ~/.ssh/know_pass ssh know-server
```

#### SSH 키 등록 (최종 권장 — 비밀번호 입력 불필요)

```bash
# 키 생성 (없는 경우)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/know_rsa -N ""

# 서버에 공개키 등록 (비밀번호 1회 필요)
sshpass -f ~/.ssh/know_pass ssh-copy-id \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -i ~/.ssh/know_rsa.pub know@133.186.132.245

# 이후 비밀번호 없이 접속
ssh -i ~/.ssh/know_rsa know@133.186.132.245
```

### 서버 환경 정보

| 항목 | 값 |
|------|-----|
| OS | CentOS 7 (kernel 3.10.0-1160.71.1.el7.x86_64) |
| python3/pip3 | Python 3.8.16 + pip 설치됨 |
| SSH 인증 | password 인증 지원 확인됨 |

---

## 서버 디렉토리 구조

```
/home/know/
├── apps/
│   ├── know-ops/                     ← 통합 운영 디렉토리
│   │   ├── startup.sh                ← 시스템 통합 시작 (Redis + uvicorn)
│   │   ├── shutdown.sh               ← 시스템 종료
│   │   ├── www/                      ← FastAPI 웹 서버 (구 know-api)
│   │   │   ├── main.py               ← FastAPI 앱 진입점 (:18000)
│   │   │   ├── start.sh              ← uvicorn 단독 재시작
│   │   │   ├── venv/                 ← Python 가상환경
│   │   │   ├── api/                  ← FastAPI 라우터
│   │   │   ├── services/             ← 비즈니스 로직
│   │   │   ├── core/                 ← 설정/DB/보안
│   │   │   ├── frontend/             ← React SPA
│   │   │   │   ├── build_and_restart.sh  ← 빌드+재시작 스크립트
│   │   │   │   ├── dist/             ← 빌드 결과
│   │   │   │   └── src/              ← 소스코드
│   │   │   └── know.db               ← SQLite DB
│   │   ├── base/                     ← 기본 리소스 (구 jiana_admin_server/base_1.5)
│   │   │   ├── lib/
│   │   │   │   ├── jiana1.5.jar      ← 형태소분석 엔진 (JDK 1.7 필수)
│   │   │   │   └── dqdic-1.0.3.jar
│   │   │   ├── dic/                  ← 도메인별 사전 디렉토리
│   │   │   ├── pop_log/              ← 인기 검색어 로그 (TSV/CSV)
│   │   │   ├── fail_log/             ← 실패 검색어 로그 (TSV/CSV)
│   │   │   ├── work/                 ← 작업 출력 디렉토리
│   │   │   ├── build.xml             ← ant 빌드 파일
│   │   │   └── spam_kwd.pat          ← 스팸 패턴 파일
│   │   └── domain/                   ← 도메인별 사전 데이터
│   │       └── {domain}/cnlist.ks    ← 복합어 사전
│   ├── jiana_admin_server/           ← 기존 경로 (호환용)
│   ├── bin/                          ← 유틸리티 쉘스크립트
└── tomcat6/                          ← WAS (JSP 관리도구)
```

---

## 웹 관리도구 (기존 JSP)

| 항목 | 값 |
|------|-----|
| URL | http://know.diquest.com/know/know/common/login.jsp |
| 계정 | super / 1111 |
| WAS | Tomcat 6.0.37 (JDK 1.7) |
| DB | MariaDB 5.5, know_mng 데이터베이스 |

---

## know-ops 패키지 (Phase 1)

### 로컬 설치 (WSL2 개발 환경)

```bash
cd /home/rioky/work/know-ntfs/know-ops
source .venv/bin/activate
know --help
```

### 서버 설치

```bash
# 1. 서버에 패키지 복사
sshpass -f ~/.ssh/know_pass scp -r /home/rioky/work/know-ntfs/know-ops know@133.186.132.245:/home/know/apps/

# 2. 서버 접속 후 설치
sshpass -f ~/.ssh/know_pass ssh know@133.186.132.245 << 'EOF'
  cd /home/know/apps/know-ops
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -e .
  know --version
EOF
```

### 사용법

```bash
# 키워드 추출 (인기/실패 검색어 → 통합 키워드)
know extract --모드 rank --n 150000
know extract --모드 count --n 3

# 검색로그 정제
know refine query_log.txt --도메인 site1

# 형태소 분석 (JDK 7 + jiana1.5.jar)
know analyze input.txt --도메인 site1

# 형태소 결과 변환 (modify_cotton.sh → Python 변환)
know transform input.txt --도메인 site1

# 유사어 페어 처리 (파이프라인 분리 — 별도 실행)
know synonym site1.pair --도메인 site1

# 사전 빌드 (파이프라인 분리 — 별도 실행)
know build --도메인 site1

# 전체 파이프라인 4단계 (파일선택 → 정제 → 형태소분석 → 결과변환)
know pipeline input.txt --도메인 site1
# synonym/build는 파이프라인에서 분리됨 (코드 유지, 별도 실행)
```

---

## 기술 스택

| 구분 | 현행 (AS-IS) | 목표 (TO-BE) |
|------|-------------|-------------|
| 언어 | Java/JSP + Bash/Perl | Python 3.8+ (서버) / 3.11+ (개발) |
| 프레임워크 | Tomcat 6 + jQuery | FastAPI + React/Vue |
| 파이프라인 | 수동 쉘스크립트 | Celery + Redis |
| DB | MariaDB 5.5 | MariaDB (유지) |
| 형태소분석 | jiana1.5.jar (JDK 1.7) | subprocess 래핑 유지 |

---

## Phase 계획

- **Phase 1** ✅ 완료: Python CLI 패키지 (know-ops) 신규 생성 + 서버 설치 완료 (Python 3.8 호환)
  - 파이프라인 4단계 확정: 파일선택 → 정제 → 형태소분석 → 결과변환(transform)
  - know-ops/src/know/pipeline/변환/ 신규 패키지 (형태소결과변환기.py — modify_cotton.sh 포팅)
  - know-ops/src/know/pipeline/검증/ 신규 패키지 (사전등록검증기.py — check_after_dic.sh 포팅)
  - know-ops/src/know/pipeline/공통/ 신규 패키지 (텍스트유틸.py — 인코딩/정렬/필터/정규화)
  - know-ops/src/know/pipeline/유사어/ 확장 (목록변환기.py — pair2list.pl 포팅, 차이비교기.py — fdiff.pl 포팅)
  - executor.py: shell subprocess 완전 제거 → Python 모듈 직접 호출 + workspace 파라미터 지원
- **Phase 2** ✅ 완료: FastAPI :18000 서버 + React SPA 관리 UI 구현 (JWT 인증, 도메인/사전/카테고리/통계 CRUD, systemd 유닛)
- **Phase 3** ✅ 완료: Celery 자동화 파이프라인 구현 + 프론트엔드 통합 (Redis 미설치 → 동기 fallback 운영)
- **Phase 4** ✅ 완료: 워크스페이스 통합 phase 시스템 도입 (preprocess→work→build→verify 4단계 enum) + 사전검증 파일기반 재작성 + user_work_phase SQLite 테이블

---

## www 디렉토리 구조 (Phase 2 신규, 구 know-api)

```
www/
├── main.py                    # FastAPI 앱 진입점 (:18000)
├── requirements.txt           # 의존성 (fastapi, uvicorn, PyJWT, bcrypt 등)
├── know_api.service           # systemd 유닛 파일
├── .env.example               # 환경변수 템플릿 (JWT_SECRET 등)
├── core/                      # 설정/DB/보안
│   ├── config.py              # 환경변수 로딩 (pydantic BaseSettings)
│   ├── database.py            # MariaDB 커넥션풀
│   └── security.py            # JWT 발급/검증 + bcrypt 인증
├── models/                    # DB 모델 (SQLAlchemy ORM)
│   ├── account.py, domain.py, dictionary.py
├── schemas/                   # Pydantic 요청/응답 스키마
│   ├── auth.py                # LoginResponse: token, user_id, name, auth 반환
│   ├── common.py, domain.py, dictionary.py, category.py
├── services/                  # 비즈니스 로직
│   ├── auth_service.py, domain_service.py, dictionary_service.py
│   ├── category_service.py, statistics_service.py
│   ├── phase1_service.py      # 데이터전처리 파이프라인 서비스
│   ├── workspace_service.py   # 워크스페이스 상태 관리 (JSON 파일 기반) + 핫키 설정 + 도메인 메타(display_name) JSON 관리 + 통합 phase enum (preprocess/work/build/verify/complete) + user_work_phase (idle/working/done) + complete_workspace(도메인백업+WS→도메인복사)
│   ├── dict_verify_service.py # 사전검증 서비스 (user.ks/cnlist.ks/synonym.UTF-8 교차검증 — 파일 기반 재작성)
│   ├── work_history_service.py # 작업이력 CRUD + undo/rollback (SQLite work_history 테이블)
│   ├── llm_settings_service.py # LLM 설정 CRUD + 연결 테스트 (4종: openai/claude/gemini/local)
│   ├── ai_analysis_service.py # AI 분석 서비스 (LLM + Wikipedia — LLM탭/Wikipedia탭 2종)
│   ├── typo_matcher.py        # 한영변환+오타변형 엔진 (검색변형생성 — 모음/인접키/한영 최대 20개)
│   └── thesaurus_recommend.py # 유사어 추천 서비스 (후보검색 + LLM재순위, frozenset 양방향 중복제거)
├── api/                       # FastAPI 라우터
│   ├── auth.py, domain.py, category.py, statistics.py
│   ├── dictionary.py          # 사전 CRUD API + 유사어 추천: GET/POST /api/dictionary/recommend
│   ├── phase1.py              # 데이터전처리 엔드포인트 (/preprocess/*)
│   ├── workspace.py           # 워크스페이스 엔드포인트 + 핫키 API + 도메인목록({id,name}[]) + 도메인추가(display_name 포함) + POST /{name}/complete (작업완료 처리)
│   ├── work_history.py        # 작업이력 API (GET/POST /api/work-history, POST /api/work-history/undo/{id})
│   ├── assignment.py          # 키워드 할당 API (GET /api/assignments, PUT /api/assignments/flag, GET /api/assignments/keyword/{id}, GET /api/assignments/keyword-page)
│   ├── dict_verify.py         # 사전검증 API (POST /api/dict-verify/run, GET /api/dict-verify/status)
│   ├── llm_settings.py        # LLM 설정 API (GET /api/llm-settings, PUT /api/llm-settings/{provider})
│   └── ai_analysis.py         # AI 분석 API (GET /api/ai-analysis/search — LLM+Wikipedia, 프롬프트 GET/PUT 관리자 API)
├── migrations/                # DB 마이그레이션 SQL
│   ├── 001_phase3_tables.sql  # Phase 3 테이블 (pipeline_history, build_history 등)
│   └── 002_user_work_phase.sql # user_work_phase 테이블 (사용자별 work 단계 상태)
├── pipeline/                  # Celery 태스크 모듈
│   ├── tasks.py               # Celery 태스크 정의
│   ├── refine.py              # 검색로그 정제 태스크
│   ├── morpheme.py            # 형태소분석 태스크
│   └── build_wrapper.py       # 사전빌드 래퍼 태스크 (빌드 완료 후 reanalyze_from_db() 호출 — DB 기반 재분석)
├── config/
│   └── ai_prompt.json         # AI 분석 기본 프롬프트 설정 (관리자 수정 가능)
├── scripts/
│   └── install_redis.sh       # Redis 설치 스크립트
├── know_celery.service        # Celery systemd 유닛 (Redis 설치 후 활성화)
└── frontend/                  # React SPA (Ant Design 5)
    ├── src/pages/             # 로그인/도메인/사전/카테고리/통계/파이프라인/지식작업/빌드이력/데이터전처리/워크스페이스/LLM설정/작업완료 페이지
    │   ├── Phase1Pipeline.tsx # 데이터전처리 페이지 (4패널 레이아웃)
    │   ├── KnowledgeWork.tsx  # 지식관리 작업실 페이지 (3열레이아웃+인피니티스크롤+포커스스타일+단축키15개+핫키설정모달+AI분석+작업이력+flag마킹+순번표시+undo탭전환+자동선택+border+컬럼분리+오류표시, 캐시 제거됨)
    │   ├── LLMSettings.tsx    # LLM 설정 페이지 (ChatGPT/Claude/Gemini/로컬LLM 4종 카드형 설정 + 연결 테스트)
    │   ├── Workspace.tsx      # 워크스페이스 관리 페이지 (symlink 관리 + 통합 phase 전이 버튼)
    │   ├── DictVerify.tsx     # 사전검증 페이지 (user.ks/cnlist.ks/synonym 교차검증 결과 표시)
    │   └── WorkComplete.tsx   # 작업완료 페이지 (신규 — 정책 #6: 도메인 백업 + WS→도메인 복사 실행)
    ├── src/components/workspace/ # 작업실 컴포넌트
    │   ├── AIAnalysis.tsx     # AI 분석 패널 (LLM탭+Wikipedia탭 2탭 구조 — Google/Perplexity 제거)
    │   ├── WorkHistory.tsx    # 작업이력 패널 (Table 4컬럼: 번호/사전/단어/작업 + undo)
    │   └── HotkeySettings.tsx # 핫키 설정 모달 (15개 단축키)
    ├── src/components/phase1/ # 데이터전처리 컴포넌트
    │   ├── FilePanel.tsx      # 파일 패널 (탭 구조 제거)
    │   └── ControlPanel.tsx   # 파이프라인 제어 패널
    │   # DomainPanel.tsx — 삭제됨 (워크스페이스 페이지로 이전)
    ├── src/api/pipeline.ts    # 파이프라인 API 클라이언트
    ├── src/api/assignment.ts  # 키워드 할당 API 클라이언트 (목록 조회, updateFlag, 키워드페이지조회)
    ├── src/api/phase1.ts      # 데이터전처리 API 클라이언트
    ├── src/api/workspace.ts   # 워크스페이스 API 클라이언트 (DomainItem {id,name} 타입 포함 + phase 전이 API)
    ├── src/api/dict_verify.ts # 사전검증 API 클라이언트
    ├── src/api/llm.ts         # LLM 설정 API 클라이언트 (목록 조회, 저장)
    ├── src/stores/authStore.ts # JWT 상태 관리
    ├── src/stores/pipelineStore.ts # 파이프라인 상태 관리
    ├── src/stores/workspaceStore.ts # 워크스페이스 전역 상태 (Zustand — 선택/목록) + completeWorkspace 액션
    ├── src/stores/globalTaskStore.ts # 전역작업 단일 큐 (currentTask, isBlocked, _startTask, _finishTask, _startPolling, applyRemoteTask) — 다중 PC WS 동기화 race condition 수정 완료
    ├── src/stores/workspaceOpsSlice.ts # 워크스페이스 작업 슬라이스 (executeCreate/Connect/Cancel/Release/Reinit, restoreWorkspacePolling)
    ├── src/stores/domainOpsSlice.ts # 도메인 작업 슬라이스 (executeDomainAdd/Delete, restoreDomainPolling)
    ├── src/stores/buildOpsSlice.ts  # 사전빌드 작업 슬라이스 (executeBuild/cancelBuild — 5초 폴링, 백엔드 percent 활용)
    └── src/index.css           # 전역 디자인 CSS (glassmorphism, 애니메이션, CSS 변수)
    └── dist/                  # 빌드 결과 (FastAPI StaticFiles로 서빙)
```

### Phase 3 신규 API 엔드포인트

| 경로 | 설명 |
|------|------|
| /api/pipeline/* | 파이프라인 이력 조회/실행 |
| /api/knowledge/* | 지식작업 워크플로우 |
| /api/build/* | 빌드 이력 조회/실행 |
| /api/realtime/* | 실시간 로그 스트리밍 (SSE) |

### 데이터전처리/워크스페이스 API 엔드포인트

| 경로 | 설명 |
|------|------|
| /preprocess/* | 데이터전처리 파이프라인 (파일 업로드/실행/로그) |
| /workspaces | 워크스페이스 목록 조회 (GET) / 생성 (POST) / 삭제 (DELETE) |
| /workspaces/select | 워크스페이스 선택 (POST) / 선택 해제 (DELETE) |
| /workspaces/hotkeys | 핫키 설정 조회 (GET) / 저장 (PUT) |
| /work-history | 작업이력 목록 (GET) / 기록 (POST) |
| /work-history/undo/{id} | 작업이력 undo/rollback (POST) |
| /assignments | 키워드 할당 목록 조회 (GET) |
| /assignments/flag | 키워드 읽음/작업 flag 업데이트 (PUT) — R/W/'' |
| /assignments/complete-with-mode | 키워드 완료 처리 모드 선택 (POST) |
| /assignments/keyword/{keyword_id} | 키워드 단건 조회 (GET) — 빌드 완료 후 분석결과 갱신용 |
| /ai-analysis/search | AI 분석 검색 — LLM+Wikipedia (GET) |
| /llm-settings | LLM 설정 4종 조회 (GET) |
| /llm-settings/{provider} | LLM 설정 저장 (PUT) — openai/claude/gemini/local |
| /stats/llm-usage | LLM 사용량 통계 조회 — provider별/기간별 집계 (GET) |

### 워크스페이스 Phase 시스템 API (Phase 4 신규)

| 경로 | 설명 |
|------|------|
| GET /api/workspaces/{domain}/phase | 현재 워크스페이스 phase 조회 (preprocess/work/build/verify) |
| POST /api/workspaces/{domain}/phase/{target} | phase 전이 (target: work/build/verify/preprocess) |
| GET /api/workspaces/{domain}/my-phase | 내 작업 phase 조회 (idle/working/done) |
| POST /api/workspaces/{domain}/my-phase | 내 작업 phase 설정 |
| POST /api/dict-verify/run | 사전검증 실행 (user.ks/cnlist.ks/synonym.UTF-8 교차검증) |
| GET /api/dict-verify/status | 사전검증 마지막 결과 조회 |

---

## 최근 변경사항 요약 (2026-04-09, know 프로젝트 전반 개선)

### 신규 파일
- `frontend/src/components/ErrorBoundary.tsx` — React ErrorBoundary class 컴포넌트 (흰 화면 방지 폴백 UI)

### 수정 파일
- `services/assignment_service.py` — `_validate_workspace()` SQL 인젝션 방어 함수 추가
- `api/phase1.py` — KnowAPIError 에러 응답 통일 + 트랜잭션 패턴
- `api/assignment.py` — `/initialize` 트랜잭션 패턴 (try/except/rollback)
- `init_db.py` — `trg_phase1_runs_delete` 트리거 + `idx_wh_ws_dom`, `idx_bh_domain` 인덱스 추가
- `App.tsx` — ErrorBoundary로 앱 루트 래핑
- `api/client.ts` — HTTP_ERROR_MESSAGES 한국어 메시지 맵 + 인터셉터 통일 처리
- `pages/DomainManage.tsx` — 도메인 추가 UI 모달 통일
- `hooks/usePhase1WebSocket.ts` — exponential backoff 재연결 구현
- `components/phase1/ControlPanel.tsx` — stepPercents prop으로 실제 진행률 % 표시
- `pages/Phase1Pipeline.tsx` — stepPercents useMemo 추가
- `pages/KnowledgeWork.tsx` — 30초 auto-save (localStorage) + 복구 배너

---

## 최근 변경사항 요약 (2026-04-09, 전처리 초기화 + kw_{workspace} 전환)

### 핵심 변경
- `services/assignment_service.py` — `kw_{workspace}` 테이블 전용 CRUD로 전환 + 동적 테이블 생성
- `api/workspace.py` — 이전단계 이동 시 phase1_runs/로그/kw_{workspace} TRUNCATE 호출
- `services/workspace_service.py` — `reset_phase_data()` 신규 (전처리 전체 초기화)
- `init_db.py` — `kw_{workspace}` 동적 테이블 생성 지원
- `api/assignment.py` — kw_{workspace} 기반 API 조정
- `pages/Phase1Pipeline.tsx` — 이전단계 이동 시 `?reset=1` 쿼리 파라미터 처리
- `pages/Assignment.tsx`, `api/assignment.ts`, `pages/KnowledgeWork.tsx` — 워크스페이스별 테이블 전환 반영

---

## 최근 변경사항 요약 (2026-04-09, k5 파이프라인)

### Phase 1: 백엔드 구조 정비
- `core/constants.py` 신규: 18개 전역 경로 상수 통합 (중복 하드코딩 제거)
- `core/exceptions.py` 신규: 커스텀 예외 계층 (KnowError 기반)
- `main.py`: CORS 환경변수화 + lifespan 마이그레이션 + 전역 예외 핸들러
- `services/dict_export_service.py` 신규: 역방향 import 해소 (phase1→pipeline 의존성 제거)

### Phase 2: 프론트엔드 컴포넌트 분리
- `components/workspace/DicTab.tsx` 신규 (548줄): 사전탭 컴포넌트 분리
- `utils/analysis.ts` 신규: 분석 유틸 함수 분리
- `utils/keyboard.tsx` 신규: 키보드 핫키 유틸
- `utils/hangul.ts` 신규: 한글 입력 처리
- `KnowledgeWork.tsx`: 2281줄 → 1470줄 (컴포넌트 분리로 감축)

### Phase 3: 대시보드 + 일괄 작업 모드
- `api/dashboard.py` + `services/dashboard_service.py` 신규
- `/api/assignments/bulk-register`, `bulk-delete` 엔드포인트 추가
- `pages/Dashboard.tsx` 신규: 도메인별 현황 대시보드
- `Layout.tsx`: 대시보드 메뉴 추가

### Phase 4: 실시간 알림 + UX 개선
- `services/notification_service.py` + `api/notification.py` 신규
- `hooks/useNotification.ts` 신규 (WebSocket 기반 실시간 알림) — closedIntentionally ref + onopen 초기 상태 fetch + userId 변경 시 재연결 추가 (다중 PC 동기화)
- `components/GlobalSearch.tsx` 신규 (통합 검색)
- `Layout.tsx`: disabled Tooltip + GlobalSearch 헤더 통합
- `Workspace.tsx`: 진행률 표시 개선

### Phase 5: 사전빌드 globalTaskStore 이관 (2026-04-11)
- `stores/buildOpsSlice.ts` 신규: 사전빌드 전역작업 슬라이스 (executeBuild/cancelBuild — 5초 폴링)
- `stores/globalTaskStore.ts`: BuildOpsSlice 합성 추가
- `pages/KnowledgeWork.tsx`: buildLoading 로컬 state 제거 → isBlocked/executeBuild 연동, 빌드 완료 후 키워드 단건 갱신, overflow:hidden 스크롤 수정
- `api/assignment.py`: `GET /assignments/keyword/{keyword_id}` 단건 조회 엔드포인트 추가
- `api/assignment.ts`: `키워드단건(workspace, id)` API 메서드 추가
- `pages/DomainManage.tsx`: 복사소스 사전건수 표시 UI 제거, Select 너비 280px 고정
- `services/dictionary_service.py`: `_find_dict_file()` 2단계 하위 디렉토리 탐색 추가

### Phase 6: auto-save 제거 + 사전빌드 재분析/percent 개선 (2026-04-11)
- `pages/KnowledgeWork.tsx`: auto-save state/useEffect×2/JSX Alert 완전 제거 (사용자 미요청 기능)
- `services/assignment_service.py`: `reanalyze_from_db()` 신규 — DB `kw_{workspace}` 기반 형태소분析+유사어확장+refine.txt 재생성
- `pipeline/build_wrapper.py`: 빌드 완료 후 `reanalyze_from_db()` 호출로 교체 (DB 기반 재분析)
- `services/build_service.py`: `_estimate_build_percent()` 신규 + 빌드 상태 응답에 `percent` 필드 추가
- `stores/buildOpsSlice.ts`: 백엔드 `percent` 값 활용하여 progressbar 단계적 진행 표시

### Phase 7: 작업실 키워드 자동복원 — keyword_id 기반 페이지 계산 (2026-04-11)
- `services/assignment_service.py`: `get_keyword_page()` 신규 — keyword_id → line_num → position → 페이지 번호 계산
- `api/assignment.py`: `GET /assignments/keyword-page` 엔드포인트 추가 (keyword_id 기반 페이지 번호 조회)
- `api/assignment.ts`: `키워드페이지조회(workspace, domain, userId, keywordId)` API 메서드 추가
- `pages/KnowledgeWork.tsx`: `목록초기화()` 수정 — 신규 API로 startPage 계산 + target 마지막 항목 pre-fetch
