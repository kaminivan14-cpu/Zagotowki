-- Production acceptance checks as signed-in users, simulated inside the SQL Editor (READ-ONLY, no placeholders).
-- Target: First Zagotowki, ssheqxdgsmndiutthxvd (same logic as supabase/upgrades/uat/work_module_postflight_as_user.sql). Paste the WHOLE file and click Run.
-- Run it only after prod_postflight.sql is all OK. It reads real Production rows but returns only check results (no names, no contents).
-- The result is one table: check, expected, actual, status.
--
-- How it works: statement 1 (SQL Editor role) picks test data automatically — the newest live task (preferably one
-- with subtasks) and its creator, the newest removed attachment and its uploader, the newest active attachment, its
-- uploader and one other employee unrelated to that task. Each following statement switches the JWT subject and the
-- role `authenticated` exactly as PostgREST does (set_config(..., true): local to this single run, gone afterwards)
-- and stores its findings in transaction-local variables `work_check.*`; the last statement prints them.
-- Nothing is written: only SELECTs and STABLE read functions. Works before and after the deployment steps: before
-- step 4 / step 5 the Storage rows report the known exposure as "expected before step 5".
-- Limits: this exercises database functions and RLS for those users, not the PostgREST HTTP layer, the Storage API or
-- the browser (rollout §11). If the identity row shows current_user = postgres, the editor did not keep the settings.

-- 1. Pick test data (SQL Editor role).
SELECT set_config('work_check.task_id',        coalesce(pick.task_id, ''), true),
       set_config('work_check.list_user',      coalesce(pick.list_user, ''), true),
       set_config('work_check.removed_key',    coalesce(rm.object_key, ''), true),
       set_config('work_check.removed_user',   coalesce(rm.uploader, ''), true),
       set_config('work_check.active_key',     coalesce(act.object_key, ''), true),
       set_config('work_check.active_user',    coalesce(act.uploader, ''), true),
       set_config('work_check.active_task',    coalesce(act.task_id, ''), true),
       set_config('work_check.other_user',     coalesce(oth.auth_user_id, ''), true),
       set_config('work_check.other_role',     coalesce(oth.role, ''), true),
       set_config('work_check.policy_new',
         (EXISTS (SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'tasks_file_select' AND qual LIKE '%tasks_storage_select%'))::text, true),
       set_config('work_check.function_new', (to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL)::text, true)
FROM (SELECT 1) one
LEFT JOIN LATERAL (
  SELECT t.id::text AS task_id, e.auth_user_id::text AS list_user
    FROM public."Tasks" t JOIN public."Employees" e ON e.id = t.created_by_employee_id
   WHERE t.deleted_at IS NULL AND e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL
   ORDER BY EXISTS (SELECT FROM public."Tasks" c WHERE c.parent_task_id = t.id AND c.deleted_at IS NULL) DESC, t.id DESC
   LIMIT 1) pick ON true
LEFT JOIN LATERAL (
  SELECT f.object_key, e.auth_user_id::text AS uploader
    FROM public."Task_files" f JOIN public."Employees" e ON e.id = f.uploaded_by
   WHERE f.removed_at IS NOT NULL AND f.task_id IS NOT NULL AND e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL
   ORDER BY f.removed_at DESC LIMIT 1) rm ON true
LEFT JOIN LATERAL (
  SELECT f.object_key, e.auth_user_id::text AS uploader, f.task_id::text AS task_id,
         t.assigned_to_employee_id AS assignee, t.created_by_employee_id AS creator, f.uploaded_by
    FROM public."Task_files" f JOIN public."Employees" e ON e.id = f.uploaded_by JOIN public."Tasks" t ON t.id = f.task_id
   WHERE f.removed_at IS NULL AND t.deleted_at IS NULL AND e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL
   ORDER BY f.created_at DESC LIMIT 1) act ON true
LEFT JOIN LATERAL (
  -- another active employee who works with tasks (created or holds a task) and has no link to the active file's task
  SELECT e.auth_user_id::text AS auth_user_id, e.role
    FROM public."Employees" e
   WHERE e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL
     AND e.id IS DISTINCT FROM act.uploaded_by AND e.id IS DISTINCT FROM act.assignee AND e.id IS DISTINCT FROM act.creator
     AND EXISTS (SELECT FROM public."Tasks" x WHERE x.created_by_employee_id = e.id OR x.assigned_to_employee_id = e.id)
   ORDER BY (e.role IN ('administrator', 'manager')), e.id
   LIMIT 1) oth ON true;

-- 2. Become the task creator (what PostgREST does for that user's API call).
SELECT set_config('request.jwt.claim.sub', current_setting('work_check.list_user'), true),
       set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('work_check.list_user'), ''), 'role', 'authenticated')::text, true),
       set_config('role', 'authenticated', true);

-- 3. Task list contract, views, pagination, sorting, hierarchy fields, notifications, picker, details, events.
SELECT set_config('work_check.list', CASE WHEN current_setting('work_check.list_user') = '' THEN '{"skipped":true}' ELSE (
  WITH q AS (SELECT v.view, public.tasks_list(jsonb_build_object('page', 1, 'page_size', 10, 'view', v.view, 'tab', 'active', 'sort', 'deadline', 'dir', '')) AS r
               FROM (VALUES ('my'), ('team'), ('relevant'), ('all')) v(view)),
       p AS (SELECT public.tasks_list('{"page":1,"page_size":2,"view":"all","tab":"all","sort":"title","dir":"asc"}'::jsonb) AS p1,
                    public.tasks_list('{"page":2,"page_size":2,"view":"all","tab":"all","sort":"title","dir":"asc"}'::jsonb) AS p2,
                    public.tasks_list('{"page":1,"page_size":2,"view":"all","tab":"all","sort":"title","dir":"desc"}'::jsonb) AS d1),
       d AS (SELECT public.tasks_details(current_setting('work_check.task_id')::bigint) AS d,
                    public.tasks_events(current_setting('work_check.task_id')::bigint, NULL) AS e)
  SELECT jsonb_build_object(
    'current_user', current_user, 'auth_uid', auth.uid(),
    'views', (SELECT jsonb_object_agg(view, jsonb_build_object('page_size', r->'page_size', 'total', r->'total', 'rows', jsonb_array_length(r->'items'))) FROM q),
    'view_counters', (SELECT r->'views' FROM q WHERE view = 'all'),
    'rows', (SELECT count(*) FROM q, jsonb_array_elements(q.r->'items') i WHERE q.view = 'all'),
    'rows_with_tree_fields', (SELECT count(*) FROM q, jsonb_array_elements(q.r->'items') i WHERE q.view = 'all'
                               AND i ? 'tree_parent_id' AND i ? 'depth' AND i ? 'match' AND i ? 'progress' AND i ? 'parent_task_id'),
    'roots_total', (SELECT p1->'total' FROM p),
    'page1_roots', (SELECT jsonb_agg(i->'id') FROM p, jsonb_array_elements(p1->'items') i WHERE (i->>'depth')::int = 0),
    'page2_roots', (SELECT jsonb_agg(i->'id') FROM p, jsonb_array_elements(p2->'items') i WHERE (i->>'depth')::int = 0),
    'asc_first', (SELECT p1->'items'->0->>'title' FROM p), 'desc_first', (SELECT d1->'items'->0->>'title' FROM p),
    'unread_count', public.tasks_notifications_unread(),
    'unread_listed', jsonb_array_length(public.tasks_notifications('unread', NULL, 100)->'items'),
    'parent_candidates', jsonb_array_length(public.tasks_parent_candidates(NULL, '', 5)),
    'details_keys', (SELECT count(*) FROM d, jsonb_object_keys(d.d) k WHERE k IN
                     ('ancestors','attachments','children','children_hidden','events','incomplete_children','parent','permissions','progress')),
    'details_progress', (SELECT d.d->'progress' FROM d),
    'events', (SELECT jsonb_array_length(d.e->'events') FROM d))
)::text END, true);

-- 4. Become the uploader of the newest removed attachment.
SELECT set_config('request.jwt.claim.sub', current_setting('work_check.removed_user'), true),
       set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('work_check.removed_user'), ''), 'role', 'authenticated')::text, true);

-- 5. Removed attachment through Storage RLS, for its own uploader.
SELECT set_config('work_check.removed', CASE WHEN current_setting('work_check.removed_key') = '' THEN '{"skipped":true}' ELSE jsonb_build_object(
  'current_user', current_user, 'auth_uid', auth.uid(),
  'visible', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tasks-private' AND name = current_setting('work_check.removed_key')),
  'allowed', CASE WHEN to_regprocedure('public.tasks_storage_select(text)') IS NULL THEN NULL ELSE
    (xpath('/row/v/text()', query_to_xml(format('SELECT public.tasks_storage_select(%L) AS v', current_setting('work_check.removed_key')), false, true, '')))[1]::text END
)::text END, true);

-- 6. Become the uploader of the newest active attachment.
SELECT set_config('request.jwt.claim.sub', current_setting('work_check.active_user'), true),
       set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('work_check.active_user'), ''), 'role', 'authenticated')::text, true);

-- 7. Active attachment for its uploader.
SELECT set_config('work_check.active', CASE WHEN current_setting('work_check.active_key') = '' THEN '{"skipped":true}' ELSE jsonb_build_object(
  'visible', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tasks-private' AND name = current_setting('work_check.active_key'))
)::text END, true);

-- 8. Become the other employee.
SELECT set_config('request.jwt.claim.sub', current_setting('work_check.other_user'), true),
       set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('work_check.other_user'), ''), 'role', 'authenticated')::text, true);

-- 9. Active attachment for an employee unrelated to its task: visible exactly when the task itself is readable.
SELECT set_config('work_check.other', CASE WHEN current_setting('work_check.active_key') = '' OR current_setting('work_check.other_user') = ''
  THEN '{"skipped":true}' ELSE jsonb_build_object(
  'visible', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'tasks-private' AND name = current_setting('work_check.active_key')),
  'task_readable', EXISTS (SELECT FROM jsonb_array_elements(public.tasks_list(jsonb_build_object('page', 1, 'view', 'all', 'tab', 'all',
                     'search', '#' || current_setting('work_check.active_task')))->'items') i
                   WHERE i->>'id' = current_setting('work_check.active_task') AND (i->>'match')::boolean)
)::text END, true);

-- 10. Report.
WITH l AS (SELECT current_setting('work_check.list')::jsonb AS j),
     rm AS (SELECT current_setting('work_check.removed')::jsonb AS j),
     ac AS (SELECT current_setting('work_check.active')::jsonb AS j),
     ot AS (SELECT current_setting('work_check.other')::jsonb AS j),
     st AS (SELECT current_setting('work_check.policy_new')::boolean AS policy_new, current_setting('work_check.function_new')::boolean AS function_new)
SELECT n AS nr, check_name, expected, actual, status FROM (
 SELECT 1 AS n, 'identity (task creator)' AS check_name, 'current_user = authenticated, auth_uid set' AS expected,
        coalesce(j->>'current_user', '-') || ' / ' || coalesce(j->>'auth_uid', '-') AS actual,
        CASE WHEN j ? 'skipped' THEN 'SKIPPED - no live task with an active creator'
             WHEN j->>'current_user' = 'authenticated' AND j->>'auth_uid' IS NOT NULL THEN 'OK'
             ELSE 'STOP - editor did not keep the settings' END AS status FROM l
 UNION ALL
 SELECT 2, 'tasks_list: four views', 'page_size 10 in my / team / relevant / all', coalesce((j->'views')::text, '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN (SELECT bool_and(v->>'page_size' = '10') FROM jsonb_each(j->'views') x(k, v)) THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 3, 'tasks_list: view counters', 'object with my, team, relevant, all', coalesce((j->'view_counters')::text, '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN j->'view_counters' ?& ARRAY['my','team','relevant','all'] THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 4, 'tasks_list: hierarchy fields', 'every row has tree_parent_id, depth, match, progress, parent_task_id',
        coalesce(j->>'rows_with_tree_fields', '-') || ' of ' || coalesce(j->>'rows', '-') || ' rows',
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN j->>'rows' = '0' THEN 'n/a - no rows' WHEN j->>'rows_with_tree_fields' = j->>'rows' THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 5, 'tasks_list: pagination (2 roots per page)', 'page 1 and page 2 roots differ',
        'total roots ' || coalesce(j->>'roots_total', '-') || '; p1 ' || coalesce(j->>'page1_roots', '[]') || '; p2 ' || coalesce(j->>'page2_roots', '[]'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN coalesce((j->>'roots_total')::int, 0) < 3 THEN 'n/a - fewer than 3 root tasks'
             WHEN NOT EXISTS (SELECT FROM jsonb_array_elements(j->'page1_roots') a JOIN jsonb_array_elements(j->'page2_roots') b ON a = b) THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 6, 'tasks_list: sorting by title', 'first title ascending differs from first title descending',
        coalesce(j->>'asc_first', '-') || ' | ' || coalesce(j->>'desc_first', '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN coalesce((j->>'roots_total')::int, 0) < 2 THEN 'n/a - fewer than 2 root tasks'
             WHEN j->>'asc_first' IS DISTINCT FROM j->>'desc_first' THEN 'OK' ELSE 'CHECK - equal titles?' END FROM l
 UNION ALL
 SELECT 7, 'notifications', 'unread counter equals unread list (up to 100)',
        coalesce(j->>'unread_count', '-') || ' / ' || coalesce(j->>'unread_listed', '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN (j->>'unread_count')::int > 100 OR j->>'unread_count' = j->>'unread_listed' THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 8, 'tasks_parent_candidates', 'answers (list of up to 5)', coalesce(j->>'parent_candidates', '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN j ? 'parent_candidates' THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 9, 'tasks_details (task ' || current_setting('work_check.task_id') || ')', 'all 9 workspace keys present',
        coalesce(j->>'details_keys', '-') || ' keys; progress ' || coalesce(j->>'details_progress', 'null (no children)'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN j->>'details_keys' = '9' THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 10, 'tasks_events', 'activity events returned', coalesce(j->>'events', '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED' WHEN j ? 'events' THEN 'OK' ELSE 'FAIL' END FROM l
 UNION ALL
 SELECT 11, 'deployment state', 'tasks_storage_select exists (step 4) and tasks_file_select uses it (step 5)',
        'function ' || function_new || ', policy ' || policy_new,
        CASE WHEN function_new AND policy_new THEN 'OK' ELSE 'PENDING - steps 4/5 not applied yet' END FROM st
 UNION ALL
 SELECT 12, 'removed attachment, its own uploader', 'not visible (0), tasks_storage_select = false',
        coalesce(rm.j->>'visible', '-') || ' / ' || coalesce(rm.j->>'allowed', 'function absent'),
        CASE WHEN rm.j ? 'skipped' THEN 'SKIPPED - no removed attachment in this database (remove one in the app, then re-run)'
             WHEN rm.j->>'visible' = '0' THEN 'OK'
             WHEN NOT st.policy_new THEN 'EXPECTED BEFORE STEP 5 - known exposure (D-47)'
             ELSE 'FAIL' END FROM rm, st
 UNION ALL
 SELECT 13, 'active attachment, its uploader', 'visible (1)', coalesce(j->>'visible', '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED - no active attachment in this database' WHEN j->>'visible' = '1' THEN 'OK' ELSE 'FAIL' END FROM ac
 UNION ALL
 SELECT 14, 'active attachment, unrelated employee (role ' || current_setting('work_check.other_role') || ')',
        'visible exactly when that employee may read the task', coalesce(j->>'visible', '-') || ' / task readable ' || coalesce(j->>'task_readable', '-'),
        CASE WHEN j ? 'skipped' THEN 'SKIPPED - no attachment or no second employee'
             WHEN (j->>'visible' = '1') = (j->>'task_readable')::boolean THEN 'OK' ELSE 'FAIL' END FROM ot
 UNION ALL
 SELECT 15, 'Task_notifications table', 'no direct SELECT for authenticated (reads only through RPCs)',
        'SELECT privilege ' || has_table_privilege('authenticated', 'public."Task_notifications"', 'SELECT'),
        CASE WHEN NOT has_table_privilege('authenticated', 'public."Task_notifications"', 'SELECT') THEN 'OK' ELSE 'FAIL' END
) r ORDER BY n;
