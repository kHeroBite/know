# CLAUDE.md - AI Agent 프로젝트 매뉴얼

> **역할**: Claude Code가 프로젝트에서 작업할 때 참조하는 핵심 지침서

---

## 문서/스킬 3-tier 구조 (최우선 원칙)

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: CLAUDE.md (이 파일) — 범용 규칙                         │
│  ● 모든 프로젝트에 공통 적용되는 규칙/정책/프로세스              │
│  ● 스킬 전체 목록 및 설명 (범용)                                  │
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

---

## 정보 정직성 원칙 (절대 규칙)

> **이 규칙은 모든 상황에서 예외 없이 적용된다. 사용자에 대한 신뢰의 근간이다.**

```yaml
거짓말_추정_추측_금지:
  - 확실하지 않은 정보를 사실인 것처럼 전달하는 행위 절대 금지
  - 모르는 것을 아는 척하거나 빈칸을 채우기 위해 내용을 꾸며내는 행위 금지
  - 기억/학습 데이터 기반의 막연한 "아마도", "보통은", "일반적으로" 단독 사용 금지

불확실_정보_전달_규칙:
  - 확실하지 않을 때: "확실하지 않습니다"를 명시한 후 말하라
  - 추정/추측일 때: "추정입니다", "추측입니다"를 명시한 후 말하라
  - 직접 확인된 fact만 단정적으로 전달하라

외부검색_활용:
  - 신뢰성이 필요한 정보는 WebSearch/WebFetch로 직접 확인 후 전달하라
  - 외부검색 결과를 사용할 때는 반드시 출처(URL/서비스명)를 함께 명시하라
  - 검색 결과가 없거나 불확실하면 그 사실을 솔직히 말하라

위반_예시 (하지 말아야 할 것):
  - "A 라이브러리는 B 방식으로 동작합니다" (직접 확인 없이)
  - "이 오류는 C가 원인입니다" (추측을 사실처럼)
  - "보통 D를 사용합니다" (검색 없이 단정)
  - 스킬/코드의 동작 방식을 파일을 읽지 않고 기억/추측으로 답변 (반드시 Grep/Read로 확인 후 답변)
  - 질문받은 파일을 직접 확인하지 않고 "~하지 않습니다", "~합니다"로 단정

올바른_예시:
  - "확실하지 않아 검색해보겠습니다." → WebSearch 실행 → "출처: [URL]에 따르면 ~"
  - "직접 확인하지 않았으나 추정컨대 ~일 수 있습니다. 확인이 필요합니다."
  - "코드에서 직접 확인한 결과: ~입니다."
```

---

## 기술 타당성 판정 원칙 (절대 규칙)

사용자가 요청한 기능을 구현하기 전에 반드시 다음을 수행하라.

```yaml
필수_절차:
  1. 공식_지원_확인: 확실하지 않으면 WebSearch/WebFetch로 직접 확인
  2. 타협_금지: 공식 미지원이면 "불가능"이라고 명시하고 대안 제시
  3. 구현_수락_전_타당성_보고: 사용자가 기술적 한계를 이해하고 승인한 후 구현 착수

올바른_예시:
  - "공식 미지원이므로 자동화 불가능합니다. 대안으로 CLAUDE.md 한 줄 안내만 두는 건 어떨까요?"
  - 사용자 명시 동의 후 문서 대안만 구현

원칙: 정직한 "불가능" > 작동 안 하는 "타협 구현"
연관: 정보 정직성 원칙 + 재발방지 정책 (LLM 의지 의존 금지)
```

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

WSL에서_실행 (기본):
  - oio MCP (파일 I/O + 셸 명령 — 유일한 실행 경로)
  - Glob/Grep (코드 검색 — 읽기 전용)
도구_정책:
  - 모든 실행은 oio MCP 경유 (Claude 내장 Bash/Read/Edit/Write 사용 금지)
  - Windows 도구(.exe): 반드시 사유 명시 + oio bash_exec로 실행

oio MCP 독점 (절대 규칙 — 예외 없음):
  원칙: Claude Code의 모든 파일 I/O + 모든 셸 명령은 oio MCP 경유 필수
  적용: 파이프라인 상태 무관 (IDLE/OK/PLAN/DEV/TEST/DONE 모두)
  자발성: hook 차단 전에 스스로 oio를 선택해야 함 (hook은 안전망)

  파일_I/O (oio 전용):
    - 읽기: mcp__oio__file_read (offset/limit 또는 start_line/end_line)
    - 쓰기: mcp__oio__file_write / file_edit / file_delete / file_rename / file_move / file_copy
    - 디렉토리: mcp__oio__dir_create / dir_delete / dir_move / dir_rename
    - 심볼릭링크: mcp__oio__file_symlink
    - 탐색: mcp__oio__list_dir / mcp__oio__find / mcp__oio__get_cwd
    - 자동 처리: NTFS/EXT4 감지, BOM/CRLF 보존, Intent Lock, File Lock

  셸_명령 (oio bash_exec 전용):
    - 모든 셸 명령은 mcp__oio__bash_exec 사용 (Claude 내장 Bash 도구 사용 금지)
    - dotnet, git, npm, curl, tmux, python3, cmd.exe, source 등 전부 포함
    - 예외 없음 — session-env state echo도 oio bash_exec 사용

  Fallback: oio 불가 시에만 Claude Code Edit

  금지 도구 매핑표:
    | 금지 도구/명령 | oio 대체 도구 |
    |---|---|
    | Bash (Claude 내장) | mcp__oio__bash_exec |
    | Read (Claude 내장) | mcp__oio__file_read |
    | Edit/Write (Claude 내장) | mcp__oio__file_edit / file_write |
    | cat/head/tail | mcp__oio__file_read |
    | cp/rsync | mcp__oio__file_copy |
    | mv | mcp__oio__file_move / mcp__oio__dir_move |
    | rm/rmdir | mcp__oio__file_delete / mcp__oio__dir_delete |
    | mkdir | mcp__oio__dir_create |
    | touch/echo> | mcp__oio__file_write |
    | sed -i | mcp__oio__file_edit |
    | ln -s | mcp__oio__file_symlink |
    | pwd | mcp__oio__get_cwd |
    | ls/find | mcp__oio__list_dir / mcp__oio__find |

  위반_감지: write_guard.sh가 Edit/Write + Bash 도구 사용 차단

```

### NTFS 성능 최적화 (Windows Defender 제외 등록)

`/mnt/c/` 경로에서 Windows Defender 실시간 검사는 NTFS I/O를 차단(D-state)시킬 수 있다. 차단 발생 시 bash_exec가 `NTFS_DSTATE_BLOCK` 에러를 즉시 반환(원인 8). 근본 해결책은 PowerShell(관리자)에서 아래 명령으로 프로젝트 경로 + python3 프로세스를 Defender 제외 목록에 등록하는 것이다.

```powershell
Add-MpPreference -ExclusionPath "C:\DATA\Project\AI"
Add-MpPreference -ExclusionProcess "python3.exe"
```

적용 후에는 `Get-MpPreference | Select-Object -ExpandProperty ExclusionPath` 로 등록 상태를 확인할 수 있다.

---

## 관련 문서

| 문서 | 내용 | 범위 |
|------|------|------|
| **[HISTORY.md](./HISTORY.md)** | 버그 수정 및 작업 이력 | 프로젝트 고유 |
| **[LESSONS.md](./LESSONS.md)** | 자기 개선 교훈 로그 | 프로젝트 고유 |

---

## Hook 파일명 변경 이력 (2026-04-11)

가독성 향상을 위해 hook 스크립트를 Claude Code hook 이벤트명 기반으로 rename.

| 변경 전 | 변경 후 | Hook 이벤트 | matcher |
|---|---|---|---|
| `session_init.sh` | `SessionStart.sh` | SessionStart | `""` (전체) |
| `session_lifecycle.sh` | `UserPromptSubmit.sh` | UserPromptSubmit | - |
| `compact_save.sh` | `PreCompact.sh` | PreCompact | - |
| `compact_restore.sh` | `SessionStart_compact.sh` | SessionStart | `compact` |

**규칙**: 이후 hook 추가 시 `{EventName}[_{matcher}].sh` 명명.
- 예: Stop hook → `Stop.sh`, PreToolUse matcher=Bash → `PreToolUse_Bash.sh`
- `lib/` 하위 공용 라이브러리는 기존 이름 유지 (특정 이벤트 1:1 매핑 아님)
- `guards/` 하위 matcher별 guard 스크립트(write_guard 등)는 기존 이름 유지 (다중 matcher 대응)

LESSONS.md/HISTORY.md의 과거 교훈은 **당시 파일명 그대로 보존** (역사성 유지).

---

## Advisor 사용 안내

필요 시 `/advisor`를 켜서 Opus 4.6 어드바이저를 활성화할 수 있다. 한 번 토글 ON 하면 해당 세션 내내 유지되며, 복잡한 아키텍처 결정이나 설계 검증 전에 권장. 자동 실행은 공식 미지원이므로 사용자가 수동으로 판단하여 호출.

### advisor 호출 필수 (강제)

메인에이전트 및 팀에이전트(oplan/odev/otest/odone 등) 모두 다음 상황에서 `advisor()` 도구를 **반드시 호출해야 한다. 호출 없이 진행하는 것은 규칙 위반이다.**

```yaml
advisor_필수_시점:
  - 구현 접근법이 2가지 이상이고 트레이드오프 판단이 필요한 경우
  - 아키텍처 결정 사항이 이후 단계에 큰 영향을 미칠 때
  - 계획(oplan) 수립 중 요구사항 해석이 모호할 때
  - 구현(odev) 중 예상치 못한 기술적 제약에 부딪혔을 때
  - 테스트(otest) 중 FAIL 원인이 불명확할 때
  - 어떤 단계든 "이게 맞는 방향인가" 확신이 없을 때

호출_방법: advisor() 도구 직접 호출 (파라미터 없음)
효과: 전체 대화 컨텍스트가 자동 전달되어 강력한 리뷰어의 조언을 받음
비용: 추가 API 호출 발생하나, 잘못된 방향으로 진행하는 비용보다 낮음
```

**원칙**: 메인/팀에이전트 모두 위 조건 해당 시 반드시 멈추고 advisor를 호출하라. advisor 미호출 후 진행은 규칙 위반이며, advisor 호출은 품질 보증의 필수 절차다.

## 반복 작업 자동화 안내

사용자가 "완성될 때까지", "없어질 때까지", "끝날 때까지", "반복", "반복해서", "반복적으로", "계속" 등 **반복 수행** 패턴을 요청하면:
- 반드시 `Skill('ralph-loop:ralph-loop')` 스킬을 **첫 번째 행동**으로 호출하라
- 기본 반복 횟수: `--max-iterations 10` (미지정 시 무한 루프 — 반드시 명시)
- 해당 스킬이 반복 루프 관리(종료 조건 감지, 재개, 취소)를 담당한다
- 스킬 호출 없이 직접 반복을 수동으로 수행하는 행위 금지

---

## 도구 호출 절제 원칙

```yaml
단순_질문_직접_응답:
  - 단순 질문/의견/판단 요청에는 도구 호출 없이 바로 텍스트로 답하라
  - sequential-thinking, vibe-check 등 분석 도구를 불필요하게 호출하면 스트리밍이 멈추고 응답 지연 발생
  - 도구 호출이 필요한 경우: 파일 읽기/수정, 코드 검색, DB 쿼리 등 실제 데이터가 필요할 때만
```

## ointaug 필수 호출 규칙

`UserPromptSubmit.sh`가 UserPromptSubmit에서 `📌 [ointaug 필수]` 메시지를 출력하여 강제. 출력 시 반드시 `Skill('ointaug')`를 첫 번째 행동으로 호출하라.

---

## 스킬 회피 안티패턴 (절대 금지)

아래 사고방식은 스킬 적용을 회피하는 합리화 패턴이다. 감지 즉시 중단하고 스킬을 먼저 확인하라.

- "단순한 질문일 뿐이라 스킬이 필요 없다"
- "먼저 맥락/코드를 파악한 후 스킬을 결정하겠다"
- "이 작업엔 스킬이 과도하다"
- "지금 진행 중인 작업이 있어서 스킬 확인을 나중에 하겠다"
- "이미 방법을 알고 있으니 스킬 없이 진행하겠다"
- "단순 질문/계산이라 파이프라인이 불필요하다"
- "코드 수정이 아니므로 파이프라인 대상이 아니다"

**원칙**: 1%라도 스킬 적용 가능성이 있으면 먼저 스킬을 확인하라. 스킬이 작업에 해당하면 반드시 사용해야 하며 예외는 없다. (우선순위: 사용자 명시 지시 > 스킬 > 기본 동작)

## 재발방지 정책 (절대 규칙)

"재발방지하라" 명령 또는 교훈(odone_lesson) 단계에서 재발방지 조치 시:

```yaml
수단_우선순위 (위가 최우선):
  1. Hook: write_guard.sh 등 물리 차단 (위반 시도 자체를 불가능하게)
  2. oio 서버: MCP 서버 코드 수정 (파라미터 별칭, 자동 변환 등)
  3. Skill: 스킬 프로세스에 체크 단계 추가
  4. CLAUDE.md: 규칙/매핑표 업데이트 (최후 수단)

절대_금지:
  - Memory 업데이트로 재발방지 대신하기 (Memory는 참고 정보일 뿐, 강제력 없음)
  - "문서화했으니 됐다"는 사고방식 (문서는 LLM이 무시할 수 있음)

원칙: 재발방지 = 물리적 강제. LLM 의지에 의존하는 조치는 재발방지가 아님.

완벽 검증: 재발방지 조치 후 반드시 "재발방지 완벽 검증 절차" 실행 — 물리 차단 점수 ≥ 8/10 + 우회 경로 5건 전수 차단 + Hook 1순위 미적용 사유 명시. 미달 시 추가 조치 강제. (odone_lesson/SKILL.md 참조)
```

## oi 파이프라인 라우팅

`UserPromptSubmit.sh`가 상태별로 자동 분기하여 필요한 메시지를 출력한다:
- `💬 [IDLE 직접처리]` → 메인이 바로 답변
- `💬 [oi] 활성(PLAN|DEV)` → `Skill('oi')` 호출 필수 (state 변경 없음)
- `📋 [큐잉]` / `📋 [OK]` → 현재 작업 계속, 큐잉된 입력은 종료 후 처리
- 슬래시 명령(/ok, /o1~o5) → oi 바이패스

`oi_route_guard.sh`가 PLAN/DEV 상태에서 Skill('oi') 미경유 직접 호출을 `block` 응답으로 차단한다.

## o시리즈 파이프라인 프로세스 (절대 규칙)

사용자가 o시리즈 스킬(/ok, /o1, /o2, /o3, /o4, /o5, /oplan, /oplan_debate, /odev, /otest, /odone, /oresume 등)을 **명시적으로 요구**하면:
- 해당 스킬의 프로세스를 **예외 없이 100% 따라야** 함
- "요구사항이 명확하니 스킬 프로세스 생략" 금지
- "이미 답을 알고 있으니 바로 구현" 금지
- 스킬이 토론(oplan_debate)을 요구하면 반드시 토론 수행
- 스킬이 팀에이전트 spawn을 요구하면 반드시 spawn

**위반 시**: 사용자 신뢰 손상. 스킬 프로세스는 품질 보증 절차이며 생략 불가.

코드 수정 작업 분류 (v4.3 — forced_tier 통일):

/o1~/o5 직접 호출 (tier 확정 — oplan tier 결정 bypass):
- /o1: oplan 없음 → odev → ofinish(Step 1.5 경량 교훈 + Step 7.5 경량 커밋)
- /o2: oplan_simple → odev → obr → ofinish(Step 1.5 + Step 7.5)
- /o3: oplan_normal(forced_tier=o3, opus[1m], 계획만) → odev → otest → odone → ofinish
- /o4: oplan(forced_tier=o4, 자율선택: oplan_deep/oplan_consult/oplan_debate, 계획만) → odev → otest → odone → ofinish
- /o5: oplan(forced_tier=o5, 자율선택: oplan_debate 기본/oplan_consult 대안, 계획만) → odev → otest → odone → ofinish
- 원칙: /o1~/o5 직접 호출 시 tier는 사용자가 확정. oplan은 계획 수립만 수행하고 tier 재결정/승격 금지.

/ok 호출 (tier 미확정 — oplan이 tier 결정):
- /ok: ok 의도분석(텍스트) 초벌 판정 → oplan에 hint_tier 전달 → oplan 탐색 후 o2~o5 확정
- oplan이 결정한 tier에 따라 해당 파이프라인 실행

/oresume: 중단된 파이프라인 재개 (checkpoint.jsonl 기반). compact 후 자동 권고됨.
레거시: /ol→o2, /om→o3, /of→o4 제거 완료 (2026-03-31)

Multi-Phase 자동 완수 (Auto-Loop):
- oplan이 다단계(Phase Batch) 계획을 세운 경우, 모든 batch를 끝까지 자동 실행 (ok_pipeline Auto-Loop)
- "남은 Phase는 후속 /ko로" 출력 후 멈추는 행위 절대 금지
- 상세: ok_pipeline/SKILL.md "4.5단계: Phase Batch Auto-Loop" 참조

---

## MCP 서버

### 기본 ON (2개)
| 서버 | 용도 | 비고 |
|------|------|------|
| **mysql** | DB 작업 | 한글 INSERT/UPDATE 금지 |
| **context7** | 라이브러리 문서 | 무료 |

### MCP 공통 지침

- 기본 서버는 위 표의 2개를 항상 활성화합니다.
- DB 작업은 `mcp__mysql__*` 도구를 우선 사용하며, 한글이 포함된 쿼리를 실행할 때는 세션마다 `SET NAMES utf8`을 먼저 호출합니다.
- MCP 호출은 각 도구를 직접 호출합니다.

### MCP MySQL 역할 분리 규칙
> → ok SKILL.md "MCP_MySQL_역할_분리" 섹션 참조 (유일 출처)

### MCP MySQL 한글 인코딩 규칙
> → domain-database SKILL.md "UTF-8 인코딩 필수 정책" 섹션 참조 (유일 출처)

### MCP 호출 규칙
- 각 MCP 도구를 직접 호출.

### MCP 끊김 대응
- **감지**: PostToolUse hook(`mcp_disconnect_guard.sh`)이 oio 도구 실패 시 연결 끊김 패턴 자동 감지
- **재연결**: `/mcp` 명령으로 MCP 서버 상태 확인 + 재연결
- **임시 대안**: oio 끊김 시 Claude 내장 Bash/Read/Edit로 임시 전환 (oio_fallback_guard.sh가 1회 허용)
- **예방**: oio 서버에 top-level 예외 처리 + logging 적용 (server.py)

### 코드 수정 도구 선택

| 상황 | 도구 |
|------|------|
| 코드 수정/추가/리팩토링 | oio file_edit / file_write |
| oio 불가 시 | Claude Code Edit (Fallback) |

