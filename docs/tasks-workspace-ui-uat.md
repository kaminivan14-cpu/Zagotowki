# Робота: Графік, створення задач і Звіти — UAT

Branch: `feature/orders`. Production/main are excluded.

## Changes

- Schedule: top action, employee/team scope, 28 compact day cells, typed event colours, click-day date prefill and dynamic modal. Explicit event creation/deletion uses the existing commands. No default shift records are generated.
- Task creation: Основне / Час і терміни / Виконавець, quick estimates, collapsible checklist/dependency/additional sections, sticky create/cancel. Planning date/employee prefill retained. Dependency search uses the existing scoped, paginated `tasks_list` read.
- Checklists/dependencies use existing versioned commands after task creation. They are sequential, not an atomic batch. The dialog preserves the created task and completed operation index during retries, using existing operation UUID handling. A failure does not recreate the task. Closing/reloading after partial success leaves the created task and successfully saved items; remaining unsaved draft items must be completed through task details. No rollback/delete is attempted.
- Reports: Ukrainian Звіти tab, previous week by default, period navigation, calendar month with expandable partial/full weeks, compact daily rows, employee/team filtering, actual time, planned/unplanned/unknown split, donut, category bars, deterministic insight, CSV export.
- Report actual time includes ongoing sessions and unfinished tasks, explicitly explained in UI. Sessions split at company-local midnight; DST days retain their real duration. Planning status is taken from the event snapshot at each session's start; a later plan does not relabel earlier work. If history is missing, time is shown as unknown, not falsely classified. Task details continue using their existing authorization checks.

## Authorized backend extension

The user explicitly approved changing the no-event availability default after the conflict with the original zero-capacity behavior was identified.

Migration: `202610050001_task_availability_reports.sql`.

Changed internal functions: `app_private.task_windows`, `app_private.task_capacity`. Existing planning, queue and balancer use these shared functions. No schema/table/RLS/permission changes or physical default events.

New reads: `tasks_schedule_capacity(bigint,date,date)` and `tasks_report_activity(bigint,date,date)`. Both use the existing active Tasks actor and employee scope checks; anonymous execution is revoked. Existing report RPC remains intact.

No configuration of default shift start/end exists. The no-explicit-shift day therefore has a flexible local-day window and the effective employee capacity (or module default, currently seeded as 360 minutes). Busy schedule intervals reduce that budget; overlapping intervals count once. An exhausted implicit budget has no available window. Explicit work events bound availability to their actual hours, subtract busy intervals and retain the existing daily capacity ceiling. Meetings subtract only their duration. Full-day day off/vacation/absence blocks the day. Weekends follow the same no-event rule. There is no fabricated 09:00–17:00 interval; time fields require explicit entry for timed events.

The schedule command has no description/reason argument. These optional event fields are omitted rather than discarded silently. No department/team assignment was invented in task creation.

## Local validation

Targeted: 23 browser tests passed, including all four widths (375/768/1024/1440), creation/date prefill, checklist/dependency writes, partial retry, schedule save/cancel, weekly/monthly reports, scoped team, empty data, CSV. Three new report helper tests passed. Lint and UAT build passed.

PostgreSQL tests cover implicit availability, no event row creation, day off, vacation, partial/full absence, overlapping meetings, explicit shift hours, planning/queue consistency, out-of-scope and anonymous denial, session midnight splitting, historical planned/unplanned classification, missing history and DST duration. Full regression: 133 Playwright tests; 109 Node tests plus deployment-target guard tests; Tasks PostgreSQL 134 checks, Orders 189 on fresh and upgrade paths, Worktime 58, production plan migration/RPC regression PASS. PIN/Auth is included in Node/headless. Lint and build:uat PASS; existing large-bundle warning only.

Screenshots (synthetic local data):
- `tmp/tasks-workspace.local/schedule-1440.png`
- `tmp/tasks-workspace.local/event-1440.png`
- `tmp/tasks-workspace.local/create-1440.png`
- `tmp/tasks-workspace.local/reports-1440.png`
- `tmp/tasks-workspace.local/reports-768.png`

## Manual UAT migration — before frontend push

Do not run a generic linked-project push. This iteration requires the new UAT reads before the frontend can use the new screens. No remote migration has been run by the agent.

1. Open Supabase project **meuzkduxttjcuiynsnaa**, click **Connect**, and copy the PostgreSQL URI for the direct connection or session pooler (database `postgres`). Supply its database password locally. Do not paste credentials in chat.
2. Install/use PostgreSQL client tools compatible with the server (`psql`, `pg_dump`). In a terminal, enter the repo and open Bash:

   ```sh
   cd /Users/ivankaminskyi/zagotowki
   bash
   read -r -s -p 'UAT PostgreSQL URI: ' UAT_DATABASE_URL
   export UAT_DATABASE_URL
   node scripts/tasks-workspace-uat.mjs
   ```

3. The script accepts only the exact UAT direct hostname or a Supabase pooler with username `postgres.meuzkduxttjcuiynsnaa`. It does not read Keychain, CLI login state or browser sessions. It writes a schema snapshot to `tmp/tasks-workspace-uat-*/schema-before.sql` and compares the two changed availability functions with the locally tested baseline. **Any drift: STOP and provide the error, without credentials.** Inspect the snapshot; do not automatically replace a differing function.
4. After a successful check, apply the single migration:

   ```sh
   node scripts/tasks-workspace-uat.mjs --apply
   unset UAT_DATABASE_URL
   exit
   ```

   Apply takes another snapshot and repeats the drift check, then runs the transaction. It records this migration in the standard Supabase ledger if present, saves the after snapshot and verifies read function existence and grants. No business rows are written by the migration. Do not rerun after success; a rerun intentionally stops on changed baseline.
5. Then `git push origin feature/orders`. Verify Vercel Preview is built from the delivered commit, with the UAT project URL. No Vercel Production deployment.

## Manual smoke

- Schedule: empty day shows default shift and nonzero capacity matching Planning. Add meeting; verify only busy time is subtracted. Add day off/vacation; capacity becomes zero. Explicit work shift uses its entered hours. Check personal/team scope.
- Create: quick/custom estimate, category/priority/urgency, deadline/hard deadline, selected assignee, ordered checklist, dependency search, cancel and retry. Check Planning prefill remains correct.
- Reports: actual work time (not estimate), past week, calendar month expanded week, employee/team scope, CSV, empty period. Plan a previously unplanned task after work and verify historical session classification does not change.
- Verify queue offers a planned task on an implicit day, while a blocked day has no work availability. Existing balancer uses the same capacity.
- Check 768/1024/1440 and mobile 375, keyboard focus/Enter/Escape and touch.

Authenticated live smoke must be performed manually. No user's sessions, automatic login, Safari or Computer Use are used.
