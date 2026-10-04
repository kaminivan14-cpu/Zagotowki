# Explicit task actions — UAT

Branch feature/orders only. The user approved completing an own unstarted task despite schedule blocking, with explicit confirmation and no fabricated time; additionally requested a start button.

UI: `Розпочати завдання` and `Позначити виконаним` on the Work task rows and in task details. In-progress tasks use the existing `Зроблено` action. Work shows own nonterminal tasks (existing scoped/paginated tasks_list) when no task is running. Manual completion requires an inline confirmation checkbox; success refreshes work and closes details.

Migration `202610050002_task_manual_actions.sql` adds private `task_manual_command` and extends the existing validator/dispatcher. The same tasks_command operation UUIDs, actor validation, employee locks and task versions remain authoritative. Exact baseline hashes guard the changed functions. No new public RPC, role permission, table or RLS policy.

- `start_task`: own task only, task_ready must pass. It preserves schedule/time/estimate/dependency restrictions. Starts real work via existing task_start; critical tasks retain the existing interrupt/return flow. Another normal running task prevents a second timer.
- `mark_completed`: own unplanned/planned/paused task, or delegates in-progress completion to the existing command. Requires confirmed=true, completed checklist and completed prerequisites. A planned task may be marked completed even outside its scheduled window because this records already performed work. It adds no session or minutes. Pending approvals, drafts, blocked/cancelled/completed states are not accepted. Another active task/timer is preserved; only the completed task is removed from the paused-return list.
- Audit: existing TASK_COMPLETED event, reason manual_completion, no_time_added=true. No implicit cancellation or deletion.

Tests include scoped denial, confirmation, checklist and dependencies, future start rejection, real start/session, another active timer, preserving actual time after pause, idempotency and concurrent completion. UI tests use en-US browser at 375/768/1024/1440 and cover typed date/time validation, ISO round-trip, start, confirmation and removal after completion.

Rollout: snapshot schema and migration history, compare task_validate_args/task_dispatch against guarded baseline, apply only this migration on meuzkduxttjcuiynsnaa, verify RLS/grants/other function hashes unchanged, then push feature/orders and verify Preview. Never Production/main.

Known limits: explicit start deliberately does not override availability; if the task is outside its shift it reports TASK_NOT_READY. Manual completion is a declaration of already done work, not a way to manufacture tracked hours. Live UI smoke still requires access through Preview Protection.
