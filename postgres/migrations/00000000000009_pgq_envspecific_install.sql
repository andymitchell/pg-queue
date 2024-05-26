-- ** DO NOT RENAME THIS FILE ** (from envspecific_install) without updating anything in the package that references it!

-- #ENVSPECIFIC_INSTALL
-- Env specific installs are typically things requiring an extension that may not be present. 
--  They're always optional: you can still use queues, you just have to do things like clean up / dispatching jobs at a higher level (e.g. with a server). 
-- 
-- Because it's so variable, the migrations should try to install it every time they run/update. 
-- To keep that clean, all envspecific installs are a) put into a function, b) collated here. 
--      That means that only this file needs to be re-issued every time /install/cli generates migration files. 



SELECT "pgq_schema_placeholder".envspecific_install_job_cron();
SELECT "pgq_schema_placeholder".envspecific_install_dispatcher_functions();