# Work module update — rollout notes

Scope: migrations `202611110001_work_hierarchy.sql`, `202611120001_work_finalize.sql`,
`202611120002_attachment_name_type.sql`, `202611140001_attachment_storage_read.sql`, the Storage policy script
`supabase/storage/tasks-private-policies-202611140001.sql` and the frontend on branch `feature/claude-refactoring`.
This work never wrote to UAT or PROD: every remote check was a read-only probe with the public anon key (§9).

## 1. Database

- One additive migration. It adds columns (`Tasks.deleted_at/deleted_by_employee_id`,
  `Task_files.removed_at/removed_by_employee_id`), one table (`Task_notifications`, RLS on, no client grants),
  a BEFORE UPDATE trigger (`task_completion_guard`), helper functions and new/replaced RPCs
  (`tasks_list(jsonb)`, `tasks_details`, `tasks_events`, `tasks_parent_candidates`, `tasks_notifications`,
  `tasks_notifications_unread`). Existing functions are extended with the repository's string-replacement
  pattern and guarded by `SCHEMA_DRIFT` checks, so the migration aborts if a remote function differs.
- Rollback (manual, if ever needed): drop the trigger and the new functions/table/columns in reverse order.
  No data is rewritten by the migration, so rolling back loses only notifications and soft-delete marks.
- Apply with the standard CLI flow used for earlier migrations (`supabase db push` on UAT first). Run
  `tests/work-hierarchy.test.mjs` (PGlite) before pushing; run the docker-based `tests/tasks-database.mjs`
  where docker is available.
- Storage: no new bucket or policy. `tasks-private` keeps its 20 MiB limit and MIME allowlist. Removed
  attachments stay in the bucket (no delete policy exists); they are unreadable through the app.

## 2. Frontend

- Build: `VITE_SUPABASE_URL=<uat url> VITE_SUPABASE_ANON_KEY=<public key> npx vite build --mode uat`.
- The global language bar is hidden only while the Work module is mounted (`body.work-module-active`);
  other modules are unchanged.
- Reports and Schedule remain in the bundle (lazy `TasksApp` chunk) but are not reachable; re-enable by
  restoring the commented lines in `src/tasks/TasksApp.jsx` and the entries in `src/tasks/shell/navigation.js`.

## 3. UAT acceptance checklist (manual, hosted Auth)

1. Create a root task, a subtask (title only) and a third-level subtask; check defaults of the quick-created child.
2. Try to complete the parent while a child is open → message about unfinished subtasks; complete children, then the parent.
3. Check progress 2/4 = 50 % with a completed grandchild; a task without children shows «—».
4. Filter by a nested task's title → only its ancestor chain is shown as context rows.
5. Switch Мої / Команди / Релевантні / Всі as a manager with direct reports and as a specialist.
6. Edit description and deadline in the workspace → activity shows old/new values.
7. Upload an image and a PDF, open both, remove one as the uploader and as the task creator.
8. Comment as another user → bell counter increments; open notification → task opens and is marked read; mark all read.
9. Delete a leaf task (confirmation names the task); deleting a parent with children is refused with an explanation.
10. Confirm Reports/Schedule are absent from navigation; Admin panel opens from the header for `tasks.admin`.
11. Check 375 px, 768 px and 1440 px: bottom navigation on phones, sidebar on desktop, no horizontal scroll.

## 4. Second migration `202611120001_work_finalize.sql` (2026-11-12)

- Adds `application/msword` and `application/vnd.ms-excel` to the `tasks-private` bucket allowlist (only if
  missing; limit, privacy and policies unchanged).
- `file_register` additionally refuses types outside the bucket allowlist (`ATTACHMENT_TYPE`) and empty or
  oversized files (`ATTACHMENT_TOO_LARGE`); Storage already enforced both on upload, the server now does too.
- `task_notify`: an assignment that leaves the assignee unchanged creates no notification (D-14).
- No table, column or row changes. Both functions are patched with `SCHEMA_DRIFT` guards.
- Rollback: `UPDATE storage.buckets SET allowed_mime_types = array_remove(array_remove(allowed_mime_types,
  'application/msword'),'application/vnd.ms-excel') WHERE id='tasks-private';` and recreate the two functions
  from the previous migration (the inserted blocks are delimited by `202611120001` comments).

## 5. Impact on existing data (both migrations)

| Change | Existing rows affected | Notes |
|---|---|---|
| New nullable columns on `Tasks`, `Task_files` | none rewritten | `NULL` = not deleted / not removed |
| `Task_notifications` table | none | starts empty; history is not back-filled |
| Completion guard trigger | none rewritten | applies only to future status changes; an existing parent with open children cannot be completed until they are |
| `tasks_list(jsonb)` default `tab='all'` | none | earlier callers keep their behaviour (D-15) |
| Bucket allowlist | bucket config only | two MIME types added |

Read-only pre-flight queries for UAT (run as the project owner before `db push`):

```sql
SELECT count(*) AS tasks, count(*) FILTER (WHERE parent_task_id IS NOT NULL) AS subtasks FROM public."Tasks";
-- parents that are still open while having open children (the guard will block completing them later)
SELECT p.id, p.status, count(c.*) AS open_children FROM public."Tasks" p
JOIN public."Tasks" c ON c.parent_task_id = p.id AND c.status NOT IN ('completed','cancelled')
WHERE p.status NOT IN ('completed','cancelled') GROUP BY p.id, p.status ORDER BY open_children DESC LIMIT 20;
-- already completed parents with unfinished children (left untouched; reported for awareness)
SELECT count(*) FROM public."Tasks" p WHERE p.status = 'completed' AND EXISTS
 (SELECT 1 FROM public."Tasks" c WHERE c.parent_task_id = p.id AND c.status NOT IN ('completed','cancelled'));
SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'tasks-private';
SELECT max(version) FROM supabase_migrations.schema_migrations;
```

## 6. UAT execution status (2026-11-12)

**Not executed — blocked.** This workstation has no Supabase CLI, no `SUPABASE_ACCESS_TOKEN`, and no UAT
database connection string or password (only `psql`/`pg_dump` binaries). A valid UAT backup therefore cannot
be confirmed either, and the runbook requires one before any migration. PROD was not touched.

To run it, an operator with UAT access:
1. Confirms the target ref is `meuzkduxttjcuiynsnaa` (UAT), never `ssheqxdgsmndiutthxvd` (PROD).
2. Takes / confirms a backup (Dashboard → Database → Backups, or `pg_dump --schema-only` + data dump of
   `public."Tasks"`, `"Task_files"`, `"Task_events"`) and records its timestamp.
3. Runs the pre-flight queries above and keeps the output.
4. `supabase link --project-ref meuzkduxttjcuiynsnaa && supabase db push` (applies `202611110001` and
   `202611120001`); any `SCHEMA_DRIFT` error aborts the transaction without changes.
5. Builds and deploys the UAT frontend, then walks the checklist in section 3 plus: legacy Word/Excel upload,
   unsupported and >20 MB files refused, task deep link `?task=<id>`, «Модулі» button, notification on
   reassignment only to the new assignee / author / participants.

Note (2026-11-12): `.env` then pointed `VITE_SUPABASE_URL` at the PROD project ref. Since 2026-11-14 it points at UAT
`meuzkduxttjcuiynsnaa` (operator change, see §9 and D-50).

## 7. Migration `202611120002_attachment_name_type.sql` (2026-11-12)

- Patches `app_private.task_result_command` only: `file_register` refuses a file whose name extension does not match
  its declared type (`ATTACHMENT_TYPE`). No table, row or bucket change. Guarded by `SCHEMA_DRIFT`; requires
  `202611120001` to be applied first. Rollback: re-apply the previous function definition (block delimited by
  `202611120002` comments).

## 7a. Migration `202611140001_attachment_storage_read.sql` + Storage policy script (2026-11-14, D-47)

- Adds `public.tasks_storage_select(p_key text)` (SECURITY DEFINER, `EXECUTE` for `authenticated` only). A registered
  object follows `app_private.task_file_read` (active file and task / process read rights; removed files never); an
  unregistered object (between upload and `file_register`) is readable only in the uploader's folder.
- Guards: stops with `SCHEMA_DRIFT` if the function already exists or if `task_file_read` lacks the 202611110001
  removed-file check. No table, row, bucket or object change.
- The Storage policy is changed separately (Storage policies are never part of migrations):
  `supabase/storage/tasks-private-policies-202611140001.sql` runs `ALTER POLICY tasks_file_select … USING
  (bucket_id = 'tasks-private' AND app_private.has_permission('tasks.access') AND public.tasks_storage_select(name))`
  and stops if the function is missing, the policy is missing, or its current definition is not the 2026-10 one.
  A project without the `tasks_file_*` policies uses `tasks-private-policies.sql` (fresh install, same definition).
- Rollback: the previous `USING` expression is in the header of the policy script; then
  `DROP FUNCTION public.tasks_storage_select(text)`. Rolling back re-opens the removed-file exposure.

## 8. Release gates (status 2026-11-14)

| Gate | Status | Notes |
|---|---|---|
| Local verification (lint, build, Node + PGlite DB tests, browser suite) | **Passed** | requirements matrix «Verification run (2026-11-14)»; one pre-existing browser failure (D-31) |
| Local visual QA (1440 / 1024 / 768, basic 375) | **Passed** (2026-11-12/13) | D-38, D-41; no screenshots in the repository |
| Configured Supabase project | UAT `meuzkduxttjcuiynsnaa` (since 2026-11-14) | read-only anon probes only (§9); nothing written |
| Docker-based DB suites (`tests/tasks-database.mjs`, `tests/tasks-processes-database.mjs`) | **Not run** | no docker in this environment |
| UAT: `202611110001` … `202611140001` + Storage policy script | **Applied** (operator P10, 2026-11-15; anon probe confirms `tasks_storage_select`) | D-54; CLI history reconciliation still pending (`docs/work-module-uat-sql-editor.md` §8) |
| Authenticated integration tests against UAT (RPC, permissions, hierarchy, notifications, attachments) | **Not run — blocked** | no test credentials or operator session in this environment |
| Notifications on UAT (generation, isolation, read state) | **Pending** | 0 notifications explained by D-52; run the diagnostic and the two-account scenarios (`docs/work-module-uat-acceptance-guide.md` §0–§2) |
| Attachment security with real files (owner, participant, unrelated, removed, direct Storage API) | **Pending** | `docs/work-module-uat-acceptance-guide.md` §3 |
| Hosted acceptance on UAT (checklist §3, §11) | **Not run** | depends on the rows above and a UAT frontend deploy |
| Production release | **Not ready** | PROD lacks `202611110001` (D-42, probe 2026-11-13); requires the UAT gates and a production backup |

Hosted acceptance must additionally cover: default list view «Мої завдання» (D-46) and the four view modes, bulk
delete (parents excluded, partial failure message), legacy DOC / XLS uploads, a renamed file being refused, a removed
attachment refused through Storage for its uploader (§11 E), process launch form, critical-task dialog, and the tablet
icon rail at 768–900 px.

## 9. State of the configured Supabase project (read-only probes)

**2026-11-13 — production ref** (then in `.env`): `tasks_notifications_unread` → `PGRST202`; none of the Work
migrations applied (D-42). The app shows a notice, nests legacy rows client-side and, since D-48, the task list falls
back to the legacy query contract.

**2026-11-14 — UAT `meuzkduxttjcuiynsnaa`** (`.env` changed by the operator; D-50). Method: public anon key only,
no data returned. An RPC that exists answers `42501 permission denied` (anon has no `EXECUTE`), a missing one
`PGRST202`; a zero-row column selection (`?select=<column>&limit=0`) answers `42501` for an existing column and
`42703` for a missing one (control: a made-up column → `42703`).

| Object | Result | Meaning |
|---|---|---|
| RPCs `tasks_list`, `tasks_details`, `tasks_events`, `tasks_parent_candidates`, `tasks_notifications`, `tasks_notifications_unread`, `tasks_file`, `tasks_storage_read`, `tasks_command` | `42501` | exist; anon denied (as intended) |
| `tasks_storage_select(p_key)` | not present | `202611140001` not applied (expected) |
| `Tasks.deleted_at`, `Tasks.deleted_by_employee_id`, `Task_files.removed_at`, table `Task_notifications` | `42501` | `202611110001` objects exist |
| `Employees.position` (`202610260001_employee_positions`) | `42703` | **missing** |
| `Work_shifts.current_shift_function` (`202610280001_shift_functions`) | `42703` | **missing** |
| `Orders.integration_sbid` (`202610100001_order_ingest`, production-targeted) | `42703` | missing (documented as production-only) |

So the UAT schema is **not** a prefix of the repository chain: `202611110001` was applied while at least
`202610260001` and `202610280001` were not. A plain `supabase db push` would also try to apply those (and the
production-only order-ingest pair) — or refuse because of the out-of-order history. **Do not run a blind
`db push`.** Apply only the intended files (§10) and record them with `supabase migration repair`.

**2026-11-15 — both projects, full-chain marker probe** (`.env` now targets production; the UAT values remain as
comments). Same method, automated over every migration: each public function, table and added column a migration
introduces was probed on both projects (156 objects; 35 of the 46 migrations create anon-visible objects). No probe
executed anything — every answer was `42501`, `PGRST202` or `42703`.

| Migration | UAT | Production |
|---|---|---|
| 31 migrations from `202609230001_auth` to `202611110001_work_hierarchy` not listed below | all objects present | all objects present |
| `202610070001_manager_email_auth` (`auth_email_access`, `auth_invite_command`) | **missing** — the employee invite dialog (`EmailInvite`) cannot work on UAT | present |
| `202610100001_order_ingest`, `202610100002_order_location_routing` | missing (production-only by design) | present |
| `202610260001_employee_positions`, `202610280001_shift_functions` | **missing** (L-10) | present |
| `202611140001_attachment_storage_read` (`tasks_storage_select`) | present | **missing** — the removed-attachment Storage fix (D-47) is not applied |

Not visible to the anon key, so unknown on production until the operator runs the read-only SQL files there:
`202611120001`, `202611120002` and the nine other migrations that only change function bodies or private schemas,
the `tasks-private` bucket and its policies, the migration history, the data volumes and notification counts.
The files in `supabase/upgrades/uat/` (pre-flight P1–P10, post-flight O1–O5, the notification diagnostic and the
user checks) contain no write statement and may be run on production unchanged, one numbered query at a time; on
production their P10 "RUN" verdicts are information only — applying anything there needs an explicit release decision.

Operator result, production, 2026-11-15: the pre-flight stopped at P3 with `relation
"supabase_migrations.schema_migrations" does not exist` — production has **no CLI migration history**: its
migrations were applied by hand, so its state can only be established from schema evidence (P4 / P10). P3 now reads
the history table dynamically and reports "NO HISTORY TABLE" instead of failing (tested on PGlite with and without
the table; whole-file run and post-flight O1–O5 clean in both cases).

**Production package (2026-11-15, D-55).** Read-only gap analysis for Production: `supabase/upgrades/prod/`
(pre-flight, release journal + per-migration evidence, full repository-vs-database diff, inventories, post-flight,
acceptance). Operator guide in Ukrainian: `docs/production-database-rollout-uk.md`. Nothing has been applied to
Production.

## 10. Operator runbook — UAT `meuzkduxttjcuiynsnaa` (requires owner / `postgres` access)

**Step-by-step SQL Editor version with tested read-only pre-/post-flight files: `docs/work-module-uat-sql-editor.md`.**

Needed: Dashboard SQL editor or `psql` with the UAT connection string (never the anon key), a fresh backup, and the
repository at this branch. Stop at any unexpected result.

**Pre-flight (read-only)**

```sql
SELECT current_database(), now();                                   -- confirm you are on Zagotowki - UAT
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;   -- compare with supabase/migrations
SELECT to_regprocedure('public.tasks_notifications_unread()') IS NOT NULL                         AS has_202611110001,
       position('ATTACHMENT_TYPE' IN pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure)) > 0 AS has_202611120001,
       position('202611120002'    IN pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure)) > 0 AS has_202611120002,
       to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL                          AS has_202611140001;
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'tasks-private';
SELECT policyname, cmd, qual, with_check FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'tasks_file_%';
```
Also run the data pre-flight queries from §5 and keep all output with the backup timestamp.

**Apply (one file at a time, in this order, only those still missing)**

1. `202611120001_work_finalize.sql` — if `has_202611120001` is false.
2. `202611120002_attachment_name_type.sql` — if `has_202611120002` is false (needs 202611120001).
3. `202611140001_attachment_storage_read.sql`.
4. Storage: `supabase/storage/tasks-private-policies-202611140001.sql` if `tasks_file_select` exists with the 2026-10
   definition; `supabase/storage/tasks-private-policies.sql` if no `tasks_file_*` policy exists; otherwise stop.
5. Record manually applied versions: `supabase migration repair --status applied <version> --project-ref meuzkduxttjcuiynsnaa`.

`SCHEMA_DRIFT …` or `STOP: …` aborts that file inside its transaction without changes — review, do not edit around it.
`202610260001` / `202610280001` are separate modules (positions, shift functions) and need their own decision.

**Post-flight (read-only)**

```sql
-- all four flags true
SELECT to_regprocedure('public.tasks_notifications_unread()') IS NOT NULL, position('ATTACHMENT_TYPE' IN pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure)) > 0,
       position('202611120002' IN pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure)) > 0, to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL;
-- privileges: anon none, authenticated execute
SELECT has_function_privilege('anon','public.tasks_storage_select(text)','EXECUTE') AS anon_exec,
       has_function_privilege('authenticated','public.tasks_storage_select(text)','EXECUTE') AS auth_exec;
SELECT qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select'; -- uses tasks_storage_select, no foldername
SELECT 'application/msword' = ANY(allowed_mime_types) AND 'application/vnd.ms-excel' = ANY(allowed_mime_types) FROM storage.buckets WHERE id = 'tasks-private';
SELECT count(*) FROM public."Tasks";                                  -- unchanged against the pre-flight count
```

## 11. Post-migration acceptance on UAT (authenticated, real project — not mocked)

Run with two test accounts (a manager with a direct report, and that report) on the UAT frontend or `npm run dev`
with the UAT `.env`. Record pass / fail with date and account roles in the requirements matrix.

- **A. Task list:** `tasks_list` accepts `view` / `page_size` / `dir` (no legacy notice); rows carry `tree_parent_id`,
  `depth`, `match`, `progress`; page counter matches root tasks; each sort and direction; Мої / Команди / Релевантні / Всі
  return the expected tasks for each account; tab counters.
- **B. Subtasks:** five levels created through the list, workspace and create dialog; no duplicate rows; parent
  progress 2/4 = 50 % with a completed grandchild; completing a parent with an open child is refused; reparenting keeps
  the subtree; cycle and self-parent refused.
- **C. Notifications:** comment by the other account → bell count +1; open → task opens, read state persists after
  reload; «Позначити всі як прочитані»; one notification per event; actor gets none.
- **D. Workspace:** open, edit title / description / deadline, change status, priority, assignee and parent; activity
  shows old / new values; attachments upload, preview, open, download, remove.
- **E. Deletion and attachments:** single and bulk delete (parent refused, no cascade, row hidden, history kept);
  after removing an attachment, the uploader's `supabase.storage.from('tasks-private').createSignedUrl(<object_key>, 60)`
  (key read before removal through `tasks_file`) must fail, and `tasks_file` must return `TASKS_DENIED`.
