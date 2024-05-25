--


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".test_jobs_basic()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN


    -- ############
    -- ADD JOB

    -- Test adding a job queue without any queue config
    INSERT INTO "pgq_schema_placeholder".job_queue (
            queue_name, 
            payload, 
            status, 
            retries_remaining, 
            start_after
        ) VALUES (
            'randomq_a',
            '{"opinion":"x"}',
            '',
            1,
            NOW()
        );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name from "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_a' $q$,
            $q$ VALUES('randomq_a') $q$,
            'Row was added'
        );


    
    -- Test the add_job function fails with NULLs 
    PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_b', '{"opinion":"x"}', NULL) $q$,
        '',
        'function throw an error with NULL values'
    );

    -- Test the add_job function works
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_b', '{"opinion":"x"}') $q$,
        'function runs without error'
    );


    -- Verify the add_job actually added something 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select retries_remaining from "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' $q$,
            $q$ VALUES(10) $q$,
            'Row for randomq_b was added with right default'
        );

    -- Check the start_after is valid 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select retries_remaining from "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND start_after <= NOW() $q$,
            $q$ VALUES(10) $q$,
            'Row for randomq_b was added with right start after'
        );


    -- ############
    -- PICK JOB 

    -- Try picking a job
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_b', NULL, FALSE) $q$,
            $q$ VALUES('randomq_b') $q$,
            'pick_next_job runs ok'
        );

    -- Check the picked job is marked as processing 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The item should be marked as processing'
        );

    -- Verify that picking the job again, on a now empty queue, fails 
    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_b', NULL) $q$,
            'pick_next_job should be empty for this queue on the second call, as its already assigned'
        );

    -- ############
    -- PICK JOB: CHECK MULTIPLE JOBS ONLY RETURNS 1

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_multi_1', '{"item":1}') $q$,
        'add_job runs without error for randomq_multi_1 1'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_multi_1', '{"item":2}') $q$,
        'add_job runs without error for randomq_multi_1 2'
    );

    -- Try picking a job
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_multi_1', NULL, FALSE) $q$,
            $q$ VALUES('randomq_multi_1') $q$,
            'pick_next_job runs ok for randomq_multi_1 (it should be only 1 row)'
        );

    -- ############
    -- PICK JOB: SUPPORT MULTIPLE QUEUE CHECKING

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_multi_2', '{"item":1}') $q$,
        'add_job runs without error for randomq_multi_2 1'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_multi_3', '{"item":1}') $q$,
        'add_job runs without error for randomq_multi_3 2'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_multi_4', '{"item":1}') $q$,
        'add_job runs without error for randomq_multi_4 2'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job(NULL, ARRAY['randomq_multi_2', 'randomq_multi_3']::TEXT[]) $q$,
            $q$ VALUES('randomq_multi_2') $q$,
            'pick_next_job runs ok for randomq_multi_2 '
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job(NULL, ARRAY['randomq_multi_2', 'randomq_multi_3']::TEXT[]) $q$,
            $q$ VALUES('randomq_multi_3') $q$,
            'pick_next_job runs ok for randomq_multi_3'
        );

    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job(NULL, ARRAY['randomq_multi_2', 'randomq_multi_3']::TEXT[]) $q$,
            'pick_next_job should not return randomq_multi_4'
        );

    -- ############
    -- RELEASE JOB 

    -- Check an unknown outcome on release_job fails
    PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
        $q$ SELECT "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing'), 'nonsense') $q$,
        NULL,
        'function should throw with an unknown result '
    );

    -- Check that release_job, with an unknown ID, silently fails
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".release_job(-1, 'complete') $q$,
        'release_job should work but do nothing with an unknown ID'
    );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'release_job should not change anything'
        );

    -- Check release_job works - mark failure 
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing'), 'failed') $q$,
        'release_job should succeed'
    );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing' $q$,
            $q$ VALUES (0::BIGINT) $q$,
            'release_job should no longer be marked processing'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'failed' AND start_after > NOW() $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'release_job should be marked failed, with a start_after in the future'
        );

    -- Check it cannot be picked, due to the start_after being high after failure
    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_b') $q$,
            'pick_next_job should be empty for this queue, as due to failure its set to start_after the future'
        );

    -- Reset the start_after
    UPDATE "pgq_schema_placeholder".job_queue SET start_after = NOW() WHERE queue_name = 'randomq_b';

    -- Check a job marked 'failed' can be picked 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_b') $q$,
            $q$ VALUES('randomq_b') $q$,
            'pick_next_job runs ok'
        );

    -- Release it again, but this time as complete 
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing'), 'complete') $q$,
        'release_job should succeed with complete'
    );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' AND status = 'processing' $q$,
            $q$ VALUES (0::BIGINT) $q$,
            'release_job should no longer be marked processing now its complete'
        );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_b' $q$,
            $q$ VALUES (0::BIGINT) $q$,
            'release_job should no longer have anything in the queue as its complete'
        );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_completed WHERE queue_name = 'randomq_b' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'release_job has successfully moved it to the complete table'
        );



    -- ############
    -- TEST FAILURE TIMES OUT 

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_c', '{"opinion":"x"}', 2) $q$,
        'add_job runs without error with retries'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_c') $q$,
            $q$ VALUES('randomq_c') $q$,
            'pick_next_job runs ok for randomq_c'
        );


    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_c' AND status = 'processing'), 'failed') $q$,
        'release_job should succeed for randomq_c'
    );

    UPDATE "pgq_schema_placeholder".job_queue SET start_after = NOW() WHERE queue_name = 'randomq_c';

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_c') $q$,
            $q$ VALUES('randomq_c') $q$,
            'pick_next_job runs ok for randomq_c 2'
        );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_c' AND status = 'processing'), 'failed') $q$,
        'release_job should succeed for randomq_c 2'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_c' $q$,
            $q$ VALUES (0::BIGINT) $q$,
            'release_job should no longer have anything in the queue as its failed for randomq_c'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_failed_forever WHERE queue_name = 'randomq_c' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'release_job should move it to the failed table'
        );


    -- ############
    -- PICK JOB WITH p_allowed_queue_names 

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_d', '{"opinion":"x"}') $q$,
        'add_job runs without error for randomq_d'
    );

    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_d', ARRAY['randomq_b']) $q$,
            'pick_next_job should be empty for this queue as p_allowed_queue_names denies it'
        );


    PERFORM "pgq_schema_placeholder".testhelper_isnt_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_d', ARRAY['randomq_d']) $q$,
            'pick_next_job should work, as queue is allowed'
        );



    -- ############
    -- JOB TIME OUT

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_timeout_a', '{"opinion":"x"}') $q$,
        'function runs without error for randomq_timeout_a'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_timeout_a') $q$,
            $q$ VALUES('randomq_timeout_a') $q$,
            'pick_next_job runs ok for randomq_timeout_a'
        );


    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_timeout_a' AND status = 'processing' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The randomq_timeout_a item should be marked as processing'
        );

    UPDATE "pgq_schema_placeholder".job_queue SET status_updated_at = now() - INTERVAL '5 minutes', last_keep_alive_at = now() - INTERVAL '5 minutes' WHERE queue_name = 'randomq_timeout_a';

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".check_and_release_timed_out_jobs() $q$,
        'function runs without error for randomq_timeout_a1'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_timeout_a' AND status = 'processing' $q$,
            $q$ VALUES (0::BIGINT) $q$,
            'The randomq_timeout_a item should not be marked as processing'
        );



    -- ############
    -- JOB TIME OUT: QUEUE CONFIG SET TO PAUSED 

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('rj_paused', 2, 30000, 5000, 'paused', FALSE, NULL, NULL, NULL, NULL) $q$,
        'update_queue_config runs ok for rj_paused'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".queue_config WHERE queue_name = 'rj_paused' AND timeout_with_result = 'paused' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused queue_config should be marked to timeout with paused'
        );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('rj_paused', '{"opinion":"x"}', 2) $q$,
        'add_job runs for rj_paused'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('rj_paused') $q$,
            $q$ VALUES('rj_paused') $q$,
            'pick_next_job runs ok for rj_paused'
        );

    UPDATE "pgq_schema_placeholder".job_queue SET status_updated_at = now() - INTERVAL '5 minutes', last_keep_alive_at = now() - INTERVAL '5 minutes' WHERE queue_name = 'rj_paused';

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".check_and_release_timed_out_jobs() $q$,
        'function runs without error for rj_paused'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused' AND details->>'result_type_source' = 'timeout_with_result' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_a job_queue_event_log should have timeout_with_result'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused' AND  details->>'from_result_type' = 'paused' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused job_queue_event_log should have paused'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'rj_paused' AND status = '' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused item should be ready to go again'
        );


    -- ############
    -- JOB TIME OUT: JOB SET TO PAUSED 

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('rj_paused_a', 2, 30000, 5000, 'failed', FALSE, NULL, NULL, NULL, NULL) $q$,
        'update_queue_config runs ok for rj_paused_a'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".queue_config WHERE queue_name = 'rj_paused_a' AND timeout_with_result = 'failed' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_a queue_config should be marked to timeout with failed'
        );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('rj_paused_a', '{"opinion":"x"}', 2, NOW(), NULL, 'paused') $q$,
        'add_job runs for rj_paused_a'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('rj_paused_a') $q$,
            $q$ VALUES('rj_paused_a') $q$,
            'pick_next_job runs ok for rj_paused_a'
        );

    UPDATE "pgq_schema_placeholder".job_queue SET status_updated_at = now() - INTERVAL '5 minutes', last_keep_alive_at = now() - INTERVAL '5 minutes' WHERE queue_name = 'rj_paused_a';

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".check_and_release_timed_out_jobs() $q$,
        'function runs without error for rj_paused_a'
    );


    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_a' AND details->>'timeout_period_source' = 'timeout_milliseconds' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_a job_queue_event_log should have timeout_period_source of timeout_milliseconds'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_a' AND details->>'result_type_source' = 'custom_timeout_with_result' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_a job_queue_event_log should have custom_timeout_with_result'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_a' AND details->>'from_result_type' = 'paused' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_a job_queue_event_log should have paused'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'rj_paused_a' AND status = '' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_a item should be ready to go again'
        );



    -- ############
    -- JOB TIME OUT: JOB BASED TIMEOUT PERIOD

    -- Set the queue timeout to very far in the future, so it can't trigger
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('rj_paused_b', 2, 100000, 100000, 'paused', FALSE, NULL, NULL, NULL, NULL) $q$,
        'update_queue_config runs ok for rj_paused_b'
    );


    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('rj_paused_b', '{"opinion":"x"}', 2, NOW(), 4999) $q$,
        'add_job runs for rj_paused_b'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('rj_paused_b') $q$,
            $q$ VALUES('rj_paused_b') $q$,
            'pick_next_job runs ok for rj_paused_b'
        );

    UPDATE "pgq_schema_placeholder".job_queue SET status_updated_at = now() - INTERVAL '5 minutes', last_keep_alive_at = now() - INTERVAL '5 minutes' WHERE queue_name = 'rj_paused_b';

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".check_and_release_timed_out_jobs() $q$,
        'function runs without error for rj_paused_b'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_b' AND event_name = 'timeout' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_b job_queue_event_log should 1 in it'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_b' AND details->>'result_type_source' = 'timeout_with_result' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_b job_queue_event_log should have timeout_with_result'
        );


    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_b' AND details->>'timeout_period_source' = 'custom_timeout_milliseconds' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_b job_queue_event_log should have timeout_period_source of custom_timeout_milliseconds'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_b' AND details->>'from_result_type' = 'paused' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_b job_queue_event_log should have paused'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'rj_paused_b' AND status = '' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_b item should be ready to go again'
        );


    -- ############
    -- JOB TIME OUT: TIMEOUT PERIOD BUT KEEPS ALIVE

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('rj_paused_c', 2, 5000, 5000, 'paused', FALSE, NULL, NULL, NULL, NULL) $q$,
        'update_queue_config runs ok for rj_paused_c'
    );


    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('rj_paused_c', '{"opinion":"x"}', 2) $q$,
        'add_job runs for rj_paused_c'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('rj_paused_c') $q$,
            $q$ VALUES('rj_paused_c') $q$,
            'pick_next_job runs ok for rj_paused_c'
        );

    UPDATE "pgq_schema_placeholder".job_queue SET status_updated_at = now() - INTERVAL '5 minutes', last_keep_alive_at = now() - INTERVAL '5 minutes' WHERE queue_name = 'rj_paused_c';

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".keep_job_alive( (SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'rj_paused_c' LIMIT 1)) $q$,
        'keep alive function runs without error for rj_paused_c'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".check_and_release_timed_out_jobs() $q$,
        'function runs without error for rj_paused_c'
    );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue_event_log WHERE queue_name = 'rj_paused_c' AND event_name = 'timeout' $q$,
            $q$ VALUES (0::BIGINT) $q$,
            'The rj_paused_c job_queue_event_log should nothing in it'
        );


    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'rj_paused_c' AND status = 'processing' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'The rj_paused_c should still be processing'
        );


        RETURN true;
END;
$$;


