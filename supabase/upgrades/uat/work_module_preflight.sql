-- Work module — UAT pre-flight (READ-ONLY). Target: Zagotowki - UAT, project ref meuzkduxttjcuiynsnaa.
-- Runbook: docs/work-module-uat-sql-editor.md. The runbook's APPLY steps are UAT-only; this file itself is read-only
-- and may be run on production (ssheqxdgsmndiutthxvd) as a gap check: there, P10 verdicts are information only.
-- Every query below only reads catalog or table data: SELECT / WITH only, no DDL, no DML, no settings.
-- The SQL Editor shows only the LAST result of a multi-statement run. Running the whole file therefore shows
-- P10 (decision summary). For any other query select it (from its "-- P" header to its semicolon) and use
-- "Run selected"; save every result (CSV / copy).

-- P1. Database identity and version (compare employees / tasks with what you know of UAT test data)
SELECT current_database() AS database, current_user AS role, version() AS postgres_version, now() AS server_time,
       (SELECT count(*) FROM public."Employees") AS employees,
       (SELECT count(*) FROM public."Tasks") AS tasks;

-- P2. Does the CLI migration history exist and may this role read it?
SELECT n.nspname AS schema, c.relname AS table_name,
       has_table_privilege(c.oid, 'SELECT') AS can_select,
       (SELECT string_agg(attname, ', ' ORDER BY attnum) FROM pg_attribute
         WHERE attrelid = c.oid AND attnum > 0 AND NOT attisdropped) AS columns
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'supabase_migrations' AND c.relkind = 'r';

-- P3. Registered history compared with the repository. Safe when the history table does not exist (a project whose
--     migrations were applied by hand in the SQL Editor): every row then says "NO HISTORY TABLE".
WITH hist_xml AS (
  SELECT query_to_xml(CASE
           WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
             THEN 'SELECT NULL::text AS version, NULL::text AS name WHERE false'
           WHEN EXISTS (SELECT FROM pg_attribute WHERE attrelid = to_regclass('supabase_migrations.schema_migrations')
                          AND attname = 'name' AND NOT attisdropped)
             THEN 'SELECT version::text AS version, name::text AS name FROM supabase_migrations.schema_migrations'
           ELSE 'SELECT version::text AS version, NULL::text AS name FROM supabase_migrations.schema_migrations' END,
         false, false, '') AS x
), h AS (
  SELECT (xpath('/row/version/text()', r))[1]::text AS version, (xpath('/row/name/text()', r))[1]::text AS name
  FROM hist_xml, unnest(xpath('/table/row', hist_xml.x)) AS r
), repo(version, name) AS (VALUES
  ('202609220001','base'),
  ('202609230001','auth'),
  ('202609230002','auth_production'),
  ('202609290001','employee_pin'),
  ('202609300001','employee_archive'),
  ('202610010001','roles_modules'),
  ('202610010002','crafter'),
  ('202610010003','orders'),
  ('202610020001','task_access'),
  ('202610020002','task_core'),
  ('202610020003','task_approvals'),
  ('202610020004','task_planning'),
  ('202610020005','task_work'),
  ('202610020006','task_balance_reports'),
  ('202610020007','task_hardening'),
  ('202610020008','task_audit'),
  ('202610020009','task_pagination'),
  ('202610020010','task_contracts'),
  ('202610020011','task_team_calendar'),
  ('202610020012','task_role_invariant'),
  ('202610030001','orders_board'),
  ('202610030002','orders_uat_generator'),
  ('202610040001','worktime'),
  ('202610050001','task_availability_reports'),
  ('202610050002','task_manual_actions'),
  ('202610050003','task_execution'),
  ('202610060001','tasks_admin_processes'),
  ('202610060002','new_menu_process'),
  ('202610070001','manager_email_auth'),
  ('202610080001','organization_structure'),
  ('202610080002','access_directory'),
  ('202610080003','organization_current_department'),
  ('202610080004','employee_avatars'),
  ('202610090001','process_workspace'),
  ('202610100001','order_ingest'),
  ('202610100002','order_location_routing'),
  ('202610110001','process_wizard'),
  ('202610130001','audit'),
  ('202610150001','task_process_schedules'),
  ('202610260001','employee_positions'),
  ('202610260002','tasks_list_view'),
  ('202610280001','shift_functions'),
  ('202611110001','work_hierarchy'),
  ('202611120001','work_finalize'),
  ('202611120002','attachment_name_type'),
  ('202611140001','attachment_storage_read')
)
SELECT coalesce(r.version, h.version) AS version, r.name AS repository_file, h.name AS history_name,
       CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
              THEN 'NO HISTORY TABLE - migrations were not applied with the Supabase CLI; use P4 / P10 schema evidence'
            WHEN h.version IS NULL THEN 'in repository, NOT registered'
            WHEN r.version IS NULL THEN 'registered, NOT in repository'
            ELSE 'registered' END AS history_status
FROM repo r FULL JOIN h ON h.version = r.version
ORDER BY 1;

-- P4. Schema evidence for each Work migration (decides what must run; see runbook §5).
SELECT migration, object, present,
       CASE count(*) FILTER (WHERE present) OVER (PARTITION BY migration)
            WHEN count(*) OVER (PARTITION BY migration) THEN 'APPLIED'
            WHEN 0 THEN 'NOT APPLIED'
            ELSE 'PARTIAL - STOP' END AS migration_verdict
FROM (VALUES
  ('202611110001', 'column Tasks.deleted_at', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Tasks' AND column_name='deleted_at')),
  ('202611110001', 'column Tasks.deleted_by_employee_id', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Tasks' AND column_name='deleted_by_employee_id')),
  ('202611110001', 'column Task_files.removed_at', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Task_files' AND column_name='removed_at')),
  ('202611110001', 'column Task_files.removed_by_employee_id', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Task_files' AND column_name='removed_by_employee_id')),
  ('202611110001', 'table Task_notifications', to_regclass('public."Task_notifications"') IS NOT NULL),
  ('202611110001', 'Task_notifications RLS enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public."Task_notifications"')), false)),
  ('202611110001', 'unique (event_id, recipient_employee_id)', EXISTS(SELECT FROM pg_constraint WHERE conrelid = to_regclass('public."Task_notifications"') AND contype = 'u')),
  ('202611110001', 'index tasks_children_live', to_regclass('public.tasks_children_live') IS NOT NULL),
  ('202611110001', 'index task_files_live', to_regclass('public.task_files_live') IS NOT NULL),
  ('202611110001', 'index task_notifications_inbox', to_regclass('public.task_notifications_inbox') IS NOT NULL),
  ('202611110001', 'trigger task_completion_guard on Tasks', EXISTS(SELECT FROM pg_trigger WHERE tgrelid = 'public."Tasks"'::regclass AND tgname = 'task_completion_guard' AND NOT tgisinternal)),
  ('202611110001', 'function task_completion_guard()', to_regprocedure('app_private.task_completion_guard()') IS NOT NULL),
  ('202611110001', 'function task_progress(bigint)', to_regprocedure('app_private.task_progress(bigint)') IS NOT NULL),
  ('202611110001', 'function task_descendants(bigint)', to_regprocedure('app_private.task_descendants(bigint)') IS NOT NULL),
  ('202611110001', 'function task_notify(...)', to_regprocedure('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)') IS NOT NULL),
  ('202611110001', 'function task_hierarchy_command(...)', to_regprocedure('app_private.task_hierarchy_command(text,jsonb,uuid)') IS NOT NULL),
  ('202611110001', 'function tasks_parent_candidates(bigint,text,integer)', to_regprocedure('public.tasks_parent_candidates(bigint,text,integer)') IS NOT NULL),
  ('202611110001', 'function tasks_notifications(text,bigint,integer)', to_regprocedure('public.tasks_notifications(text,bigint,integer)') IS NOT NULL),
  ('202611110001', 'function tasks_notifications_unread()', to_regprocedure('public.tasks_notifications_unread()') IS NOT NULL),
  ('202611110001', 'tasks_list returns tree_parent_id', position('tree_parent_id' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.tasks_list(jsonb)')),'')) > 0),
  ('202611110001', 'tasks_details returns children_hidden', position('children_hidden' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.tasks_details(bigint)')),'')) > 0),
  ('202611110001', 'task_event calls task_notify', position('task_notify' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_event(bigint,text,uuid,jsonb,jsonb)')),'')) > 0),
  ('202611110001', 'task_core accepts deadline_is_hard', position('deadline_is_hard' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_core(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'validator knows set_parent', position('set_parent' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_validate_args_20261011(text,jsonb)')),'')) > 0),
  ('202611110001', 'dispatcher routes task_hierarchy_command', position('task_hierarchy_command' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_dispatch_20261011(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'tasks_command lock list has notifications_read_all', position('notifications_read_all' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.tasks_command(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'task_result_command records TASK_ATTACHMENT_ADDED', position('TASK_ATTACHMENT_ADDED' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_result_command(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'task_file_read refuses removed files', position('f.removed_at IS NULL' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_file_read(uuid)')),'')) > 0),
  ('202611120001', 'bucket allows msword + vnd.ms-excel', EXISTS(SELECT FROM storage.buckets WHERE id = 'tasks-private' AND allowed_mime_types @> ARRAY['application/msword','application/vnd.ms-excel'])),
  ('202611120001', 'task_result_command block 202611120001', position('-- end 202611120001' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_result_command(text,jsonb,uuid)')),'')) > 0),
  ('202611120001', 'task_notify block 202611120001', position('202611120001' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)')),'')) > 0),
  ('202611120002', 'task_result_command block 202611120002', position('-- end 202611120002' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_result_command(text,jsonb,uuid)')),'')) > 0),
  ('202611140001', 'function tasks_storage_select(text)', to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL),
  ('202611140001', 'authenticated may execute tasks_storage_select', to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL AND has_function_privilege('authenticated', to_regprocedure('public.tasks_storage_select(text)'), 'EXECUTE')),
  ('storage policy D-47', 'tasks_file_select uses tasks_storage_select', EXISTS(SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select' AND qual LIKE '%tasks_storage_select%')),
  ('storage policy D-47', 'tasks_file_select has no own-folder branch', EXISTS(SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select' AND qual NOT LIKE '%foldername%'))
) AS c(migration, object, present)
ORDER BY migration, object;

-- P5. Function bodies compared with the repository (md5 of prosrc after each migration stage, computed
--     by replaying supabase/migrations locally). Expected now: hierarchy stage at least.
WITH expected(signature, stage, md5) AS (VALUES
  ('app_private.task_event(bigint,text,uuid,jsonb,jsonb)','before 202611110001','6ddb44084566897aeab980dd7de8c3ae'),
  ('app_private.task_event(bigint,text,uuid,jsonb,jsonb)','202611110001','e86c6336522d4db4d71007e30a3871bf'),
  ('app_private.task_core(text,jsonb,uuid)','before 202611110001','e6db92411b86324288158b19f657b283'),
  ('app_private.task_core(text,jsonb,uuid)','202611110001','715bb7ddba11b0b593a84635c6c686c0'),
  ('app_private.task_validate_args_20261011(text,jsonb)','before 202611110001','e6bee006667491795bb8158ebed01948'),
  ('app_private.task_validate_args_20261011(text,jsonb)','202611110001','3855afde02755556b4612fd8a81c4feb'),
  ('app_private.task_dispatch_20261011(text,jsonb,uuid)','before 202611110001','e912f047da41b88e577d2ce0009697ae'),
  ('app_private.task_dispatch_20261011(text,jsonb,uuid)','202611110001','54ec5d31377140e29dc8f39b0fa04349'),
  ('public.tasks_command(text,jsonb,uuid)','before 202611110001','bf537489b7f9f7424407bd0b61b5482f'),
  ('public.tasks_command(text,jsonb,uuid)','202611110001','acd1440c328200886212e66350a054a1'),
  ('app_private.task_result_command(text,jsonb,uuid)','before 202611110001','9c17573721faba9841fcdb5caa8ef44c'),
  ('app_private.task_result_command(text,jsonb,uuid)','202611110001','2cdae368d9d6996e16403afa4d0cb1ba'),
  ('app_private.task_result_command(text,jsonb,uuid)','202611120001','315556a26c81d2fac9af8235e0443676'),
  ('app_private.task_result_command(text,jsonb,uuid)','202611120002','513f570afa496c95e36bc0e4a905d60c'),
  ('app_private.task_file_read(uuid)','before 202611110001','466147c0b7e222e2c12237a57549a98d'),
  ('app_private.task_file_read(uuid)','202611110001','42271be4661a61c271eb1bd425cb5896'),
  ('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)','202611110001','d79003527bbd27715933f136497c7e4a'),
  ('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)','202611120001','688ebf8e74973ad577ec913aee8ca6e4'),
  ('app_private.task_completion_guard()','202611110001','70365495950e66bbeb24a8c48b003ff6'),
  ('app_private.task_progress(bigint)','202611110001','a721885cdfe1cb25b82ca397a5add66c'),
  ('app_private.task_descendants(bigint)','202611110001','d22adf8226174d325f9243bfdac5b302'),
  ('app_private.task_hierarchy_command(text,jsonb,uuid)','202611110001','8bd9d8102d24211ff677cb542f50d883'),
  ('public.tasks_list(jsonb)','before 202611110001','71fbf2cb694e1a78f8c5bc512694b5d5'),
  ('public.tasks_list(jsonb)','202611110001','3f69a765c50c1d3852e5745f6e01119f'),
  ('public.tasks_details(bigint)','before 202611110001','5a40335fca5aebcb296fa55e3cc633e5'),
  ('public.tasks_details(bigint)','202611110001','26f06040e6251bcd948477d9073a7a55'),
  ('public.tasks_events(bigint,bigint)','before 202611110001','b2bac7781e38a0d4096d49a760d9525f'),
  ('public.tasks_events(bigint,bigint)','202611110001','4b1ab71c7d745d8e71195ddf1f4f3c26'),
  ('public.tasks_parent_candidates(bigint,text,integer)','202611110001','39a09291c075bc945f796769303fa0e9'),
  ('public.tasks_notifications(text,bigint,integer)','202611110001','7aaff876a88d886e25b0032a0532d9ea'),
  ('public.tasks_notifications_unread()','202611110001','dc73119f0f54dd1f69fb8e95237467c0'),
  ('public.tasks_storage_select(text)','202611140001','c939a4ea96a0b25c65e67fe394ed1a93'),
  ('public.tasks_storage_read(text)','before 202611110001','c022403a6a5432ceb9bea47353898b2b'),
  ('public.tasks_file(uuid)','before 202611110001','c187c7ce6841d2d15f6c9d83d4b14e36')
), actual AS (
  SELECT DISTINCT e.signature, md5(p.prosrc) AS md5
  FROM expected e LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
)
SELECT a.signature,
       coalesce(a.md5, 'function absent') AS actual_md5,
       coalesce((SELECT e.stage FROM expected e WHERE e.signature = a.signature AND e.md5 = a.md5),
                CASE WHEN a.md5 IS NULL THEN 'absent' ELSE 'NO MATCH - review' END) AS matches_stage
FROM actual a ORDER BY a.signature;

-- P6. Foreign keys, RLS, triggers and RPC privileges of the Work objects
SELECT 'foreign key' AS kind, conrelid::regclass::text AS object, conname AS name, pg_get_constraintdef(oid) AS detail
  FROM pg_constraint
 WHERE contype = 'f' AND conrelid IN (SELECT oid FROM pg_class WHERE oid IN (
       to_regclass('public."Tasks"'), to_regclass('public."Task_files"'), to_regclass('public."Task_notifications"')))
UNION ALL
SELECT 'rls', c.oid::regclass::text, 'enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity, NULL
  FROM pg_class c
 WHERE c.oid IN (to_regclass('public."Tasks"'), to_regclass('public."Task_files"'), to_regclass('public."Task_events"'),
                 to_regclass('public."Task_notifications"'), to_regclass('storage.objects'))
UNION ALL
SELECT 'trigger', tgrelid::regclass::text, tgname, 'enabled=' || tgenabled::text
  FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN (to_regclass('public."Tasks"'), to_regclass('public."Task_events"'))
UNION ALL
SELECT 'rpc privilege', p.oid::regprocedure::text, 'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE'), 'security_definer=' || p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('tasks_list','tasks_details','tasks_events','tasks_parent_candidates',
       'tasks_notifications','tasks_notifications_unread','tasks_command','tasks_file','tasks_storage_read','tasks_storage_select')
UNION ALL
SELECT 'table privilege', 'public."Task_notifications"',
       'anon=' || has_table_privilege('anon', to_regclass('public."Task_notifications"'), 'SELECT')
       || ' authenticated=' || has_table_privilege('authenticated', to_regclass('public."Task_notifications"'), 'SELECT'), NULL
 WHERE to_regclass('public."Task_notifications"') IS NOT NULL
ORDER BY 1, 2, 3;

-- P7. Storage bucket and the tasks_file_* policies
SELECT 'bucket' AS kind, id AS name, 'public=' || public || ' limit=' || file_size_limit AS detail,
       array_to_string(allowed_mime_types, ', ') AS expression
  FROM storage.buckets WHERE id = 'tasks-private'
UNION ALL
SELECT 'policy', policyname, cmd || ' to ' || array_to_string(roles, ','), coalesce(qual, with_check)
  FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'tasks_file_%'
ORDER BY 1, 2;

-- P8. Data snapshot (keep it: post-flight compares against it; migrations must not change these counts)
SELECT (SELECT count(*) FROM public."Tasks") AS tasks,
       (SELECT count(*) FROM public."Tasks" WHERE parent_task_id IS NOT NULL) AS subtasks,
       (SELECT count(*) FROM public."Tasks" t WHERE to_jsonb(t) ->> 'deleted_at' IS NOT NULL) AS soft_deleted_tasks,
       (SELECT count(*) FROM public."Task_events") AS activity_events,
       (SELECT count(*) FROM public."Task_files") AS files,
       (SELECT count(*) FROM public."Task_files" f WHERE to_jsonb(f) ->> 'removed_at' IS NOT NULL) AS removed_files,
       CASE WHEN to_regclass('public."Task_notifications"') IS NULL THEN NULL ELSE
         (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public."Task_notifications"', false, true, '')))[1]::text::bigint END AS notifications,
       (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tasks-private') AS stored_objects,
       (SELECT count(*) FROM public."Tasks" p WHERE p.status NOT IN ('completed','cancelled') AND EXISTS
          (SELECT FROM public."Tasks" c WHERE c.parent_task_id = p.id AND c.status NOT IN ('completed','cancelled'))) AS open_parents_with_open_children,
       (SELECT count(*) FROM public."Tasks" p WHERE p.status = 'completed' AND EXISTS
          (SELECT FROM public."Tasks" c WHERE c.parent_task_id = p.id AND c.status NOT IN ('completed','cancelled'))) AS completed_parents_with_open_children;

-- P9. Current definitions that the remaining steps replace (SAVE the full output before executing anything:
--     it is the exact rollback material for 202611120001 / 202611120002 and for the Storage policy).
SELECT 'function' AS kind, x.sig AS name, pg_get_functiondef(to_regprocedure(x.sig)) AS current_definition
  FROM (VALUES ('app_private.task_result_command(text,jsonb,uuid)'),
               ('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)')) AS x(sig)
 WHERE to_regprocedure(x.sig) IS NOT NULL
UNION ALL
SELECT 'bucket allowed_mime_types', id, array_to_string(allowed_mime_types, ', ') FROM storage.buckets WHERE id = 'tasks-private'
UNION ALL
SELECT 'policy ' || cmd, policyname, coalesce(qual, with_check)
  FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'tasks_file_%';

-- P10. Decision summary (last query: running the whole file shows this). One row per deployment step.
WITH checks(migration, object, present) AS (VALUES
  ('202611110001', 'column Tasks.deleted_at', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Tasks' AND column_name='deleted_at')),
  ('202611110001', 'column Tasks.deleted_by_employee_id', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Tasks' AND column_name='deleted_by_employee_id')),
  ('202611110001', 'column Task_files.removed_at', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Task_files' AND column_name='removed_at')),
  ('202611110001', 'column Task_files.removed_by_employee_id', EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Task_files' AND column_name='removed_by_employee_id')),
  ('202611110001', 'table Task_notifications', to_regclass('public."Task_notifications"') IS NOT NULL),
  ('202611110001', 'Task_notifications RLS enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public."Task_notifications"')), false)),
  ('202611110001', 'unique (event_id, recipient_employee_id)', EXISTS(SELECT FROM pg_constraint WHERE conrelid = to_regclass('public."Task_notifications"') AND contype = 'u')),
  ('202611110001', 'index tasks_children_live', to_regclass('public.tasks_children_live') IS NOT NULL),
  ('202611110001', 'index task_files_live', to_regclass('public.task_files_live') IS NOT NULL),
  ('202611110001', 'index task_notifications_inbox', to_regclass('public.task_notifications_inbox') IS NOT NULL),
  ('202611110001', 'trigger task_completion_guard on Tasks', EXISTS(SELECT FROM pg_trigger WHERE tgrelid = 'public."Tasks"'::regclass AND tgname = 'task_completion_guard' AND NOT tgisinternal)),
  ('202611110001', 'function task_completion_guard()', to_regprocedure('app_private.task_completion_guard()') IS NOT NULL),
  ('202611110001', 'function task_progress(bigint)', to_regprocedure('app_private.task_progress(bigint)') IS NOT NULL),
  ('202611110001', 'function task_descendants(bigint)', to_regprocedure('app_private.task_descendants(bigint)') IS NOT NULL),
  ('202611110001', 'function task_notify(...)', to_regprocedure('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)') IS NOT NULL),
  ('202611110001', 'function task_hierarchy_command(...)', to_regprocedure('app_private.task_hierarchy_command(text,jsonb,uuid)') IS NOT NULL),
  ('202611110001', 'function tasks_parent_candidates(bigint,text,integer)', to_regprocedure('public.tasks_parent_candidates(bigint,text,integer)') IS NOT NULL),
  ('202611110001', 'function tasks_notifications(text,bigint,integer)', to_regprocedure('public.tasks_notifications(text,bigint,integer)') IS NOT NULL),
  ('202611110001', 'function tasks_notifications_unread()', to_regprocedure('public.tasks_notifications_unread()') IS NOT NULL),
  ('202611110001', 'tasks_list returns tree_parent_id', position('tree_parent_id' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.tasks_list(jsonb)')),'')) > 0),
  ('202611110001', 'tasks_details returns children_hidden', position('children_hidden' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.tasks_details(bigint)')),'')) > 0),
  ('202611110001', 'task_event calls task_notify', position('task_notify' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_event(bigint,text,uuid,jsonb,jsonb)')),'')) > 0),
  ('202611110001', 'task_core accepts deadline_is_hard', position('deadline_is_hard' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_core(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'validator knows set_parent', position('set_parent' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_validate_args_20261011(text,jsonb)')),'')) > 0),
  ('202611110001', 'dispatcher routes task_hierarchy_command', position('task_hierarchy_command' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_dispatch_20261011(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'tasks_command lock list has notifications_read_all', position('notifications_read_all' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.tasks_command(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'task_result_command records TASK_ATTACHMENT_ADDED', position('TASK_ATTACHMENT_ADDED' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_result_command(text,jsonb,uuid)')),'')) > 0),
  ('202611110001', 'task_file_read refuses removed files', position('f.removed_at IS NULL' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_file_read(uuid)')),'')) > 0),
  ('202611120001', 'bucket allows msword + vnd.ms-excel', EXISTS(SELECT FROM storage.buckets WHERE id = 'tasks-private' AND allowed_mime_types @> ARRAY['application/msword','application/vnd.ms-excel'])),
  ('202611120001', 'task_result_command block 202611120001', position('-- end 202611120001' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_result_command(text,jsonb,uuid)')),'')) > 0),
  ('202611120001', 'task_notify block 202611120001', position('202611120001' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)')),'')) > 0),
  ('202611120002', 'task_result_command block 202611120002', position('-- end 202611120002' IN coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('app_private.task_result_command(text,jsonb,uuid)')),'')) > 0),
  ('202611140001', 'function tasks_storage_select(text)', to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL),
  ('202611140001', 'authenticated may execute tasks_storage_select', to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL AND has_function_privilege('authenticated', to_regprocedure('public.tasks_storage_select(text)'), 'EXECUTE')),
  ('storage policy D-47', 'tasks_file_select uses tasks_storage_select', EXISTS(SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select' AND qual LIKE '%tasks_storage_select%')),
  ('storage policy D-47', 'tasks_file_select has no own-folder branch', EXISTS(SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select' AND qual NOT LIKE '%foldername%'))
), verdict AS (
  SELECT migration,
         CASE count(*) FILTER (WHERE present) WHEN count(*) THEN 'APPLIED' WHEN 0 THEN 'NOT APPLIED' ELSE 'PARTIAL' END AS schema_state,
         count(*) FILTER (WHERE present) || '/' || count(*) AS markers
  FROM checks GROUP BY migration
), expected(signature, stage, md5) AS (VALUES
  ('app_private.task_event(bigint,text,uuid,jsonb,jsonb)','before 202611110001','6ddb44084566897aeab980dd7de8c3ae'),
  ('app_private.task_event(bigint,text,uuid,jsonb,jsonb)','202611110001','e86c6336522d4db4d71007e30a3871bf'),
  ('app_private.task_core(text,jsonb,uuid)','before 202611110001','e6db92411b86324288158b19f657b283'),
  ('app_private.task_core(text,jsonb,uuid)','202611110001','715bb7ddba11b0b593a84635c6c686c0'),
  ('app_private.task_validate_args_20261011(text,jsonb)','before 202611110001','e6bee006667491795bb8158ebed01948'),
  ('app_private.task_validate_args_20261011(text,jsonb)','202611110001','3855afde02755556b4612fd8a81c4feb'),
  ('app_private.task_dispatch_20261011(text,jsonb,uuid)','before 202611110001','e912f047da41b88e577d2ce0009697ae'),
  ('app_private.task_dispatch_20261011(text,jsonb,uuid)','202611110001','54ec5d31377140e29dc8f39b0fa04349'),
  ('public.tasks_command(text,jsonb,uuid)','before 202611110001','bf537489b7f9f7424407bd0b61b5482f'),
  ('public.tasks_command(text,jsonb,uuid)','202611110001','acd1440c328200886212e66350a054a1'),
  ('app_private.task_result_command(text,jsonb,uuid)','before 202611110001','9c17573721faba9841fcdb5caa8ef44c'),
  ('app_private.task_result_command(text,jsonb,uuid)','202611110001','2cdae368d9d6996e16403afa4d0cb1ba'),
  ('app_private.task_result_command(text,jsonb,uuid)','202611120001','315556a26c81d2fac9af8235e0443676'),
  ('app_private.task_result_command(text,jsonb,uuid)','202611120002','513f570afa496c95e36bc0e4a905d60c'),
  ('app_private.task_file_read(uuid)','before 202611110001','466147c0b7e222e2c12237a57549a98d'),
  ('app_private.task_file_read(uuid)','202611110001','42271be4661a61c271eb1bd425cb5896'),
  ('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)','202611110001','d79003527bbd27715933f136497c7e4a'),
  ('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)','202611120001','688ebf8e74973ad577ec913aee8ca6e4'),
  ('app_private.task_completion_guard()','202611110001','70365495950e66bbeb24a8c48b003ff6'),
  ('app_private.task_progress(bigint)','202611110001','a721885cdfe1cb25b82ca397a5add66c'),
  ('app_private.task_descendants(bigint)','202611110001','d22adf8226174d325f9243bfdac5b302'),
  ('app_private.task_hierarchy_command(text,jsonb,uuid)','202611110001','8bd9d8102d24211ff677cb542f50d883'),
  ('public.tasks_list(jsonb)','before 202611110001','71fbf2cb694e1a78f8c5bc512694b5d5'),
  ('public.tasks_list(jsonb)','202611110001','3f69a765c50c1d3852e5745f6e01119f'),
  ('public.tasks_details(bigint)','before 202611110001','5a40335fca5aebcb296fa55e3cc633e5'),
  ('public.tasks_details(bigint)','202611110001','26f06040e6251bcd948477d9073a7a55'),
  ('public.tasks_events(bigint,bigint)','before 202611110001','b2bac7781e38a0d4096d49a760d9525f'),
  ('public.tasks_events(bigint,bigint)','202611110001','4b1ab71c7d745d8e71195ddf1f4f3c26'),
  ('public.tasks_parent_candidates(bigint,text,integer)','202611110001','39a09291c075bc945f796769303fa0e9'),
  ('public.tasks_notifications(text,bigint,integer)','202611110001','7aaff876a88d886e25b0032a0532d9ea'),
  ('public.tasks_notifications_unread()','202611110001','dc73119f0f54dd1f69fb8e95237467c0'),
  ('public.tasks_storage_select(text)','202611140001','c939a4ea96a0b25c65e67fe394ed1a93'),
  ('public.tasks_storage_read(text)','before 202611110001','c022403a6a5432ceb9bea47353898b2b'),
  ('public.tasks_file(uuid)','before 202611110001','c187c7ce6841d2d15f6c9d83d4b14e36')
), stage AS (
  SELECT e.signature,
         coalesce((SELECT x.stage FROM expected x JOIN pg_proc p ON p.oid = to_regprocedure(x.signature)
                    WHERE x.signature = e.signature AND x.md5 = md5(p.prosrc)),
                  CASE WHEN to_regprocedure(e.signature) IS NULL THEN 'absent' ELSE 'NO MATCH' END) AS stage
  FROM (SELECT DISTINCT signature FROM expected) e
), f AS (
  SELECT (SELECT stage FROM stage WHERE signature = 'app_private.task_result_command(text,jsonb,uuid)') AS trc,
         (SELECT stage FROM stage WHERE signature = 'app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)') AS notify,
         (SELECT count(*) FROM stage WHERE stage = 'NO MATCH') AS mismatches,
         (SELECT string_agg(signature, ', ') FROM stage WHERE stage = 'NO MATCH') AS mismatch_list,
         (SELECT qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select') AS policy_qual,
         (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'tasks_file_%') AS policies
), h AS (
  SELECT v.version,
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'no history table'
              WHEN (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM supabase_migrations.schema_migrations WHERE version = %L', v.version), false, true, '')))[1]::text::int > 0
              THEN 'registered' ELSE 'not registered' END AS history
  FROM (VALUES ('202611110001'), ('202611120001'), ('202611120002'), ('202611140001')) v(version)
), s AS (SELECT migration, schema_state, markers FROM verdict)
SELECT step, migration, schema_state, markers, function_evidence, history, decision
FROM (
 SELECT 1 AS step, '202611110001_work_hierarchy.sql' AS migration, s.schema_state, s.markers,
        'functions not matching repository: ' || f.mismatches || coalesce(' (' || f.mismatch_list || ')', '') AS function_evidence,
        (SELECT history FROM h WHERE version = '202611110001') AS history,
        CASE WHEN s.schema_state = 'APPLIED' AND f.mismatches = 0 THEN 'SKIP - already applied (do not re-run)'
             WHEN s.schema_state = 'APPLIED' THEN 'STOP - applied but some bodies differ: send P5'
             ELSE 'STOP - not (fully) applied: send P4' END AS decision
   FROM s, f WHERE s.migration = '202611110001'
 UNION ALL
 SELECT 2, '202611120001_work_finalize.sql', s.schema_state, s.markers,
        'task_result_command=' || f.trc || '; task_notify=' || f.notify,
        (SELECT history FROM h WHERE version = '202611120001'),
        CASE WHEN s.schema_state = 'APPLIED' AND f.trc IN ('202611120001','202611120002') AND f.notify = '202611120001' THEN 'SKIP - already applied'
             WHEN s.schema_state = 'NOT APPLIED' AND f.trc = '202611110001' AND f.notify = '202611110001' THEN 'RUN step 2'
             ELSE 'STOP - inconsistent state: send P4 + P5' END
   FROM s, f WHERE s.migration = '202611120001'
 UNION ALL
 SELECT 3, '202611120002_attachment_name_type.sql', s.schema_state, s.markers,
        'task_result_command=' || f.trc,
        (SELECT history FROM h WHERE version = '202611120002'),
        CASE WHEN s.schema_state = 'APPLIED' AND f.trc = '202611120002' THEN 'SKIP - already applied'
             WHEN s.schema_state = 'NOT APPLIED' AND f.trc = '202611120001' THEN 'RUN step 3'
             WHEN s.schema_state = 'NOT APPLIED' AND f.trc = '202611110001' THEN 'RUN step 3 (after step 2)'
             ELSE 'STOP - inconsistent state: send P4 + P5' END
   FROM s, f WHERE s.migration = '202611120002'
 UNION ALL
 SELECT 4, '202611140001_attachment_storage_read.sql', s.schema_state, s.markers,
        'tasks_storage_select=' || (SELECT stage FROM stage WHERE signature = 'public.tasks_storage_select(text)'),
        (SELECT history FROM h WHERE version = '202611140001'),
        CASE WHEN s.schema_state = 'APPLIED' THEN 'SKIP - already applied'
             WHEN s.schema_state = 'NOT APPLIED' THEN 'RUN step 4'
             ELSE 'STOP - partial: send P4' END
   FROM s WHERE s.migration = '202611140001'
 UNION ALL
 SELECT 5, 'storage/tasks-private-policies-202611140001.sql', s.schema_state, s.markers,
        'tasks_file_* policies: ' || f.policies,
        'not a migration (no history entry)',
        CASE WHEN s.schema_state = 'APPLIED' THEN 'SKIP - already applied'
             WHEN f.policies = 0 THEN 'RUN step 5 prime (tasks-private-policies.sql, fresh install)'
             WHEN f.policy_qual LIKE '%foldername%' AND f.policy_qual LIKE '%tasks_storage_read%' THEN 'RUN step 5 (after step 4)'
             ELSE 'STOP - unexpected tasks_file_select: send P7' END
   FROM s, f WHERE s.migration = 'storage policy D-47'
) d ORDER BY step;
