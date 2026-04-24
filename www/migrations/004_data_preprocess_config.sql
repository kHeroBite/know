-- 004_data_preprocess_config.sql — 도메인별 데이터기반 전처리 컬럼 선택 설정

CREATE TABLE IF NOT EXISTS data_preprocess_config (
    domain            TEXT PRIMARY KEY,
    selected_columns  TEXT NOT NULL DEFAULT '[]',
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
)
