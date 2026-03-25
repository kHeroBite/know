# HISTORY.md — 작업 이력

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
