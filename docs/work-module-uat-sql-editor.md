# Work module — UAT deployment through the Supabase Dashboard SQL Editor

Prepared 2026-11-14. **Nothing in this document has been executed.** It is the step list for the developer who
applies the SQL by hand; the SQL Editor output is returned for verification before anything is marked applied.

| Item | Value |
|---|---|
| Target | **Zagotowki - UAT**, project ref **`meuzkduxttjcuiynsnaa`** |
| Never | production `ssheqxdgsmndiutthxvd` |
| Tool | Dashboard → project → SQL Editor, role selector **postgres** (never the anon key, never `supabase db push`) |
| Read-only SQL | `supabase/upgrades/uat/work_module_preflight.sql` (P1–P9), `work_module_postflight.sql` (O1–O5), `work_module_postflight_as_user.sql` (whole file, 15 checks) |
| Tested | all three files and the execution order below were run end to end on PGlite (PostgreSQL 17.5) built from the repository chain without the four migrations UAT lacks, starting from "202611110001 applied, 2026-10 Storage policy" |

The SQL Editor shows only the result of the last statement of a run. Running the whole pre-flight file therefore
shows **P10, the decision summary** (one row per step: schema state, function evidence, history registration,
decision RUN / SKIP / STOP). For any other query select it and use **Run selected**; save every result (copy or CSV)
and send them back. P10 was tested in three states: hierarchy only (RUN 2–5), 202611120001 already applied (SKIP 2,
RUN 3–5) and everything applied (SKIP all).

## 1. Confirm the target

1. The browser URL is `https://supabase.com/dashboard/project/meuzkduxttjcuiynsnaa/...` and the project name in the
   header is **Zagotowki - UAT**. If either differs: stop.
2. Run **P1**. Note the PostgreSQL version and check that `employees` / `tasks` look like UAT test data.

## 2. Backup readiness (all boxes before any change)

- [ ] Dashboard → Database → Backups: the newest backup timestamp is today, or a fresh backup / PITR point is
      recorded. If the plan has no backups, a `pg_dump` taken with the UAT connection string replaces it.
- [ ] P1–P9 results saved, especially **P8** (data snapshot) and **P9** (current function and policy definitions:
      the exact material to restore the objects that steps 2–5 replace).
- [ ] Nobody else is changing UAT during the window.
If a box cannot be ticked: stop.

## 3. What is known before the pre-flight

Evidence so far comes only from read-only anon probes (rollout §9); the migration history table was never read.

| Migration | Evidence today | Unknown |
|---|---|---|
| `202611110001_work_hierarchy` | its RPCs and columns exist on UAT | history registration; whether definitions match the file |
| `202611120001_work_finalize` | none (function-body / bucket patch) | applied or not |
| `202611120002_attachment_name_type` | none (function-body patch) | applied or not |
| `202611140001_attachment_storage_read` | `tasks_storage_select` absent | — (not applied) |
| `202610260001_employee_positions` | `Employees.position` missing | history |
| `202610280001_shift_functions` | `Work_shifts.current_shift_function` missing | history |

The pre-flight replaces this table with facts: **P3** (history vs repository), **P4** (schema evidence per
migration, verdict APPLIED / NOT APPLIED / PARTIAL - STOP), **P5** (md5 of each function body compared with the body
the repository produces after each migration).

## 4. Dependencies

```
202610060001 tasks_admin_processes ── Task_files, task_file_read, tasks_file, bucket tasks-private
        │
202610150001 task_process_schedules ── renames the validator to task_validate_args_20261011
        │
202611110001 work_hierarchy ── patches task_event, task_core, task_validate_args_20261011, task_dispatch_20261011,
        │                      tasks_command, task_result_command, task_file_read; creates task_notify …
        ├── 202611120001 work_finalize  (anchors in task_result_command and in task_notify from 202611110001)
        │        └── 202611120002 attachment_name_type  (anchor "-- end 202611120001")
        └── 202611140001 attachment_storage_read  (needs task_file_read with the 202611110001 removed-file check)
                 └── storage/tasks-private-policies-202611140001.sql  (needs public.tasks_storage_select)
```

`202610260001_employee_positions` and `202610280001_shift_functions` are **not** prerequisites: they touch the outer
`task_validate_args` wrapper, process functions, shifts, orders and worktime, none of which the Work migrations read
or patch. Replaying the chain with and without them gives identical bodies for every Work function (P5 hashes are
the same). They are separate modules and are **not** part of this deployment. The production-only order-ingest pair
`202610100001` / `202610100002` is likewise out of scope.

## 5. Execution order and decision table

Run a step only when the pre-flight says so. "Expected" = the result most likely given §3.

| # | File | Depends on | Run when (pre-flight) | Expected | Schema change | Verify after |
|---|---|---|---|---|---|---|
| 1 | `supabase/migrations/202611110001_work_hierarchy.sql` | 202610060001, 202610150001 | **never in this deployment** if P4 = APPLIED and P5 shows `202611110001` (or later) for its functions | skip | — | P4 / O1 |
| 2 | `supabase/migrations/202611120001_work_finalize.sql` | step 1 | P4 `202611120001` = NOT APPLIED **and** P5: `task_result_command` and `task_notify` → `202611110001` | run | bucket + 2 MIME types; bodies of `task_result_command`, `task_notify` | P4 row group `202611120001` = APPLIED; P5 `task_result_command` → `202611120001`, `task_notify` → `202611120001` |
| 3 | `supabase/migrations/202611120002_attachment_name_type.sql` | step 2 | P4 `202611120002` = NOT APPLIED and `task_result_command` → `202611120001` | run | body of `task_result_command` | P5 `task_result_command` → `202611120002` |
| 4 | `supabase/migrations/202611140001_attachment_storage_read.sql` | step 1 | P4 `202611140001` = NOT APPLIED | run | new function `public.tasks_storage_select(text)` + grants | P4 `202611140001` = APPLIED |
| 5 | `supabase/storage/tasks-private-policies-202611140001.sql` | step 4 | P7 `tasks_file_select` contains `foldername` and `tasks_storage_read` (2026-10 definition) | run | `USING` of policy `tasks_file_select` only | P7 / O4: uses `tasks_storage_select`, no `foldername` |
| 5′ | `supabase/storage/tasks-private-policies.sql` | step 4 | only if P7 lists **no** `tasks_file_*` policy | unlikely | creates both policies | same |

Then run the post-flight (§7) and only then the history reconciliation (§8).

If 202611120001 is already APPLIED (and P5 confirms it), skip step 2; same rule for step 3. Never re-run step 1: it is
not idempotent (`ADD COLUMN`, `CREATE TABLE`, `CREATE FUNCTION` without `IF NOT EXISTS`). A re-run would fail on
its first statement and roll back, so it cannot damage data, but it proves nothing and must not be used as a probe.

## 6. Step instructions

General: one file per run. Open the file in the repository, copy its **entire** content, paste into a new SQL
Editor tab, check the role selector says `postgres`, click **Run**. Expected success: "Success. No rows returned".
After an error: run `ROLLBACK;` as a separate query (harmless if no transaction is open), save the message, stop.

**Step 2 — `202611120001_work_finalize.sql`.** The file has no `BEGIN` / `COMMIT` of its own: three `DO` blocks (bucket
allowlist, `task_result_command` patch, `task_notify` patch). Type `BEGIN;` on the first line, paste the file below it,
and type `COMMIT;` on the last line, so the three blocks succeed or fail together. Guards: `SCHEMA_DRIFT
task_result_command` (anchor missing or already patched), `SCHEMA_DRIFT task_notify`. Rollback reference: the file
header (remove the two MIME types; restore the function definitions saved by P9).

**Step 3 — `202611120002_attachment_name_type.sql`.** One `DO` block (atomic by itself); wrap it in `BEGIN;` / `COMMIT;`
the same way for uniformity. Guard: `SCHEMA_DRIFT task_result_command` (no `-- end 202611120001` anchor, or already
patched). Rollback reference: file header (restore the P9 definition of `task_result_command`; if step 2 ran in the
same window, restore the definition captured right after step 2 — run P9 again between steps 2 and 3).

**Step 4 — `202611140001_attachment_storage_read.sql`.** Has its own `BEGIN;` … `COMMIT;`; paste as is. Guards:
`SCHEMA_DRIFT tasks_storage_select` (already exists), `SCHEMA_DRIFT task_file_read (apply 202611110001 first)`. Ends
with `NOTIFY pgrst, 'reload schema'`. Rollback reference: file header (`DROP FUNCTION public.tasks_storage_select(text)`,
only after the policy is restored).

**Step 5 — `tasks-private-policies-202611140001.sql`.** Has its own `BEGIN;` … `COMMIT;`; paste as is. It checks that the
function exists, that `tasks_file_select` exists and still has the 2026-10 definition, then runs one `ALTER POLICY`.
Guards: `STOP: apply migration 202611140001…`, `STOP: policy tasks_file_select not found…`, `STOP: tasks_file_select differs
from the 2026-10 definition…`. If Postgres answers `must be owner of table objects`: stop and report; do not grant
ownership or use another role. Rollback reference: the exact previous `USING` expression is in the file header
(it re-opens the removed-file exposure).

None of the steps reads, changes or deletes table rows, files or Storage objects; all are reversible from the
saved definitions. The application stays usable between steps (the list falls back on older servers, D-48).

## 7. Post-flight

**As `postgres` in the SQL Editor (catalog facts)** — `work_module_postflight.sql`:

| Query | Expected |
|---|---|
| O1 | every row group APPLIED: `202611110001`, `202611120001`, `202611120002`, `202611140001`, `storage policy D-47` |
| O2 | every function `OK` (body identical to the repository after the whole chain) |
| O3 | no foreign key with `ON DELETE CASCADE`; `Tasks.parent_task_id` → `Tasks(id)`; RLS enabled on `Tasks`, `Task_files`, `Task_events`, `Task_notifications`, `storage.objects`; trigger `task_completion_guard` `enabled=O`; every Work RPC `anon=false authenticated=true`; `Task_notifications` table privilege `anon=false authenticated=false` |
| O4 | `tasks_file_select` = `… AND public.tasks_storage_select(name)`, no `foldername`; `tasks_file_insert` unchanged; bucket private, 20 MiB, includes `application/msword`, `application/vnd.ms-excel` |
| O5 | identical to P8 |

**As simulated signed-in users in the SQL Editor** — `work_module_postflight_as_user.sql`. Paste the **whole
file** and click Run; there are no placeholders. It picks the test data itself (newest live task and its creator, newest
removed attachment and its uploader, newest active attachment, its uploader and one unrelated employee), switches
between those accounts the way PostgREST does (transaction-local settings, gone after the run) and prints one table
`nr, check_name, expected, actual, status`. Only reads; it also runs before the deployment steps, where row 11 says
`PENDING` and row 12 says `EXPECTED BEFORE STEP 5 - known exposure (D-47)`. Tested on an empty database (rows SKIPPED),
on the UAT-like state and after all steps (every row OK).

| Row | Expected after the deployment |
|---|---|
| 1 identity | `authenticated / <uuid>` — if it shows `postgres`, the editor did not keep the settings: rely on rollout §11 |
| 2–10 list, views, counters, hierarchy fields, pagination, sorting, notifications, parent picker, details, events | OK (n/a when UAT has too few root tasks) |
| 11 deployment state | OK (function and policy present) |
| 12 removed attachment, its own uploader | OK: `0 / false` |
| 13 active attachment, its uploader | OK: `1` |
| 14 active attachment, unrelated employee | OK: visible exactly when that employee may read the task |
| 15 `Task_notifications` table | OK: no direct SELECT for `authenticated` |

SKIPPED rows mean UAT has no matching data (for example no removed attachment): remove one in the app and run again.
The simulation proves database functions and RLS for those users; it is **not** proof of the HTTP API, the Storage
API or the UI. Completion guard, soft delete, notifications on real events and attachment removal must be exercised in
the application with two test accounts (rollout §11 A–E); nothing in the SQL files writes data.

## 8. Migration history reconciliation (do not run yet)

The SQL Editor does not write `supabase_migrations.schema_migrations`. Register a version only after O1 and O2 pass
for it, and only versions that P3 listed as "in repository, NOT registered". Never insert rows by hand.

The Supabase CLI is not installed on this machine; `npx` resolved `supabase@3.1.0` on 2026-11-14. CLI v3 targets a
hosted project with `--remote=<ref>` (`--linked` / `--project-ref` still work in v3 but are deprecated):

```sh
npx supabase@3.1.0 login
npx supabase@3.1.0 migration list --remote=meuzkduxttjcuiynsnaa          # asks for the UAT database password
# after O1 + O2 pass — list only the versions that are verified and not yet registered:
npx supabase@3.1.0 migration repair 202611110001 202611120001 202611120002 202611140001 --status applied --remote=meuzkduxttjcuiynsnaa
npx supabase@3.1.0 migration list --remote=meuzkduxttjcuiynsnaa          # the four versions now show on both sides
```

The command asks for confirmation before changing the hosted history (do not add `--yes`). With CLI v2:
`supabase link --project-ref meuzkduxttjcuiynsnaa`, then the same commands with `--linked`. `migration list` compares
timestamps only. `202610100001`, `202610100002`, `202610260001`, `202610280001` stay local-only: **do not** repair them
(they are not applied). The Storage policy script is not a migration and has no history entry; record its execution
in `docs/work-module-requirements-matrix.md`.

## 9. Stop conditions

- URL or project name is not UAT; role selector is not `postgres`; no confirmed backup.
- P4 shows `PARTIAL - STOP` for any migration, or `202611110001` is not APPLIED.
- P5 shows `NO MATCH - review` for `task_result_command`, `task_notify`, `task_file_read` or any `202611110001` function,
  or an impossible combination (e.g. `task_result_command` at `202611120002` while `task_notify` is at `202611110001`).
- P7 `tasks_file_select` is neither the 2026-10 definition nor the new one.
- Any error message during steps 2–5 (`SCHEMA_DRIFT …`, `STOP: …`, `must be owner …`, anything else): run `ROLLBACK;`, save
  the message, do not continue and do not edit SQL around it.
- O1 not all APPLIED, O2 any `MISMATCH`/`MISSING`, O5 different from P8.

## 10. Remaining uncertainties

- Whether UAT's history table exists and what it contains (answered by P2 / P3).
- Whether 202611120001 / 202611120002 were applied earlier (answered by P4 / P5).
- Whether UAT's earlier function bodies equal the repository's: P5 hashes assume the earlier migrations were applied
  from these files; a `NO MATCH` means a manual or different version and needs review before patching.
- Whether the SQL Editor's `postgres` role may `ALTER POLICY` on `storage.objects` in this project (step 5 tells).
- Whether the SQL Editor keeps `set_config(…, true)` settings across the statements of one run (row 1 of the user-check report tells).
- UAT PostgreSQL version (P1); the files were tested on 17.5.
- Authenticated application behaviour: not provable from the SQL Editor (rollout §11).
