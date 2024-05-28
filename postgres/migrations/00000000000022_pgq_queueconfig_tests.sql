--


CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".test_queueconfig_basic()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN



    -- Can it add a queue_config
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_f', 2, 30000, 5000, 'failed', FALSE, NULL, NULL, NULL, NULL) $q$,
        'update_queue_config runs ok for randomq_f'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_f', 2, 30000, 5000, 'failed', TRUE) $q$,
        'update_queue_config should succeed for randomq_f with endpoint_active set TRUE, even with missing parameters, because it uses defaults'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_f', 2, 30000, 5000, 'failed', TRUE, 'GET', '',  'url', 3000, FALSE) $q$,
        'update_queue_config runs ok for randomq_f with endpoint'
    );

    -- Test valid params

    PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_f', 2, 30000, 5000, 'failed', TRUE, 'SHAKE', '', 'url', 3000, FALSE) $q$,
        NULL,
        'update_queue_config should reject http verb'
    );


    PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
            $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_f', 2, 30000, 5000, 'failed', TRUE, 'POST', 'alligator', 'url', 3000, FALSE) $q$,
            NULL,
            'update_queue_config should reject bearer type'
        );

    -- ############
    -- QUEUE CONCURRENCY 


    -- Can it add a queue_config
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_e', 2, 30000, 5000, 'failed', FALSE) $q$,
        'update_queue_config runs ok'
    );

    -- Can it upsert a queue_config
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_e', 2, 30000, 6000, 'failed', FALSE) $q$,
        'update_queue_config runs ok 2'
    );



    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".queue_config WHERE queue_name = 'randomq_e' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'randomq_e queue_config should only be 1'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select timeout_milliseconds as c FROM "pgq_schema_placeholder".queue_config WHERE queue_name = 'randomq_e' $q$,
            $q$ VALUES (6000::INT) $q$,
            'randomq_e queue_config timeout_milliseconds check'
        );


    -- Test queue_config prescence doesn't do anything weird 
    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e') $q$,
            'pick_next_job return nothing as no jobs on randomq_e'
        );

    -- Add 4 items 
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_e', '{"item":1}') $q$,
        'function runs without error for randomq_e'
    );
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_e', '{"item":2}') $q$,
        'function runs without error for randomq_e 2'
    );
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_e', '{"item":3}') $q$,
        'function runs without error for randomq_e 3'
    );
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".add_job('randomq_e', '{"item":4}') $q$,
        'function runs without error for randomq_e 4'
    );

    -- Try to pick items 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e') $q$,
            $q$ VALUES('randomq_e') $q$,
            'pick_next_job should work with a queue config and max concurrency set, for item 1'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e') $q$,
            $q$ VALUES('randomq_e') $q$,
            'pick_next_job should work with a queue config and max concurrency set, for item 2'
        );

    -- Check the 3rd item fails (as max concurrency is 2)
    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e') $q$,
            'pick_next_job should return empty with a queue config and max concurrency set, for item 3'
        );

    -- Make sure ignoring max_concurrency succeeds (takes us to 3 processing)
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e', NULL, NULL, TRUE) $q$,
            $q$ VALUES('randomq_e') $q$,
            'pick_next_job should work with a queue config and max concurrency set, for item 3, with ignore max_currency turned off'
        );

    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_e' AND status = 'processing' $q$,
            $q$ VALUES (3::BIGINT) $q$,
            'randomq_e should have 3 items processing'
        );

    -- Release 1, taking us to 2 processing 
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ select "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_e' AND status = 'processing' LIMIT 1), 'complete') $q$,
            'release_job shoudl work for randomq_e, 1'
        );

    -- It should still deny, as with 2 processing its at max concurrency 
    PERFORM "pgq_schema_placeholder".testhelper_is_empty(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e') $q$,
            'pick_next_job should return empty with a queue config and max concurrency set, for item 4'
        );

    -- Release another (down to 1 item)
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ select "pgq_schema_placeholder".release_job((SELECT job_id FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_e' AND status = 'processing' LIMIT 1), 'complete') $q$,
            'release_job shoudl work for randomq_e, 2'
        );
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select COUNT(*) as c FROM "pgq_schema_placeholder".job_queue WHERE queue_name = 'randomq_e' AND status = 'processing' $q$,
            $q$ VALUES (1::BIGINT) $q$,
            'randomq_e should have 1 items processing'
        );


    -- It should be able to pick again 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select queue_name FROM "pgq_schema_placeholder".pick_next_job('randomq_e', NULL, NULL, TRUE) $q$,
            $q$ VALUES('randomq_e') $q$,
            'pick_next_job should work with a queue config and max concurrency set, for item 4, after releasing'
        );






    -- ############
    -- API KEY 

    -- Test inline 
    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_api_1', 2, 30000, 5000, 'failed', TRUE, 'POST', 'inline', 'url', 3000, FALSE) $q$,
        'update_queue_config runs ok for randomq_api_1'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_api_2', 2, 30000, 5000, 'failed', TRUE, 'POST', '', 'url', 3000, FALSE) $q$,
        'update_queue_config runs ok for randomq_api_2'
    );

    PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
        $q$ SELECT "pgq_schema_placeholder".set_queue_endpoint_api_key('randomq_api_1', 'inline_abc') $q$,
        NULL,
        'set_queue_endpoint_api_key should fail for randomq_api_1 because no temporary key was set'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".register_temporary_key_for_api_access('key_for_temp_1') $q$,
        'register_temporary_key_for_api_access runs ok'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".set_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_1', 'inline_abc') $q$,
        'set_queue_endpoint_api_key runs ok for randomq_api_1'
    );

    PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
        $q$ SELECT "pgq_schema_placeholder".set_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_2', 'inline_abc') $q$,
        'set_queue_endpoint_api_key runs ok for randomq_api_1'
    );


    -- Check inline returns it 
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select "pgq_schema_placeholder".get_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_1') $q$,
            $q$ VALUES('inline_abc') $q$,
            'get_queue_endpoint_api_key should return a value '
        );

    -- Check an empty location returns nothing (even if it was set)
    PERFORM "pgq_schema_placeholder".testhelper_results_eq(
            $q$ select "pgq_schema_placeholder".get_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_2') $q$,
            $q$ VALUES('') $q$,
            'get_queue_endpoint_api_key should be empty for randomq_api_2'
        );



    IF "pgq_schema_placeholder".is_running_supabase() = true THEN
        -- Test supabase vault

        PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ SELECT "pgq_schema_placeholder".update_queue_config('randomq_api_3', 2, 30000, 5000, 'failed', TRUE, 'POST', 'supabase_vault', 'url', 3000, FALSE) $q$,
            'update_queue_config runs ok for randomq_api_3'
        );


        PERFORM "pgq_schema_placeholder".testhelper_lives_ok(
            $q$ SELECT "pgq_schema_placeholder".set_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_3', 'supa_key') $q$,
            'set_queue_endpoint_api_key runs ok for randomq_api_3'
        );

        -- Check supabase vault returns it 
        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select "pgq_schema_placeholder".get_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_3') $q$,
                $q$ VALUES('supa_key') $q$,
                'get_queue_endpoint_api_key should return a value for randomq_api_3 (supabase vault)'
            );



        PERFORM "pgq_schema_placeholder".testhelper_results_eq(
                $q$ select "pgq_schema_placeholder".testhelper_returns_api_in_text() $q$,
                $q$ VALUES(TRUE) $q$,
                'testhelper_returns_api_in_text should be TRUE'
            );

        -- Check security as this is so sensitive 
        SET role 'authenticated';
        PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
            $q$ select "pgq_schema_placeholder".get_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_1') $q$,
            NULL,
            'get_queue_endpoint_api_key should fail for authenticated'
        );

        SET role 'anon';
        PERFORM "pgq_schema_placeholder".testhelper_throws_ok(
            $q$ select "pgq_schema_placeholder".get_queue_endpoint_api_key('key_for_temp_1', 'randomq_api_1') $q$,
            NULL,
            'get_queue_endpoint_api_key should fail for anon'
        );

        SET role 'postgres';
    END IF;

    RETURN true;

    
END;
$$;