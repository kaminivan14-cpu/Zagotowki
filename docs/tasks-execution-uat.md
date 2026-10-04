# Tasks: one-task execution (feature/orders, UAT only)

Only the Робота tab is redesigned. Planning, Schedule and Reports retain their UI. The existing module shell stays in place.

Flow: start/reuse Work_shifts → preview the server-selected task → explicit start_task → real Task_work_session → complete with advance:false → preview next task. There is no client-side queue, task list or persisted current-task state. Reload reads the authoritative current task and shift. Critical Now keeps the existing modal, pause stack and automatic return to interrupted work.

The current task shows instructions, category, priority, urgency, optional deadline, estimate, checklist, comments and elapsed time for its active session. Completion still enforces the server checklist. Queue eligibility still checks prerequisites and availability. A lack of eligible work does not mean all planned work is complete; the empty screen says this explicitly and shows completed-today count.

Backend changes are required because the existing next command starts a timer immediately and Worktime originally accepts only orders/production:

- `202610050003_task_execution.sql` extracts the existing queue selection, unchanged ordering, into private `task_queue_candidate`, shared by legacy `task_next` and new read-only `tasks_execution_state`.
- `tasks_execution_state` returns one candidate, current task/session start, completed count, and permitted active work locations. No session, event or context is written by a preview.
- The existing complete command accepts optional `advance:false`; normal completion then waits for explicit start. Legacy callers retain automatic next. Critical return resumes its prior task even with advance:false.
- Worktime accepts source `tasks`, keeps existing location scope/idempotency/one-active-shift enforcement, and grants `worktime.self` to existing Tasks roles. Shift end rejects an open task timer. Work_shifts data is not rewritten; only the two source constraints are extended.
- The Tasks shell uses the existing Worktime logout dialog. No new authentication or timer mechanism.

Migration guards exact baseline hashes of four changed functions. UAT rollout needs fresh schema/history snapshots and drift-check, then only this migration on `meuzkduxttjcuiynsnaa`. No Production/main deployment.

Limitations: a non-admin must have an active assigned location before starting a work shift (existing Worktime scope). Missing assignment is shown explicitly; no location is fabricated. Availability can change between preview and start, so the server rechecks it. Live UI smoke requires user access through Vercel Preview Protection. All browser tests use isolated synthetic sessions, never the user's session.

Screenshots: `tmp/tasks-execution.local/{start-work,current-task,in-progress,no-next-task}-{375,768,1440}.png`.

Validation: Node/PIN/Auth 117 PASS; Playwright 141 PASS plus final 5 execution scenarios; Tasks PostgreSQL 164 PASS; Worktime 58 PASS; Orders 189 PASS on both fresh and Tasks-upgrade paths; Production migration regression PASS; lint and build:uat PASS (existing chunk-size warning). Read-only UAT preflight 20261003T232026Z PASS, including source constraints.
