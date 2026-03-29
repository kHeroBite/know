# 지식작업소 (know-api) 사용 매뉴얼

> 버전: 2.0.0 | 최종 수정: 2026-03-29
> 서버: http://133.186.132.245:18000

---

## 1. 시스템 개요

지식작업소는 검색엔진 지식팀의 사전 관리 + 데이터 전처리 자동화 웹 도구입니다.

### 기술 스택

- 백엔드: Python 3.8 + FastAPI
- 프론트엔드: React 18 + Ant Design 5
- 데이터베이스: SQLite (내장 파일 DB)
- 비동기 처리: Celery + Redis (선택)
- 형태소 분석: jiana 1.5 (JDK 1.7)

### 사용자 권한

- A (관리자): 모든 기능 + 계정 관리
- W (편집자): 사전 편집, 파이프라인 실행
- R (읽기전용): 조회만 가능

### 데이터 흐름

    [웹 UI] --> [SQLite DB] --> [빌드] --> [바이너리 사전 파일] --> [검색엔진]
                    ^
             [파일 임포트]

- DB: 사전 데이터의 편집/관리 저장소 (마스터)
- 파일: 빌드된 바이너리 사전 (검색엔진 실행용)

---

## 2. 서버 설치 및 초기화

### 2.1 최초 설치

    ssh know@133.186.132.245
    cd /home/know/apps/know-api
    source venv/bin/activate
    pip install -r requirements.txt
    python3 init_db.py

실행 결과:
- know.db 파일 생성 (SQLite 데이터베이스)
- 21개 테이블 자동 생성
- 기본 관리자 계정: admin / 1111
- 기본 도메인 3개: EPOST, MALL, QQ

### 2.2 환경 변수 (.env)

    DB_URL=sqlite:///know.db
    JWT_SECRET=change-me-in-production    # 운영 시 반드시 변경
    JWT_EXPIRE_MINUTES=480                # 로그인 유지 시간 (8시간)
    SMTP_HOST=                            # SMTP 서버 주소
    SMTP_PORT=587
    SMTP_USER=                            # SMTP 인증 계정
    SMTP_PASS=                            # SMTP 인증 비밀번호
    SMTP_FROM=                            # 발신자 이메일

### 2.3 서비스 시작

    nohup python3 -B -m uvicorn main:앱 --host 0.0.0.0 --port 18000 --workers 2 > /tmp/know-api.log 2>&1 &
    curl http://localhost:18000/api/health
    # {"status":"ok","db":true}

---

## 3. 로그인

1. 아이디와 비밀번호를 입력합니다
2. 로그인 버튼을 클릭합니다
3. 성공 시: 데이터 전처리 페이지로 이동
4. 실패 시: 화면 상단에 에러 메시지 표시 (예: "아이디 또는 비밀번호 오류")

초기 계정: admin / 1111 (관리자)

> 비밀번호는 bcrypt 단방향 해시로 저장됩니다. 복호화 불가능하므로 분실 시 관리자에게 초기화를 요청하세요.

---

## 4. 워크스페이스

### 상태

- IDLE: 사용 가능 (도메인 미연결)
- CONNECTING: 도메인 연결 중 (파일 복사 진행)
- USED: 도메인 연결됨 (작업 가능)
- FAILED: 연결 실패

### 주요 기능

워크스페이스 생성: 우상단 + 추가 버튼 -> 이름 입력 -> 생성

도메인 연결: IDLE 상태 카드에서 연결 버튼 -> 도메인 선택 -> 파일 복사 -> USED

워크스페이스 해제: USED 상태 카드에서 해제 버튼 -> IDLE 복귀

색상 변경: 팔레트 아이콘 -> 프리셋 색상 선택 -> 사이드바 테마 변경

워크스페이스 삭제: IDLE 상태에서만 가능

### 워크스페이스 선택
- 선택하면 사이드바 상단에 워크스페이스명-도메인명 표시
- 이후 사전 관리, 전처리 등에서 해당 도메인 기준으로 작업

---

## 5. 데이터 전처리

### 전처리 4단계

1. 파일선택: 처리할 입력 파일 선택
2. 정제 (refine): 검색로그 정제 - 스팸/중복 제거
3. 형태소분석 (analyze): jiana 엔진으로 형태소 분석
4. 결과변환 (transform): 분석 결과를 사전 등록 형식으로 변환

### 사용법

1. 워크스페이스가 선택되어 있어야 합니다
2. 파일 패널에서 파일을 업로드하거나 선택합니다
3. 제어 패널에서 실행할 단계 범위를 선택합니다
4. 실행 버튼을 클릭합니다
5. 로그 패널에서 진행 상황을 실시간 확인합니다

---

## 6. 사전 관리

전제 조건: 워크스페이스에서 도메인이 연결되어 있어야 합니다.

### 탭 구성

사용자사전 (UDIC) / 복합명사 (CNDIC):
- 단어 (WORD): 등록할 단어 (대문자 자동 변환)
- 메모 (MEMO): 비고/설명

유의어 (THESAURUS):
- 대표어 (HEAD_WORD): 대표 단어
- 유의어 (TAIL_WORD): 쉼표 구분 유의어 목록

### 기능
- 추가: + 추가 버튼 -> 단어/메모 입력 -> 저장
- 검색: 검색 바에 키워드 입력 -> LIKE 검색
- 삭제: 행의 삭제 버튼 -> 확인 -> 삭제
- 일괄 등록: CLI 임포트 사용 (13장 참조)

---

## 7. 카테고리 관리

- 단어 (WORD): 카테고리 대상 단어
- 표시 카테고리: 카테고리 경로 (예: "전자제품>휴대폰")

사전 관리와 동일한 패턴으로 추가/수정/삭제합니다.

---

## 8. 파이프라인

파이프라인 실행 이력을 관리합니다.

상태: pending(대기) / running(실행) / paused(승인대기) / completed(완료) / failed(실패) / cancelled(취소)

> Celery + Redis가 설치된 환경에서만 비동기 파이프라인이 동작합니다.

---

## 9. 지식작업

- 파일 업로드: CSV/Excel 업로드 -> 행 수/미리보기 자동 표시
- 작업 분배: 담당자별 처리 범위 할당
- 내 작업: 나에게 할당된 작업 목록 조회

---

## 10. 통계

도메인별 사전 현황을 표시합니다.
- 도메인명, UDIC/CNDIC/THESAURUS/CATEGORY 항목 수
- 테이블 미생성 시 -1로 표시

---

## 11. 빌드이력

도메인별 사전 빌드 실행 이력을 표시합니다.
- DB 사전 데이터 -> 바이너리 사전 파일로 변환한 기록
- 빌드 상태, 시작/완료 시간, 항목 수 확인

---

## 12. 계정 관리 (관리자 전용)

관리자(A) 권한으로 로그인해야 사이드바에 메뉴가 표시됩니다.

### 계정 추가

1. + 계정 추가 버튼 클릭
2. 입력 항목:
   - 아이디: 영문/숫자 (로그인 ID, 변경 불가)
   - 이름: 표시명
   - 비밀번호: 초기 비밀번호
   - 이메일: 비밀번호 분실 시 초기화용 (선택)
   - 권한: 관리자(A) / 편집자(W) / 읽기전용(R)
3. 저장 클릭

### 계정 수정

행의 수정 버튼 -> 이름/비밀번호/이메일/권한 변경 -> 저장

### 비밀번호 초기화

1. 이메일이 등록된 계정의 초기화 버튼 클릭
2. 확인 -> 랜덤 8자리 비밀번호 생성
3. SMTP 설정 O: 이메일로 새 비밀번호 발송
4. SMTP 설정 X: 화면에 임시 비밀번호 표시

### 계정 삭제

- admin 계정은 삭제 불가 (시스템 보호)
- 다른 계정: 삭제 버튼 -> 확인 -> 삭제

---

## 13. CLI 도구 (init_db.py)

서버에서 직접 실행하는 명령줄 도구입니다.

    cd /home/know/apps/know-api

### 13.1 DB 초기화

    python3 init_db.py

21개 테이블 생성 + admin 계정 + 3개 도메인. 이미 존재하는 데이터는 SKIP.

### 13.2 비밀번호 초기화

    # 기본 비밀번호(1111)로 초기화
    python3 init_db.py --reset-password admin

    # 지정 비밀번호로 초기화
    python3 init_db.py --reset-password admin myNewPassword

### 13.3 사전 파일 임포트 (파일 -> DB)

    python3 init_db.py --import EPOST udic /path/to/words.txt
    python3 init_db.py --import MALL cndic /path/to/compound.txt
    python3 init_db.py --import QQ thesaurus /path/to/synonyms.txt
    python3 init_db.py --import EPOST category /path/to/categories.txt

### 파일 형식

UDIC / CNDIC (한 줄에 단어 하나, 탭 뒤 메모 선택):

    삼성전자
    갤럭시	신규 추가
    아이폰	2026-03 등록

THESAURUS (탭 구분: 대표어 -> 유의어):

    핸드폰	휴대폰,스마트폰,셀폰
    노트북	랩탑,laptop

CATEGORY (탭 구분: 단어 -> 카테고리):

    아이폰	전자제품>휴대폰
    맥북	전자제품>노트북

### 임포트 규칙
- 이미 존재하는 단어는 건너뜁니다
- UDIC/CNDIC 단어는 대문자 변환 + BOM/공백 제거 자동 적용
- 빈 줄은 무시됩니다
- UTF-8 인코딩 파일을 사용하세요

---

## 14. 서버 운영 가이드

### 14.1 서비스 시작/중지/재시작

    # 시작
    nohup python3 -B -m uvicorn main:앱 --host 0.0.0.0 --port 18000 --workers 2 > /tmp/know-api.log 2>&1 &

    # 중지
    kill $(pgrep -f 'uvicorn.*main')

    # 재시작
    kill $(pgrep -f 'uvicorn.*main'); sleep 2; \
    nohup python3 -B -m uvicorn main:앱 --host 0.0.0.0 --port 18000 --workers 2 > /tmp/know-api.log 2>&1 &

    # 상태 확인
    curl http://localhost:18000/api/health

### 14.2 로그 확인

    tail -f /tmp/know-api.log

### 14.3 DB 백업/복원

    # 백업
    cp know.db know.db.backup.$(date +%Y%m%d)

    # 복원
    cp know.db.backup.20260329 know.db
    # 서비스 재시작 필요

### 14.4 DB 직접 조회

    python3 -c "
    import sqlite3
    conn = sqlite3.connect('know.db')

    # 계정 목록
    for r in conn.execute('SELECT _USER_ID, _NAME, _AUTH FROM accounts'):
        print(r)

    # 도메인 목록
    for r in conn.execute('SELECT _SITE, _MEMO FROM domains'):
        print(r)

    # 전체 테이블
    for r in conn.execute('SELECT name FROM sqlite_master WHERE type=\"table\"'):
        print(r[0])
    conn.close()
    "

### 14.5 도메인 파일 경로

    /home/know/apps/know-ops/domain/
      epost/    EPOST 도메인 파일
      mall/     MALL 도메인 파일
      qq/       QQ 도메인 파일

### 14.6 이메일 설정 (Gmail 예시)

    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your-email@gmail.com
    SMTP_PASS=your-app-password
    SMTP_FROM=your-email@gmail.com

> SMTP 미설정 시에도 비밀번호 초기화는 동작합니다. 이메일 발송만 실패하고 초기화된 비밀번호가 화면에 표시됩니다.

---

## 부록: API 엔드포인트 요약

    POST   /api/auth/login                  로그인
    GET    /api/auth/me                     내 정보
    GET    /api/accounts                    계정 목록 (관리자)
    POST   /api/accounts                    계정 생성 (관리자)
    PUT    /api/accounts/{id}               계정 수정 (관리자)
    DELETE /api/accounts/{id}               계정 삭제 (관리자)
    POST   /api/accounts/{id}/reset-password 비밀번호 초기화 (관리자)
    GET    /api/workspaces                  워크스페이스 목록
    POST   /api/workspaces                  워크스페이스 생성
    DELETE /api/workspaces                  워크스페이스 삭제
    POST   /api/workspaces/select           워크스페이스 선택
    DELETE /api/workspaces/select           워크스페이스 해제
    GET    /api/preprocess/*                데이터 전처리
    CRUD   /api/dictionaries/{site}/*       사전 관리
    CRUD   /api/categories/{site}/*         카테고리 관리
    GET    /api/statistics/*                통계 조회
    CRUD   /api/pipeline/*                  파이프라인 관리
    CRUD   /api/knowledge/*                 지식작업
    CRUD   /api/build/*                     빌드 관리
    GET    /api/health                      서버 상태 확인
