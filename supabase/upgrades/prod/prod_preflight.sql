-- Production pre-flight (READ-ONLY). Target: First Zagotowki, ssheqxdgsmndiutthxvd.
-- Run P1 alone first ("Run selected") and confirm the project. Then run the WHOLE file: the visible result is P4.
-- Nothing is written. No personal data is returned (identifiers and counts only).
-- Order of the Production package (docs/production-database-rollout-uk.md):
--   prod_preflight -> prod_migration_history -> prod_gap_analysis -> inventories -> (approved changes) -> prod_postflight
--   -> prod_acceptance_checks.

-- P1. Which database is this? Compare with what you know of Production (employees, orders, locations).
SELECT current_database() AS database, current_user AS role, split_part(version(), ' on ', 1) AS postgres_version,
       now() AS server_time, current_setting('TimeZone') AS timezone,
       (SELECT count(*) FROM public."Employees") AS employees,
       (SELECT count(*) FROM public."Locations") AS locations,
       (SELECT count(*) FROM public."Orders") AS orders,
       to_regclass('app_private.production_module_releases') IS NOT NULL AS has_release_journal,
       to_regclass('app_private.production_upgrade') IS NOT NULL AS has_legacy_upgrade_state,
       to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_cli_history;

-- P2. Sessions and locks right now (a deployment needs short exclusive locks on the affected functions only).
SELECT state, count(*) AS sessions, max(now() - xact_start) AS longest_transaction, max(now() - query_start) AS longest_query
FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()
GROUP BY state ORDER BY state;

-- P3. Size of the Work tables touched by the pending Work / attachment changes (lock and duration estimate).
SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows, pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('Tasks', 'Task_events', 'Task_files', 'Task_notifications', 'Employees')
ORDER BY c.relname;

-- P4. Readiness summary for the known pending changes (one row per check).
SELECT check_name, actual, verdict FROM (VALUES
  (1, 'release journal present (Production marker)',
      (to_regclass('app_private.production_module_releases') IS NOT NULL)::text,
      CASE WHEN to_regclass('app_private.production_module_releases') IS NOT NULL THEN 'OK - Production-style database'
           ELSE 'STOP if you expected Production: this looks like UAT / local' END),
  (2, 'CLI migration history table',
      (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text,
      CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
           THEN 'expected on Production: never use supabase db push / migration repair here' ELSE 'present' END),
  (3, 'Work hierarchy (202611110001): tasks_notifications_unread()',
      (to_regprocedure('public.tasks_notifications_unread()') IS NOT NULL)::text,
      CASE WHEN to_regprocedure('public.tasks_notifications_unread()') IS NOT NULL THEN 'present' ELSE 'MISSING - 202611110001 not applied' END),
  (4, 'Work finalize (202611120001): attachment type check in task_result_command',
      coalesce((position('ATTACHMENT_TYPE' IN pg_get_functiondef(to_regprocedure('app_private.task_result_command(text,jsonb,uuid)'))) > 0)::text, 'function missing'),
      CASE WHEN to_regprocedure('app_private.task_result_command(text,jsonb,uuid)') IS NULL THEN 'function missing'
           WHEN position('ATTACHMENT_TYPE' IN pg_get_functiondef(to_regprocedure('app_private.task_result_command(text,jsonb,uuid)'))) > 0 THEN 'present'
           ELSE 'NOT APPLIED' END),
  (5, 'Attachment name/type (202611120002) marker in task_result_command',
      coalesce((position('202611120002' IN pg_get_functiondef(to_regprocedure('app_private.task_result_command(text,jsonb,uuid)'))) > 0)::text, 'function missing'),
      CASE WHEN to_regprocedure('app_private.task_result_command(text,jsonb,uuid)') IS NULL THEN 'function missing'
           WHEN position('202611120002' IN pg_get_functiondef(to_regprocedure('app_private.task_result_command(text,jsonb,uuid)'))) > 0 THEN 'present'
           ELSE 'NOT APPLIED' END),
  (6, 'Removed-attachment Storage rule (202611140001): tasks_storage_select(text)',
      (to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL)::text,
      CASE WHEN to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL THEN 'present' ELSE 'NOT APPLIED - the effect depends on the read policy row below' END),
  (7, 'storage read policy for tasks-private (name tasks_file_select*, Dashboard may add a suffix)',
      coalesce((SELECT string_agg(policyname || ': ' || coalesce(qual, ''), ' | ') FROM pg_policies
                WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT'
                  AND (policyname LIKE 'tasks_file_select%' OR qual LIKE '%tasks-private%')), 'none'),
      CASE WHEN EXISTS (SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT'
                        AND (policyname LIKE 'tasks_file_select%' OR qual LIKE '%tasks-private%') AND qual LIKE '%tasks_storage_select%') THEN 'upgraded'
           WHEN EXISTS (SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT'
                        AND (policyname LIKE 'tasks_file_select%' OR qual LIKE '%tasks-private%'))
             THEN 'OLD RULE - removed attachments readable by their uploader; upgrade after 202611140001'
           ELSE 'NONE - nobody can read tasks-private objects (attachments cannot be opened); create with tasks-private-policies.sql after 202611140001' END),
  (7, 'storage upload policy for tasks-private (name tasks_file_insert*)',
      coalesce((SELECT string_agg(policyname || ': ' || coalesce(with_check, ''), ' | ') FROM pg_policies
                WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT'
                  AND (policyname LIKE 'tasks_file_insert%' OR with_check LIKE '%tasks-private%')), 'none'),
      CASE WHEN EXISTS (SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT'
                        AND (policyname LIKE 'tasks_file_insert%' OR with_check LIKE '%tasks-private%'))
           THEN 'present' ELSE 'NONE - uploads to tasks-private are refused' END),
  (8, 'bucket tasks-private',
      coalesce((SELECT 'public=' || public || ' limit=' || coalesce(file_size_limit::text, '-') FROM storage.buckets WHERE id = 'tasks-private'), 'missing'),
      CASE WHEN EXISTS (SELECT FROM storage.buckets WHERE id = 'tasks-private' AND NOT public) THEN 'present, private' ELSE 'CHECK' END),
  (9, 'objects in tasks-private', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tasks-private')::text, 'information'),
  (10, 'active employees with tasks.access via role',
      (SELECT count(*) FROM public."Employees" e WHERE e.active AND e.archived_at IS NULL
         AND EXISTS (SELECT FROM app_private.role_permissions p WHERE p.role = e.role AND p.permission = 'tasks.access'))::text, 'information')
) AS v(nr, check_name, actual, verdict) ORDER BY nr, check_name;
