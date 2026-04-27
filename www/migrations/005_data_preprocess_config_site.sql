-- 005_data_preprocess_config_site.sql — site_code 기반 컬럼 설정 저장 (domain → site_code)
DROP TABLE IF EXISTS data_preprocess_config;
CREATE TABLE data_preprocess_config (
    site_code         TEXT PRIMARY KEY,
    selected_columns  TEXT NOT NULL DEFAULT '[]',
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
