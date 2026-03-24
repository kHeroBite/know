# know-ops

지식팀 Ops 자동화 CLI 도구 (Phase 1)

## 설치

```bash
pip install -e .
```

## 사용법

```bash
# 검색로그 정제
know refine 입력파일.txt --도메인 site1

# 형태소 분석
know analyze 입력파일.txt --도메인 site1

# 유사어 페어 처리
know synonym pair파일.txt --도메인 site1

# 사전 빌드
know build --도메인 site1

# 전체 파이프라인
know pipeline 입력파일.txt --도메인 site1
```

## 구조

- `src/know/cli.py`: Click CLI 진입점
- `src/know/core/config.py`: JAR/JDK 경로 설정
- `src/know/pipeline/정제/`: 검색로그 정제 (refine_log_spam.sh 대체)
- `src/know/pipeline/유사어/`: 유사어 페어 관리 (makepair.pl 등 대체)
- `src/know/pipeline/분석/`: 형태소 분석 (cotton_test.sh 대체)
- `src/know/pipeline/빌드/`: 사전 빌드 (ant dic 대체)
