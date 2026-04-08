# HISTORY.md — 작업 이력

## 2026-04-08 — 전처리 5단계 복원 + 사전빌드 후 재분석 + 캐시 제거 + DB migration

### 수정 내용

**핵심 변경**: 프론트엔드 캐시 완전 제거, executor.py 전처리 단계 복원(3~5), 빌드 후 자동 재분석, DB 컬럼 추가

#### 수정 파일 (총 8개)
- `www/frontend/src/pages/KnowledgeWork.tsx` — liteCacheRef/fullCacheRef/prefetchAbortRef/mkCacheKey/프리패치useEffect 완전 제거 (131줄 감소) + useEffect 시작줄 복원 + setLiteAnalysis(result) 복원
- `www/frontend/src/pages/Phase1Pipeline.tsx` — end_step:5로 변경 (전처리 5단계 전체 실행)
- `www/frontend/src/components/phase1/ControlPanel.tsx` — 단계 목록 확장 (3/4/5단계 추가)
- `www/phase1/executor.py` — PHASE1_STEPS 3/4/5단계 복원 (키워드추출/결과변환/유사어체크)
- `www/services/assignment_service.py` — reanalyze_after_build() 함수 추가 (빌드 후 자동 재분석)
- `www/pipeline/build_wrapper.py` — 빌드 완료 후 reanalyze_after_build() 호출 추가
- `www/frontend/src/api/pipeline.ts` — `/api/build/` → `/build/` (baseURL 중복 제거)
- `www/main.py` — llm_settings.thesaurus_prompt 컬럼 migration (ALTER TABLE ADD COLUMN)
- `www/frontend/dist/` — 빌드 결과물 갱신

#### 아키텍처 변경
- **캐시 제거**: KnowledgeWork.tsx 131줄 캐시 로직 완전 제거 → 단순 API 호출 방식 복원
- **전처리 복원**: 전처리 3/4/5단계(키워드추출/결과변환/유사어체크)를 executor.py에 복원
- **빌드 후 재분석**: build_wrapper.py가 빌드 완료 후 reanalyze_after_build() 자동 호출
- **DB migration**: llm_settings 테이블에 thesaurus_prompt TEXT 컬럼 추가

#### 교훈
- L-036: ktest 팀에이전트 프롬프트에 curl localhost 하드코딩 금지
- L-037: 신규 DB 컬럼 참조 시 migration SQL 동시 작성 필수

---

## 2026-04-07 — 작업실 실시간 분석 구조 변경 — 전처리 단축 + 실시간 API + 사전빌드 (커밋: dd30078)

### 수정 내용

**핵심 변경**: 데이터전처리 단계 단축(키워드추출+정제→프리징) + 작업실 실시간 분석 API 신설 + 사전빌드 버튼 구조 변경

#### 수정 파일 (총 9개)
- `know-api/phase1/executor.py` — PHASE1_STEPS 축소 (Step 3,4,5 제거 — 작업실 실시간 API로 이전)
- `know-api/services/assignment_service.py` — 프리징 단순화 (analysis 빈값으로 저장)
- `know-api/services/morpheme_service.py` — 실시간_분석(), 실시간_풀분석() 신규 추가
- `know-api/phase1/synonym_checker.py` — 단일_유사어체크() 함수 추출
- `know-api/api/morpheme.py` — /analyze-realtime, /analyze-full-realtime 엔드포인트 추가
- `know-api/frontend/src/pages/KnowledgeWork.tsx` — 실시간 API 전환 + 사전빌드 버튼(dqdic+thesaurus)
- `know-api/services/build_service.py` — thesaurus export 통합
- `know-api/pipeline/build_wrapper.py` — thesaurus export 빌드 전 실행
- `know-api/api/build.py` — workspace 파라미터 전달

#### 아키텍처 변경
- **전처리 파이프라인 단축**: 키워드추출(Step 3) + 결과변환(Step 4) + 유사어체크(Step 5) 제거 → 프리징 즉시 완료
- **실시간 분석 API**: `/analyze-realtime` (LITE) + `/analyze-full-realtime` (FULL) 신설
- **사전빌드 버튼**: dqdic + thesaurus 동시 빌드 지원, thesaurus export가 빌드 전 자동 실행

#### 교훈
- L-033: PHASE1_STEPS 단계 번호 불연속 → 이전 이유 주석 필수
- L-034: 경로 상수 다중 파일 중복 → constants.py 단일 출처 원칙
- L-035: phase1→pipeline 역방향 import → 레이어 의존성 준수

---

## 2026-04-07 — 분석결과 탭 LITE/FULL 개선 + 단축키 정리 + 레이아웃 통합 (커밋: d87d6ab)

### 수정 내용

#### 변경 파일 (총 2개)
- `frontend/src/pages/KnowledgeWork.tsx` — 분석결과 탭명 변경(심플→LITE, 풀→FULL), LITE/FULL 행간 통일(lineHeight 2.0), 통합 레이아웃 구현
- `frontend/src/components/workspace/HotkeySettings.tsx` — 단축키 설정 정리 (prevKeyword/nextKeyword/thesaurusLlm 제거, 고정단축키 동적화)

#### 상세 변경
- **분석결과 탭명**: 심플 → LITE, 풀 → FULL
- **LITE/FULL 행간**: lineHeight 2.0으로 통일
- **LITE/FULL 통합 레이아웃**: 어절=분석 생략, 유사어 줄바꿈 처리, 부분유사어 꺽쇠 제거, comp줄 표시
- **단축키 설정 간소화**: 사용 안 하는 prevKeyword/nextKeyword/thesaurusLlm 항목 제거, 고정 단축키 동적화

---

## 2026-04-05 — 워크스페이스 통합 phase 시스템 도입 + 사전검증 파일기반 재작성 (커밋: TBD)

### 수정 내용

**핵심 변경**: 3개 플래그(isFrozen/isAssigned/isBuildPhase) 완전 제거 → 통합 phase enum 도입

#### 아키텍처 변경
- **workspace phase** (4단계): `preprocess` → `work` → `build` → `verify`
- **user_work_phase** (work 단계 전용): `idle` | `working` | `done`
- SQLite `user_work_phase` 테이블 신설 (migrations/002_user_work_phase.sql)

#### 수정 파일 (총 20개)
- `services/workspace_service.py` — phase 전이 로직 + user_work_phase CRUD
- `api/workspace.py` — phase 전이 4개 API + my-phase 2개 API
- `schemas/workspace.py` — 신규 스키마 파일
- `services/dict_verify_service.py` — 사전검증 파일기반 재작성 (신규)
- `api/dict_verify.py` — 사전검증 API (신규)
- `migrations/002_user_work_phase.sql` — 마이그레이션 SQL (신규)
- `main.py` — migration 주석 파싱 버그 수정 + dict_verify 라우터 등록
- `api/assignment.py` — phase 연동 수정
- `frontend/src/api/workspace.ts` — phase 전이 API 클라이언트
- `frontend/src/api/dict_verify.ts` — 사전검증 API 클라이언트 (신규)
- `frontend/src/pages/Workspace.tsx` — "검증단계로"/"다음단계로" 버튼 추가
- `frontend/src/pages/DictVerify.tsx` — 사전검증 페이지 (신규)
- `frontend/src/pages/Assignment.tsx`, `BuildHistory.tsx`, `KnowledgeWork.tsx`, `Phase1Pipeline.tsx`
- `frontend/src/components/Layout.tsx` — DictVerify 메뉴 추가
- `frontend/src/App.tsx` — DictVerify 라우트 추가
- `frontend/src/stores/workspaceStore.ts`

#### ktest 중 발견·수정된 버그 6개
1. workspace.ts 중복 advancePhase export (TS1117)
2. Python 3.8 호환성 `tuple[set]` PEP585 사용 (L-028 재발)
3. 사용자phase조회/설정 반환값 누락
4. GET /phase str 반환 → dict 래핑
5. main.py migration SQL 주석 스킵 버그
6. api/dict_verify.py build_history 컬럼 오류 (workspace → domain)

### ktest 결과
- must 13/13 ✅, should 4/4 ✅

---

## 2026-04-03 — LLM 사용 통계 + AI분석 UI 개선 + 작업완료 모달 + 유사어LLM제외 최적화 (커밋: 47d630f)

### 수정 내용

**신규: llm_usage_log 테이블** (`init_db.py`)
- LLM 호출 로그 영구 저장 (provider/model/user_id/tokens_used/duration_ms/success/error_msg)

**신규: LLM 통계 API + 페이지** (`api/statistics.py`, `services/statistics_service.py`, `frontend/src/pages/Statistics.tsx`)
- `GET /api/stats/llm-usage` — provider별/기간별 LLM 사용량 통계
- Statistics 페이지 recharts 그래프로 시각화 (recharts 의존성 추가)

**개선: 유사어추천 LLM 제외 최적화** (`services/thesaurus_recommend.py`)
- head완전 또는 tail완전 텍스트 매칭 시 LLM 재순위 단계 스킵 → 응답 속도 향상

**개선: LLM 사용 로그 기록 + user_id 전달** (`services/llm_settings_service.py`, `services/ai_analysis_service.py`, `api/ai_analysis.py`, `api/dictionary.py`)
- 모든 LLM 호출 시 llm_usage_log에 user_id + 결과 기록

**개선: AI분석 UI 개선** (`frontend/src/components/workspace/AIAnalysis.tsx`)
- 너비/레이아웃 조정, 탭명 변경, disabled 처리, forcedTab 지원

**신규: 작업완료 버튼 + 모달** (`api/assignment.py`, `services/assignment_service.py`, `frontend/src/pages/KnowledgeWork.tsx`, `frontend/src/api/assignment.ts`)
- `POST /api/assignments/complete-with-mode` — 완료 처리 모드 선택 API
- 작업완료 모달 UI (완료 처리 방식 선택)

**버그픽스: 복합명사 등록 race condition 수정** (`frontend/src/pages/KnowledgeWork.tsx`)
- 동시 등록 시 상태 불일치 버그 수정

**신규: AI/Wikipedia 탭 단축키** (`frontend/src/components/workspace/HotkeySettings.tsx`, `frontend/src/pages/KnowledgeWork.tsx`)
- PageUp/PageDown으로 AI분석/Wikipedia 탭 전환 단축키 추가

### 수정 파일 (16개)
- **백엔드 (10):** `init_db.py`, `services/llm_settings_service.py`, `services/thesaurus_recommend.py`, `services/statistics_service.py`, `api/statistics.py`, `api/ai_analysis.py`, `services/ai_analysis_service.py`, `api/dictionary.py`, `api/assignment.py`, `services/assignment_service.py`
- **프론트엔드 (6):** `frontend/src/components/workspace/AIAnalysis.tsx`, `frontend/src/pages/KnowledgeWork.tsx`, `frontend/src/components/workspace/HotkeySettings.tsx`, `frontend/src/api/assignment.ts`, `frontend/src/pages/Statistics.tsx`, `frontend/package.json`(recharts 추가)

---

## 2026-04-03 — 작업실 유사어 추천 시스템: 오타변형 텍스트매칭 + LLM 의미기반 재순위 하이브리드 (커밋: adb3583)

### 수정 내용

**신규: 한영변환+오타변형 엔진** (`services/typo_matcher.py`)
- 한글 자모 분해/조합 유틸 (5-state machine으로 복합종성 처리)
- 한→영/영→한 키보드 레이아웃 변환
- 모음 오타 그룹 치환, 인접키 자음 치환
- `검색변형생성(keyword)` → 최대 20개 변형 반환 (점수 기반)

**신규: 유사어 후보검색 + LLM 재순위** (`services/thesaurus_recommend.py`)
- `세트정규화키(head, tail)` — frozenset 양방향 중복 제거
- `유사어추천후보검색(db, site, keyword, limit=50)` — 변형 생성 → DB 전체 로드 → 점수 매칭 → 상위 반환
- `LLM재순위(keyword, candidates, context, prompt)` — LLM 상위 5개 선택, 실패 시 점수 기준 폴백

**수정: recommend GET/POST 엔드포인트 추가** (`api/dictionary.py`)
- `GET /api/dictionary/recommend` — 후보 검색 (텍스트 매칭 결과)
- `POST /api/dictionary/recommend` — LLM 재순위 결과 반환

**수정: 추천 모달 UI** (`frontend/src/pages/KnowledgeWork.tsx`)
- 작업실 숫자3 핫키 → 유사어 추천 모달 오픈
- LLM 분석 버튼 + 프롬프트 편집 가능

**기타 수정** (`api/assignment.py`, `services/assignment_service.py`, `frontend/src/api/assignment.ts`, `frontend/src/components/Layout.tsx`, `frontend/src/components/workspace/WorkHistory.tsx`)

### 수정 파일 (9개)
- **백엔드 (4):** `services/typo_matcher.py`(신규), `services/thesaurus_recommend.py`(신규), `api/dictionary.py`, `api/assignment.py`, `services/assignment_service.py`
- **프론트엔드 (4):** `frontend/src/pages/KnowledgeWork.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/components/workspace/WorkHistory.tsx`, `frontend/src/api/assignment.ts`

---

## 2026-04-02 — LLM 설정 페이지 + AI분석 LLM탭 구현 (커밋: 3a00471)

### 수정 내용

**신규 기능: LLM 설정 페이지 (4종 AI)**
- DB: `llm_settings` 테이블 신규 (provider/api_key/model_name/enabled/extra_config)
- 서비스: `services/llm_settings_service.py` 신규 — 4종 LLM 설정 CRUD + 연결 테스트
- API: `api/llm_settings.py` 신규 — GET /api/llm-settings, PUT /api/llm-settings/{provider}
- 프론트: `pages/LLMSettings.tsx` 신규 — ChatGPT/Claude/Gemini/로컬LLM 4종 카드형 설정 UI + 연결 테스트 버튼
- 프론트: `api/llm.ts` 신규 — LLM 설정 API 클라이언트
- 라우팅: `/llm-settings` 페이지 추가 (`App.tsx`), 사이드바 "LLM 설정" 메뉴 추가 (`Layout.tsx`)

**변경: AI분석 탭 구조 개선** (`AIAnalysis.tsx`, `ai_analysis_service.py`, `ai_analysis.py`)
- Google/Perplexity 탭 제거 → LLM/Wikipedia 2탭으로 단순화
- LLM 탭: 설정된 AI 엔진으로 분석 요청
- Wikipedia 탭: 한국어 Wikipedia 검색 유지

**버그픽스: Python 3.8 타입 힌트 호환성** (`api/llm_settings.py`)
- `list[Dict[str, Any]]` → `List[Dict[str, Any]]` (from typing import List 추가)
- 원인: Python 3.8 서버에서 built-in 제네릭(PEP 585) 미지원

### 수정 파일 (12개)
- **백엔드 (7):** `init_db.py`, `services/llm_settings_service.py`(신규), `api/llm_settings.py`(신규), `services/ai_analysis_service.py`, `api/ai_analysis.py`, `main.py`, `requirements.txt`
- **프론트엔드 (5):** `src/api/llm.ts`(신규), `src/pages/LLMSettings.tsx`(신규), `src/components/workspace/AIAnalysis.tsx`, `src/App.tsx`, `src/components/Layout.tsx`

---

## 2026-04-02 — 작업실 단축키·포커스·undo·이력 컬럼 개선 5건 (커밋: 5dec62e)

### 수정 내용

**건1: derivedHotkeys 계산 로직 도입** (`KnowledgeWork.tsx`)
- 기존 고정 단축키 배열 대신 useMemo 기반 derivedHotkeys로 동적 계산
- HotkeySettings 설정값 반영하여 탭별 단축키 자동 구성

**건2: 탭별 포커스 트리거 개선** (`KnowledgeWork.tsx`)
- 탭 전환 시 해당 탭의 입력 필드에 포커스 자동 이동
- escKeyword + escCount 상태 추가로 Esc 키 이벤트 감지 개선

**건3: WorkHistory undoLatestForKeyword 추가** (`WorkHistory.tsx`)
- 선택 키워드 기준 최근 작업 1건 되돌리기 기능 추가
- 사전 컬럼 width 70으로 고정

**건4: HotkeySettings 고정탭단축키 제거** (`HotkeySettings.tsx`)
- 고정된 탭 단축키 항목 제거
- 사용자 안내 텍스트 교체 (derivedHotkeys 방식 반영)

**건5: AC-006 escCount 역라우팅 수정** (`KnowledgeWork.tsx`)
- ktest AC-006 검증에서 escCount 미구현 발견 → 즉시 수정

### 수정 파일
- `know-api/frontend/src/pages/KnowledgeWork.tsx`
- `know-api/frontend/src/components/workspace/WorkHistory.tsx`
- `know-api/frontend/src/components/workspace/HotkeySettings.tsx`

---

## 2026-04-02 — 작업실 6건: 자동선택+border+컬럼분리+AI분석UI+이력테이블+오류표시 (커밋: TBD)

### 수정 내용

**건1: 진입 시 미작업 키워드 자동 선택** (`KnowledgeWork.tsx`)
- 작업실 진입 시 flag!='W'인 첫 번째 키워드 자동 선택 처리

**건2: 선택 키워드 outline 1px solid #1890ff** (`KnowledgeWork.tsx`)
- 선택된 키워드 행에 파란색 테두리 1px 표시

**건3: 키워드 번호/텍스트 컬럼 분리** (`KnowledgeWork.tsx`)
- 키워드 목록에서 순번 컬럼과 텍스트 컬럼을 별도 분리

**건4: AI분석 직접입력 UI + URL 표시 + 프롬프트 수정(관리자)** (`AIAnalysis.tsx`, `ai_analysis.py`, `ai_analysis_service.py`, `workspace.ts`, `config/ai_prompt.json`)
- AI분석 패널에 직접입력 텍스트박스 추가
- 분석 결과 URL 표시 기능 추가
- 관리자 전용 프롬프트 수정 UI 추가
- config/ai_prompt.json 신규 생성 (기본 프롬프트 저장)

**건5: 작업이력 Table 4컬럼 분리** (`WorkHistory.tsx`)
- 작업이력 패널을 Ant Design Table로 변환 — 번호/사전/단어/작업 4컬럼

**건6: 단축키 등록 오류 메시지 복원** (`KnowledgeWork.tsx`)
- 단축키 등록 실패 시 오류 메시지 표시 기능 복원

### 수정 파일
- `know-api/frontend/src/pages/KnowledgeWork.tsx`
- `know-api/frontend/src/components/workspace/AIAnalysis.tsx`
- `know-api/frontend/src/components/workspace/WorkHistory.tsx`
- `know-api/api/ai_analysis.py`
- `know-api/services/ai_analysis_service.py`
- `know-api/config/ai_prompt.json` (신규)
- `know-api/frontend/src/api/workspace.ts`

## 2026-04-02 — 작업실 8건: flag+포스트잇+프롬프트+이력형식+순번+undo탭전환+border

### 수정 내용

**건1: 분석결과 하이라이트 배경색 포스트잇(#FFFDE7) 고정** (`KnowledgeWork.tsx`)
- 분석결과 패널 배경색을 포스트잇 느낌 #FFFDE7(연노랑) 고정

**건2: DB flag 컬럼 추가 + 자동 마킹 + 키워드목록 실시간 반영** (`init_db.py`, `assignment_service.py`, `api/assignment.py`, `assignment.ts`, `KnowledgeWork.tsx`)
- `keyword_assignments.flag` 컬럼 추가 (R=읽음, W=작업완료, ''=미확인)
- 분석결과 열릴 때 flag='R'로 자동 마킹 → PUT `/api/assignments/flag`
- 키워드목록 worked_count 실시간 반영

**건3: 키워드목록 타이틀 "키워드(N/M)" 형식** (`KnowledgeWork.tsx`)
- 헤더에 총 키워드 수 / worked_count 표시

**건4: AI분석 프롬프트 변경 + 높이 2배** (`ai_analysis_service.py`, `KnowledgeWork.tsx`)
- DuckDuckGo 검색 기반 프롬프트 개선
- 분석결과 패널 높이 2배 확대

**건5: 작업이력 "사용자사전 + 명인" 형식** (`WorkHistory.tsx`)
- 이력 항목 표시: `[사전타입] 단어` → `사용자사전 + 명인 표시 형식` 개선

**건6: 키워드 할당 순번 표시** (`KnowledgeWork.tsx`)
- 키워드목록에서 line_num(원본 순번) 표시

**건7: undo 시 사전탭 전환 + 재검색** (`KnowledgeWork.tsx`)
- undo 실행 후 해당 사전탭으로 자동 전환 + 키워드 재검색

**건8: 선택 키워드 border 검정 (배경색 유지)** (`KnowledgeWork.tsx`)
- 선택된 키워드 아이템에 검정 border 추가 (기존 배경색 유지)

### 수정 파일
- `know-api/init_db.py` (flag 컬럼 마이그레이션)
- `know-api/services/assignment_service.py` (flag SELECT/UPDATE, worked_count)
- `know-api/api/assignment.py` (PUT /flag 엔드포인트)
- `know-api/services/ai_analysis_service.py` (DuckDuckGo 프롬프트)
- `know-api/frontend/src/api/assignment.ts` (updateFlag API)
- `know-api/frontend/src/pages/KnowledgeWork.tsx` (건1~건8 프론트 전체)
- `know-api/frontend/src/components/workspace/WorkHistory.tsx` (이력 표시 형식)
- `.claude/skills/kinfra_know/SKILL.md` (서버 빌드 스크립트 방식 명시)

### 비고
- 역라우팅 1회 발생: 건1 배경색 + 건2 flag API URL (L-022 기록됨)

---

## 2026-04-02 — 작업실 4건: 스크롤+AI분석+이력undo+레이아웃

### 수정 내용

**건1: 키워드목록 PAGE_SIZE=100 + 인피니티스크롤 복원 + 선택 키워드 자동 중앙 스크롤** (`KnowledgeWork.tsx`)
- PAGE_SIZE=100으로 확대 + 인피니티스크롤 복원
- 선택된 키워드가 목록 중앙에 오도록 자동 스크롤

**건2: AI분석 Google/Perplexity 크롤링 → DuckDuckGo/Wikipedia API 교체** (`ai_analysis_service.py`)
- Google 검색/Perplexity 크롤링 → DuckDuckGo + Wikipedia 공식 API로 교체
- 크롤링 없이 안정적 AI 분석 정보 제공

**건3: 작업이력 undo 사전삭제 버그 수정** (`work_history_service.py`, `KnowledgeWork.tsx`)
- action_type='add' 통일 + word fallback 처리
- undo 시 사전 항목이 잘못 삭제되던 버그 수정

**건4: 화면 3열 레이아웃 재구성** (`KnowledgeWork.tsx`)
- 좌: 키워드목록, 중: 분석+사전, 우: AI고정+이력grow

### 수정 파일
- `know-api/frontend/src/pages/KnowledgeWork.tsx` (건1+건3프론트+건4)
- `know-api/services/ai_analysis_service.py` (건2)
- `know-api/services/work_history_service.py` (건3)
- 프론트엔드 빌드(dist) 포함

### 비고
- 역라우팅 1회 발생: 건3 action_type 불일치 (L-022 기록)
- ko/SKILL.md Agent spawn subagent_type 규칙 강화 (L-021 반영)

---

## 2026-04-02 — 작업실 10건 UI/로직 수정

### 수정 내용

**건1: 분석결과 카드 포커스 배경+3D+border 2px** (`KnowledgeWork.tsx`)
- 분석 결과 카드에 포커스 시 배경 강조 + 3D 효과 + border 2px 적용

**건2: ← 키 이전 키워드 자동 이동** (`KnowledgeWork.tsx`)
- 분석 결과 화면에서 ← 방향키 누르면 이전 키워드로 자동 이동

**건3: comp: 패턴 자동선택 제외** (`KnowledgeWork.tsx`)
- comp: 접두사 패턴을 자동선택 대상에서 제외

**건4: AI분석 화면 사라짐 버그 수정** (`ai_analysis_service.py`)
- AI 검색 반환값 평탄화 처리 → 분석 화면 사라짐 현상 수정

**건5: 사전등록 작업이력 미저장 버그 수정** (`workspace.ts`, `WorkHistory.tsx`)
- addWorkHistory 타입 수정 + WorkHistoryItem 인터페이스 필드명 불일치 수정

**건6: 핫키설정 → 단축키설정 명칭 변경** (`HotkeySettings.tsx`)
- 모달 제목 "핫키설정" → "단축키설정" 변경

**건7: 카드 title KbdKey 키보드 이미지 추가** (`KnowledgeWork.tsx`)
- 카드 제목 영역에 단축키 표시용 KbdKey 컴포넌트 추가

**건8: 하단 탭 Alt+ 제거** (`KnowledgeWork.tsx`)
- 하단 탭에서 Alt+ 접두사 표시 제거

**건9: 키워드 열람 시 노랑색 배경 표시** (`KnowledgeWork.tsx`)
- 열람 상태 키워드에 노랑색 배경 적용

**건10: 메뉴명 작업실(Home) → 작업실** (`Layout.tsx`)
- 사이드바 메뉴명 "작업실(Home)" → "작업실" 변경

### 수정 파일
- `know-api/frontend/src/pages/KnowledgeWork.tsx` (8건)
- `know-api/frontend/src/api/workspace.ts`
- `know-api/frontend/src/components/workspace/WorkHistory.tsx`
- `know-api/services/ai_analysis_service.py`
- `know-api/frontend/src/components/workspace/HotkeySettings.tsx`
- `know-api/frontend/src/components/Layout.tsx`
- 프론트엔드 빌드(dist) 포함

---

## 2026-04-02 — 5건 UI/안정성 수정: 고정높이 + WS타임아웃 + 이력유지 + 깜빡임방지 + startStep

### 수정 내용

**건1: 2~5단계 설정 파라미터 없음 확인** (코드 변경 없음)
- 현재 2~5단계에 별도 설정 파라미터가 없음을 확인 — 변경 불필요

**건2: 단계 파티션 고정높이 + 로그패널 높이 맞춤** (`know-api/frontend/src/components/phase1/ControlPanel.tsx`)
- 각 단계 파티션 고정높이 44px 적용 → 단계 수 변해도 레이아웃 안정
- 로그패널 높이를 단계 파티션과 맞춤

**건3: WebSocket 30초 타임아웃 fallback** (`know-api/frontend/src/hooks/usePhase1WebSocket.ts`)
- WS 메시지 없을 시 30초 후 API(`/preprocess/logs/{runId}`)로 최종 상태 확인
- 실행 중 WS가 끊어져도 polling fallback으로 완료 감지 보장

**건4: 전체실행 시 이전 이력 유지** (`know-api/frontend/src/pages/Phase1Pipeline.tsx`)
- 전체실행 시 이전 실행 결과(건수/경과시간) 보존 — 새 실행 결과로 점진적 갱신

**건5: 개별실행 시 이후 단계 깜빡임 방지** (`know-api/frontend/src/hooks/usePhase1WebSocket.ts`, `know-api/frontend/src/pages/Phase1Pipeline.tsx`)
- `startStep` 파라미터 도입 — 개별 실행 시 해당 단계 이전 completed 상태 즉시 보존
- 이후 단계만 리셋하여 실행 전 깜빡임(상태 초기화→재로드) 방지

### 특이사항
- 프론트엔드 빌드(dist) 포함

---

## 2026-04-02 — 4건 수정: 프리징버튼 이동 + 복사진행률 message + 필터모드 리디자인 + 정제순서유지 (커밋: 29c1a36+)

### 수정 내용

**건1: 프리징 버튼 위치 이동** (`know-api/frontend/src/components/phase1/ControlPanel.tsx`)
- 프리징 버튼을 유사어체크(Synonym Check) 아래로 이동

**건2: 워크스페이스 복사진행률 message 필드 누락 수정** (`know-api/api/workspace.py`)
- `GET /api/workspace/copy-progress` 응답에 `message` 필드 반환 누락 수정

**건3: 키워드 추출 옵션 리디자인** (Backend 3파일 + Frontend 3파일)

*Backend*
- **know-api/api/phase1.py**: `Phase1실행요청` — `filter_mode` 옵션 확장 (`both_and`, `both_or` 추가)
- **know-api/phase1/executor.py**: `_sync_extract` — both_and/both_or 이중 필터 로직 추가
- **know-api/services/phase1_service.py**: `phase1_실행()` 파라미터 전달 확장

*Frontend*
- **know-api/frontend/src/api/phase1.ts**: `RunParams` 인터페이스 확장
- **know-api/frontend/src/components/phase1/ControlPanel.tsx**: 체크박스 2개 + 프리셋 콤보 + AND/OR 리디자인
- **know-api/frontend/src/pages/Phase1Pipeline.tsx**: filterMode/filterValue 상태 관리 + props 전달

**건4: 정제 단계 정렬 순서 유지** (`know-api/phase1/executor.py`, `know-ops/.../검색로그정제기.py`)
- `_sync_refine`: 정제 처리 후 원본 입력 순서 재정렬 유지

### 특이사항
- 백엔드(건2/건3/건4)는 커밋 29c1a36에 포함, 프론트엔드+검색로그정제기.py는 후속 커밋에 포함

---

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
