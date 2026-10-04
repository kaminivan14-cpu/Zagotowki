# Планування — UI UAT

Scope: `feature/orders`, only the Planning presentation and optional initial values in the existing task creation dialog. No database, RPC, RLS, permissions, Work Queue, balancing algorithm, Reports or Schedule changes. No Production deployment.

## Interface

- Seven vertical day blocks, compact task rows, category hierarchy from `Task_categories`, priority and optional start time/status.
- Current/next week selection: next week unavailable Monday–Thursday; Friday–Sunday defaults to next week. Current week remains available. Past-day creation is disabled. Existing server validation remains authoritative.
- Day creation opens the existing `TaskCreateDialog` with the selected employee and date. Unplanned tasks open existing details and scheduling actions.
- Day capacity uses existing `tasks_planning.days` aggregates. Near capacity starts at 85%; overload means remaining minutes exceed capacity. Unknown estimates remain explicitly visible.
- `planned_minutes` represents remaining work according to the existing RPC, not the sum of original estimates. Task rows show their original estimate. The sidebar explains this distinction.
- Sidebar includes period, dates, total tasks, remaining load, priority/category summaries and immediate-save status. Unconfirmed operations do not show “all changes saved”.
- Existing month planning remains current Monday through the following three weeks (28 days), with existing approvals, recommendations and manual load-check action preserved.

## Existing data and limitations

The existing read already supplies `planned_date`, `planned_start_at`, `estimated_minutes`, category, priority, status and daily capacity/count/unknown aggregates. No read extension or migration is needed.

There is no existing copy-week or clear-week command. Copy is disabled with an explanation; clear is omitted. No speculative bulk write/delete was added.

The RPC paginates task rows. Day/period totals use server aggregates; priority/category summaries cover loaded rows and display a partial-summary notice until pagination is exhausted. “Load more” preserves day aggregates and appends planned/unplanned rows. Stale responses from previously selected periods/employees are ignored.

## Verification

Targeted: 17 browser tests (existing Tasks plus 9 Planning tests), 3 new Node tests; lint and UAT build passed. Browser fixtures are synthetic and isolated from UAT/Production.

Full regression: 106 Node tests; 127 Playwright tests (including PIN/Auth, Orders, Tasks, production plan and Worktime); Orders PostgreSQL 189 checks on both fresh and Tasks-upgrade paths; Tasks PostgreSQL 111 checks; Worktime PostgreSQL 58 checks; production plan migration/RPC regression passed. Lint and `build:uat` passed. Build retains the existing large-main-chunk warning. Screenshots from isolated tests:

- `tmp/tasks-planning.local/week-1440.png`
- `tmp/tasks-planning.local/week-1024.png`
- `tmp/tasks-planning.local/week-768.png`
- `tmp/tasks-planning.local/week-375.png`

## Manual UAT smoke after Preview

1. Open Робота → Планування; verify Ukrainian text and existing application navigation.
2. Open week planning; check seven days, week availability, employee scope, capacity and unknown estimates against real data.
3. Add a task on a permitted day; verify date/employee preselection and persistence after reload.
4. Open an unplanned task, schedule through the existing dialog, verify its day and totals after reload.
5. Check category hierarchy, priority, optional start time, task details and pagination when applicable.
6. Switch to month planning: four Monday–Sunday weeks; return to week without losing saved work.
7. Verify tablet/desktop layout, keyboard focus and permission-restricted accounts.

No authenticated live smoke is performed using the user's browser, sessions or Keychain. Deployment requires pushing `feature/orders`; no migration is required.
