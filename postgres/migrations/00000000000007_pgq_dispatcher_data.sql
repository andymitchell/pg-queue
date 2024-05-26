
CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".dispatcher_current_jobs (
    request_id INT NOT NULL,
    job_id INT NOT NULL,
    manual_release BOOLEAN NOT NULL
);