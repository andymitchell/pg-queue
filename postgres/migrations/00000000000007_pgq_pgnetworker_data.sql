
CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".pgnetworker_current_jobs (
    request_id INT NOT NULL,
    job_id INT NOT NULL,
    manual_release BOOLEAN NOT NULL
);