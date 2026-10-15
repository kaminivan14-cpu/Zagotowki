# Tasks, Processes and i18n — UAT release

Scope: UAT `meuzkduxttjcuiynsnaa` only. Branch `feature/tasks-processes-i18n`, based on the current UAT Audyt branch (`f5d2254`), which already includes main `68d4d0e`. No Production migration, merge or deployment.

## Reuse and implementation

- Existing Process versions/definitions remain the template source of truth; launch continues creating central Tasks and an execution snapshot. No second Tasks, dependencies, roles or permissions system.
- Step 1 no longer displays or requires process instruction/launch condition. Historical fields remain stored and readable. Task-level instructions remain available.
- New process tasks default to 30 minutes and explicitly depend on the previous task in their stage. UUID references remain stable when numbering changes.
- Stage/task `deadline_offset_days` is an optional nonnegative integer relative to the instance start. At launch it resolves to a calendar deadline in the company timezone, at 23:59. A task without its own offset inherits its stage deadline. UI and backend reject task deadlines beyond the stage deadline. Shortening a stage shows a conflict, without silently changing task values.
- Fixed execution deadlines remain fixed when relative predecessor completion is late; legacy relative dates retain their previous behavior when no fixed deadline was configured. Execution snapshots are not edited.
- Diagram edge selection supports pointer and Enter/Space, predecessor/successor replacement, adding another successor and deletion. Step 2 and diagram share one definition. Implicit legacy edges require changing their originating stage/date rule. Self/cycle validation remains in backend and UI.
- Role/dependency dropdowns dismiss on outside pointer/touch and Escape. Escape consumes the event so the surrounding modal remains open.
- Launch automatically resolves the latest published version on the server, under the existing template lock. No published version disables launch with an explanation. The launch offset derives start = deadline − offset, independently of template recurrence.

## Recurrence foundation — automation is NOT enabled

One shared UI handles none/daily/weekly/monthly/yearly/custom, interval, weekday selection, month day and until/count limits. Stored values are structural, never translated labels.

- Process template: recurrence in the existing version definition.
- Process launch: separate `Process_schedules` record; override does not modify the template. It stores version, launch arguments, anchor deadline, start offset, next occurrence and generated count.
- Ordinary Tasks: extends existing `Recurring_task_templates`; records are `active=false`, `scheduler_state=pending`, so the legacy daily generator cannot accidentally generate these new schedules.
- `recurrence_next` calculates the next calendar date; impossible month dates are skipped. End count includes the first created Task/Instance.
- Existing command operation idempotency remains in use. Unique operation IDs and occurrence guards prevent duplicate Tasks/Instances.
- TODO: a trusted scheduler must claim due pending schedules transactionally, revalidate permissions/assignees, materialize one occurrence through existing commands, advance the next date/count atomically, and retry using a stable occurrence key. No cron/worker was deployed and no future instances are pre-generated. UI explicitly states this limitation.

## Ordinary Task Create

Required title, priority (medium), estimate (30 minutes), deadline (company calendar date +7 days, 17:00 local) and assignee (creator). Category is null by default; description/comment/subtasks/dependencies optional. No actual-time, urgency selector, Additional or Time accordion. Actual work sessions remain unchanged. Existing checklist rows are presented as subtasks, not new Tasks.

`tasks.interrupt` is granted to owner/administrator/director; UI checks the capability and backend checks both commands and the Tasks trigger. No permissions for other roles were expanded. Existing assignment scope remains enforced.

## Migration / security

`202610150001_task_process_schedules.sql` extends the recurring table and Process instances, adds private Process schedules and calculation/validation helpers, wraps the existing dispatch/launch functions and adds deadline/interruption guards. Existing business records are not rewritten.

Public RPC signatures remain stable. New private functions and schedule tables have no client execute/read/write grants. Existing RLS and table grants remain unchanged. UAT's existing Supabase service-role Dxtm table privileges differ from the local database defaults; they were documented and preserved, not extended.

UAT preflight: six affected function definitions and ACLs, affected columns/constraints and policies match the local baseline. Migration history and schema snapshots are local under `tmp/tasks-processes-i18n/` and are not committed. DDL rehearsal rolled back before applying the migration. UAT migration head is `202610150001`. Postflight verified changed functions/ACLs against the upgraded local database and unchanged business row counts/policies/grants.

UAT smoke: defaults + recurring Task create + retry, template creation/publication, role resolution, launch offset, schedule creation, central Task deadline snapshot and private grants. Entire smoke transaction rolled back; no test records retained.

## Localization

`src/i18n` provides `uk`/`pl`, Ukrainian base labels, Polish dictionary, development missing-key warnings, nonempty fallback and subscriptions without remounting. Local preference uses `zagotowki.locale`; no DB preferences migration. Language selection is available globally and inside modals. Business names, descriptions, role codes and backend enums are never translated or changed.

Translated in this iteration: Processes lists/wizard/launch/instance/diagram/files, simplified Task Create, shared Tasks statuses/priorities/role labels/errors, Tasks navigation, module navigation and header tool/account labels. Date values retain DD.MM.YYYY and 24-hour time; duration formatting and planning weekday names use the selected locale.

Remaining batches (not claimed as fully bilingual): Work/Planning/Reports/Schedule body text, Task details/actions/results, employee editing/Organization/Access/dictionaries, Worktime, Orders board/actions, Zagotówki, Audit, and Auth/PIN forms. Shared labels in those screens are already reactive, but remaining hardcoded text falls back to its existing language. This is the gradual migration allowed in section C10, not a claim of complete application translation.

## Validation / release

- 21 targeted Node tests PASS, including new PGlite lifecycle group for deadlines, latest-version launch, recurrence boundaries, retry and occurrence uniqueness.
- Existing real PostgreSQL Processes regression: 104 checks PASS.
- Full migration-chain upgrade in disposable local PostgreSQL: PASS.
- 14 focused browser tests PASS: responsive 375/768/1024/1440, simplified Task defaults/recurrence, director interruption, outside click/Escape, pointer/keyboard edges, shared model, latest launch UI and locale persistence without losing draft data.
- Lint and UAT build: PASS (existing bundle-size advisory remains).
- UAT migration/postflight and rolled-back backend smoke: PASS.

Frontend Preview requires pushing the branch. Do not merge into main or deploy Production. Final Preview URL/SHA and manual smoke must be confirmed after the push. Existing Vercel Preview protection may require the user's manual smoke; do not bypass it or claim authenticated live UI checks from mocked tests.
