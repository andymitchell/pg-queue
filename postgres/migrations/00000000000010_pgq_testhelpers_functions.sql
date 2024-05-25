
CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_rows_to_text(
    p_query text,
    p_prefix text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql 
AS $$
DECLARE
    rec record;
    result_text text := p_prefix;
BEGIN
    FOR rec IN EXECUTE p_query
    LOOP
        result_text := result_text || rec::text || E'\n';
    END LOOP;
    
    -- If prefix was provided, add an extra newline after it.
    IF p_prefix <> '' THEN
        result_text := p_prefix || E'\n' || result_text;
    END IF;
    
    
    RETURN result_text;

END;
$$;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_returns_api_in_text() 
RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE
    v_api_key TEXT;
BEGIN
    v_api_key := "pgq_schema_placeholder".get_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_1');
    return v_api_key = 'inline_abc';
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_results_eq(query TEXT, expected TEXT, description TEXT )
RETURNS VOID AS $$
DECLARE
    actual RECORD;
    expected_result RECORD;
    is_equal BOOLEAN := TRUE;
BEGIN
    FOR actual IN EXECUTE query LOOP
        FOR expected_result IN EXECUTE expected LOOP
            IF actual IS DISTINCT FROM expected_result THEN
                is_equal := FALSE;
                RAISE EXCEPTION 'Test failed: %, Actual: %, Expected: %', description, actual, expected_result;
            END IF;
        END LOOP;
    END LOOP;
    IF is_equal THEN
        RAISE NOTICE 'Test passed: %', description;
    END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_throws_ok(query TEXT, expected_exception TEXT DEFAULT NULL, description TEXT DEFAULT '')
RETURNS VOID AS $$
DECLARE
    exception_occurred BOOLEAN := FALSE;
BEGIN

    BEGIN
        EXECUTE query;
    EXCEPTION WHEN OTHERS THEN
        exception_occurred := TRUE;
        IF expected_exception IS NOT NULL AND SQLERRM !~ expected_exception THEN
            RAISE EXCEPTION 'Test failed: % - Unexpected exception: %', description, SQLERRM;
        END IF;
    END;
    
    IF exception_occurred THEN
        RAISE NOTICE 'Test passed: %', description;
    ELSE
        RAISE EXCEPTION 'Test failed: % - No exception was raised', description;
    END IF;
END;
$$ LANGUAGE plpgsql;




CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_lives_ok(query TEXT, description TEXT)
RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE query;
        RAISE NOTICE 'Test passed: %', description;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Test failed: % - Exception raised: %', description, SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_is_empty(query TEXT, description TEXT)
RETURNS VOID AS $$
DECLARE
    row_count INT;
BEGIN
    EXECUTE 'SELECT COUNT(*) FROM (' || query || ') AS subquery' INTO row_count;
    IF row_count = 0 THEN
        RAISE NOTICE 'Test passed: %', description;
    ELSE
        RAISE EXCEPTION 'Test failed: % - Query returned % rows', description, row_count;
    END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".testhelper_isnt_empty(query TEXT, description TEXT)
RETURNS VOID AS $$
DECLARE
    row_count INT;
BEGIN
    EXECUTE 'SELECT COUNT(*) FROM (' || query || ') AS subquery' INTO row_count;
    IF row_count > 0 THEN
        RAISE NOTICE 'Test passed: %', description;
    ELSE
        RAISE EXCEPTION 'Test failed: % - Query returned no rows', description;
    END IF;
END;
$$ LANGUAGE plpgsql;
