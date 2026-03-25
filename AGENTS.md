# CLAUDE.md - AI Agent 프로젝트 매뉴얼

> **역할**: Claude Code가 프로젝트에서 작업할 때 참조하는 핵심 지침서

---

## 문서/스킬 3-tier 구조 (최우선 원칙)

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: CLAUDE.md (이 파일) — 범용 규칙                         │
│  ● 모든 프로젝트에 공통 적용되는 규칙/정책/프로세스              │
│  ● 스킬 전체 목록 및 설명 (범용 58개)                             │
│  ● 실행 환경, 병렬화 정책, MCP 설정 등 범용 인프라               │
├─────────────────────────────────────────────────────────────────┤
│  Tier 2: PROJECT.md — 프로젝트 고유 정보                         │
│  ● 프로젝트 메타데이터, 파일 구조, 아키텍처                      │
│  ● 프로젝트스킬(_{project}) 목록 및 설명                         │
│  ● 해당 프로젝트에만 해당하는 설정/경로/도구                     │
├─────────────────────────────────────────────────────────────────┤
│  Tier 3: 스킬 파일 (.claude/skills/*/SKILL.md)                   │
│  ● 가이드/유틸리티 = 100% 범용 (프로젝트명/경로 금지)           │
│  ● 프로젝트스킬(_{project}) = 100% 프로젝트 고유                │
│  ● 프로젝트 문서(ADVANCED/DATABASE/MCP 등) = 프로젝트 고유       │
└─────────────────────────────────────────────────────────────────┘
```

**분리 원칙 (절대 위반 금지):**
- CLAUDE.md, 가이드/유틸리티 스킬에 **특정 프로젝트명/경로/설정 금지**
- 프로젝트 고유 정보는 **PROJECT.md 또는 프로젝트스킬(_{project})에만** 기재
- Skill('kO') 로딩 시 **현재 프로젝트를 감지**하여 `kInfra_{project}` 자동 호출 → 프로젝트별 인프라 설정 로딩

---

## 언어 정책

**필수**: 모든 대화/주석/변수명/함수명/클래스명/문서 = 한국어. Git 커밋 = 한국어 + 이모지. [COMPACT]
**커밋 모델 태그**: 제목 마지막에 `by {모델버전}` 추가 (예: `✨ 기능 추가 by claude-sonnet-4-6`). 접두어 금지. [COMPACT]
**예외**: 기술 용어(REST API, MCP 등), 라이브러리명은 영어 허용.
**중요**: /compact 후에도 한국어 유지 필수. CLAUDE.md 재읽기 필수. 새 세션도 한국어로 시작.

### 인코딩 규칙 (핵심만)

- **PowerShell UTF-8 (L-148)**: `Out-File`/`Set-Content -Encoding UTF8` 절대 금지 (BOM 강제). `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))` 사용. [COMPACT]
- **CRLF**: NTFS 프로젝트 파일은 CRLF 유지. `.sh` Write 후 `sed -i 's/\r//' 파일` 필수.
- **BOM**: 신규 파일 UTF-8 without BOM. 기존 파일 cp 바이너리 복사로 자동 보존.
- **Git**: `i18n.commitEncoding = utf-8` 유지.
> 상세(PowerShell/CRLF 전체 절차): domain-fileops SKILL.md 참조

### UI/Designer 규칙

- UI 컨트롤 추가/배치는 `*.Designer.cs`에서만. 코드에서 `new Control()` 직접 생성 금지.
- 이벤트 바인딩도 Designer에서 처리.


---

## 실행 환경: WSL2 + Windows

Claude Code는 WSL2에서 실행되며, 프로젝트 파일은 Windows NTFS(`/mnt/c/`)에 위치.

```yaml
기본_환경: WSL2 (Linux)
프로젝트_경로: kInfra_{project} 프로젝트스킬의 솔루션_경로 참조

WSL에서_실행 (기본):
  - Bash 명령어, dotnet build, curl, MCP 도구
  - Read/Glob/Grep (읽기는 정상 작동)
  - Serena 코드 분석/편집

도구_정책 (WSL 최우선):
  - WSL에서 최대한 리눅스 도구 사용, Windows 도구(.exe)는 최소화
  - git push → kInfra_{project} 프로젝트스킬 참조
  - Windows 도구 사용 시: 반드시 사유 명시 + Fallback으로만 사용

파일_수정 (/mnt/c/ 경로 — 절대 규칙):
  - NTFS(/mnt/c/)에서 Edit/Write 도구 직접 사용 절대 금지 [COMPACT]
    - drvfs 캐시 불일치로 ENOENT statx 발생 → 파일 손상 (복구 불가)
    - "한 번만 괜찮겠지" 예외 없음 — .cs, .md, .json, .xml 모든 파일 유형 해당
  - 필수 절차 (rsync 방식 — 유일한 안전 경로):
      1. cp "/mnt/c/.../파일" /home/rioky/work/{project}-ntfs/파일  (ext4로 복사)
      2. Read /home/rioky/work/{project}-ntfs/파일  (ext4 파일 읽기)
      3. Edit /home/rioky/work/{project}-ntfs/파일  (ext4에서 부분 수정)
      4. rsync -a --inplace /home/rioky/work/{project}-ntfs/파일 "/mnt/c/.../파일"  (NTFS에 동기화)
  - --inplace 필수 (없으면 임시파일 rename 시 NTFS metadata 오류)
  - BOM 처리: cp가 바이너리 복사이므로 기존 BOM 자동 보존 (신규 파일은 BOM 없이 생성)
  - 작업 디렉토리: /home/rioky/work/{project}-ntfs/ (세션 공통 — ~/는 Edit/Write/Read 도구에서 확장 불가, 절대경로 필수)
  - 예외_Serena_심볼편집만: LSP 경유이므로 rsync 불필요 (유일한 예외)
  - 위반_감지: /mnt/c/ 경로에 Edit/Write 도구 직접 호출 시 즉시 중단 + 경고

스크린샷:
  - kInfra_{project} 프로젝트스킬에 경로/API 정의됨
  - 사용자가 스크린샷 언급 시: 프로젝트스킬의 경로에서 최신 파일 자동 확인 (묻지 않고 직접 탐색)
```

---

## 관련 문서

| 문서 | 내용 | 범위 |
|------|------|------|
| **[PROJECT.md](./PROJECT.md)** | 프로젝트 구조, 파일 인벤토리, **프로젝트스킬 상세** | 프로젝트 고유 |
| **[ADVANCED.md](./ADVANCED.md)** | 새 폼, 메뉴 등록, 권한, 람다식, 리팩토링 | 프로젝트 고유 |
| **[DATABASE.md](./DATABASE.md)** | 테이블, 스키마, FK, MCP 설정 | 프로젝트 고유 |
| **[MCP.md](./MCP.md)** | MCP 서버 통합 문서 | 프로젝트 고유 |
| **[RESTAPI.md](./restapi.md)** | REST API 엔드포인트 | 프로젝트 고유 |
| **[HISTORY.md](./HISTORY.md)** | 버그 수정 및 작업 이력 | 프로젝트 고유 |
| **[LESSONS.md](./LESSONS.md)** | 자기 개선 교훈 로그 | 프로젝트 고유 |

> 프로젝트스킬(`_{project}`) 상세 설명은 **PROJECT.md** 참조.

---

## 스킬 시스템 (범용 58개 + 프로젝트스킬 10개)

**모든 사용자 메시지에 메인이 판단** — 우선순위 순서로 처리:
1. **`/kO` 명시 호출** → kO 오케스트레이션 발동 (유일한 발동 조건)
2. **단위 스킬 직접 호출** (`/kPlan`, `/kDev`, `/kTest`, `/kDone`, `/kDebug` 등) → 해당 스킬만 단독 실행 (kO 없음, 팀에이전트 없음)
3. **나머지** → 5-way 분류(질문/계획/퀵/미디엄/풀) → 메인 직접 처리 (파일 수정 필요 시 `/kO`를 명시하거나 단위 스킬 직접 호출)

> **v5.0 아키텍처**: kO 오케스트레이션은 `/kO 지시` 명시 시에만 발동. **자동 kO 발동 폐지.** 단위 스킬은 `/스킬명` 직접 호출로 kO 없이 단독 실행. 메인이 직접 파일 수정하는 것은 여전히 금지.
> **팀에이전트 spawn 방식**: Claude Code가 자동으로 pane 생성 + 팀 join. Task 도구 team_name 필수.
> **kO 팀에이전트 spawn 절대 금지 (L-214)**: Claude Code는 flat team 구조. kO는 스킬로만 로딩.

**spawn 규칙 (절대):**
- `mode: "bypassPermissions"` 필수 (L-181). `mode: "plan"` 절대 금지 [COMPACT]
- 메인 직접 파일 수정 절대 금지 (L-171). 파일 종류 무관, 예외 없음 [COMPACT]
  - 파이프라인 비활성(IDLE) 상태에서도: NTFS(/mnt/c/) 직접 Edit/Write 금지 (rsync 절차 필수)
  - 파이프라인 활성(KO/PLAN/DEV/TEST/DONE/FINISH) 상태에서는: 모든 경로 Edit/Write 금지
  - 활성 상태 중 추가 수정 발견 시: 새 에이전트 spawn → 위임 → kFinish 후 IDLE 전환
  - "kDone 완료됐으니 이제 괜찮겠지" 판단 금지 — DONE도 활성 상태, kFinish 후 IDLE이 되어야 종료
- kO를 팀에이전트(Agent)로 spawn 절대 금지 (L-214) — kO는 스킬로만 로딩

```
사용자 메시지 → [메인] (1턴 이내)
  ├─ /kO 명시 → Skill('kO') → 5-way 분류 → 전체 파이프라인
  │               (계획→kPlan / 퀵→kDev→kDone / 미디엄/풀→kPlan→kDev→kTest→kDone) → kFinish
  ├─ /스킬명 직접 → 해당 Skill 단독 실행 (kO·팀에이전트 없음)
  ├─ 질문 → 메인 직접 응답 (Read/Grep/Glob 0~2회)
  └─ 그 외 → 메인 직접 처리 (파일 수정 필요 시 /kO 또는 단위 스킬 안내)

⚠️ kFinish (L-200 — 절대): 팀에이전트 사용 후 반드시 실행. 에러/중단 포함. [COMPACT]
  커밋_필수 (L-205): kFinish 후 미커밋 변경 있으면 git add + commit + push 수행

5-way 분류 (/kO 내부):
  > 상세: kO SKILL.md "핵심_분류_기준" 참조
  질문: 0~2회 탐색으로 답변 / 계획: 분석 요청+수정없음 (구현요청은 미디엄/풀)
  퀵: 비코드(.md/.json/.yaml)만 / 미디엄: 코드 1~4개 / 풀: 코드 5개+

메인 역할 경계 (L-162):
  질문 0~2회 탐색. /kO 명시 → kO 파이프라인. /스킬명 → 단독 실행.
  금지: 메인 직접 탐색 3회+ ("먼저 현황 파악" 패턴 금지)

인터럽트: 매 메시지 독립 재판단. 결이 같으면 SendMessage, 다르면 새 spawn.
계획 상세: > kO SKILL.md "계획 분류 절차" 참조
```

### 오케스트레이션 (3개)

| 스킬 | 설명 |
|------|------|
| **kO** | 오케스트레이션 실행 지침 — 메인이 Skill('kO')로 로딩. 퀵/코드수정 분류 + 파이프라인 순서(kPlan→kDev→kTest→kDone) + 팀에이전트 spawn 지침 제공. **팀에이전트로 spawn 절대 금지 (L-214)** |
| **kO_pipeline** | kO 미디엄/풀 파이프라인 상세 절차 — TeamCreate/에이전트등록/kPlan→kDone spawn/역라우팅 |
| **kO_debate** | kO 풀(Full) 토론 계획 프로세스 — kPlan_dual/kPlan_codex 분기 |

### 메인 + 서브스킬 (34개)

> **파이프라인 순서 엄수 (L-008)**: 메인(kO 지침)이 kPlan(1) → kDev(2) → kTest(3) → kDone(4) 순서로 팀에이전트 spawn. 이전 단계 완료 전 다음 진입 금지. **진입 기반 상태 전환**: spawn 직전에 해당 단계 상태 설정 (비정상종료 시 실패 단계 식별 가능). **실패 시 역라우팅 허용**: DEV→PLAN, TEST→DEV, TEST→PLAN, DONE→TEST (최대 5회 — `$HOME/.claude/session-env/${UUID}/reroute_count` 카운터 파일로 강제). TEST→PLAN은 설계/계획 재검토가 필요한 경우만.

#### 모델 배정
- kPlan (미디엄/풀): opus / kPlan (퀵/계획)/kDev/kTest/kDone: 기본 모델

#### kPlan 계열 (8개) — 순수 계획 수립
kPlan(메인) → kPlan_deep(심층설계) / kPlan_sim(시뮬레이션) / kPlan_review(검증) / kPlan_parallel(병렬에이전트결정) / kPlan_dual(이중토론) / kPlan_codex(이종AI토론) / kResearch(조건부사전조사)

#### kDev 계열 (6개) — 코드 구현
kDev(메인) → kDev_parallel(병렬디스패치) / kDev_review(코드리뷰) / kDev_simplify(단순화) / kDev_impact(영향도) / kDev_lock(파일Lock)

#### kTest 계열 (9개) — 빌드/테스트
kTest(메인) → **kBuild(빌드)** / **kExec(실행/배포)** / kTest_run(테스트실행) / kTest_quality(품질검증) / kTestUI(UI테스트) / kTestUIWinforms(WinForms/WPF자동화) / kTest_ui_rules(UI파일변경시전용규칙)
> kBuild/kExec는 kTest_build/kTest_deploy 대체. /kBuild, /kExec 단독 호출도 지원.

#### kDone 계열 (11개) — 작업 마무리
kDone(메인) → kDone_review(프로세스개선) / kDone_trans(우회감지) / kDone_hooks(Hook강제화) / kDone_skills(스킬업데이트) / kDone_cleanup(코드정리) / kDone_docs(문서) / kDone_git(커밋) / **kPush(Git push)** / kFinish(파이프라인마무리) / kFinish_cleanup(팀정리)
> kPush는 kDone_git에서 push 단계를 분리. /kPush 단독 호출도 지원.

### 유틸리티 (10개)

| 스킬 | 설명 |
|------|------|
| **kCopy** | 새 프로젝트 기본 환경 구축 — AI 원본의 공용 파일을 하드링크, commands/skills 폴더를 심볼릭링크로 연결 |
| **kDebug** | 체계적 디버깅 — 4 Phases 근본원인 분석 (모든 단계에서 호출 가능) |
| **kVerify** | 완료 검증 — Gate Function 5단계, 증거 기반 확인 (모든 단계에서 호출 가능) |
| **kThink** | 관점 전환 — 문제 재정의, 대안 매트릭스, 레버리지 포인트 (교착 시 호출) |
| **kSs** | Windows 전체화면 스크린샷 — 전체 모니터 파노라마 캡처 → /tmp/screenshot/ 저장 → Claude에게 시각적 전달 |
| **kClean** | 프로젝트 잔여물 정리 유틸리티 |
| **kInsights** | 세션 메타/facets/트랜스크립트/LESSONS 분석 → 패턴 감지 → 사용자 선택 → 자동 개선 (hooks/skills/CLAUDE.md/MEMORY) |
| **kMemOpt** | 컨텍스트 토큰 통합 최적화 — MEMORY→CLAUDE 이관, CLAUDE→스킬 흡수, SKILL.md 최적화, LESSONS→CLAUDE/스킬/hook 이관 (수동 전용) |
| **kQ** | 질문/답변 전용 팀에이전트 — 메인이 kQ 에이전트 spawn → 사용자 질문 위임 처리. /exit 또는 종료 명령까지 세션 유지. |
| **stress-agent** | 스트레스 테스트 더미 에이전트 — echo/sleep/SendMessage 프로토콜 (Bash+SendMessage만 허용) |

### 에이전트 (1개)

| 스킬 | 설명 |
|------|------|
| **agent_profiles** | 에이전트 프로필 프리셋 — 프롬프트 조립 시 참조 (impl-form/backend/mobile, scout, analyst, reviewer) |

### 도메인 (5개)

| 스킬 | 설명 |
|------|------|
| **domain-fileops** | 파일 수정 Low-level 드라이버 — 환경 감지(NTFS/EXT4), NTFS 안전 절차, 원자적 파일 Lock |
| **domain-csharp** | C# 코드 품질 분석 + 리팩토링 (통합) |
| **domain-winforms** | WinForms UI 디자인 + MDI 폼 템플릿 (통합) |
| **domain-database** | DB 스키마 마이그레이션 |
| **domain-context7** | Context7 MCP 실시간 라이브러리 문서 |

### 검색 (1개)

| 스킬 | 설명 |
|------|------|
| **find-skills** | 스킬 검색 — 사용자 요청에 맞는 설치 가능 스킬 탐색 |

### 라이브러리 스킬 (1개)

> **네이밍 규칙**: 공통 라이브러리 스킬은 `kSkill_{라이브러리명}` 형식.

| 스킬 | 설명 |
|------|------|
| **kSkill_livecharts2** | LiveCharts2 차트 구현 — kPlan/kDev/kTest 파이프라인 통합 |

### 외부 스킬 (2개)

| 스킬 | 설명 |
|------|------|
| **skill-creator** | 스킬 생성 가이드 — 새 스킬 작성/수정 시 구조화된 워크플로우 |
| **mcp-builder** | MCP 서버 생성 가이드 — FastMCP/MCP SDK 기반 외부 서비스 통합 |

### 프로젝트스킬 시스템

```yaml
구조: 메인스킬 > 서브스킬 (범용) + 프로젝트스킬 (고유, _{project} 접미사)
로딩: 팀에이전트가 각자 Skill('kInfra_{project}') 호출
코딩_규칙: /kRules_{project} — on-demand 로드
금지: 범용 스킬에 프로젝트 고유 경로/설정 추가
```

> 상세: [PROJECT.md](./PROJECT.md) 프로젝트스킬 섹션 참조

### 스킬 공유 (다중 프로젝트)

AI/.claude/skills/ 폴더를 심볼릭링크로 공유 (AI ↔ Mars ↔ MaiX). 외부 스킬 설치 시 AI에 설치하면 전체 자동 반영.
> 상세: kCopy SKILL.md 참조

### Hooks 공유
기타 hook 운영/동기화/금지 규칙은 [AI/hooks.md](./AI/hooks.md) 참조.

---

## 병렬화 정책

> 상세: kDev_parallel SKILL.md "병렬화 분리 기준" 섹션 참조 (유일 출처)

---

# Bash 명령어 실행 규칙

> 상세: kTest SKILL.md "Bash 명령어 실행 규칙" 섹션 참조 (유일 출처) [COMPACT]

### Bash 명령 작성 금지 패턴

- **UUID는 system-reminder에서 직접 읽기**: 매 메시지 system-reminder에 `🆔 [UUID] {값}` 형식으로 제공됨. `cat current_uuid`, `ls session-env | grep UUID` 등 파일/명령어로 UUID를 탐색하는 행위 절대 금지.

- **유니코드 말줄임표(`…`, U+2026) 절대 금지**: Bash 명령 내 파일명/경로/인자에 `…` 사용 시 `Invalid tool parameters` 오류 발생
  - 잘못된 예: `echo "done" >> $HOME/.claude/session-env/${UUID}/agents/kPlan-1…)`
  - 올바른 예: 완전한 경로 작성. 생략이 필요하면 `# 생략` 주석 사용
  - 원인: macOS/일부 환경에서 `...` → `…` 자동변환 + Bash 파싱 실패

---

## 에이전트 운영 규칙

```yaml
팀에이전트_공통:
  - shutdown_request 수신 시 즉시 응답. SendMessage hook 차단 절대 금지 (L-172)
  - 에이전트 반환 메시지: 요약 5줄 이내 + 파일 경로만 (컨텍스트 보호)
  - 에이전트 1개당 담당 파일 최대 3개. DB SELECT는 상위 5행만
  - 스킬 호출 선언 필수: 스킬 로딩 시 "Skill('{스킬명}') 로딩 — {목적}" 형식으로 선언
  - kDev는 구현(파일 수정)만 담당. git commit/push 절대 금지 — 커밋은 kDone 전용 (L-228)
  - 팀에이전트는 정상완료/스킵/이미완료 등 모든 종료 경로에서 SendMessage 완료 보고 필수 (L-228)
중단_조건: 동일 오류 10회 반복 / 외부 의존성 문제 → ntfy 알림
```

> 상세: kO SKILL.md (오케스트레이션 지침, 분류별 처리 흐름, 제약 사항)

---

## 스킬/문서 동기화 규칙

- 스킬 수정 시 CLAUDE.md 테이블 설명 즉시 동기화 (L-119)
- 스킬 추가/삭제 시 개수 카운터 업데이트
- 수정 필요 발견 즉시 자동 수정. "수정할까요?" 질문 금지 (L-116, Bypass 원칙)

---

## 도구 호출 절제 원칙

```yaml
단순_질문_직접_응답:
  - 단순 질문/의견/판단 요청에는 도구 호출 없이 바로 텍스트로 답하라
  - sequential-thinking, vibe-check 등 분석 도구를 불필요하게 호출하면 스트리밍이 멈추고 응답 지연 발생
  - 도구 호출이 필요한 경우: 파일 읽기/수정, 코드 검색, DB 쿼리 등 실제 데이터가 필요할 때만
```

## 스킬 회피 안티패턴 (절대 금지)

아래 사고방식은 스킬 적용을 회피하는 합리화 패턴이다. 감지 즉시 중단하고 스킬을 먼저 확인하라.

- "단순한 질문일 뿐이라 스킬이 필요 없다"
- "먼저 맥락/코드를 파악한 후 스킬을 결정하겠다"
- "이 작업엔 스킬이 과도하다"
- "지금 진행 중인 작업이 있어서 스킬 확인을 나중에 하겠다"
- "이미 방법을 알고 있으니 스킬 없이 진행하겠다"

**원칙**: 1%라도 스킬 적용 가능성이 있으면 먼저 스킬을 확인하라. 스킬이 작업에 해당하면 반드시 사용해야 하며 예외는 없다. (우선순위: 사용자 명시 지시 > 스킬 > 기본 동작)

## kO 경로 강제화 (프로젝트 훅)

`/.claude/settings.json`의 `PreToolUse`에서 `/.claude/hooks/write_guard.sh`를 실행하여 아래를 하드 차단한다.

- NTFS(`/mnt/c/`) 직접 수정 시도 (Edit/Write 도구)
- `~/.claude/teams/` 보호 (팀 디렉토리 직접 수정 금지)
- `/kO` 명시 없이 메인이 직접 파일 수정 시도 (단위 스킬 직접 호출 경로는 허용)
- `question` 분류에서 파일 수정 시도

즉, 질문/답변은 직접 처리하고, 파일 수정은 `/kO` 명시(전체 파이프라인) 또는 단위 스킬 직접 호출(`/kPlan`, `/kDev` 등)로만 진행된다.

---

## 멀티세션 오류 처리 (L-275)

> 상세 절차: kO SKILL.md "TeamCreate_실패_재시도" 섹션 참조

```yaml
"Already leading team":
  해결: TeamDelete("{기존팀명}") → TeamCreate 재시도. 충돌 지속 시 "-v2" 접미사.
  예방: kFinish 반드시 실행 (L-200)

L-111 (general-purpose 팀 없음):
  해결: "Already leading team" 절차 선행 → TeamCreate 성공 후 Agent 호출
  예방: Agent 전 TeamCreate 완료 확인. kO SKILL.md 순서 엄수.
```

---

## MCP 서버

### 기본 ON (3개)
| 서버 | 용도 | 비고 |
|------|------|------|
| **mysql** | DB 작업 | 한글 INSERT/UPDATE 금지 |
| **serena** | 코드 분석/편집 | claude-code context |
| **context7** | 라이브러리 문서 | 무료 |

### MCP 공통 지침

- 기본 서버는 위 표의 3개를 항상 활성화하고, 대규모 코드 분석이 필요할 때만 `serena-full`을 추가 연결합니다.
- DB 작업은 `mcp__mysql__*` 도구를 우선 사용하며, 한글이 포함된 쿼리를 실행할 때는 세션마다 `SET NAMES utf8`을 먼저 호출합니다.
- MCP 호출은 각 도구를 직접 실행하며 Serena의 `execute_shell_command`로 다른 MCP를 우회 호출하지 않습니다.
- 코드 수정 도구 선택: `.cs` 파일은 Serena, Designer/문서/JSON/YAML 파일은 Claude Code Edit/Write를 기본으로 사용합니다.

### MCP MySQL 역할 분리 규칙 (L-284/L-285)

메인(kO): MySQL 도구 사용 절대 금지 (SELECT 포함)
kPlan: SELECT만 허용 (현황 파악용)
kDev: DDL/DML 전담 (CREATE/INSERT/UPDATE/DROP 모두)
팀에이전트_UUID: PIPELINE_UUID 환경변수만 사용. resolve_uuid 호출 금지.

### MCP MySQL 한글 인코딩 규칙

> **유일 출처**: 한글 INSERT/UPDATE 금지 규칙은 여기서만 정의. 프로젝트스킬은 참조만.
> 한글 데이터 수정 방법 상세: /kRules_{project} 참조.

**MCP MySQL로 한글 INSERT/UPDATE 절대 금지** (latin1 연결). SELECT/영문만 허용.

### MCP 호출 규칙
- 각 MCP 도구를 직접 호출. Serena의 `execute_shell_command`로 다른 MCP 호출 금지.

### 코드 수정 도구 선택

| 상황 | 도구 |
|------|------|
| C# 코드 심볼 수정/추가/리팩토링 | Serena |
| Designer.cs, 비코드 파일, 주석/문자열 | Claude Code Edit |
| Serena 오류 시 | Claude Code Edit (Fallback) |

### 도메인 스킬 자동 트리거 기준

| 상황 | 자동 로딩 스킬 |
|------|---------------|
| C# 코드 리뷰/리팩토링/품질 분석 | `domain-csharp` |
| WinForms UI 설계/폼 생성/MDI/레이아웃 | `domain-winforms` |
| DB 스키마 변경/테이블 생성/마이그레이션 | `domain-database` |
| 새 라이브러리 도입/버전 업그레이드 | `domain-context7` |
| NTFS 파일 수정/파일 잠금/다중 세션 충돌 | `domain-fileops` |

**규칙**: 위 상황에 해당하면 작업 시작 전 해당 스킬을 반드시 로딩하라. "나중에 필요하면 보겠다" 패턴 금지.

---

## 프로젝트 정보

- **구조**: [PROJECT.md](./PROJECT.md) - 파일 추가/삭제 시 즉시 업데이트, **프로젝트스킬 상세 포함**
- **DB**: [DATABASE.md](./DATABASE.md) - 테이블 변경 시 즉시 업데이트

---

## 중요 참고사항

### 프로젝트별 코딩 규칙
- SQL, Gateway, 권한, UI, GDI+, 한글 인코딩 등 프로젝트 고유 규칙은 `/kRules_{project}`에서 on-demand 로드
- Skill('kO') 로딩 시 자동 안내됨

### TODO 파일 생명주기
생성 → 계획 → 추적 → 삭제 (.gitignore 포함)
