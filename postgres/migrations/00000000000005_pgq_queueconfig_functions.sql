
-- ##################
-- QUEUE CONFIG - FUNCTIONS

DROP FUNCTION IF EXISTS "pgq_schema_placeholder".update_queue_config( -- Signature is changing, so drop old one 
    TEXT, 
    INTEGER, 
    INTEGER, 
    INTEGER, 
    BOOLEAN, 
    "pgq_schema_placeholder".endpoint_method, 
    "pgq_schema_placeholder".endpoint_bearer_token_location_type, 
    TEXT, 
    INTEGER, 
    BOOLEAN
);
CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".update_queue_config( 
    p_queue_name TEXT,
    p_max_concurrency INTEGER DEFAULT NULL,
    p_pause_between_retries_milliseconds INTEGER DEFAULT NULL,
    p_timeout_milliseconds INTEGER DEFAULT NULL,
    p_timeout_with_result "pgq_schema_placeholder".job_result_type DEFAULT NULL,
    p_endpoint_active BOOLEAN DEFAULT NULL,
    p_endpoint_method "pgq_schema_placeholder".endpoint_method DEFAULT NULL,
    p_endpoint_bearer_token_location "pgq_schema_placeholder".endpoint_bearer_token_location_type DEFAULT NULL,
    p_endpoint_url TEXT DEFAULT NULL,
    p_endpoint_timeout_milliseconds INT DEFAULT NULL,
    p_endpoint_manual_release BOOLEAN DEFAULT NULL
) 
RETURNS VOID
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE 
    v_supabase_vault_key UUID;
    v_existing_record RECORD;
    v_defaults JSONB;
BEGIN

    -- Fetch column defaults (as text - they'll need to be cast below)
    SELECT "pgq_schema_placeholder".get_table_defaults('queue_config') INTO v_defaults;

    -- Fetch existing record for the given queue_name
    SELECT * INTO v_existing_record 
    FROM "pgq_schema_placeholder".queue_config 
    WHERE queue_name = p_queue_name;


    -- Check if endpoint_active is true, check it has everything it needs 
    IF COALESCE(p_endpoint_active, v_existing_record.endpoint_active, FALSE) THEN
        -- Ensure required fields are provided or already exist
        IF p_endpoint_method IS NULL AND v_existing_record.endpoint_method IS NULL THEN
            RAISE EXCEPTION 'endpoint_method must be provided or already exist when endpoint_active is true';
        END IF;
        IF p_endpoint_url IS NULL AND v_existing_record.endpoint_url IS NULL THEN
            RAISE EXCEPTION 'endpoint_url must be provided or already exist when endpoint_active is true';
        END IF;
        IF p_endpoint_timeout_milliseconds IS NULL AND v_existing_record.endpoint_timeout_milliseconds IS NULL THEN
            RAISE EXCEPTION 'endpoint_timeout_milliseconds must be provided or already exist when endpoint_active is true';
        END IF;
        IF p_endpoint_manual_release IS NULL AND v_existing_record.endpoint_manual_release IS NULL THEN
            RAISE EXCEPTION 'endpoint_manual_release must be provided or already exist when endpoint_active is true';
        END IF;
    END IF;

    -- Upsert configuration for a specific queue
    INSERT INTO "pgq_schema_placeholder".queue_config (
        queue_name,
        max_concurrency, 
        pause_between_retries_milliseconds,
        timeout_milliseconds,
        timeout_with_result,
        endpoint_active,
        endpoint_method,
        endpoint_bearer_token_location,
        endpoint_url,
        endpoint_timeout_milliseconds,
        endpoint_manual_release
    ) 
    VALUES (
        p_queue_name, 
        COALESCE(p_max_concurrency, (v_defaults->>'max_concurrency')::INTEGER), 
        COALESCE(p_pause_between_retries_milliseconds, (v_defaults->>'pause_between_retries_milliseconds')::INTEGER),
        COALESCE(p_timeout_milliseconds, (v_defaults->>'timeout_milliseconds')::INTEGER),
        COALESCE(p_timeout_with_result, (v_defaults->>'timeout_with_result')::"pgq_schema_placeholder".job_result_type),
        COALESCE(p_endpoint_active, (v_defaults->>'endpoint_active')::BOOLEAN),
        COALESCE(p_endpoint_method, (v_defaults->>'endpoint_method')::"pgq_schema_placeholder".endpoint_method),
        COALESCE(p_endpoint_bearer_token_location, (v_defaults->>'endpoint_bearer_token_location')::"pgq_schema_placeholder".endpoint_bearer_token_location_type),
        COALESCE(p_endpoint_url, (v_defaults->>'endpoint_url')::TEXT),
        COALESCE(p_endpoint_timeout_milliseconds, (v_defaults->>'endpoint_timeout_milliseconds')::INTEGER),
        COALESCE(p_endpoint_manual_release, (v_defaults->>'endpoint_manual_release')::BOOLEAN)
    ) 
    ON CONFLICT (queue_name) 
    DO UPDATE 
    SET 
        max_concurrency = COALESCE(EXCLUDED.max_concurrency, "pgq_schema_placeholder".queue_config.max_concurrency, (v_defaults->>'max_concurrency')::INTEGER),
        pause_between_retries_milliseconds = COALESCE(EXCLUDED.pause_between_retries_milliseconds, "pgq_schema_placeholder".queue_config.pause_between_retries_milliseconds, (v_defaults->>'pause_between_retries_milliseconds')::INTEGER),
        timeout_milliseconds = COALESCE(EXCLUDED.timeout_milliseconds, "pgq_schema_placeholder".queue_config.timeout_milliseconds, (v_defaults->>'timeout_milliseconds')::INTEGER),
        timeout_with_result = COALESCE(EXCLUDED.timeout_with_result, "pgq_schema_placeholder".queue_config.timeout_with_result, (v_defaults->>'timeout_with_result')::"pgq_schema_placeholder".job_result_type),
        endpoint_active = COALESCE(EXCLUDED.endpoint_active, "pgq_schema_placeholder".queue_config.endpoint_active, (v_defaults->>'endpoint_active')::BOOLEAN),
        endpoint_method = COALESCE(EXCLUDED.endpoint_method, "pgq_schema_placeholder".queue_config.endpoint_method),
        endpoint_bearer_token_location = COALESCE(EXCLUDED.endpoint_bearer_token_location, "pgq_schema_placeholder".queue_config.endpoint_bearer_token_location, (v_defaults->>'endpoint_bearer_token_location')::"pgq_schema_placeholder".endpoint_bearer_token_location_type),
        endpoint_url = COALESCE(EXCLUDED.endpoint_url, "pgq_schema_placeholder".queue_config.endpoint_url, (v_defaults->>'endpoint_url')::TEXT),
        endpoint_timeout_milliseconds = COALESCE(EXCLUDED.endpoint_timeout_milliseconds, "pgq_schema_placeholder".queue_config.endpoint_timeout_milliseconds, (v_defaults->>'endpoint_timeout_milliseconds')::INTEGER),
        endpoint_manual_release = COALESCE(EXCLUDED.endpoint_manual_release, "pgq_schema_placeholder".queue_config.endpoint_manual_release, (v_defaults->>'endpoint_manual_release')::BOOLEAN),
        endpoint_bearer_token_inline_value = CASE 
                                            WHEN EXCLUDED.endpoint_active = FALSE THEN (v_defaults->>'endpoint_bearer_token_inline_value')::TEXT 
                                            ELSE COALESCE("pgq_schema_placeholder".queue_config.endpoint_bearer_token_inline_value, (v_defaults->>'endpoint_bearer_token_inline_value')::TEXT)
                                        END;
    

    IF p_endpoint_bearer_token_location = 'supabase_vault' THEN 
        -- See if there's an existing value key
        SELECT endpoint_bearer_token_supabase_vault_key INTO v_supabase_vault_key FROM "pgq_schema_placeholder".queue_config WHERE queue_name = p_queue_name;

        -- If no vault key, create one and remember it 
        IF v_supabase_vault_key IS NULL THEN 
            -- Starts empty. Actual secret updates must go through the proper API key location 
            v_supabase_vault_key := vault.create_secret('', 'queue_endpoint_bearer_token::' || p_queue_name);

            IF v_supabase_vault_key IS NULL THEN 
                RAISE EXCEPTION 'v_supabase_vault_key should be set';
            END IF;

            -- store the vault key for future use 
            UPDATE "pgq_schema_placeholder".queue_config SET endpoint_bearer_token_supabase_vault_key = v_supabase_vault_key WHERE queue_name = p_queue_name;
        END IF;

        -- Now set the latest secret against the vault key, if provided
        -- If it's not provided, thats ok: assume the caller wants to avoid any risk of log exposure, and is putting the secret into the Vault via Supabase's UI instead
        --IF p_endpoint_bearer_token_supabase_vault_secret IS NOT NULL THEN
        --    select vault.update_secret(v_supabase_vault_key, p_endpoint_bearer_token_supabase_vault_secret);
        --END IF;
    END IF;
    


END;
$$ LANGUAGE plpgsql;








CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".register_temporary_key_for_api_access(
    p_temporary_access_key TEXT
) 
RETURNS VOID 
SECURITY DEFINER
AS $$
DECLARE
    v_log_parameter_setting TEXT;
    v_log_rows_setting TEXT;
BEGIN
    PERFORM "pgq_schema_placeholder".cleanup_expired_temporary_keys_for_api_access();

    -- Get current settings
    --SELECT current_setting('pgaudit.log_parameter') INTO v_log_parameter_setting;
    --SELECT current_setting('pgaudit.log_rows') INTO v_log_rows_setting;

    -- The whole point of forcing registration is to disable any pgaudit logging that might pick up key exchange 
    --alter role authenticator set pgaudit.log_parameter = off;
    --alter role authenticator set pgaudit.log_rows = off;

    --IF v_log_parameter_setting = 'on' OR v_log_rows_setting = 'on' THEN
    --    RAISE NOTICE 'PgAudit logging settings changed. log_parameter and log_rows are now off.';
    --END IF;

    INSERT INTO "pgq_schema_placeholder".temporary_keys_for_api_access (temporary_access_key)
    VALUES (p_temporary_access_key);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".verify_temporary_key_for_api_access(
    p_temporary_access_key TEXT
) 
RETURNS BOOLEAN 
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM "pgq_schema_placeholder".temporary_keys_for_api_access
    WHERE temporary_access_key = p_temporary_access_key
    AND created_at >= NOW() - INTERVAL '1 minute';

    IF v_count > 0 THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".set_queue_endpoint_api_key(
    p_temporary_access_key TEXT,
    p_queue_name TEXT,
    p_api_key TEXT
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder", vault
AS $$
DECLARE
    v_bearer_token_location "pgq_schema_placeholder".endpoint_bearer_token_location_type;
    v_endpoint_bearer_token_supabase_vault_key UUID;
BEGIN
    IF NOT "pgq_schema_placeholder".verify_temporary_key_for_api_access(p_temporary_access_key) THEN
        RAISE EXCEPTION 'Register a temporary key for api access first';
    END IF;

    SELECT endpoint_bearer_token_location, endpoint_bearer_token_supabase_vault_key
    INTO v_bearer_token_location, v_endpoint_bearer_token_supabase_vault_key
    FROM "pgq_schema_placeholder".queue_config
    WHERE queue_name = p_queue_name;

    IF v_bearer_token_location = 'supabase_vault' THEN
        -- Get the vault key, and update it 
        PERFORM vault.update_secret(v_endpoint_bearer_token_supabase_vault_key, p_api_key);
    ELSIF v_bearer_token_location = 'inline' THEN
        UPDATE "pgq_schema_placeholder".queue_config
        SET endpoint_bearer_token_inline_value = p_api_key
        WHERE queue_name = p_queue_name;
    END IF;

END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".get_queue_endpoint_api_key(
    p_temporary_access_key TEXT,
    p_queue_name TEXT
)
RETURNS TEXT 
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder", vault
AS $$
DECLARE
    v_bearer_token_location "pgq_schema_placeholder".endpoint_bearer_token_location_type;
    v_endpoint_bearer_token_supabase_vault_key UUID;
    v_endpoint_bearer_token_inline_value TEXT;
    v_api_key TEXT;
BEGIN
    IF NOT "pgq_schema_placeholder".verify_temporary_key_for_api_access(p_temporary_access_key) THEN
        RAISE EXCEPTION 'Register a temporary key for api access first';
    END IF;

    
    SELECT endpoint_bearer_token_location, endpoint_bearer_token_supabase_vault_key, endpoint_bearer_token_inline_value
    INTO v_bearer_token_location, v_endpoint_bearer_token_supabase_vault_key, v_endpoint_bearer_token_inline_value
    FROM "pgq_schema_placeholder".queue_config
    WHERE queue_name = p_queue_name;

    -- Get the API key using the new function
    IF v_bearer_token_location = '' THEN
        v_api_key := '';
    ELSIF v_bearer_token_location = 'supabase_vault' THEN
        IF v_endpoint_bearer_token_supabase_vault_key IS NULL THEN
            RAISE EXCEPTION 'v_endpoint_bearer_token_supabase_vault_key was null for supabase_vault';
        END IF;

        SELECT decrypted_secret
        INTO v_api_key
        FROM vault.decrypted_secrets
        WHERE id = v_endpoint_bearer_token_supabase_vault_key;
    ELSEIF v_bearer_token_location = 'inline' THEN
        v_api_key := v_endpoint_bearer_token_inline_value;
    ELSE
        RAISE EXCEPTION 'v_bearer_token_location unknown';
    END IF;

    return COALESCE(v_api_key, '');
END;
$$ LANGUAGE plpgsql;
