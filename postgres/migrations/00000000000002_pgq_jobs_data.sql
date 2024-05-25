




-- ##############
-- TABLE SET UP

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


SELECT "pgq_schema_placeholder".create_enum_type_if_not_exists('pgq_schema_placeholder', 'job_status_type', ARRAY['', 'failed', 'processing', 'complete']);
SELECT "pgq_schema_placeholder".create_enum_type_if_not_exists('pgq_schema_placeholder', 'job_result_type', ARRAY['failed', 'paused', 'complete']);
SELECT "pgq_schema_placeholder".create_enum_type_if_not_exists('pgq_schema_placeholder', 'endpoint_method', ARRAY['GET', 'POST']);
SELECT "pgq_schema_placeholder".create_enum_type_if_not_exists('pgq_schema_placeholder', 'endpoint_bearer_token_location_type', ARRAY['', 'supabase_vault', 'inline']);
--CREATE TYPE "pgq_schema_placeholder".job_status_type AS ENUM ('', 'failed', 'processing', 'complete');
--CREATE TYPE "pgq_schema_placeholder".job_result_type AS ENUM ('failed', 'paused', 'complete');
--CREATE TYPE "pgq_schema_placeholder".endpoint_method AS ENUM ('GET', 'POST');
--CREATE TYPE "pgq_schema_placeholder".endpoint_bearer_token_location_type AS ENUM ('', 'supabase_vault', 'inline');



CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".job_queue (
    job_id SERIAL PRIMARY KEY,
    queue_name TEXT NOT NULL,
    payload jsonb NOT NULL,
    status "pgq_schema_placeholder".job_status_type NOT NULL DEFAULT '',
    start_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retries_remaining INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "pgq_schema_placeholder".job_queue
ADD COLUMN IF NOT EXISTS custom_timeout_milliseconds INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS custom_timeout_with_result "pgq_schema_placeholder".job_result_type DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_keep_alive_at TIMESTAMPTZ NOT NULL DEFAULT NOW();




CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".job_queue_completed (
    job_id SERIAL PRIMARY KEY,
    original_job_id INT,
    queue_name TEXT NOT NULL,
    payload jsonb,
    status TEXT NOT NULL CHECK (status IN ('complete')),
    start_after TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    status_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".job_queue_failed_forever (
    job_id SERIAL PRIMARY KEY,
    original_job_id INT,
    queue_name TEXT NOT NULL,
    payload jsonb,
    status TEXT NOT NULL CHECK (status IN ('failed')),
    start_after TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    status_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status
ON "pgq_schema_placeholder".job_queue(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_queue_name
ON "pgq_schema_placeholder".job_queue(queue_name);
CREATE INDEX IF NOT EXISTS idx_job_queue_retries_remaining
ON "pgq_schema_placeholder".job_queue(retries_remaining);


CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".job_queue_event_log (
    log_id SERIAL PRIMARY KEY,
    queue_name TEXT NOT NULL,
    job_id INTEGER NOT NULL, -- No Foreign key constraint is used, because want this to remain even if job_queue deleted 
    current_status "pgq_schema_placeholder".job_status_type,
    event_name TEXT NOT NULL,
    details JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
