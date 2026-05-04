-- 006_workspace_rounds.sql
-- 회차 카운터 분리: workspace_rounds 신규 테이블

CREATE TABLE IF NOT EXISTS workspace_rounds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace   TEXT NOT NULL,
    round_no    INTEGER NOT NULL DEFAULT 1,
    started_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(workspace, round_no)
);

CREATE INDEX IF NOT EXISTS idx_ws_rounds_ws ON workspace_rounds(workspace);
