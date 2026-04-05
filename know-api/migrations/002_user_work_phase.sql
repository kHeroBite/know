-- migrations/002_user_work_phase.sql
-- 사용자별 작업 Phase 추적 테이블 (SQLite)
-- 워크스페이스×도메인×사용자 단위로 idle/working/done 상태 관리

CREATE TABLE IF NOT EXISTS user_work_phase (
  workspace TEXT NOT NULL,
  domain TEXT NOT NULL,
  user_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'idle',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace, domain, user_id)
);

CREATE INDEX IF NOT EXISTS idx_uwp_ws ON user_work_phase(workspace, domain);
