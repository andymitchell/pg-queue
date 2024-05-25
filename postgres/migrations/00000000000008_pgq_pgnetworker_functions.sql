-- This is #ENVSPECIFIC_INSTALL

-- This picks jobs and calls a remote http end point (e.g. an Edge function)
--
--
-- # ALT ENVIRONMENTS
-- pg_cron
--  Might be better to use native LISTEN / NOTIFY
-- pg_net
--  If not available, it must use something else that's capable of asynchronous requests (pgsql-http is not), otherwise a (most likely) long running http function will clog connections.
--  Or, use something like pgsql-http (or AWS Postgres Lambda caller) to a http function, but have that http function return immediately after asynchonously calling another function, which in turn calls back to "pgq_schema_placeholder".release_job. 
--      You wouldn't use pgnetworker_process_current_jobs_by_cron in that situation, relying instead on the eventual http function calling back to "pgq_schema_placeholder".release_job. 
-- Providing bearer tokens
--  Currently its set up for Supabase, locked to the SERVICE_TOKEN for heightened power/gate-keeping in the http callbacks. 
--  Any other could be added, just give it a technique name in pgnet_queue_name_end_point and pgnet_execute


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_pgnetworker_available()
RETURNS BOOLEAN
LANGUAGE plpgsql 
AS $$
BEGIN

    RETURN "pgq_schema_placeholder".has_function('pgnetworker_set_cron_schedule');

END;
$$;


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".envspecific_install_pgnetworker_functions()  
RETURNS VOID
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
BEGIN
    IF "pgq_schema_placeholder".is_extension_known('pg_net') = true AND "pgq_schema_placeholder".is_extension_known('pg_cron') = true THEN
        create extension if not exists pg_net;
        create extension if not exists pg_cron with schema extensions;


        -- ####################
        -- CONFIGURATION



        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_set_cron_schedule(
            p_picker_interval_seconds INTEGER DEFAULT 10,
            p_picker_sleep_if_empty_seconds DOUBLE PRECISION DEFAULT 0.5,
            p_picker_sleep_if_jobs_seconds DOUBLE PRECISION DEFAULT 0,
            p_currentchecker_interval_seconds INTEGER DEFAULT 10,
            p_currentchecker_sleep_seconds DOUBLE PRECISION DEFAULT 1,
            p_cleanup_unused_queues_interval_hours INTEGER DEFAULT 24,
            p_cleanup_unused_queues_inactive_duration INTERVAL DEFAULT '48 hours'
        )
        RETURNS VOID 
        LANGUAGE plpgsql 
        AS $i$
        BEGIN
            IF p_picker_interval_seconds <= 0 OR p_currentchecker_interval_seconds <= 0 OR p_cleanup_unused_queues_interval_hours <= 0 THEN
                RAISE EXCEPTION 'Interval values must be greater than 0';
            END IF;
            IF p_picker_interval_seconds > 60 OR p_currentchecker_interval_seconds > 60 THEN
                RAISE EXCEPTION 'Interval values should not need to be more than 1 minute. It increases the risk of dead time before restart, if the process fails.';
            END IF;


            PERFORM cron.schedule(
                'pgnetworker_pick_next_job_by_cron_',
                p_picker_interval_seconds || ' seconds',
                FORMAT('SELECT "pgq_schema_placeholder".pgnetworker_pick_next_job_by_cron(%L, %L, %L);', 
                    p_picker_interval_seconds, p_picker_sleep_if_empty_seconds, p_picker_sleep_if_jobs_seconds)
            );

            PERFORM cron.schedule(
                'pgnetworker_process_current_jobs_by_cron_',
                p_currentchecker_interval_seconds || ' seconds',
                FORMAT('SELECT "pgq_schema_placeholder".pgnetworker_process_current_jobs_by_cron(%L, %L);', 
                    p_currentchecker_interval_seconds, p_currentchecker_sleep_seconds)
            );

            PERFORM cron.schedule(
                'pgnetworker_cleanup_unused_queues_',
                p_cleanup_unused_queues_interval_hours || ' hours',
                FORMAT('SELECT "pgq_schema_placeholder".pgnetworker_cleanup_unused_queues(%L);', 
                    p_cleanup_unused_queues_inactive_duration)
            );

            
            
        END;
        $i$;

        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_cancel_cron()
        RETURNS VOID 
        LANGUAGE plpgsql 
        AS $i$
        BEGIN
            SELECT cron.unschedule(
                'pgnetworker_pick_next_job_by_cron_'
            );

            SELECT cron.unschedule(
                'pgnetworker_process_current_jobs_by_cron_'
            );

            SELECT cron.unschedule(
                'pgnetworker_cleanup_unused_queues_'
            );

            
            
        END;
        $i$;




        -- ####################
        -- START A CONSUMER PROCESS





        -- A routine CRON that tries to pick jobs for the duration of the minimum CRON scheduled window (i.e. 1 minute)
        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_pick_next_job_by_cron(
            p_loop_seconds DOUBLE PRECISION DEFAULT 60,
            p_sleep_if_empty DOUBLE PRECISION DEFAULT 0.5,
            p_sleep_if_jobs DOUBLE PRECISION DEFAULT 0
        ) 
        RETURNS INTEGER 
        SECURITY DEFINER
        SET search_path = "pgq_schema_placeholder", extensions, net, vault
        AS $i$
        DECLARE
            r "pgq_schema_placeholder".job_queue;
            v_loop_count INTEGER := 0;
            v_start_time TIMESTAMP;
            v_end_time TIMESTAMP;
            v_max_concurrency_enabled_count INT;
            v_ignore_max_concurrency BOOLEAN;
            v_allowed_queue_names TEXT[];
            v_queue_names_that_manual_release TEXT[];
        BEGIN
            v_start_time := clock_timestamp();
            v_end_time := v_start_time + (p_loop_seconds * interval '1 second');

            -- Only pick jobs for queues that we're allowed to run 
            SELECT array_agg(queue_name) 
            INTO v_allowed_queue_names 
            FROM "pgq_schema_placeholder".queue_config
            WHERE endpoint_active = TRUE;

            -- Know which queues will manual release
            SELECT array_agg(queue_name) 
            INTO v_queue_names_that_manual_release 
            FROM "pgq_schema_placeholder".queue_config
            WHERE endpoint_active = TRUE AND endpoint_manual_release = TRUE;

            -- See if concurrency checks are disabled
            SELECT COUNT(*) 
            INTO v_max_concurrency_enabled_count 
            FROM "pgq_schema_placeholder".queue_config 
            WHERE max_concurrency > -1 AND queue_name = ANY(v_allowed_queue_names);

            IF v_max_concurrency_enabled_count = 0 THEN
                v_ignore_max_concurrency := TRUE;
            END IF;
            
            WHILE clock_timestamp() < v_end_time LOOP
                -- FYI Want to do something every X loops? IF v_loop_count % 10 = 0 THEN
                v_loop_count := v_loop_count + 1;
                

                r := "pgq_schema_placeholder".pick_next_job(NULL, v_allowed_queue_names, v_ignore_max_concurrency);
                
                IF r IS NULL THEN
                    RAISE NOTICE 'No job was found.';

                    -- No need to chew up CPU scanning an empty table (especially with the max_concurrency checks). 
                    -- Be aware though it might not be empty, it might just be that concurrent tasks have filled all the slots. 
                    -- It also represents a possible time tax on all added jobs in a sparse queue
                    IF p_sleep_if_jobs > 0 THEN 
                        PERFORM pg_sleep(p_sleep_if_empty);
                    ELSE
                        RAISE NOTICE 'It is not recommended to set p_sleep_if_empty to 0.';
                    END IF;
                ELSE
                    RAISE NOTICE 'Picked job with ID: %', r.job_id;

                    PERFORM "pgq_schema_placeholder".pgnetworker_execute(
                        p_queue_name => r.queue_name,
                        p_job_id => r.job_id,
                        p_payload => r.payload,
                        p_manual_release => COALESCE((r.queue_name = ANY(v_queue_names_that_manual_release))::BOOLEAN, FALSE)
                    );

                    -- Go quick onto the next until the queue is cleared (or at least every concurrency slot is filled). 
                    IF p_sleep_if_jobs > 0 THEN 
                        PERFORM pg_sleep(p_sleep_if_jobs);
                    END IF;
                END IF;

            END LOOP;

            RETURN v_loop_count;

        END;
        $i$ LANGUAGE plpgsql;






        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_execute(
            p_queue_name TEXT,
            p_job_id INT,
            p_payload JSONB,
            p_manual_release BOOLEAN
        ) 
        RETURNS VOID 
        SECURITY DEFINER
        SET search_path = "pgq_schema_placeholder", extensions, net, vault
        AS $i$
        DECLARE
            v_request_id INT;
            v_api_key TEXT;
            v_http_verb "pgq_schema_placeholder".endpoint_method; 
            v_bearer_token_location "pgq_schema_placeholder".endpoint_bearer_token_location_type;
            v_end_point_url TEXT;
            v_headers JSONB; 
            v_body JSONB;
            v_timeout INT;
        BEGIN
            RAISE NOTICE 'pgnetworker executing job_id %', p_job_id;
            
            -- Retrieve the details for this queue 
            SELECT endpoint_method, endpoint_bearer_token_location, endpoint_url, endpoint_timeout_milliseconds
            INTO v_http_verb, v_bearer_token_location, v_end_point_url, v_timeout
            FROM "pgq_schema_placeholder".queue_config
            WHERE queue_name = p_queue_name;

            -- Get the API key
            v_api_key := "pgq_schema_placeholder".get_queue_endpoint_api_key(p_queue);
            
            IF v_api_key = '' THEN
                v_headers := jsonb_build_object('Content-Type', 'application/json');
            ELSE
                v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_api_key, 'Content-Type', 'application/json');
            END IF;

            v_body := COALESCE(p_payload::jsonb, '{}'::jsonb);
            v_body := jsonb_build_object(
                'data', COALESCE(p_payload, '{}'::jsonb),
                'job_id', p_job_id,
                'queue_name', p_queue_name
            );


            RAISE NOTICE '% request to %, with a timeout of %', v_http_verb, v_end_point_url, v_timeout;

            IF v_http_verb = 'POST' THEN
                SELECT net.http_post(
                    url:=v_end_point_url,
                    body:=v_body,
                    headers:=v_headers,
                    timeout_milliseconds:=v_timeout
                ) INTO v_request_id;
            ELSIF v_http_verb = 'GET' THEN
                SELECT net.http_get(
                    url:=v_end_point_url,
                    params:=jsonb_build_object('body', jsonb_pretty(v_body)), -- Only accepts key/value pairs in the JSONB. The value will be URL encoded by pg_net. 
                    headers:=v_headers,
                    timeout_milliseconds:=v_timeout
                ) INTO v_request_id;
            ELSE
                RAISE EXCEPTION 'v_http_verb must be POST, or GET';
            END IF;

            INSERT INTO "pgq_schema_placeholder".pgnetworker_current_jobs (request_id, job_id, manual_release)
            VALUES (v_request_id, p_job_id, p_manual_release);

        END;
        $i$ LANGUAGE plpgsql;







        -- ####################
        -- RESPOND TO CONSUMER PROCESS RESULTS 

        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_process_current_jobs_by_cron(
            p_loop_seconds INTEGER DEFAULT 60,
            p_sleep DOUBLE PRECISION DEFAULT 1
        ) 
        RETURNS VOID 
        SECURITY DEFINER
        SET search_path = "pgq_schema_placeholder", extensions, net, vault
        AS $i$
        DECLARE
            v_loop_count INTEGER := 0;
            v_start_time TIMESTAMP;
            v_end_time TIMESTAMP;
        BEGIN
            v_start_time := clock_timestamp();
            v_end_time := v_start_time + (p_loop_seconds * interval '1 second');

            
            WHILE clock_timestamp() < v_end_time LOOP
                v_loop_count := v_loop_count + 1;
                
                PERFORM "pgq_schema_placeholder".pgnetworker_process_current_jobs();
                IF p_sleep > 0.05 THEN 
                    PERFORM pg_sleep(p_sleep);
                ELSE 
                    RAISE EXCEPTION 'Invalid p_sleep time. These are async network calls and do not need checking so hard.';
                END IF;
                
            END LOOP;

        END;
        $i$ LANGUAGE plpgsql;

        -- 
        -- Loop through records in current_jobs and get response from pg_net
        --
        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_process_current_jobs()
        RETURNS VOID 
        SECURITY DEFINER
        SET search_path = "pgq_schema_placeholder", extensions, net, vault
        AS $i$
        DECLARE
            current_job RECORD;
            v_response_result RECORD;
            
        BEGIN



            FOR current_job IN SELECT * FROM pgnetworker_current_jobs 
            FOR UPDATE SKIP LOCKED
            LOOP
                RAISE NOTICE 'Processing job_id: %, request_id: %', current_job.job_id, current_job.request_id;

                SELECT
                    status,
                    message,
                    (response).status_code AS status_code,
                    (response).body AS body
                INTO v_response_result
                FROM net._http_collect_response(current_job.request_id);

                IF v_response_result.status = 'SUCCESS' AND v_response_result.status_code BETWEEN 200 AND 299 THEN
                    RAISE NOTICE 'Job completed (job_id: %)', current_job.job_id;

                    IF current_job.manual_release = FALSE THEN
                        PERFORM "pgq_schema_placeholder".release_job(current_job.job_id, 'complete');
                    END IF;

                    DELETE FROM "pgq_schema_placeholder".pgnetworker_current_jobs
                    WHERE request_id = current_job.request_id;
                ELSIF v_response_result.status = 'ERROR' THEN
                    -- WARNING: Although the status column can be 'PENDING', 'SUCCESS', or 'ERROR', there is a bug that makes all 'PENDING' requests displayed as 'ERROR'. https://github.com/supabase/pg_net#requests-api 
                    -- WARNING: 'message' of 'request matching request_id not found' is also pending, because "request in progress is indistinguishable from request that doesn't exist" see https://github.com/supabase/pg_net/blob/master/sql/pg_net--0.2--0.3.sql
                    RAISE NOTICE 'Job failed (job_id: %. status_code: %.  message: %.)', current_job.job_id, v_response_result.status_code,  v_response_result.message;

                    IF current_job.manual_release = FALSE THEN
                        PERFORM "pgq_schema_placeholder".release_job(current_job.job_id, 'failed');
                    END IF;

                    DELETE FROM "pgq_schema_placeholder".pgnetworker_current_jobs
                    WHERE request_id = current_job.request_id;
                ELSE
                    RAISE NOTICE 'Job still in progress or not found (job_id: %)', current_job.job_id;
                END IF;
            END LOOP;
        END;
        $i$ LANGUAGE plpgsql;


        -- ####################
        -- CLEAN UP

        -- queue_config can slow down max_concurrency checks when picking jobs, so periodically remove unusued ones
        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_cleanup_unused_queues(
            inactive_duration INTERVAL
        )
        RETURNS VOID
        LANGUAGE plpgsql
        AS $i$
        BEGIN
            DELETE FROM "pgq_schema_placeholder".pgnetworker_queue_name_end_point qc
            WHERE qc.updated_at < NOW() - inactive_duration AND 
                "pgq_schema_placeholder".is_queue_inactive(qc.queue_name, inactive_duration);
        END;
        $i$;
        


        --pgnetworker_triggered_process_job_DEAD: Removed because the CRON _should_ be fast enough to run all jobs. And this was duplicating the logic required, which increases the chance of inconsistencies. E.g. this has forgotten to add checks for start_after. Consider bringing it back as a speed optimisation, but I'm unconvinced.
        --pgnetworker_triggered_process_job_DEAD:CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".pgnetworker_triggered_process_job() 
        --pgnetworker_triggered_process_job_DEAD:RETURNS TRIGGER
        --pgnetworker_triggered_process_job_DEAD:SECURITY DEFINER
        --pgnetworker_triggered_process_job_DEAD:SET search_path = "pgq_schema_placeholder", extensions, net, vault
        --pgnetworker_triggered_process_job_DEAD:AS $i$
        --pgnetworker_triggered_process_job_DEAD:DECLARE
        --pgnetworker_triggered_process_job_DEAD:    v_pgnetworker_queues_matching INTEGER;
        --pgnetworker_triggered_process_job_DEAD:BEGIN
        --pgnetworker_triggered_process_job_DEAD:    RAISE NOTICE 'Processing job_id: %', NEW.job_id;
        --pgnetworker_triggered_process_job_DEAD:    -- Check pgnetworker is allowed to run this queue
        --pgnetworker_triggered_process_job_DEAD:    SELECT COUNT(*) 
        --pgnetworker_triggered_process_job_DEAD:    INTO v_pgnetworker_queues_matching 
        --pgnetworker_triggered_process_job_DEAD:    FROM "pgq_schema_placeholder".pgnetworker_queue_name_end_point
        --pgnetworker_triggered_process_job_DEAD:    WHERE queue_name = NEW.queue_name;
        --pgnetworker_triggered_process_job_DEAD:
        --pgnetworker_triggered_process_job_DEAD:    -- Check the queue for this isn't at max concurrency 
        --pgnetworker_triggered_process_job_DEAD:    IF v_pgnetworker_queues_matching > 0 AND "pgq_schema_placeholder".is_queue_available_wrt_max_concurrency(NEW.queue_name) THEN
        --pgnetworker_triggered_process_job_DEAD:        -- I believe triggers fire before the insert is committed, so no need for SKIP LOCKED. Check? 
        --pgnetworker_triggered_process_job_DEAD:        UPDATE job_queue
        --pgnetworker_triggered_process_job_DEAD:        SET status = 'processing'
        --pgnetworker_triggered_process_job_DEAD:        WHERE job_id = NEW.job_id AND status = '';
        --pgnetworker_triggered_process_job_DEAD:        PERFORM "pgq_schema_placeholder".pgnetworker_execute(
        --pgnetworker_triggered_process_job_DEAD:                p_queue_name => NEW.queue_name,
        --pgnetworker_triggered_process_job_DEAD:                p_job_id => NEW.job_id,
        --pgnetworker_triggered_process_job_DEAD:                p_payload => NEW.payload
        --pgnetworker_triggered_process_job_DEAD:            );
        --pgnetworker_triggered_process_job_DEAD:    END IF;
        --pgnetworker_triggered_process_job_DEAD:    RETURN NEW;
        --pgnetworker_triggered_process_job_DEAD:END;
        --pgnetworker_triggered_process_job_DEAD:$i$ LANGUAGE plpgsql;
        --pgnetworker_triggered_process_job_DEAD:-- Adding the trigger to the queue table:
        --pgnetworker_triggered_process_job_DEAD:CREATE TRIGGER process_job_trigger
        --pgnetworker_triggered_process_job_DEAD:AFTER INSERT ON "pgq_schema_placeholder".job_queue
        --pgnetworker_triggered_process_job_DEAD:FOR EACH ROW
        --pgnetworker_triggered_process_job_DEAD:EXECUTE FUNCTION "pgq_schema_placeholder".pgnetworker_triggered_process_job();
        
    END IF;

END;
$$ LANGUAGE plpgsql;
