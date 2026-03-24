# know 프로젝트 — 프로젝트 정보

## 개요

검색엔진 지식팀 Ops 툴 고도화 프로젝트.
기존 Java/JSP 관리도구 + 수작업 쉘/펄 스크립트 파이프라인을 Python 기반으로 포팅/고도화.

---

## 서버 접속 정보

### 관리 서버 (know-server)

| 항목 | 값 |
|------|-----|
| 호스트 | 133.186.132.245 |
| 사용자 | know |
| 비밀번호 | ledge123! |
| 포트 | 22 (기본) |

### SSH 접속 방법

#### 방법 1: ~/.ssh/config 등록 (권장 — 재사용 가능)

```bash
# ~/.ssh/config 에 아래 내용 추가
Host know-server
    HostName 133.186.132.245
    User know
    Port 22
    # 키 인증 사용 시:
    # IdentityFile ~/.ssh/know_rsa

# 접속
ssh know-server

# 비밀번호 인증 강제 (키 없을 때)
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no know-server
```

#### 방법 2: sshpass 비밀번호 자동입력

```bash
# 비밀번호를 파일에 저장 (보안 권장)
echo 'ledge123!' > ~/.ssh/know_pass
chmod 600 ~/.ssh/know_pass
sshpass -f ~/.ssh/know_pass ssh know@133.186.132.245

# 명령 직접 실행
sshpass -f ~/.ssh/know_pass ssh know@133.186.132.245 "echo 접속성공"

# 파일 전송 (scp)
sshpass -f ~/.ssh/know_pass scp -r ./know-ops know@133.186.132.245:/home/know/apps/
```

#### 방법 3: SSH 키 등록 (최종 권장)

```bash
# 키 생성 (없는 경우)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/know_rsa -N ""

# 서버에 공개키 등록 (비밀번호 1회 필요)
sshpass -f ~/.ssh/know_pass ssh-copy-id -i ~/.ssh/know_rsa.pub know@133.186.132.245

# 이후 비밀번호 없이 접속
ssh -i ~/.ssh/know_rsa know@133.186.132.245
```

---

## 서버 디렉토리 구조

```
/home/know/
├── apps/
│   ├── jiana_admin_server/
│   │   └── base_1.5/
│   │       ├── lib/
│   │       │   ├── jiana1.5.jar      ← 형태소분석 엔진 (JDK 1.7 필수)
│   │       │   └── dqdic-1.0.3.jar
│   │       ├── dic/                  ← 도메인별 사전 디렉토리
│   │       ├── build.xml             ← ant 빌드 파일
│   │       └── spam_kwd.pat          ← 스팸 패턴 파일
│   ├── bin/                          ← 유틸리티 쉘스크립트
│   └── know-ops/                     ← Python CLI 패키지 (신규)
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
# 검색로그 정제
know refine query_log.txt --도메인 site1

# 형태소 분석 (JDK 7 + jiana1.5.jar)
know analyze input.txt --도메인 site1

# 유사어 페어 처리
know synonym site1.pair --도메인 site1

# 사전 빌드
know build --도메인 site1
```

---

## 기술 스택

| 구분 | 현행 (AS-IS) | 목표 (TO-BE) |
|------|-------------|-------------|
| 언어 | Java/JSP + Bash/Perl | Python 3.11+ |
| 프레임워크 | Tomcat 6 + jQuery | FastAPI + React/Vue |
| 파이프라인 | 수동 쉘스크립트 | Celery + Redis |
| DB | MariaDB 5.5 | MariaDB (유지) |
| 형태소분석 | jiana1.5.jar (JDK 1.7) | subprocess 래핑 유지 |

---

## Phase 계획

- **Phase 1** ✅ 완료: Python CLI 패키지 (know-ops) 신규 생성
- **Phase 2** 예정: FastAPI 백엔드 API + 웹 UI
- **Phase 3** 예정: Celery 자동화 파이프라인 + 전사 배포
