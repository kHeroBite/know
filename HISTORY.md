# HISTORY.md — 작업 이력

## 2026-03-25 — know-api 버그 수정

### 수정 내용
- 프론트엔드 페이지네이션 응답 처리: `res.data` → `res.data?.items || []` (DomainList, CategoryManage, DictionaryManage)
- Statistics.tsx DomainStat 인터페이스 필드명 수정: `udic_count` → `udic` 등 4개
- category_service.py: `{SITE}_CATEGORY` 테이블 미존재 시 500 에러 → 200 + 빈 목록 반환
- kPlaywright 스킬: Windows CDP → WSL Headless Chromium 전환

### 배경
- Playwright 테스트 중 `.some is not a function` JS 오류 발견 → API 응답이 `{items:[...]}` 객체인데 배열로 처리하던 버그
- bcrypt 5.0.0 + passlib 호환성 문제는 이전 세션에서 수정 완료 (bcrypt==3.2.2 다운그레이드)
