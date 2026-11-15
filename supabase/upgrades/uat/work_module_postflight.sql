-- Work module — UAT post-flight, catalog checks as the SQL Editor role (READ-ONLY).
-- Target: Zagotowki - UAT, meuzkduxttjcuiynsnaa. Run ONE numbered query at a time ("Run selected").
-- These prove what exists in the database. They do NOT prove behaviour of real application requests
-- (PostgREST + JWT, Storage API): see work_module_postflight_as_user.sql and rollout §11.

-- O1. Every Work migration must report APPLIED, including "storage policy D-47".
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

-- O2. Function bodies identical to the repository after the whole chain (every row must say OK).
WITH expected(signature, md5) AS (VALUES
  ('app_private.task_event(bigint,text,uuid,jsonb,jsonb)','e86c6336522d4db4d71007e30a3871bf'),
  ('app_private.task_core(text,jsonb,uuid)','715bb7ddba11b0b593a84635c6c686c0'),
  ('app_private.task_validate_args_20261011(text,jsonb)','3855afde02755556b4612fd8a81c4feb'),
  ('app_private.task_dispatch_20261011(text,jsonb,uuid)','54ec5d31377140e29dc8f39b0fa04349'),
  ('public.tasks_command(text,jsonb,uuid)','acd1440c328200886212e66350a054a1'),
  ('app_private.task_result_command(text,jsonb,uuid)','513f570afa496c95e36bc0e4a905d60c'),
  ('app_private.task_file_read(uuid)','42271be4661a61c271eb1bd425cb5896'),
  ('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)','688ebf8e74973ad577ec913aee8ca6e4'),
  ('app_private.task_completion_guard()','70365495950e66bbeb24a8c48b003ff6'),
  ('app_private.task_progress(bigint)','a721885cdfe1cb25b82ca397a5add66c'),
  ('app_private.task_descendants(bigint)','d22adf8226174d325f9243bfdac5b302'),
  ('app_private.task_hierarchy_command(text,jsonb,uuid)','8bd9d8102d24211ff677cb542f50d883'),
  ('public.tasks_list(jsonb)','3f69a765c50c1d3852e5745f6e01119f'),
  ('public.tasks_details(bigint)','26f06040e6251bcd948477d9073a7a55'),
  ('public.tasks_events(bigint,bigint)','4b1ab71c7d745d8e71195ddf1f4f3c26'),
  ('public.tasks_parent_candidates(bigint,text,integer)','39a09291c075bc945f796769303fa0e9'),
  ('public.tasks_notifications(text,bigint,integer)','7aaff876a88d886e25b0032a0532d9ea'),
  ('public.tasks_notifications_unread()','dc73119f0f54dd1f69fb8e95237467c0'),
  ('public.tasks_storage_select(text)','c939a4ea96a0b25c65e67fe394ed1a93'),
  ('public.tasks_storage_read(text)','c022403a6a5432ceb9bea47353898b2b'),
  ('public.tasks_file(uuid)','c187c7ce6841d2d15f6c9d83d4b14e36')
)
SELECT e.signature, md5(p.prosrc) AS actual_md5, e.md5 AS expected_md5,
       CASE WHEN p.oid IS NULL THEN 'MISSING' WHEN md5(p.prosrc) = e.md5 THEN 'OK' ELSE 'MISMATCH - review' END AS status
FROM expected e LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
ORDER BY e.signature;

-- O3. Foreign keys (no CASCADE expected), RLS, triggers (task_completion_guard enabled=O), RPC privileges
--     (anon=false everywhere, authenticated=true), Task_notifications table privileges (both false).
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

-- O4. Bucket and policies: tasks_file_select must use public.tasks_storage_select(name), no foldername;
--     tasks_file_insert unchanged; allowed types include application/msword and application/vnd.ms-excel.
SELECT 'bucket' AS kind, id AS name, 'public=' || public || ' limit=' || file_size_limit AS detail,
       array_to_string(allowed_mime_types, ', ') AS expression
  FROM storage.buckets WHERE id = 'tasks-private'
UNION ALL
SELECT 'policy', policyname, cmd || ' to ' || array_to_string(roles, ','), coalesce(qual, with_check)
  FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'tasks_file_%'
ORDER BY 1, 2;

-- O5. Data snapshot: identical to pre-flight P8 (the migrations change no rows; only the bucket allowlist).
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
