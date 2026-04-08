"""core/constants.py — 프로젝트 전역 경로 상수 통합"""
from __future__ import annotations

import os

# ──────────────────────────────────────────────
# know-ops 기본 경로
# ──────────────────────────────────────────────
KNOW_OPS_ROOT = "/home/know/apps/know-ops"
KNOW_OPS_SRC = os.path.join(KNOW_OPS_ROOT, "src")

# ──────────────────────────────────────────────
# 워크스페이스 / 도메인
# ──────────────────────────────────────────────
WORKSPACE_DIR = os.path.join(KNOW_OPS_ROOT, "workspace")
WORKSPACE_BASE = WORKSPACE_DIR  # 별칭 (executor/assignment 호환)
DOMAIN_DIR = os.path.join(KNOW_OPS_ROOT, "domain")
JIANA_BASE_DIR = os.path.join(KNOW_OPS_ROOT, "jiana")

# ──────────────────────────────────────────────
# 상태/설정 파일
# ──────────────────────────────────────────────
STATE_FILE = os.path.join(WORKSPACE_DIR, ".state.json")
USER_PREF_FILE = os.path.join(WORKSPACE_DIR, ".user_pref.json")
DOMAIN_META_FILE = os.path.join(DOMAIN_DIR, ".meta.json")
DOMAIN_JIANA_PREF_FILE = os.path.join(DOMAIN_DIR, ".jiana_pref.json")

# ──────────────────────────────────────────────
# 레거시 도메인 (이전 jiana_admin_server)
# ──────────────────────────────────────────────
OLD_DOMAIN_DIR = "/home/know/apps/jiana_admin_server"

# ──────────────────────────────────────────────
# 사전 빌드/형태소분석 관련
# ──────────────────────────────────────────────
DEFAULT_JIANA_HOME = "/home/know/jiana1.5.12"
JAVA_HOME = "/home/know/jdk1.7.0_80"
DICT_BACKUP_DIR = "/home/know/dict_backup"

# ──────────────────────────────────────────────
# 도메인 복사 진행률 임시 경로
# ──────────────────────────────────────────────
DOMAIN_PROGRESS_DIR = "/tmp/know_domain_progress"
