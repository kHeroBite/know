# HISTORY.md — 작업 이력

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

## 2026-03-25 — know-api 버그 수정

### 수정 내용
- 프론트엔드 페이지네이션 응답 처리: `res.data` → `res.data?.items || []` (DomainList, CategoryManage, DictionaryManage)
- Statistics.tsx DomainStat 인터페이스 필드명 수정: `udic_count` → `udic` 등 4개
- category_service.py: `{SITE}_CATEGORY` 테이블 미존재 시 500 에러 → 200 + 빈 목록 반환
- kplaywright 스킬: Windows CDP → WSL Headless Chromium 전환

### 배경
- Playwright 테스트 중 `.some is not a function` JS 오류 발견 → API 응답이 `{items:[...]}` 객체인데 배열로 처리하던 버그
- bcrypt 5.0.0 + passlib 호환성 문제는 이전 세션에서 수정 완료 (bcrypt==3.2.2 다운그레이드)
