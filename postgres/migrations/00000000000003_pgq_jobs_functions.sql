

-- ##############
-- JOB MANAGEMENT



DROP FUNCTION IF EXISTS "pgq_schema_placeholder".add_job(TEXT, jsonb, INTEGER, TIMESTAMPTZ); -- The type signature has changed, so drop the previous one. 
CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".add_job( 
    p_queue_name TEXT,
    p_payload jsonb,
    p_retries_remaining INTEGER DEFAULT 10,
    p_start_after TIMESTAMPTZ DEFAULT NOW(),
    p_custom_timeout_milliseconds INT DEFAULT NULL,
    p_custom_timeout_with_result "pgq_schema_placeholder".job_result_type DEFAULT NULL
) 
RETURNS VOID
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
BEGIN
    --RAISE NOTICE 'Running "pgq_schema_placeholder".add_job for %', p_queue_name;

    IF p_queue_name IS NULL OR p_payload IS NULL OR p_retries_remaining IS NULL OR  p_start_after IS NULL THEN 
        RAISE EXCEPTION 'No NULLS allowed';
    END IF;

    INSERT INTO "pgq_schema_placeholder".job_queue (
        queue_name, 
        payload, 
        status, 
        retries_remaining, 
        start_after,
        custom_timeout_milliseconds,
        custom_timeout_with_result
    ) VALUES (
        p_queue_name,
        p_payload,
        '',
        p_retries_remaining,
        p_start_after,
        p_custom_timeout_milliseconds,
        p_custom_timeout_with_result
    );

END;
$$ LANGUAGE plpgsql;




DROP FUNCTION IF EXISTS "pgq_schema_placeholder".pick_next_job(TEXT, TEXT[], BOOLEAN); -- The type signature has changed, so drop the previous one. 
CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pick_next_job(
    p_queue_name TEXT DEFAULT NULL,
    p_allowed_queue_names TEXT[] DEFAULT NULL, -- If p_queue_name is NULL, the caller can still restrict to certain queues 
    p_multi_step_id TEXT DEFAULT NULL,
    p_ignore_max_concurrency BOOLEAN DEFAULT FALSE -- The caller - e.g. cron - can do an optimization to check if any queue cares about max_concurrency 
) 
RETURNS SETOF "pgq_schema_placeholder".job_queue
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE
    v_unavailable_queue_names TEXT[];
    v_job_id INTEGER;
    v_queue_name TEXT;
    r "pgq_schema_placeholder".job_queue;
BEGIN
    IF p_ignore_max_concurrency <> TRUE THEN
        v_unavailable_queue_names := "pgq_schema_placeholder".get_unavailable_queues_due_to_max_concurrency(p_queue_name, p_allowed_queue_names);
    END IF;

    -- Find and update a job that meets the criteria
    SELECT job_id, queue_name INTO v_job_id, v_queue_name
    FROM "pgq_schema_placeholder".job_queue
    WHERE (status = '' OR status = 'failed') AND 
        start_after <= NOW() AND 
        (p_queue_name IS NULL OR queue_name = p_queue_name) AND 
        (p_allowed_queue_names IS NULL OR queue_name = ANY(p_allowed_queue_names)) AND 
        (p_multi_step_id IS NULL OR payload->>'multi_step_id' = p_multi_step_id) AND
        (v_unavailable_queue_names IS NULL OR NOT queue_name = ANY(v_unavailable_queue_names))
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
        UPDATE "pgq_schema_placeholder".job_queue
        SET status = 'processing', status_updated_at = NOW()
        WHERE job_id = v_job_id
        RETURNING * INTO r;

        -- Perform additional operations per job_id here
        PERFORM "pgq_schema_placeholder".log_job_event(v_queue_name, v_job_id, 'pick_next', jsonb_build_object('new_status', 'processing'));

        -- Return the updated job row
        RETURN NEXT r;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;




CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".keep_job_alive(
    p_job_id INT
    )
RETURNS VOID 
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "pgq_schema_placeholder".job_queue
    SET last_keep_alive_at = NOW()
    WHERE job_id = p_job_id;
END;
$$;



CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".release_job(
    p_job_id INT,
    p_result "pgq_schema_placeholder".job_result_type
) 
RETURNS VOID
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE
    v_job "pgq_schema_placeholder".job_queue%ROWTYPE;
    v_updated_job "pgq_schema_placeholder".job_queue%ROWTYPE;
    v_pause_between_retries_ms INT;
    v_updated_start_after TIMESTAMPTZ;
BEGIN
    -- Fetch job details into a variable
    SELECT * INTO v_job FROM "pgq_schema_placeholder".job_queue WHERE job_id = p_job_id;
    -- Check if job exists
    IF v_job IS NULL THEN
        RAISE WARNING 'Job with ID % not found', p_job_id;
        RETURN;
    END IF;
    
    IF p_result = 'complete' THEN
        

        

        PERFORM "pgq_schema_placeholder".log_job_event(v_job.queue_name, p_job_id, 'release_job', jsonb_build_object('new_status', 'complete', 'from_result_type', p_result));

        -- Delete from job_queue
        DELETE FROM "pgq_schema_placeholder".job_queue WHERE job_id = p_job_id;

        -- Insert into job_queue_completed with updated status and status_updated_at
        INSERT INTO "pgq_schema_placeholder".job_queue_completed (
            original_job_id,
            queue_name,
            payload,
            status,
            start_after,
            created_at,
            status_updated_at
        ) VALUES (
            v_job.job_id,
            v_job.queue_name,
            v_job.payload,
            'complete',
            v_job.start_after,
            v_job.created_at,
            NOW()
        );
    ELSIF p_result = 'failed' THEN
        -- Fetch pause_between_retries_milliseconds from the config for the relevant queue
        SELECT pause_between_retries_milliseconds
        INTO v_pause_between_retries_ms 
        FROM "pgq_schema_placeholder".queue_config
        WHERE queue_name = v_job.queue_name;

        v_pause_between_retries_ms := COALESCE(v_pause_between_retries_ms, 60000);
        IF v_pause_between_retries_ms <= 0 THEN 
            RAISE EXCEPTION 'v_pause_between_retries_ms must be greater than zero';
        END IF;
        v_updated_start_after := NOW() + (v_pause_between_retries_ms * INTERVAL '1 millisecond');
        
        -- Update job to 'failed' and reduce retries by 1
        UPDATE "pgq_schema_placeholder".job_queue
        SET status_updated_at = NOW(), 
            status = 'failed',
            retries_remaining = retries_remaining - 1,
            start_after = v_updated_start_after
        WHERE job_id = p_job_id
        RETURNING * INTO v_updated_job;

        PERFORM "pgq_schema_placeholder".log_job_event(v_job.queue_name, p_job_id, 'release_job', jsonb_build_object('new_status', 'failed', 'from_result_type', p_result));

        -- Check if job was updated (exists)
        IF v_updated_job IS NULL THEN
            RAISE WARNING 'Job with ID % not found', p_job_id;
            RETURN;
        END IF;

        -- Check if retries_remaining is 0
        IF v_updated_job.retries_remaining <= 0 THEN
            -- Delete from job_queue
            DELETE FROM "pgq_schema_placeholder".job_queue WHERE job_id = p_job_id;

            -- Insert into job_queue_failed_forever
            INSERT INTO "pgq_schema_placeholder".job_queue_failed_forever (
                original_job_id,
                queue_name,
                payload,
                status,
                start_after,
                created_at,
                status_updated_at
            ) VALUES (
                v_updated_job.job_id,
                v_updated_job.queue_name,
                v_updated_job.payload,
                'failed',
                v_updated_job.start_after,
                v_updated_job.created_at,
                NOW()
            );
        END IF;
    ELSIF p_result = 'paused' THEN
        -- Likely to occur if its being handled in a short-lived environment (e.g. http call) and needs to hand it back before a time out 
        UPDATE "pgq_schema_placeholder".job_queue
        SET status_updated_at = NOW(), 
            status = ''
        WHERE job_id = p_job_id
        RETURNING * INTO v_updated_job;

        PERFORM "pgq_schema_placeholder".log_job_event(v_job.queue_name, p_job_id, 'release_job', jsonb_build_object('new_status', '', 'from_result_type', p_result));

        -- Check if job was updated (exists)
        IF v_updated_job IS NULL THEN
            RAISE WARNING 'Job with ID % not found', p_job_id;
            RETURN;
        END IF;
    ELSE 
        RAISE EXCEPTION 'Invalid value for p_result: %', p_result;
    END IF;

END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".log_job_event(
    p_queue_name TEXT,
    p_job_id INTEGER,
    event_name TEXT,
    details JSONB DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE
    v_current_status "pgq_schema_placeholder".job_status_type;
BEGIN
    -- Retrieve the current status of the specified job
    SELECT status INTO v_current_status
    FROM "pgq_schema_placeholder".job_queue
    WHERE job_id = p_job_id;

    -- Insert the event log into the log table
    INSERT INTO "pgq_schema_placeholder".job_queue_event_log (
        queue_name,
        job_id,
        current_status,
        event_name,
        details,
        created_at
    ) VALUES (
        p_queue_name,
        p_job_id,
        v_current_status,
        event_name,
        details,
        NOW()
    );
END;
$$ LANGUAGE plpgsql;





-- ##############
-- UTILITIES

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".get_unavailable_queues_due_to_max_concurrency(
    p_queue_name TEXT,
    p_allowed_queue_names TEXT[]
) 
RETURNS TEXT[]
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE
    v_unavailable_queue_names TEXT[];
BEGIN
    SELECT array_agg(qc.queue_name)
    INTO v_unavailable_queue_names
    FROM "pgq_schema_placeholder".queue_config qc
    WHERE
        (p_queue_name IS NULL OR qc.queue_name = p_queue_name) AND 
        (p_allowed_queue_names IS NULL OR qc.queue_name = ANY(p_allowed_queue_names)) AND 
        (qc.max_concurrency > -1 AND qc.max_concurrency <= (
            SELECT COUNT(*)
            FROM "pgq_schema_placeholder".job_queue jq
            WHERE jq.queue_name = qc.queue_name AND jq.status = 'processing'
        ));
    
    RETURN v_unavailable_queue_names;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_queue_available_wrt_max_concurrency(
    p_test_queue_name TEXT
) 
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
DECLARE
    v_unavailable_queue_names TEXT[];
BEGIN
    -- Call to get_unavailable_queues_due_to_max_concurrency without p_allowed_queue_names, which is optional and defaulted to NULL.
    v_unavailable_queue_names := "pgq_schema_placeholder".get_unavailable_queues_due_to_max_concurrency(p_test_queue_name, NULL);
    
    -- Check if p_test_queue_name is in the list of unavailable queues.
    RETURN NOT p_test_queue_name = ANY(v_unavailable_queue_names);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_queue_inactive(
    p_queue_name TEXT,
    p_inactive_duration INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN 
        -- Ensure the queue_config entry is older than the specified duration.
        (SELECT NOT EXISTS (
            SELECT 1
            FROM "pgq_schema_placeholder".queue_config qc
            WHERE 
                qc.queue_name = p_queue_name
                AND qc.created_at >= NOW() - p_inactive_duration
        ))
        AND
        -- Ensure no job has been created or updated in job_queue during the specified duration.
        (SELECT NOT EXISTS (
            SELECT 1 
            FROM "pgq_schema_placeholder".job_queue jq
            WHERE 
                jq.queue_name = p_queue_name 
                AND jq.status_updated_at >= NOW() - p_inactive_duration
        ))
        AND
        -- Ensure there are no items for that queue_name in job_queue_completed during the specified duration.
        (SELECT NOT EXISTS (
            SELECT 1
            FROM "pgq_schema_placeholder".job_queue_completed jqc
            WHERE 
                jqc.queue_name = p_queue_name
                AND jqc.status_updated_at >= NOW() - p_inactive_duration -- [Note: No 'completed_at' column found in the initial definition]
        ))
        AND
        -- Ensure there are no items for that queue_name in job_queue_failed_forever during the specified duration.
        (SELECT NOT EXISTS (
            SELECT 1
            FROM "pgq_schema_placeholder".job_queue_failed_forever jqf
            WHERE 
                jqf.queue_name = p_queue_name
                AND jqf.status_updated_at >= NOW() - p_inactive_duration -- [Note: No 'completed_at' column found in the initial definition]
        ));
END;
$$;




-- ##############
-- CLEAN UP (e.g. CRON)


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".check_and_release_timed_out_jobs()
RETURNS VOID 
SECURITY DEFINER
LANGUAGE plpgsql 
AS $$
DECLARE
    v_record RECORD;
    v_default_timeout_milliseconds INT := 30000; -- default timeout (if not provided in queue_config)
    v_default_timeout_with_result "pgq_schema_placeholder".job_result_type := 'failed';
BEGIN
    FOR v_record IN (
        SELECT 
            jq.queue_name,
            jq.job_id,
            jq.status_updated_at,
            jq.last_keep_alive_at,
            COALESCE(
                jq.custom_timeout_with_result,  -- First priority: job_queue custom timeout status
                qc.timeout_with_result,          -- Second priority: queue_config timeout status
                v_default_timeout_with_result    -- Third priority: inbuilt (in case no queue_config)
            ) AS result_type,
            CASE
                WHEN jq.custom_timeout_with_result IS NOT NULL THEN 'custom_timeout_with_result'
                WHEN qc.timeout_with_result IS NOT NULL THEN 'timeout_with_result'
                ELSE 'default'
            END AS result_type_source,
            CASE
                WHEN jq.custom_timeout_milliseconds IS NOT NULL THEN 'custom_timeout_milliseconds'
                WHEN qc.timeout_milliseconds IS NOT NULL THEN 'timeout_milliseconds'
                ELSE 'default'
            END AS timeout_period_source,
            (COALESCE(jq.custom_timeout_milliseconds, qc.timeout_milliseconds, v_default_timeout_milliseconds) * interval '1 millisecond') AS timeout_period
        FROM 
            "pgq_schema_placeholder".job_queue jq
        LEFT JOIN -- Using LEFT JOIN to still select rows when no matching queue_config entry exists
            "pgq_schema_placeholder".queue_config qc ON jq.queue_name = qc.queue_name
        WHERE 
            jq.status = 'processing' 
            AND (jq.status_updated_at + (COALESCE(jq.custom_timeout_milliseconds, qc.timeout_milliseconds, v_default_timeout_milliseconds) * interval '1 millisecond')) < NOW()
            AND (jq.last_keep_alive_at + (COALESCE(jq.custom_timeout_milliseconds, qc.timeout_milliseconds, v_default_timeout_milliseconds) * interval '1 millisecond')) < NOW()
    )
    LOOP
        PERFORM "pgq_schema_placeholder".log_job_event(
            v_record.queue_name,
            v_record.job_id, 
            'timeout', 
            jsonb_build_object(
                'result_type', v_record.result_type, 
                'result_type_source', v_record.result_type_source,
                'timeout_period', v_record.timeout_period,
                'timeout_period_source', v_record.timeout_period_source,
                'status_updated_at', v_record.status_updated_at,
                'last_keep_alive_at', v_record.last_keep_alive_at
            )
        );
        --RAISE NOTICE 'Releasing timed out job with result type %', v_record.result_type;
        PERFORM "pgq_schema_placeholder".release_job(v_record.job_id, v_record.result_type);
    END LOOP;
END;
$$;



-- queue_config can slow down max_concurrency checks when picking jobs, so periodically remove unusued ones
CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".cleanup_unused_queues(
    inactive_duration INTERVAL
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM "pgq_schema_placeholder".queue_config qc
    WHERE "pgq_schema_placeholder".is_queue_inactive(qc.queue_name, inactive_duration);
END;
$$;

CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".cleanup_expired_temporary_keys_for_api_access()
RETURNS VOID 
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM "pgq_schema_placeholder".temporary_keys_for_api_access 
    WHERE created_at <= NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;



