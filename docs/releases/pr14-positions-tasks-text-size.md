# PR14: positions, task list, personal text size

Baseline: merged PR13, Production frontend `da2e78da3ad8d010c027cd694bea22f984a35fd5`.
Frontend rollout requires PR checks, approval, merge, then Vercel Production. No direct main push.

## Employee positions and Processes

`Employees.position` is an optional business text field, limited to 160 characters. The existing employee create/edit form persists it through `admin_employee_save`. Whitespace is normalized on save. The system role and permission model are unchanged.

`tasks_processes.positions` returns alphabetically sorted unique positions, comparing case and whitespace insensitively. New editable process definitions use schema version 3: `responsible_position`, `involved_positions`, task `responsible_position`, and RACI references with `type: position`. The wizard, task inspector, diagram, list, views and launch use these values.

Launch filters the already scoped `tasks_assignable_people` by normalized position. Backend resolution independently checks the position, active/nonarchived employee, linked Auth identity and existing `task_scope('tasks.assign', employee)`. An empty candidate list has an explicit message. No new role codes or grants.

Published legacy versions retain their original role/employee assignments. Editing a legacy draft or a new version requires explicit selection of business positions; a permission role is never inferred to be a position. Existing published versions and execution snapshots are not rewritten. New execution snapshots retain the selected business positions and resolved employee IDs.

## Tasks list

`TasksApp.jsx` inserts Tasks after Admin (where permitted) and before Create Task. `TaskListScreen.jsx` uses the central Tasks and checklist tables and the existing create/details/actions dialogs. Header copy describes available tasks because the existing scope includes assigned, created and permitted scoped tasks.

An additive `tasks_list(p_query jsonb)` overload provides server-side combined search, status tab, status/priority/assignee/category/date filters, sorting and 10-row pages. The original cursor RPC remains unchanged. Every query uses `task_can_read`; assignee filter options and expanded subtasks are derived from readable tasks. Counts use the same filters before the status tab. Cancelled tasks remain in All, not Active or Completed.

Checklist progress is completed/total actual items; tasks without a checklist show a dash. Checklist rows show only text/completion; real subtasks show their own available metadata and link to the existing details dialog. A subtask can also appear as an independent result, consistent with central Tasks pagination. Avatars reuse `PersonAvatar` and private storage. No new bulk mutations. Rows have current-page selection and a menu opening existing permission-enforced task details.

Nine columns, UA/PL labels, company-timezone dates, loading/error/retry/empty states, compact view and contained horizontal scrolling.

## Individual text size

A keyboard-accessible gear beside the employee name in Work opens the shared Dialog with × and Escape. Four sizes: 90%, 100%, 110%, 120%. No employee preferences model exists; storage key is `app_text_size:<auth_user_id>` (employee ID fallback), so accounts on one device do not share the preference. AuthGate applies/reset preferences on identity changes; changes apply immediately across modules and survive reload. Storage denial is reported without losing the current-session preview.

A central build-time PostCSS transform adds `--app-font-scale` to absolute font and line-height declarations. Relative em/rem typography inherits the scaled root. Existing inline text sizes in Planning/History use the same variable; a decorative emoji remains unscaled. No browser zoom. Diagram card height and connector geometry adapt to larger text, preserving dependency topology. Other graphics/layout dimensions are not multiplied.

## Production backend rollout

Applied atomically to `ssheqxdgsmndiutthxvd`:

- `202610260001_employee_positions.sql`
- `202610260002_tasks_list_view.sql`

Journal: `app_private.production_module_releases`, `pr14_positions_tasks_v1`.
Preflight definitions were fingerprinted; drift would abort. A savepoint smoke created synthetic identities, saved a position without changing the system role, published/launched a v3 process and checked new/legacy task list scope. All fixtures were rolled back before committing the additive schema/functions. Follow-up confirmed no synthetic employees or locations remain. Permission rows, RLS policies and locations match the baseline exactly.

## Validation

Database tests cover employee create/edit/read, normalized positions, correct-position assignment, inactive/unlinked/wrong-position/out-of-scope denial, v3 snapshots, legacy v2 launches, task row scope, filters/counts/pages/checklists and anonymous denial. The exact Production smoke fixture also passes locally and rolls back.

Browser tests cover the existing process workflow plus the new position field/launch options, Tasks navigation/columns/counts/search/filter/sort/pagination/checklists, current-page selection, empty/error/retry/create flow, text-size keyboard access and immediate scaling, persistence, UA/PL, and 375/768/1440-pixel layouts. Existing graph, shared modal and table readability tests remain enabled. Lint, migration harness and Production-target build are part of validation; CI runs the full suites.

Full Production PASS remains pending frontend approval/deployment and post-deploy smoke. The already published frontend is unchanged until that approval.
