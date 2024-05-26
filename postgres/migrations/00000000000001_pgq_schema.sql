-- A simple job queue for Postgres
--
-- # SETUP
-- Install this .sql 
-- Optionally for each queue, set a config by calling "pgq_schema_placeholder".update_queue_config
--
-- # USAGE
-- Call "pgq_schema_placeholder".add_job
-- Then either:-
--  Consume by calling "pgq_schema_placeholder".pick_next_job
--  Or activate dispatcher to be your consumer, which calls http functions to execute each job 
--
-- # ALT ENVIRONMENTS
-- pg_cron
--  If disabled, you'll need something to regularly call the functions pg_cron was calling.
--  E.g. In Express/Node, you'd set up endpoints/functions to call them, then expose them via a CRON job on that server (or Render.com does one off CRONs)




CREATE SCHEMA IF NOT EXISTS "pgq_schema_placeholder";
REVOKE CREATE ON SCHEMA "pgq_schema_placeholder" FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "pgq_schema_placeholder" REVOKE EXECUTE ON FUNCTIONS FROM public;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_running_supabase() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
END;
$$ LANGUAGE plpgsql;

-- Supabase specific
DO $$ 
BEGIN 
    IF "pgq_schema_placeholder".is_running_supabase() = true THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA "pgq_schema_placeholder" REVOKE EXECUTE ON FUNCTIONS FROM anon;
        ALTER DEFAULT PRIVILEGES IN SCHEMA "pgq_schema_placeholder" REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
    ELSE 
        RAISE NOTICE 'Unsure what environment this is running in';
    END IF;
END $$;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_extension_known(p_name TEXT) 
RETURNS BOOLEAN AS $$
DECLARE
    v_extension_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = p_name) INTO v_extension_exists;
    RETURN v_extension_exists;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_extension_active(p_name TEXT) 
RETURNS BOOLEAN AS $$
DECLARE
    v_extension_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = p_name) INTO v_extension_exists;
    RETURN v_extension_exists;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".has_function(p_name TEXT, p_schema TEXT DEFAULT 'pgq_schema_placeholder') 
RETURNS BOOLEAN AS $$
DECLARE
    v_function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM pg_proc 
        WHERE proname = p_name 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = p_schema)
    ) INTO v_function_exists;

    RETURN v_function_exists;
END;
$$ LANGUAGE plpgsql;



CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".create_type_if_not_exists(p_schema_name text, p_type_name text, p_fields text)
RETURNS void AS $$
DECLARE
    v_type_exists boolean;
    v_sql text;
BEGIN
    -- Check if the type already exists
    SELECT EXISTS (
        SELECT 1 
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = p_type_name
          AND n.nspname = p_schema_name
    ) INTO v_type_exists;

    IF NOT v_type_exists THEN
        -- Create the dynamic SQL statement
        v_sql := 'CREATE TYPE ' || quote_ident(p_schema_name) || '.' || quote_ident(p_type_name) || ' AS (' || p_fields || ');';
        
        -- Execute the dynamic SQL
        EXECUTE v_sql;
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE EXCEPTION 'Error creating type %: %', p_type_name, SQLERRM;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".create_enum_type_if_not_exists(p_schema_name text, p_type_name text, p_enum_values text[])
RETURNS void AS $$
DECLARE
    v_type_exists boolean;
    v_sql text;
    v_enum_value text;
BEGIN
    -- Check if the type already exists
    SELECT EXISTS (
        SELECT 1 
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = p_type_name
          AND n.nspname = p_schema_name
    ) INTO v_type_exists;

    IF NOT v_type_exists THEN
        -- Create the dynamic SQL statement
        v_sql := 'CREATE TYPE ' || quote_ident(p_schema_name) || '.' || quote_ident(p_type_name) || ' AS ENUM (';

        -- Add each enum value, properly quoted
        FOR i IN array_lower(p_enum_values, 1) .. array_upper(p_enum_values, 1)
        LOOP
            IF i > array_lower(p_enum_values, 1) THEN
                v_sql := v_sql || ', ';
            END IF;
            v_sql := v_sql || quote_literal(p_enum_values[i]);
        END LOOP;

        v_sql := v_sql || ');';
        
        -- Execute the dynamic SQL
        EXECUTE v_sql;
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE EXCEPTION 'Error creating type %: %', p_type_name, SQLERRM;
END;
$$ LANGUAGE plpgsql;