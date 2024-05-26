--


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".test_dispatcher_basic()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN


    IF "pgq_schema_placeholder".is_dispatcher_available() = true THEN
        -- ############
        -- CHECK THE CRON LOOPS AS EXPECTED 

        --SELECT diag("pgq_schema_placeholder".testhelper_rows_to_text($q$ select "pgq_schema_placeholder".dispatcher_pick_next_job_by_cron(1, 0.1, 1) $q$, 'rows'));
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ 
                    SELECT EXISTS (
                        SELECT 1 
                        WHERE (select "pgq_schema_placeholder".dispatcher_pick_next_job_by_cron(0.5, 0.1, 1)) BETWEEN 4 AND 6
                        ) AS condition_result;
                $q$,
                $q$ VALUES (TRUE) $q$,
                'dispatcher_pick_next_job_by_cron should have a loop count in a range'
            );


        -- ############
        -- CREATE A CALL BACK TO US 

        -- Give it somewhere to call
        CREATE TABLE public.test_job_queue_callback_result (
            id bigserial PRIMARY KEY,
            note TEXT NOT NULL
        );
        create or replace function public.test_job_queue_callback()
        returns text 
        LANGUAGE plpgsql 
        as $q$
        BEGIN
            RAISE NOTICE 'Reached US OH YEAH!';
            -- TODO Do it again for a POST and track params
            INSERT INTO test_job_queue_callback_result (note) VALUES ('received');

            RETURN 'the_result';
        END;
        $q$;
        GRANT EXECUTE ON FUNCTION public.test_job_queue_callback TO PUBLIC;
        GRANT EXECUTE ON FUNCTION public.test_job_queue_callback TO anon;

        -- Update the queue config to point at it  
        PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_pgnw_a', 10, 30000, 5000, 'failed', TRUE, 'POST', '', 'http://host.docker.internal:54321/rest/v1/test_job_queue_callback', 2000) $q$,
            'update_queue_config runs ok 3'
        );

        -- Add a job on that queue
        PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ SELECT "pgq_schema_placeholder".add_job('randomq_pgnw_a', '{"hello":"world"}') $q$,
            'add_job runs without error for randomq_pgnw_a'
        );

        -- Let the cron run on it 
        PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ select "pgq_schema_placeholder".dispatcher_pick_next_job_by_cron(0.2, 0.5, 0.5) $q$, 
            'dispatcher_pick_next_job_by_cron runs without error for randomq_pgnw_a'
        );

        -- Check it's processing the job 
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_pgnw_a' AND status = 'processing' $q$,
                $q$ VALUES (1::BIGINT) $q$,
                'The randomq_pgnw_a job should be marked as processing'
            );

        -- Check it's tracking the request 
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".dispatcher_current_jobs a INNER JOIN "pgq_schema_placeholder".job_queue b ON a.job_id = b.job_id  WHERE b.queue_name = 'randomq_pgnw_a' AND b.status = 'processing' $q$,
                $q$ VALUES (1::BIGINT) $q$,
                'The randomq_pgnw_a job should have created a current_job with a request'
            );

        SELECT pg_sleep(8); -- Just give it room to complete the call

        --SELECT diag("pgq_schema_placeholder".testhelper_rows_to_text($q$ SELECT * FROM net._http_collect_response $q$, 'net._http_collect_response'));
        SELECT diag("pgq_schema_placeholder".testhelper_rows_to_text($q$ SELECT * FROM net.http_request_queue $q$, 'net.http_request_queue'));
        SELECT diag("pgq_schema_placeholder".testhelper_rows_to_text($q$ SELECT * FROM net._http_response $q$, 'net._http_response'));


        -- Retrieve the http response
        PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ select "pgq_schema_placeholder".dispatcher_process_current_jobs() $q$,
            'dispatcher_process_current_jobs runs without error for randomq_pgnw_a'
        );

        -- Check current processing jobs are cleared out (complete or failed)
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_pgnw_a' AND status = 'processing' $q$,
                $q$ VALUES (0::BIGINT) $q$,
                'The randomq_pgnw_a job should no longer be processing '
            );

        -- Check the request tracking is cleared out (complete or failed)
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".dispatcher_current_jobs $q$,
                $q$ VALUES (0::BIGINT) $q$,
                'The randomq_pgnw_a job should cleared the worker '
            );

        -- Check it was complete (not failed)
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_completed WHERE queue_name = 'randomq_pgnw_a' $q$,
                $q$ VALUES (1::BIGINT) $q$,
                'The randomq_pgnw_a job should be complete'
            );


        -- $q$ SELECT "pgq_schema_placeholder".dispatcher_update_queue_config('randomq_pgnw_a', 'GET', '', 'https://postman-echo.com/get') $q$,
        -- $q$ SELECT "pgq_schema_placeholder".dispatcher_update_queue_config('randomq_pgnw_a', 'POST', '', 'host.docker.internal:54321/rest/v1/test_job_queue_callback') $q$,
        -- Verify it was received
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select COUNT(*) as c FROM public.test_job_queue_callback_result $q$,
                $q$ VALUES (1::BIGINT) $q$,
                'The randomq_pgnw_a shoudl reach the callback '
            );


        -- ############
        -- CREATE A CALL BACK TO A BAD DESTINATION 
    END IF;

    RETURN true;

    
END;
$$;





