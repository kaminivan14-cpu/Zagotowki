# Processes workspace — UAT

The existing Process_templates → Process_versions → Process_instances → Tasks flow
is extended, not replaced. No Production rollout is authorized.

## Model and migration

`202610090001_process_workspace.sql` adds nullable Process_versions.updated_at and
an update trigger. Existing immutable published-version guard remains intact.
The existing definition JSON gains category_id, start_offset_days,
sequential_stages and per-step duration_days/raci. Existing rows are not rewritten.
New validation checks numeric bounds, references and dependency cycles, including
implicit stage edges. Existing RPC signatures, capabilities, RLS and grants remain.
New private helpers have no direct public/anon/authenticated execution grants.

R uses the existing assigned_to_employee_id / department_id. Launch overrides and
assignable scope still resolve one real employee for each Task. A is zero or one
employee/department reference; C and I accept multiple references. They are
organizational metadata, not grants, subscriptions or approval permissions.
The separate existing approver field still controls result approval.

New definitions default to sequential_stages=true. Each step in a stage depends on
all steps of the preceding stage. Existing definitions without this flag retain
existing semantics. Explicit dependencies, sequential steps and completion-relative
deadlines remain supported. Launch materializes dependencies in Task_dependencies;
central Tasks completion/queue rules block until every predecessor is completed.
Cancelled predecessors do not satisfy completion. No separate scheduler is added.

Duration and start_offset_days are validated planning metadata for a future
calendar calculation. They do not silently alter existing planned dates/deadlines
or convert days into estimated_minutes. Existing offset_days, deadline_at,
relative_to and launch date remain authoritative for execution. Stage duration is
an explicitly labeled sum of known duration estimates, not a critical-path forecast.

## UI

Compact searchable/filterable/sortable tables: templates, active instances, history.
Only manual launching is implemented and labeled as such; textual launch conditions
remain instructions, not automation. Editor has Main Information and Dependencies
views. Task fields, checklists, files, confirmations, ordering and versioning remain.
Dependency ports support pointer connections, with labeled select/button alternatives
for keyboard and touch. Black arrows mean finish-to-start. Derived edges are changed
through their stage/order/date settings rather than deleted as explicit edges.

Opening a template/instance shows collapsible colored stage tables. Instances derive
progress, statuses and dependency blocking from real Tasks. Details include A/C,
checklists and instructions; real Tasks open the existing details/files workflow.
Finished history includes fully terminal instances (completed/cancelled); completion
percentage counts only completed Tasks. Processes RPC retains its existing newest
100 instances limit; filtering applies to the loaded list.

Published versions and launched instances cannot be edited in place. Future changes
use existing New Version action. Uncertain command retries retain existing operation
UUIDs; launch remains atomic and idempotent through tasks_command.

## Existing UAT example

Read-only audit found template 1, version 1 (draft), “Введення нового меню”, with
seven existing stages and 32 tasks, matching the repository fixture. No duplicate
or real launch is needed. Existing content/stage assignments are preserved. Tests
exercise that fixture locally; UAT smoke must not publish or launch it incidentally.

## Verification and rollout

Run Node, lint, build:uat, full headless browser, Processes PostgreSQL, Tasks and
Organization regression. Compare changed function definitions/ACL against the
local upgrade baseline, snapshot UAT history/schema before applying only migration
202610090001. Verify unchanged application policies/grants and use rollback-only
synthetic backend smoke. Publish only feature/org-structure-v2 Preview to UAT.

Live UI smoke requires the user's own login when Vercel Preview Protection is on:
open the existing template, inspect seven stages and 32 tasks, search/filter,
create a controlled draft, fill RACI/duration/start offset, connect dependencies,
verify cycle rejection, save/reopen, publish a controlled test version and launch
once. Complete predecessor Tasks to verify unlock/progress. Do not alter Production.

## Execution record — 2026-10-07

UAT migration 202610090001 applied after baseline function/ACL drift PASS. Head
verified. Existing policies, grants, constraints and indexes unchanged. Synthetic
create/publish/launch/central-dependency blocking/unlock smoke PASS, transaction
rolled back. Existing menu template was not changed or duplicated.

Local results: Node 134; full browser 176; final responsive workspace 3;
Processes PostgreSQL 80; Tasks 164; Organization 57; lint/build:uat all PASS.
Screenshots reviewed at desktop, responsive flows tested at 375/768/1440.

Frontend publication remains pending. Two automatic permission-review timeouts
prevented the git add/commit commands from starting. No commit or Preview deployment
for this iteration is claimed. Production was not accessed or changed.
