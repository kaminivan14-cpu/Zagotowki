# Work module («Робота») — audit before the 2026-11 update

Date: 2026-11-11. Branch: `feature/claude-refactoring`. Local inspection only; no remote
Supabase or Vercel operations were performed. Secrets are not recorded here.

## 1. Confirmed stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8, plain JSX, CSS files per module, no router (screen state in `TasksApp`) |
| Lint / build | `oxlint`, `vite build --mode uat|production` (build-safety check on `VITE_SUPABASE_URL`) |
| Backend | Supabase (PostgreSQL + RLS + SECURITY DEFINER RPC functions in `app_private` / `public`) |
| Auth | Supabase Auth (email/password or PIN proxy) → `Employees.auth_user_id` |
| Storage | Supabase Storage, private bucket `tasks-private` (20 MiB, MIME allowlist), policies in `supabase/storage/tasks-private-policies.sql` |
| Tests | `node --test tests/*.test.mjs` (unit + PGlite database tests), Playwright browser suite with mocked Supabase HTTP, docker-based PostgreSQL scripts (`tests/tasks-database.mjs`, docker not available locally) |
| i18n | `src/i18n/runtime.js` (`tr`, `localized`), Ukrainian source strings, Polish dictionary `src/i18n/pl.js` |

## 2. Work module entry points and navigation ownership

- `src/main.jsx` renders the global `LanguageSwitcher` above `AuthGate` (separate top bar — РБ-001 problem).
- `src/orders/ModuleShell.jsx` resolves capabilities and lazy-loads `src/tasks/TasksApp.jsx` for `tasks.access`.
- `TasksApp` owned: its own `<header class="tasks-header">` (title, user, ⚙ text settings, Модулі, Вийти) and a horizontal
  `<nav>` with Робота / Планування / Звіти / Графік / Процеси / Адмін панель / Завдання / Створити завдання.
- Screens: `WorkScreen` (execution), `PlanningScreen`, `ReportsScreen`, `ScheduleScreen`, `ProcessesScreen`, `AdminScreen`,
  `TaskListScreen`. Dialogs: `TaskCreateDialog`, `TaskDetailsDialog`, `CriticalTaskDialog`, `TextSettings`.

## 3. Component / state / service map

- Data access: `src/tasks/client.js` → `read(rpc, args)` and `mutate(employee, action, args)` → `tasks_command(p_action,p_args,p_operation)`.
  Mutations are idempotent by operation UUID kept in `sessionStorage` (`src/tasks/operations.js`).
- Shared feedback: `TaskFeedback` context (error, retry, busy). Polling: `tasks_context`, `tasks_assignable_people`,
  `tasks_execution_state` every 15 s and on window focus. No realtime subscription in the Work module.
- Reusable UI before this update: `src/ui/ModuleHeader.jsx` (+ `Menu`), `src/ui/ModalClose.jsx`, `src/tasks/components/Dialog.jsx`,
  `DateTimeInput`, `RecurrenceFields`, `PersonAvatar` (organization screen), `Files`/`FileLink` (admin).

## 4. Task schema and relationships

`public."Tasks"` (migration `202610020002_task_core.sql`): `parent_task_id` self reference with `CHECK(id<>parent_task_id)`,
trigger `task_parent_guard` (recursive cycle check, `PARENT_CYCLE`, global advisory lock). No depth limit exists.
Related tables: `Task_dependencies`, `Task_events` (append-only, `UNIQUE(task_id,task_version)`, before/after snapshots),
`Task_checklist_items`, `Task_approval_requests`, `Task_work_sessions`, `Task_work_contexts`, `Task_results`,
`Task_files` (`task_id` or `version_id`), `Process_instances` (`owner_employee_id`), `Recurring_task_templates`.

Regular task creation defaults (server, `task_dispatch`): `estimated_minutes` 30, `deadline_at` today+7 17:00 company time,
assignee = actor, `priority` medium, `urgency` normal, `description` ''. `parent_task_id` is already accepted by `create`
(parent must be readable). Quick-create therefore needs only `{title, parent_task_id}`.

## 5. Status and recurrence semantics

- Persisted statuses: draft, pending_approval, unplanned, planned, in_progress, paused, completed, cancelled, blocked.
- Canonical completion: `status='completed'` (`CHECK((status='completed')=(completed_at IS NOT NULL))`).
  `cancelled` is terminal but not "done". No reopen command exists; completed/cancelled tasks are final (`TASK_FINAL`).
- Completion paths: `task_work_command('complete')` (running task), `task_manual_command('mark_completed')`
  (planned/unplanned/paused/in_progress with confirmation). Both run inside `tasks_command`.
- Recurrence: `create` accepts `recurrence {frequency, interval, days_of_week, day_of_month, end_type, until, count}`
  validated by `app_private.recurrence_validate`, stored in `Recurring_task_templates` and `Tasks.source_metadata.recurrence`.
  The UI control is `src/shared/RecurrenceFields.jsx` (full block) — РБ-005 only changes presentation.

## 6. Authorization matrix (server side)

| Operation | Check |
|---|---|
| Read task | `app_private.task_can_read`: assignee, creator, pending approver, or `tasks.read.scope` over assignee (reporting subtree / scope grants / admin) |
| Create task | `tasks.create.self` for self; `tasks.assign` scope for others; parent must be readable |
| Update / assign / cancel / dependency / checklist_add | creator or `tasks.plan.scope` over assignee; version check; not final |
| Comment / checklist_toggle | any reader (toggle: assignee or plan scope) |
| Start / complete / mark_completed | assignee only |
| Files | `file_register`: assignee of the task (relaxed in this update); read via `task_file_read` (uploader, task reader, approver) |
| Admin panel | `tasks.admin` (UI gate `context.capabilities`; every admin RPC re-checks) |

## 7. Organisation, process-owner and participant sources

- Direct reports: `app_private.org_assignments(date)` → `manager_employee_id` (versioned structure or legacy reporting lines).
- Process owner: `Process_instances.owner_employee_id` joined by `Tasks.source_metadata->>'process_instance_id'`;
  step approver: `source_metadata->'step'->>'approver_id'`.
- There is no participants/watchers table. "Participants" are defined in this update as: commenters
  (`Task_events.event_type='COMMENT_ADDED'`) and pending approvers (`Task_approval_requests`).

## 8. Storage and attachment lifecycle (before)

Upload: browser → `storage.from('tasks-private').upload(`<auth uid>/<uuid>`)` → `tasks_command('file_register')` verifies
the object exists with the declared MIME and size, inserts `Task_files`. Download: signed URL (60 s) after `tasks_file(p_id)`.
No delete policy on storage objects; no removal metadata; no activity record. Only process result files used it.

## 9. Activity / notification infrastructure (before)

- Activity: `Task_events` (immutable, before/after snapshots, actor, version, operation UUID). Read: `tasks_details` (last 100)
  and `tasks_events` (pagination). UI showed only the event label, time and comment text.
- Notifications: none. Delivery choice for this update: reuse the existing 15 s polling (`tasks_notifications_unread`).

## 10. Current behaviour and defects found

- `TaskListScreen` showed subtasks only one level deep and used checklist progress instead of child progress.
- `TaskCreateDialog` fetched the whole task list (`tasks_list(p_cursor)`) for the dependency picker — kept for compatibility,
  but the new parent picker uses a server-side search RPC.
- Description of an existing task could be edited only through the small "Редагування завдання" form; deadline could not.
- Reports and Schedule were primary navigation items. The language switcher was a separate top bar.
- `tests/task-process-schedules.test.mjs` uses hard-coded launch dates (2026-11-01) that are now in the past → INVALID_PLAN_DATE.

## 11. Reuse map

| Area | Decision |
|---|---|
| `Tasks.parent_task_id`, cycle trigger, `create` with parent | reuse unchanged |
| `task_core` update, `task_validate_args`, dispatch chain | extend by string replacement (repo convention) |
| `Task_events` | reuse; add event types TASK_PARENT_CHANGED / TASK_DELETED / TASK_ATTACHMENT_ADDED / TASK_ATTACHMENT_REMOVED |
| `Task_files` + `tasks-private` bucket | reuse; add `removed_at`, `removed_by_employee_id` |
| Notifications | new table `Task_notifications` (gap) |
| `RecurrenceFields` | reuse inside a compact popover (`RecurrenceControl`) |
| `Dialog`, `ModalClose`, `DateTimeInput`, `PersonAvatar`, `Files/FileLink` | reuse |
| Reports / Schedule screens | keep files, comment out usage (У-006) |

## 12. Baseline test results (before changes)

- `npm run lint`: clean.
- `npm test`: 172 passed, 1 failed (pre-existing date-dependent process schedule test, see §10).
- `npm run build`: requires `--mode uat` with the UAT Supabase URL; builds when given the UAT env (see rollout doc).
- Browser suite: Chromium was not installed locally before this session.
