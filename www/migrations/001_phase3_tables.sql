-- migrations/001_phase3_tables.sql
-- Phase 3 신규 테이블 DDL (MariaDB 5.5 호환)
-- JSON 컬럼 사용 금지, TEXT 사용, ENGINE=InnoDB, CHARSET=utf8 (4바이트 문자 금지)

-- 실행 전 DB 선택 확인 필요: USE know_mng;

CREATE TABLE IF NOT EXISTS pipeline_history (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    domain      VARCHAR(50)  NOT NULL,
    status      ENUM('pending','running','paused','completed','failed','cancelled')
                NOT NULL DEFAULT 'pending',
    current_stage   VARCHAR(20),
    celery_task_id  VARCHAR(200),
    started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    started_by      INT,
    input_file      VARCHAR(500),
    result_summary  TEXT,
    error_message   TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS pipeline_stage_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    pipeline_id BIGINT NOT NULL,
    stage       VARCHAR(20) NOT NULL,
    status      ENUM('pending','running','waiting_approval','completed','failed','skipped')
                NOT NULL DEFAULT 'pending',
    started_at      DATETIME,
    completed_at    DATETIME,
    input_count     INT,
    output_count    INT,
    log_text        MEDIUMTEXT,
    INDEX idx_pipeline_id (pipeline_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS task_assignment (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    pipeline_id BIGINT NOT NULL,
    assignee_id INT,
    assigned_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    status      ENUM('assigned','in_progress','completed')
                NOT NULL DEFAULT 'assigned',
    item_start  INT NOT NULL,
    item_end    INT NOT NULL,
    item_count  INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS build_history (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    domain      VARCHAR(50) NOT NULL,
    build_type  VARCHAR(20) NOT NULL DEFAULT 'full',
    status      ENUM('running','completed','failed')
                NOT NULL DEFAULT 'running',
    started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    started_by      INT,
    output_path     VARCHAR(500),
    file_size       BIGINT,
    entry_count     INT,
    log_text        MEDIUMTEXT,
    INDEX idx_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT,
    action      VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id   VARCHAR(100),
    detail      TEXT,
    ip_address  VARCHAR(45),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
