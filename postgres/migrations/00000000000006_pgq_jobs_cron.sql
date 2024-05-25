-- This is #ENVSPECIFIC_INSTALL
--
-- # ALT ENVIRONMENTS
-- pg_cron
--  If disabled, you'll need something to regularly call the functions pg_cron was calling.
--  E.g. In Express/Node, you'd set up endpoints/functions to call them, then expose them via a CRON job on that server (or Render.com does one off CRONs)




CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".is_cron_job_scheduling_available()
RETURNS BOOLEAN
LANGUAGE plpgsql 
AS $$
BEGIN

    RETURN "pgq_schema_placeholder".has_function('set_cron_schedule_in_seconds');

END;
$$;




CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".envspecific_install_job_cron()  
RETURNS VOID
SECURITY DEFINER
SET search_path = "pgq_schema_placeholder"
AS $$
BEGIN
    IF "pgq_schema_placeholder".is_extension_known('pg_cron') = true THEN
                
        create extension if not exists pg_cron with schema extensions;


        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".set_cron_schedule_in_seconds(
            p_check_and_release_timed_out_jobs_interval_seconds INTEGER DEFAULT NULL,
            p_cleanup_unused_queues_interval_hours INTEGER DEFAULT  NULL,
            p_cleanup_unused_queues_inactive_duration INTERVAL DEFAULT  NULL
        )
        RETURNS VOID 
        LANGUAGE plpgsql 
        AS $i$
        BEGIN
            p_check_and_release_timed_out_jobs_interval_seconds := COALESCE(p_check_and_release_timed_out_jobs_interval_seconds, 10);
            p_cleanup_unused_queues_interval_hours := COALESCE(p_cleanup_unused_queues_interval_hours, 24);
            p_cleanup_unused_queues_inactive_duration := COALESCE(p_cleanup_unused_queues_inactive_duration, '48 hours');

            IF p_check_and_release_timed_out_jobs_interval_seconds <= 0 OR p_cleanup_unused_queues_interval_hours <= 0 THEN
                RAISE EXCEPTION 'Interval values must be greater than 0';
            END IF;


            PERFORM cron.schedule(
                'check_and_release_timed_out_jobs_',
                p_check_and_release_timed_out_jobs_interval_seconds || ' seconds',
                'SELECT "pgq_schema_placeholder".check_and_release_timed_out_jobs();'
            );

            
            --v_sql := 'SELECT "pgq_schema_placeholder".cleanup_unused_queues(''' || p_cleanup_unused_queues_inactive_duration || '''::interval);'; 
            

            PERFORM cron.schedule(
                'cleanup_unused_queues_',
                p_cleanup_unused_queues_interval_hours || ' hours',
                FORMAT('SELECT "pgq_schema_placeholder".cleanup_unused_queues(''%s''::interval);', p_cleanup_unused_queues_inactive_duration)
            );


            
            
        END;
        $i$;

        CREATE OR REPLACE FUNCTION "pgq_schema_placeholder".cancel_cron()
        RETURNS VOID 
        LANGUAGE plpgsql 
        AS $i$
        BEGIN
            SELECT cron.unschedule(
                'check_and_release_timed_out_jobs_'
            );

            SELECT cron.unschedule(
                'cleanup_unused_queues_'
            );

        END;
        $i$;

    END IF;

END;
$$ LANGUAGE plpgsql;
