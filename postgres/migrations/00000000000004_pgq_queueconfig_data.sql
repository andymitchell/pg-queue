


-- ##################
-- QUEUE CONFIG - DATA


-- ####################
-- QUEUE_CONFIG :: TABLE

CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".queue_config (
    queue_config_id serial PRIMARY KEY,
    queue_name TEXT NOT NULL UNIQUE,
    max_concurrency INT NOT NULL DEFAULT -1, -- -1 means no checks
    pause_between_retries_milliseconds INT NOT NULL DEFAULT 30000,
    timeout_milliseconds INT NOT NULL DEFAULT 30000,
    endpoint_active BOOLEAN NOT NULL DEFAULT FALSE,
    endpoint_method "pgq_schema_placeholder".endpoint_method DEFAULT NULL,
    endpoint_bearer_token_location "pgq_schema_placeholder".endpoint_bearer_token_location_type DEFAULT '',
    endpoint_bearer_token_supabase_vault_key UUID DEFAULT NULL,
    endpoint_bearer_token_inline_value TEXT DEFAULT '',
    endpoint_url TEXT DEFAULT NULL, 
    endpoint_timeout_milliseconds INT CHECK(timeout_milliseconds > 50 AND timeout_milliseconds < 600000) DEFAULT NULL, -- Less than 10 minutes
    endpoint_manual_release BOOLEAN DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_endpoint_columns 
    CHECK (
        (endpoint_active = FALSE) 
        OR (
            endpoint_active = TRUE AND 
            endpoint_method IS NOT NULL AND 
            endpoint_bearer_token_location IS NOT NULL AND 
            endpoint_url IS NOT NULL AND 
            endpoint_timeout_milliseconds IS NOT NULL
        )
    )
);

ALTER TABLE "pgq_schema_placeholder".queue_config
ADD COLUMN IF NOT EXISTS timeout_with_result "pgq_schema_placeholder".job_result_type NOT NULL DEFAULT 'failed';

-- ####################
-- QUEUE_CONFIG :: INDICES

CREATE INDEX IF NOT EXISTS idx_queue_config_queue_name ON "pgq_schema_placeholder".queue_config(queue_name);
CREATE INDEX IF NOT EXISTS idx_queue_config_max_concurrency ON "pgq_schema_placeholder".queue_config(max_concurrency);

-- ####################
-- QUEUE_CONFIG :: TRIGGERS

CREATE OR REPLACE TRIGGER queue_config_updated_at
BEFORE UPDATE ON "pgq_schema_placeholder".queue_config
FOR EACH ROW
EXECUTE FUNCTION "pgq_schema_placeholder".updated_at();



-- ####################
-- TEMPORARY KEYS FOR API ACCESS :: TABLE

CREATE TABLE IF NOT EXISTS "pgq_schema_placeholder".temporary_keys_for_api_access (
    id SERIAL PRIMARY KEY,
    temporary_access_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
