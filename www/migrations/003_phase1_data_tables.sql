-- 003_phase1_data_tables.sql — 데이터기반 전처리 테이블 생성

CREATE TABLE IF NOT EXISTS phase1_data_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id        TEXT    NOT NULL UNIQUE,
    folder        TEXT    NOT NULL,
    workspace     TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phase1_data_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT    NOT NULL,
    step_num    INTEGER NOT NULL,
    step_name   TEXT    NOT NULL DEFAULT '',
    percent     INTEGER NOT NULL DEFAULT 0,
    message     TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'running',
    elapsed_sec REAL    NOT NULL DEFAULT 0,
    ts          DATETIME DEFAULT CURRENT_TIMESTAMP
)
