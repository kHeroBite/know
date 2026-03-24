# know-ops 사용자 매뉴얼

> **know-ops** v0.1.0 — 지식팀 Ops 자동화 CLI 도구

---

## 1. 개요

**know-ops**는 지식팀 서버(CentOS 7)에서 사용하던 sh/perl 스크립트들을 **하나의 Python CLI 도구**로 통합한 프로젝트입니다.

기존에는 `refine_log_spam.sh`, `cotton_test.sh`, `makepair.pl`, `keymake.pl`, `pair2list.pl`, `fdiff.pl`, `jiana_dic_add.sh` 등 여러 스크립트를 개별 실행해야 했지만, know-ops를 사용하면 `know` 명령어 하나로 모든 작업을 수행할 수 있습니다.

### 주요 특징

- **통합 CLI**: `know refine`, `know analyze`, `know synonym`, `know build`, `know pipeline` 5개 서브커맨드
- **Python 3.8+ 호환**: CentOS 7 서버의 miniconda 환경에서 동작
- **한국어 인터페이스**: 모든 옵션과 출력 메시지가 한국어
- **파이프라인 자동화**: `know pipeline` 한 번으로 정제 → 분석 → 유사어 → 빌드 전체 실행

---

## 2. 설치 방법

### 2-1. 서버 환경 (CentOS 7, Python 3.8)

서버 IP: `133.186.132.245`, 계정: `know`

```bash
# 1) miniconda 활성화 (이미 설치되어 있다면)
source ~/miniconda3/bin/activate

# 2) know-ops 소스 디렉토리로 이동
cd /home/know/apps/know-ops

# 3) 개발 모드로 설치
pip install -e .

# 4) PATH 등록 확인 (pip install -e . 후 자동 등록됨)
which know
# → ~/.local/bin/know 또는 miniconda 환경의 bin/know

# 5) PATH에 없으면 수동 등록
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 6) 설치 확인
know --version
# → know-ops, version 0.1.0
```

### 2-2. 로컬 개발 환경

```bash
# 1) 프로젝트 클론/이동
cd /path/to/know-ops

# 2) 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate

# 3) 개발 모드로 설치
pip install -e .

# 4) 설치 확인
know --version
```

### 의존성 패키지

| 패키지 | 최소 버전 | 용도 |
|--------|-----------|------|
| click | 8.1+ | CLI 프레임워크 |
| pydantic-settings | 2.0+ | 설정 관리 |
| paramiko | 3.0+ | SSH 연결 |
| pandas | 2.0+ | 데이터 처리 |
| rich | 13.0+ | 콘솔 출력 서식 |

---

## 3. 서버 SSH 접속

### 접속 정보

| 항목 | 값 |
|------|-----|
| 서버 IP | `133.186.132.245` |
| 계정 | `know` |
| 비밀번호 | `ledge123!` |

### ⚠️ 비밀번호 주의사항

비밀번호에 느낌표(`!`)가 포함되어 있어 bash에서 **history expansion** 문제가 발생합니다.
쉘에서 `!`를 직접 입력하면 이전 명령어로 치환되거나 에러가 납니다.

**해결 방법: hex escape로 비밀번호 파일 생성**

```bash
# 비밀번호 파일 생성 (hex escape 방식 — 느낌표 문제 회피)
printf '\x6c\x65\x64\x67\x65\x31\x32\x33\x21' > ~/.ssh/know_pass
chmod 600 ~/.ssh/know_pass
```

> `\x6c\x65\x64\x67\x65\x31\x32\x33\x21` = `ledge123!`의 각 문자를 hex로 인코딩한 것

### sshpass를 사용한 접속

```bash
# sshpass 설치 (Ubuntu/Debian)
sudo apt install sshpass

# SSH 접속 (비밀번호 파일 사용, -f 옵션)
sshpass -f ~/.ssh/know_pass ssh \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  know@133.186.132.245

# 원격 명령어 실행 (예: know 버전 확인)
sshpass -f ~/.ssh/know_pass ssh \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  know@133.186.132.245 "know --version"
```

### 접속 옵션 설명

| 옵션 | 설명 |
|------|------|
| `-f ~/.ssh/know_pass` | 파일에서 비밀번호 읽기 (stdin 대신) |
| `-o PreferredAuthentications=password` | 비밀번호 인증만 사용 |
| `-o PubkeyAuthentication=no` | 공개키 인증 비활성화 |
| `-o StrictHostKeyChecking=no` | 호스트 키 확인 건너뛰기 |

---

## 4. 명령어 레퍼런스

### 4-1. `know refine` — 질의로그 스팸 정제

기존 `refine_log_spam.sh`를 대체합니다. 검색 질의 로그에서 스팸/노이즈 키워드를 필터링합니다.

```bash
# 기본 사용
know refine 입력파일.log

# 도메인 지정
know refine 입력파일.log --도메인 site1

# 출력 파일 지정
know refine 입력파일.log --도메인 site1 --출력 정제결과.log
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `입력파일` (필수) | — | 정제할 질의 로그 파일 경로 |
| `--도메인` | `default` | 도메인명 (예: site1, site2) |
| `--출력` | 자동 생성 | 출력 파일 경로 (미지정 시 자동 명명) |

### 4-2. `know analyze` — 형태소 분석

기존 `cotton_test.sh`를 대체합니다. Jiana 형태소 분석기를 호출하여 질의를 분석합니다.

```bash
# 기본 사용
know analyze 입력파일.txt

# 도메인 및 출력 지정
know analyze 입력파일.txt --도메인 site1 --출력 분석결과.txt
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `입력파일` (필수) | — | 분석할 입력 파일 경로 |
| `--도메인` | `default` | 도메인명 |
| `--출력` | 자동 생성 | 출력 파일 경로 |

### 4-3. `know synonym` — 유사어 페어 관리

기존 `makepair.pl` + `keymake.pl` + `pair2list.pl` + `fdiff.pl` 4개 Perl 스크립트를 통합 대체합니다. 유사어 페어 생성, 키 매핑, 리스트 변환, 차이 비교를 한 번에 수행합니다.

```bash
# 기본 사용
know synonym pair_파일.txt

# 도메인 및 출력 디렉토리 지정
know synonym pair_파일.txt --도메인 site1 --출력 ./결과/
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `pair_파일` (필수) | — | 유사어 페어 입력 파일 |
| `--도메인` | `default` | 도메인명 |
| `--출력` | 자동 생성 | 출력 디렉토리 경로 |

### 4-4. `know build` — 사전 빌드

기존 `jiana_dic_add.sh` + `ant dic`을 대체합니다. Jiana 사전을 빌드합니다.

```bash
# 기본 사전 빌드
know build

# 도메인 지정
know build --도메인 site1

# 전체 빌드
know build --대상 all
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--도메인` | `default` | 도메인명 |
| `--대상` | `dic` | 빌드 대상 (`dic`: 사전만, `all`: 전체) |

### 4-5. `know pipeline` — 전체 파이프라인

모든 단계를 순차적으로 실행합니다: **refine → analyze → synonym → build**

```bash
# 전체 파이프라인 실행
know pipeline 입력파일.log --도메인 site1

# 특정 단계만 실행
know pipeline 입력파일.log --단계 refine
know pipeline 입력파일.log --단계 analyze
know pipeline 입력파일.log --단계 synonym
know pipeline 입력파일.log --단계 build
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `입력파일` (필수) | — | 파이프라인 입력 파일 |
| `--도메인` | `default` | 도메인명 |
| `--단계` | `all` | 실행 단계 (`all`, `refine`, `analyze`, `synonym`, `build`) |

### 4-6. `know --version` — 버전 확인

```bash
know --version
# → know-ops, version 0.1.0
```

---

## 5. 기존 스크립트 대응표

| 기존 스크립트 | know-ops 명령어 | 설명 |
|---------------|-----------------|------|
| `refine_log_spam.sh` | `know refine` | 질의로그 스팸 정제 |
| `cotton_test.sh` | `know analyze` | 형태소 분석 (Jiana) |
| `makepair.pl` | `know synonym` | 유사어 페어 생성 |
| `keymake.pl` | `know synonym` | 유사어 키 매핑 |
| `pair2list.pl` | `know synonym` | 페어 → 리스트 변환 |
| `fdiff.pl` | `know synonym` | 유사어 차이 비교 |
| `jiana_dic_add.sh` | `know build` | 사전 추가 빌드 |
| `ant dic` | `know build` | Ant 사전 빌드 |
| (전체 수동 실행) | `know pipeline` | 전체 자동화 파이프라인 |

---

## 6. 설정 (config)

know-ops의 기본 설정값은 `src/know/core/config.py`에 정의되어 있습니다.

### JAR/JDK 경로

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `jiana_jar경로` | `/home/know/apps/jiana_admin_server/base_1.5/lib/jiana1.5.jar` | Jiana 형태소 분석기 JAR |
| `dqdic_jar경로` | `/home/know/apps/jiana_admin_server/base_1.5/lib/dqdic-1.0.3.jar` | DQDic 사전 JAR |
| `jdk7_경로` | `/usr/lib/jvm/java-1.7.0-openjdk-amd64` | JDK 7 설치 경로 |

### 기본 경로

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `base_경로` | `/home/know/apps/jiana_admin_server/base_1.5` | Jiana 기본 경로 |
| `사전_루트경로` | `/home/know/apps/jiana_admin_server/base_1.5/dic` | 사전 루트 디렉토리 |
| `스팸패턴경로` | `/home/know/apps/jiana_admin_server/base_1.5/spam_kwd.pat` | 스팸 키워드 패턴 파일 |

### 형태소 분석 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `분석_메인클래스` | `com.diquest.jiana.test.CottonTest` | Java 메인 클래스 |
| `분석_java옵션` | `["-Xmx512m", "-Dfile.encoding=UTF-8"]` | JVM 옵션 |

### 빌드 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `ant_경로` | `/usr/bin/ant` | Apache Ant 실행 경로 |
| `build_xml경로` | `/home/know/apps/jiana_admin_server/base_1.5/build.xml` | Ant 빌드 파일 |
| `bin_경로` | `/home/know/apps/bin` | 스크립트 디렉토리 |

### 도메인별 사전 경로

도메인명을 지정하면 `사전_루트경로/{도메인}` 하위에서 사전 파일을 관리합니다.

```
/home/know/apps/jiana_admin_server/base_1.5/dic/
├── default/      ← --도메인 default
├── site1/        ← --도메인 site1
└── site2/        ← --도메인 site2
```

---

## 7. 프로젝트 구조

```
know-ops/
├── pyproject.toml          ← 패키지 메타데이터 + 의존성
├── setup.py                ← setuptools 호환
├── README.md
├── MANUAL.md               ← 이 문서
└── src/
    └── know/
        ├── __init__.py     ← 버전 정보
        ├── __main__.py     ← python -m know 지원
        ├── cli.py          ← CLI 엔트리포인트 (click)
        ├── core/
        │   ├── __init__.py
        │   └── config.py   ← 전역 설정
        └── pipeline/
            ├── __init__.py
            ├── 정제/
            │   ├── __init__.py
            │   └── 검색로그정제기.py    ← know refine
            ├── 분석/
            │   ├── __init__.py
            │   └── 형태소분석래퍼.py    ← know analyze
            ├── 유사어/
            │   ├── __init__.py
            │   └── 페어관리기.py        ← know synonym
            └── 빌드/
                ├── __init__.py
                └── 사전빌드래퍼.py      ← know build
```

---

## 8. 트러블슈팅

### `know: command not found`

pip install 후 `know` 명령어를 찾을 수 없는 경우:

```bash
# 1) pip 설치 경로 확인
pip show know-ops | grep Location

# 2) ~/.local/bin이 PATH에 있는지 확인
echo $PATH | tr ':' '\n' | grep local

# 3) PATH에 추가
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 4) miniconda 환경이라면 환경 활성화 확인
source ~/miniconda3/bin/activate
which know
```

### Python 버전 문제

know-ops는 **Python 3.8 이상**이 필요합니다.

```bash
# Python 버전 확인
python --version

# CentOS 7 기본 Python은 2.7이므로 반드시 miniconda 사용
source ~/miniconda3/bin/activate
python --version  # → Python 3.8.x 이상 확인
```

### 비밀번호 `!` 이스케이프 문제

서버 접속 시 비밀번호의 느낌표(`!`)로 인한 오류:

```bash
# ❌ 잘못된 방법 (bash history expansion 발생)
sshpass -p 'ledge123!' ssh know@133.186.132.245
# → bash: !': event not found

# ❌ 잘못된 방법 (큰따옴표 내 ! 확장)
sshpass -p "ledge123!" ssh know@133.186.132.245

# ✅ 올바른 방법 (hex escape로 파일 생성 후 -f 사용)
printf '\x6c\x65\x64\x67\x65\x31\x32\x33\x21' > ~/.ssh/know_pass
chmod 600 ~/.ssh/know_pass
sshpass -f ~/.ssh/know_pass ssh -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no -o StrictHostKeyChecking=no \
  know@133.186.132.245
```

### JAR 파일을 찾을 수 없는 경우

```bash
# 서버에서 JAR 경로 확인
ls -la /home/know/apps/jiana_admin_server/base_1.5/lib/

# config.py의 기본 경로와 실제 경로가 다르면
# 환경변수 또는 설정 파일로 오버라이드 (향후 지원 예정)
```

### JDK 7을 찾을 수 없는 경우

```bash
# CentOS 7에서 JDK 7 확인
ls /usr/lib/jvm/

# 설치되어 있지 않으면
sudo yum install java-1.7.0-openjdk java-1.7.0-openjdk-devel
```

### pip install 오류

```bash
# setuptools 업그레이드
pip install --upgrade setuptools pip

# 다시 설치
pip install -e .
```

---

## 부록: 자주 사용하는 워크플로우

### 일일 사전 업데이트 (전체 파이프라인)

```bash
# 1) 서버 접속
sshpass -f ~/.ssh/know_pass ssh -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no -o StrictHostKeyChecking=no \
  know@133.186.132.245

# 2) 전체 파이프라인 실행
know pipeline /path/to/오늘_질의로그.log --도메인 site1
```

### 특정 단계만 재실행

```bash
# 스팸 정제만 다시 실행
know refine /path/to/로그.log --도메인 site1 --출력 /path/to/정제결과.log

# 사전 빌드만 다시 실행
know build --도메인 site1
```

### 원격에서 단일 명령 실행

```bash
# 서버에 접속하지 않고 원격 명령 실행
sshpass -f ~/.ssh/know_pass ssh \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  know@133.186.132.245 "know build --도메인 site1"
```
