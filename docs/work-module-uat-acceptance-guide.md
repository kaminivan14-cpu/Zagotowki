# Work module — UAT acceptance guide: notifications and attachment security

Prepared 2026-11-15 for manual testing on **Zagotowki - UAT** (`meuzkduxttjcuiynsnaa`) with two real accounts.
Nothing here writes to the database by SQL: data changes only through normal application actions. Every SQL query
below is read-only and runs in Dashboard → SQL Editor (role `postgres`).

## 0. Why the bell has been empty so far

Established from the code (D-52) and reproduced locally (`tests/work-notifications.test.mjs`):

1. Notifications are created **only** by `app_private.task_notify`, which `app_private.task_event` calls in the same
   transaction as each activity event. Every activity event goes through `task_event`; there is no other path.
2. `task_notify` exists only since migration `202611110001`. Activity recorded before it was applied produced no
   notifications, and nothing is back-filled (by design).
3. **The actor is never a recipient.** A task you create for yourself, edit, comment or complete yourself notifies
   nobody, because nobody else is related to it. Testing with one account therefore always shows an empty bell.
4. Recipients are the task's assignee and author, commenters, pending approvers, the process owner / step approver,
   and for creation / completion / cancellation / deletion / parent changes the parent's assignee and author; only
   active, non-archived employees; at most one notification per event and person.

Before testing, run the whole of `supabase/upgrades/uat/work_module_notifications_diagnostic.sql`. Its result
classifies all existing activity events:

| Classification | Meaning |
|---|---|
| 1 notified | a notification exists |
| 2 recorded before 202611110001 | expected: notifications did not exist yet |
| 3 event type never notifies | expected (recurrence generation, process launch updates, internal types) |
| 4 assignment without a change of assignee | expected (D-14) |
| 5 only the actor is involved | expected: nobody else to notify |
| 6 SHOULD HAVE NOTIFIED | a defect: send the event ids |

With 186 events and 0 notifications on UAT, the expected outcome is that every event falls into rows 2–5. Any row 6
is a real defect.

## 1. Prepare two accounts

Run **N1** from the diagnostic file (select it, "Run selected"). Pick:

- **User A** — `tasks_access = true`, `can_assign_others = true`, `has_direct_reports = true` (a manager).
- **User B** — a direct report of A with `tasks_access = true`.

A must be able to assign tasks to B: the «Виконавець» list in the create dialog offers only people within A's
assignment scope (direct reports for a manager). If no such pair exists, stop: the test needs one.

Use two separate browser sessions at the same time (for example a normal window for A and a private window for B),
both on the UAT frontend (or `npm run dev` with the UAT `.env`, http://127.0.0.1:5173). Log in, choose the module
«Робота», then «Завдання» in the sidebar.

Record the baseline with N2 (notifications per recipient) and this query (keep it open; re-run after each step):

```sql
SELECT n.id, n.kind, r.name AS recipient, a.name AS actor, t.title AS task, n.read_at, n.created_at
FROM public."Task_notifications" n
JOIN public."Employees" r ON r.id = n.recipient_employee_id
JOIN public."Task_events" e ON e.id = n.event_id
LEFT JOIN public."Employees" a ON a.id = e.actor_employee_id
JOIN public."Tasks" t ON t.id = n.task_id
ORDER BY n.id DESC LIMIT 15;
```

## 2. Notification scenarios

The bell is in the header. Its count refreshes every 15 seconds, when the browser window regains focus, and after
every action of that same user (D-7). There is no realtime channel. "Within 15 s" below means: wait up to 15
seconds, or click into the window.

| # | Account | Action (exact path) | Expected database | Expected UI | PASS when |
|---|---|---|---|---|---|
| 1 | A | «Створити завдання» → «Назва» `UAT сповіщення 1` → «Виконавець» = B → «Створити» | one row: kind `TASK_CREATED`, recipient B, actor A, `read_at` null | A's bell unchanged | row present, no row for A |
| 2 | B | do nothing, keep the page open | — | within 15 s the bell shows **1** («Сповіщення: 1 непрочитаних») | badge appears without reloading |
| 3 | B | click the bell | — | panel «Сповіщення», tab «Всі»: «*A* призначив(ла) вам завдання», below it `UAT сповіщення 1`, unread dot; tab «Непрочитані» counts 1 | text and dot as described |
| 4 | B | click that notification | `read_at` set on that row | the task workspace `UAT сповіщення 1` opens; bell has no badge; the item is under «Прочитані» | badge gone, row read |
| 5 | A | click the bell | A has no row for step 1 | A does not see B's notification | B's item absent |
| 6 | B | in the task workspace, «Коментарі» → write `Питання від B` → «Додати коментар» | kind `COMMENT_ADDED`, recipient **A** (author) | — | one row for A only |
| 7 | A | wait / click into the window | — | bell **1**: «*B* додав(ла) коментар», task title, comment text below | as described |
| 8 | A | open the task (from the notification), change «Пріоритет», «Зберегти»; then «Додати коментар» `Відповідь A` | kinds `TASK_UPDATED` and `COMMENT_ADDED`, both recipient B | — | two rows for B |
| 9 | B | wait 15 s | — | bell **2**: «змінив(ла) параметри завдання» and «додав(ла) коментар» | count 2 |
| 10 | B | panel → «Позначити всі як прочитані» | both rows of B get `read_at`; A's rows unchanged | badge gone; «Непрочитані» empty («Непрочитаних сповіщень немає.») | B unread 0, A untouched |
| 11 | B | reload the page (F5) | — | bell still without badge; items under «Прочитані» | state kept |
| 12 | B | task workspace → «Позначити виконаним» → tick «Підтверджую, що завдання виконано» → confirm | kind `TASK_COMPLETED`, recipient A | — | one row for A |
| 13 | A | wait 15 s | — | «*B* завершив(ла) завдання» | as described |
| 14 | A | create a task without changing «Виконавець» (for yourself), edit it, comment it | activity rows, **no** notification rows | nobody's bell changes | no new notification rows |
| 15 | A | create `UAT сповіщення 2` for B, then «⋯» → «Видалити завдання» → confirm | `TASK_CREATED` and `TASK_DELETED`, recipient B | B: «*A* видалив(ла) завдання» | rows present |

Interface states to observe along the way: empty inbox («Сповіщень поки немає.»), one unread, several unread, read,
mixed (steps 2–11); long comment text is cut to 140 characters (write a longer comment in step 6 to check); a counter
that cannot be refreshed shows a small warning mark on the bell and the title «Не вдалося оновити кількість
сповіщень» (not reproducible on purpose in UAT; covered by the browser suite); log out A and log in as B in the same
window: the bell shows B's count only.

Security checks during the run: step 5 (isolation); in the SQL Editor nothing is needed — `authenticated` has no
direct access to `Task_notifications` (checked by `work_module_postflight_as_user.sql`, row 15).

## 3. Attachment security (real files)

Use a small PDF or PNG. A = author of the task, B = assignee, C = a third employee unrelated to the task (N1).

| # | Account | Action | Expected | PASS when |
|---|---|---|---|---|
| 1 | B | open a task assigned to B → «Вкладення» → «Додати файли (до 20 МБ)» → choose the file | file listed with name, author and date; A gets «додав(ла) вкладення» | listed |
| 2 | B | click the file name, then «Завантажити» | file opens / downloads | opens |
| 3 | A | open the same task, click the file | opens (author of the task) | opens |
| 4 | C | open the deep link `?task=<id>` of that task | access refused (task not readable) | refused |
| 5 | — | SQL Editor: `SELECT id, object_key, removed_at FROM public."Task_files" ORDER BY created_at DESC LIMIT 3;` | note the `object_key` of the new file | key noted |
| 6 | B | DevTools console on the app page, run the snippet below with that key | `200` and a `signedURL` | 200 |
| 7 | A or B | «Вкладення» → remove the file → confirm «Видалити вкладення?» | file disappears; activity shows the removal; `removed_at` set | gone |
| 8 | B | run the snippet again | status `400` (object not found for this user) | not 200 |
| 9 | B | reopen the task | file not listed; activity still shows «видалив(ла) вкладення» | as described |
| 10 | — | SQL Editor: `SELECT count(*) FROM storage.objects WHERE bucket_id = 'tasks-private';` | unchanged by the removal (objects are never deleted) | count unchanged |

Snippet for steps 6 and 8 (uses B's own session in B's browser; replace `<OBJECT_KEY>` and `<ANON_KEY>` — the anon
key is `VITE_SUPABASE_ANON_KEY` from `.env`):

```js
const s = JSON.parse(localStorage.getItem('sb-meuzkduxttjcuiynsnaa-auth-token'));
const r = await fetch('https://meuzkduxttjcuiynsnaa.supabase.co/storage/v1/object/sign/tasks-private/<OBJECT_KEY>', {
  method: 'POST',
  headers: { apikey: '<ANON_KEY>', Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ expiresIn: 60 }),
});
console.log(r.status, await r.text());
```

Then run `supabase/upgrades/uat/work_module_postflight_as_user.sql`: rows 12–14 now use these real files.

## 4. Reporting

For each step note PASS / FAIL, the account, time and (for FAIL) the result of the notification query above. Send
the table back; the requirements matrix is updated only from these results.
