# Processes wizard — UAT extension

## Discovery and reuse

The existing module already has Process_templates, immutable published Process_versions
(JSON stage/task definitions), Process_instances, central Tasks, Task_dependencies,
Task_events, Task_files, idempotent tasks_command, RACI and scoped capabilities.
This change extends these objects. It does not add a second task queue or duplicate
Employees, Departments, Locations or roles. Existing application navigation is retained.
No reusable rich-text editor existed; the small instruction editor sanitizes an allowlist
of formatting tags and preserves plain text for central Tasks.

Previous gaps: no three-step wizard, role-based launch resolution, complete DAG view,
instance rating, separate execution snapshot or completion audit for a process.

## Implementation

- `src/tasks/admin/Processes.jsx`: existing module controller, tabs and dialogs.
- `src/tasks/processes/ProcessWizard.jsx`: one create/edit wizard, draft save at each
  step, stage/task table and inspector. Existing timing, priority, category, department,
  files, checklist and approval settings remain editable.
- `RoleSelect.jsx`, `DependencySelect.jsx`: searchable role and grouped dependency
  selection. UUIDs are identities; display numbers follow current order.
- `ProcessDiagram.jsx`, `model.js`: topological levels, parallel nodes, downward arrows,
  virtual start/end, stage bands, zoom/pan/fit/fullscreen. Both editing views share the
  same definition. The critical 2.1–2.10 graph has exactly seven levels.
- `ProcessLaunch.jsx`: explicit role-to-employee mapping, instance name, dates, scope
  and note. Eligible people are intersected with existing assignable employee IDs.
- `ProcessList.jsx`, `ProcessView.jsx`: Templates/Active/History filters and layouts,
  progress, archive, instance snapshot view and 1–5 rating (half steps supported).
- `InstructionEditor.jsx`, `instruction.js`, `processes.css`: scoped presentation.
- Existing labels/client error mappings and Processes Node/PostgreSQL/browser tests
  are extended. No unrelated module is redesigned.

## Database and security

Migration: `202610110001_process_wizard.sql` (additive).
Only Process_instances gets new columns: name, deadline, note, execution_snapshot,
finished_at, rating, rating_comment, rated_by, rated_at.

Existing private validation/command functions and public tasks_processes are extended.
New private helpers validate role documents, resolve employees, guard the snapshot and
record terminal process completion. Existing tasks_command handles idempotency, locks,
capabilities and audit. No new publicly callable RPC, Edge Function, broad grant or RLS
policy is introduced. Existing RPC ACLs and all UAT policies were compared unchanged.

Templates use the existing role catalog from role_permissions; production-role matches
are allowed only when that role is already recognized by the catalog. Launch resolves
R/A/C/I to active scoped Employees and creates ordinary Tasks/dependencies. Snapshot
and published version are immutable. Task completion and availability use the existing
backend dependency checks; a successor becomes eligible only after all predecessors
complete. There is no process-specific queue. Progress counts completed Tasks, not
stages. Process completion is recorded transactionally in the existing audit.

Legacy published templates and running instances retain their original behavior.
Editing a legacy draft converts its editable document to role-based schema v2 and asks
for roles before publication; existing published definitions are not rewritten.

## Verification (2026-10-07)

- Node: 141 PASS; final DAG/model tests: 7 PASS.
- Processes PostgreSQL: 104 PASS, including upgrade, authorization, role resolution,
  launch idempotency/concurrency, immutable snapshots, dependencies/unlock and rating.
- Tasks PostgreSQL: 164 PASS; organization PostgreSQL: 57 PASS.
- Full isolated browser regression: 176 PASS (1.9 minutes).
- Final affected Admin/Processes browser tests after last UI edits: 15 PASS.
- Responsive wizard checks: 375 / 768 / 1024 / 1440 px.
- lint and build:uat PASS. Existing >500 kB bundle warning remains.

## UAT rollout

Target: meuzkduxttjcuiynsnaa only. Branch: codex/processes-uat-v2.
Preflight: five changed function definitions match locally tested baseline;
migration head was 202610090001; policy/schema/history snapshots saved locally.
Migration 202610110001 applied successfully. RPC ACLs/policies unchanged.
Existing published “Введення нового меню” version 1/revision 2 definition digest remains
`2cd8ea5c8cdfcd943122f0bb77b44d02` (seven stages).

UAT backend smoke PASS: create/publish, role resolution, launch, snapshot, central
Tasks/dependencies, blocked/unlock, completion and rating. Synthetic test records were
rolled back. No business process was launched persistently by the smoke.
Preview deployment requires pushing the branch and verifying its commit/environment.
Production, main and Production Edge Functions were not changed.

## Manual UAT and limits

- Confirm all six screens against the references using real scoped UAT users.
- Automatic launch is draft-only: the existing app has no scheduler; publishing it is
  explicitly blocked rather than presenting a nonfunctional automatic trigger.
- “Whole stage” duration is not offered: no authoritative stage capacity exists.
  Day presets use existing default_daily_task_capacity_minutes and persist minutes.
- Existing system/production role catalog is reused; screenshot business-role names
  absent from the catalog are not invented.
- Complex cross-stage interleaving can use repeated colored stage bands to keep all
  dependencies downward. Collapse hides card details, not the dependency graph.
- Existing backend list limit (100 instances) remains; no new server pagination.
- Browser tests use synthetic intercepted data; live authenticated Preview UI smoke
  requires a UAT user session and is not represented as already passed.
