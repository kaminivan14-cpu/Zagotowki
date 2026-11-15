# Work module update — requirements traceability matrix

Audit of 2026-11-14: every requirement of `task.docx` (§1 general instructions, РБ-001 … РБ-014 split into their
individual demands, У-001 … У-007, the 20 mandatory scenarios, the §10 acceptance criteria) and of `plan.md`
(principles, domain invariants, server contract, attachments, permission matrix, edge cases, security, performance,
operations) compared with the code, the migrations and the tests. The earlier summary table (2026-11-11 … 13) marked
rows VERIFIED on local evidence; it is replaced by this matrix.

**Status vocabulary (D-51).** VERIFIED — behaviour confirmed by automated tests at the authoritative layer and not
dependent on the hosted database (client-side UI, documentation, code-review facts). PARTIALLY VERIFIED — confirmed
locally (browser suite with mocked API and/or PGlite running the real migration chain) but not against the hosted
Supabase project, or only part of the demand is met. NOT IMPLEMENTED — missing. FAILED — implemented but not meeting
the requirement. BLOCKED — cannot be verified without missing access. NOT TESTED — no sufficient test exists.
`plan.md` §0.4 prescribes another vocabulary (NOT_STARTED … EXCEPTION_APPROVED); the conflict is recorded in D-51.

**Remote evidence available (2026-11-14, updated 2026-11-15 — see «Acceptance coverage»).** `.env` points at UAT `meuzkduxttjcuiynsnaa`; only the anon key exists.
Read-only probes show the Work RPCs and `202611110001` objects present and every Work RPC denied to anon
(`42501`); see rollout §9. No authenticated call was possible, so no server row can be VERIFIED remotely.

**Totals.** Final status per row after the 2026-11-14 corrections. Before the corrections three rows were FAILED
(РБ-014.8, AC-07, PL-8.3: removed attachment readable by its uploader through Storage); the repository fix (D-47)
is verified locally and awaits deployment.

| Status | Rows |
|---|---|
| VERIFIED | 49 |
| PARTIALLY VERIFIED | 115 |
| NOT IMPLEMENTED | 4 |
| FAILED | 0 |
| BLOCKED | 2 |
| NOT TESTED | 5 |
| **Total** | **175** |

### A. task.docx §1 — general instructions

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| G-01 | Update the existing Work module, do not build a new one | task.docx §1 | `src/tasks/*` extended in place; same RPC/table model | git history (commits PROMT 5–8); code review | met | — | VERIFIED |
| G-02 | Analyse repository, stack, routes, data, migrations, permissions before changes | task.docx §1, §9 | `docs/work-module-audit.md`, decisions log | documents present and current | met | — | VERIFIED |
| G-03 | Do not duplicate existing functionality | task.docx §1; plan.md §1.3 | RPCs, `Task_events`, `Task_files`, recurrence rules reused; Tasks UI copies of `src/ui` primitives exist by explicit operator instruction (D-21) | code review; unit isolation test in `work-ui.test.mjs` | met with approved exception D-21 | — | VERIFIED |
| G-04 | Keep business logic where the change is UI-only | task.docx §1 | recurrence engine, statuses, assignment unchanged | `task-process-schedules.test.mjs`, `tasks.spec.js` recurrence | met (local) | — | PARTIALLY VERIFIED |
| G-05 | Do not delete data, tables or code without dependency analysis | task.docx §1; plan.md §0.2.4 | additive migrations; soft delete; Reports/Schedule commented out with TODO | migration review (§F of report); DB tests | met | — | VERIFIED |
| G-06 | Work in stages and check after each stage | task.docx §1, §7 | phase commits; matrix verification runs | commit history; verification tables below | met | — | VERIFIED |
| G-07 | Do not copy third-party code or design | task.docx §1; plan.md §1.2 | own components and styles | code review | met | — | VERIFIED |

### B. task.docx §2–§5 — functional requirements РБ-001 … РБ-014

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| РБ-001.1 | One compact header: language switch, «Робота», user name, settings, modules, logout | task.docx РБ-001 | `shell/WorkHeader.jsx`, `TasksLanguageSwitcher`, `TasksBackButton` | `tasks-shell.spec.js` «compact header…» 375/768/1440 | PASS (local) | — | VERIFIED |
| РБ-001.2 | Place for the notification centre in the header | task.docx РБ-001 | bell `NotificationCenter` in header | `tasks-shell.spec.js` «notification centre…» | PASS (local) | — | VERIFIED |
| РБ-001.3 | Header responsive on narrow screens | task.docx РБ-001 | `shell.css` breakpoints | «compact header…» 375; «visual audit…» 375/768/1440 | PASS (local) | — | VERIFIED |
| РБ-002.1 | «Звіти» and «Графік» removed from navigation | task.docx РБ-002; У-006 | `shell/navigation.js`, `TasksApp.jsx` (commented with TODO) | `tasks-shell.spec.js` «Reports and Schedule are disabled…»; `work-ui.test.mjs` «hidden sections…» | PASS (local) | — | VERIFIED |
| РБ-002.2 | Their routes disabled (app has no router: screen state + `?task` deep link) | task.docx РБ-002 | `resolveScreen` never returns them, even with report capabilities | same tests; no report RPC called | PASS (local) | — | VERIFIED |
| РБ-002.3 | Admin panel moved to header / settings, permission guard kept | task.docx РБ-002 | header «Адмін панель» for `tasks.admin`; server functions keep their checks | `tasks-shell.spec.js`, `tasks-admin.spec.js` | PASS (local) | — | VERIFIED |
| РБ-002.4 | Keep Робота / Планування / Процеси / Завдання and a separate «Створити завдання» | task.docx РБ-002 | sidebar + primary button | `tasks-admin.spec.js` PR14 (nav names) | PASS (local) | — | VERIFIED |
| РБ-002.5 | Reports / Schedule code, tables and data not deleted | task.docx РБ-002; У-006 | files and RPCs untouched | code review; `git diff` shows no deletion | met | — | VERIFIED |
| РБ-003.1 | Compact persistent sidebar with icons, labels, active state | task.docx РБ-003 | `shell/WorkSidebar.jsx` | «compact header, sidebar…» | PASS (local) | — | VERIFIED |
| РБ-003.2 | «Створити завдання» visually distinct | task.docx РБ-003 | primary button in sidebar | same | PASS (local) | — | VERIFIED |
| РБ-003.3 | Usable on mobile; aligned with header | task.docx РБ-003 | icon rail 601–900 px, bottom bar ≤600 px | «compact header…» 375/768; visual audit | PASS (local); 375 px basic scope (D-41) | — | VERIFIED |
| РБ-004.1 | Subtasks inside any task, including subtasks (`parent_task_id`) | task.docx РБ-004 | `create {title, parent_task_id}` from list menu, workspace, create-dialog section and parent picker | `work-finalize.test.mjs` «five-level hierarchy…»; `work-hierarchy.test.mjs` «unlimited nesting…»; `tasks-shell.spec.js` «create dialog: the parent picker…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-004.2 | No artificial depth limit | task.docx РБ-004; plan.md §4.2.9 | no limit on create/move; list recursion stops at 200 levels, breadcrumb at 100 (defensive guards) | five-level DB test | met for practical depths; levels >200 would not be listed | documented as limitation L-6 | PARTIALLY VERIFIED |
| РБ-004.3 | Each subtask is a full task with its own parameters | task.docx РБ-004 | same `Tasks` row and commands | DB tests above | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-004.4 | Quick create needs only a title; other fields = ordinary task defaults | task.docx РБ-004; plan.md §4.3 | `QuickCreateInput`; server `task_core` defaults (no parent values copied) | `work-finalize.test.mjs` defaults parity; `work-hierarchy.test.mjs` | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-004.5 | Full editing after creation | task.docx РБ-004 | task workspace | `tasks-shell.spec.js` «task workspace…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-004.6 | Cycles and self-parenting refused | task.docx РБ-004 | trigger `task_parent_guard`; `set_parent` `SELF_PARENT` / `PARENT_CYCLE` | DB tests (self, cycle) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-005.1 | Recurrence logic unchanged | task.docx РБ-005; plan.md §0.2.6 | no recurrence SQL or rule changed | `task-process-schedules.test.mjs`; docker `tasks-database.mjs` NOT RUN | PASS (local PGlite) | — | PARTIALLY VERIFIED |
| РБ-005.2 | Compact field + «Налаштувати повторення» popover + readable summary | task.docx РБ-005 | `TasksRecurrenceControl` reusing `RecurrenceFields` | `work-ui.test.mjs` «recurrence summary…»; `tasks.spec.js` 375/768/1440 | PASS (local) | — | VERIFIED |
| РБ-006.1 | Wider, denser, grouped, responsive create form | task.docx РБ-006 | `TaskCreateDialog.jsx` two columns | `tasks-workspace.spec.js` «wide task editor…»; visual QA (D-41) | PASS (local) | — | VERIFIED |
| РБ-006.2 | All existing fields, checks and business logic kept | task.docx РБ-006 | same payload and validation | `tasks.spec.js` «simplified task defaults…» | PASS (local) | — | VERIFIED |
| РБ-007.1 | Subtasks directly under their parent; expand / collapse at any depth | task.docx РБ-007 | `TaskTreeTable` (treegrid, `aria-level`, `aria-expanded`), `taskTree.js` | `tasks-shell.spec.js` «hierarchical list…»; `work-ui.test.mjs` tree helpers | PASS (local) | — | VERIFIED |
| РБ-007.2 | All nested levels collapsed by default | task.docx РБ-007 | `initialExpanded` | same | PASS (local) | — | VERIFIED |
| РБ-007.3 | «Розгорнути всі підзавдання» / «Згорнути всі підзавдання» | task.docx РБ-007 | «Вид» menu | same | PASS (local) | — | VERIFIED |
| РБ-007.4 | Indents, icons, stable row height | task.docx РБ-007 | `task-list.css` | «visual audit…» (one row height) | PASS (local) | — | VERIFIED |
| РБ-007.5 | Sorting and filtering adapted to the hierarchy | task.docx РБ-007; plan.md §4.9 | `tasks_list`: siblings sorted inside each parent, `id` tie-break, NULLS LAST, root-group pagination | `work-finalize.test.mjs` five-level; `pr14-database.test.mjs` | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-008.1 | Editable «Батьківське завдання» field in task details | task.docx РБ-008 | `ParentTaskField` / `TaskSearchSelect` → `tasks_parent_candidates` | `tasks-shell.spec.js` «task workspace…» | PASS (local) | — | VERIFIED |
| РБ-008.2 | Choose another parent or clear it (root) | task.docx РБ-008 | `set_parent` (`parent_task_id` null clears) | `work-hierarchy.test.mjs` «unlimited nesting…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-008.3 | Children kept when the task moves | task.docx РБ-008 | only `parent_task_id` of the moved row changes | `work-finalize.test.mjs` reparent C under A keeps subtree | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-008.4 | Cycles / own descendant as parent refused | task.docx РБ-008 | `task_descendants` check + trigger | DB tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-009.1 | «Мої завдання» = current user is assignee | task.docx РБ-009 | `tasks_list` `view='my'` | `work-hierarchy.test.mjs` «My / Team / Relevant / All…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-009.2 | «Завдання команди» = direct reports (org structure + rights) | task.docx РБ-009; У-002 | `org_assignments(today).manager_employee_id` | same test (direct reports); indirect manager not covered by a test | local PASS; UAT not run (no authenticated session); indirect-report case NOT TESTED | — | PARTIALLY VERIFIED |
| РБ-009.3 | «Релевантні мені» = assignee, author, participant, process owner | task.docx РБ-009; У-001 | assignee, creator, commenters, pending approvers, process owner, step approver (D-4) | same test | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-009.4 | «Всі завдання» = all tasks the user may access | task.docx РБ-009 | `task_can_read` on every row | same test | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-009.5 | Filter match shows the minimal parent chain; parents only as context; no unrelated siblings | task.docx РБ-009; У-004 | `chain` CTE over authorized rows; `match=false` context rows | `work-hierarchy.test.mjs` «… minimal ancestor chain…»; `tasks-shell.spec.js` search «макети» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-009.6 | Open a found task without losing context | task.docx РБ-009 | workspace opens over the list; list state kept; `?task=<id>` | deep-link tests in `tasks-shell.spec.js` | PASS (local) | — | VERIFIED |
| РБ-009.7 | No lost or duplicated tasks when combining filters / sort | task.docx РБ-009; plan.md §4.9 | pre-order rows, one row per id, root pagination | five-level DB test; PR14 DB/browser | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-009.8 | Client sends the server contract `view` / `page_size` / `dir`; old servers keep working | plan.md §6.1; audit brief §7 | initial query restored by the operator (D-46); fallback D-48 | `tasks-shell.spec.js` «view selector…», «legacy backend…»; `work-ui.test.mjs` legacy query | PASS (local); UAT: RPC present, call not run | D-48 fallback added; stale comments fixed | PARTIALLY VERIFIED |
| РБ-010.1 | Completed tasks hidden from active lists, including «Всі завдання» | task.docx РБ-010 | `tab='active'` | `work-hierarchy.test.mjs` «completed tasks leave active lists…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-010.2 | Separate «Завершені» view | task.docx РБ-010 | tab «Завершені» (cancelled shown with badge, D-6) | same; `tasks-shell.spec.js` «view selector…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-010.3 | Open active parent shows unfinished subtasks by default; option to show completed | task.docx РБ-010 | `SubtasksSection` toggle | `tasks-shell.spec.js` «task workspace…» | PASS (local) | — | VERIFIED |
| РБ-010.4 | Hidden completed subtasks still count in progress | task.docx РБ-010 | `app_private.task_progress` counts all direct, non-deleted, non-cancelled children | `work-hierarchy.test.mjs` progress test | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-010.5 | Progress from direct children only (2/4 = 50 %) | task.docx РБ-010 | same function | same | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-010.6 | Show done/total, percent, bar; «—» without children | task.docx РБ-010; У-005 | `ProgressCell`, `TasksProgressBar` | `tasks-shell.spec.js` (`.tk-progress-none`); unit tree tests | PASS (local) | — | VERIFIED |
| РБ-010.7 | Parent cannot be completed with an unfinished direct child; clear message; enforced on the server, all levels | task.docx РБ-010; У-003 | trigger `task_completion_guard` (BEFORE UPDATE OF status, every path); `SUBTASKS_INCOMPLETE` message | `work-hierarchy.test.mjs` «parent completion is refused…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-010.8 | Child statuses never changed automatically | task.docx РБ-010 | guard only raises | same | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-011.1 | «⋯» menu keeps «Відкрити завдання» | task.docx РБ-011 | `TasksDropdownMenu` | `tasks-shell.spec.js` «hierarchical list…» | PASS (local) | — | VERIFIED |
| РБ-011.2 | «Видалити завдання» with trash icon, danger style | task.docx РБ-011 | same | same | PASS (local) | — | VERIFIED |
| РБ-011.3 | Confirmation before deletion | task.docx РБ-011 | `TasksConfirmationDialog` names the task | same; «bulk delete…» | PASS (local) | — | VERIFIED |
| РБ-011.4 | User rights checked | task.docx РБ-011 | server: creator or planning scope | `work-finalize.test.mjs` «deletion policy…» (unrelated user denied) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-011.5 | Safe handling of tasks with subtasks | task.docx РБ-011 | refused with `TASK_HAS_SUBTASKS` (D-26), soft delete of one row | same; `work-hierarchy.test.mjs` | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-011.6 | Stable menu placement, no row jumps | task.docx РБ-011 | fixed actions column | «visual audit…» | PASS (local) | — | VERIFIED |
| РБ-012.1 | Redesigned «Відкрити завдання» workspace (ClickUp reference) | task.docx РБ-012 | `TaskDetailsDialog.jsx`, `TaskWorkspace.css` | `tasks-workspace.spec.js`, `tasks-shell.spec.js`; visual QA | PASS (local) | — | VERIFIED |
| РБ-012.2 | View and edit title, description, status, priority, assignee, deadline, other fields in one place | task.docx РБ-012 | workspace header + properties column → `tasks_command` | `tasks-shell.spec.js` «task workspace…»; DB update tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-012.3 | Subtasks, activity and attachments integrated | task.docx РБ-012 | `SubtasksSection`, `ActivityTimeline`, `TaskAttachments` | same | PASS (local) | — | VERIFIED |
| РБ-012.4 | No uncontrolled layout shifts | task.docx РБ-012 | fixed columns, stable heights | «visual audit…» | PASS (local) | — | VERIFIED |
| РБ-013.1 | Bell in header with unread count | task.docx РБ-013 §5.1 | `tasks_notifications_unread` (polling, D-7); badge «99+» cap with exact count in the panel | `tasks-shell.spec.js` «notification centre…», «notification centre states…» | PASS (local); UAT: function present; 0 notifications on UAT explained (D-52), two-account run pending | D-53: a failed counter refresh keeps the last count and marks the bell instead of showing 0 | PARTIALLY VERIFIED |
| РБ-013.2 | Panel with «Всі / Непрочитані / Прочитані», mark one, mark all, go to task | task.docx РБ-013 §5.1 | `NotificationCenter`; `notification_read`, `notifications_read_all {before_id}` | same; «notification centre: mark all as read…»; `work-hierarchy.test.mjs` «personal notifications…»; `work-notifications.test.mjs` «isolation and read state…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-013.3 | Notification on a new comment | task.docx РБ-013 §5.2 | `task_notify` on `COMMENT_ADDED` | `work-hierarchy.test.mjs`; `work-notifications.test.mjs` «two accounts…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-013.4 | Notification on a reply to a comment | task.docx РБ-013 §5.2 | no reply relation; earlier commenters are notified of any later comment (D-4) | — | not met as a reply | gap recorded (D-49), product decision needed | NOT IMPLEMENTED |
| РБ-013.5 | Notification on assignment | task.docx РБ-013 §5.2 | `TASK_ASSIGNED` recipients (D-27) | `work-finalize.test.mjs` «reassignment…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-013.6 | Notification on status change, completion (reopen: no command exists, D-5) | task.docx РБ-013 §5.2 | event types in `task_notify` | `work-finalize.test.mjs` «status changes…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-013.7 | Notification on progress change | task.docx РБ-013 §5.2 | `PROGRESS_CHANGED` to parent assignee / author | `work-hierarchy.test.mjs` (kinds `PROGRESS_CHANGED`) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-013.8 | Only related users; no notification for own action | task.docx РБ-013 §5.2 | recipient union, actor excluded (D-8) | `work-finalize.test.mjs`, `work-hierarchy.test.mjs`, `work-notifications.test.mjs` (single account = no notification; unrelated employee = none) | local PASS; UAT not run (no authenticated session); UAT diagnostic prepared (D-52) | — | PARTIALLY VERIFIED |
| РБ-013.9 | «Активність» block: creation, comments, status, assignee, deadline, description, parent, attachments, completion; author, type, time, old/new | task.docx РБ-013 §5.3 | `Task_events` before/after; `ActivityTimeline`; `tasks_events` paging | `work-hierarchy.test.mjs` «description, deadline and attachments…»; `work-finalize.test.mjs` «status changes…» | local PASS; UAT not run (no authenticated session); replies NOT IMPLEMENTED | — | PARTIALLY VERIFIED |
| РБ-013.10 | History ≠ notifications; reading keeps history; history immutable; server-written; access-limited; no duplicates | task.docx РБ-013 §5.4 | separate `Task_notifications`; `UNIQUE(event_id, recipient_employee_id)`; append-only trigger on `Task_events`; RLS without client grants | `work-hierarchy.test.mjs` (UPDATE of an event refused; dedup); `work-finalize.test.mjs` | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-013.11 | Delivery mechanism chosen after analysis | task.docx РБ-013 §5.4 | existing 15 s polling reused (D-7) | code review | met | — | VERIFIED |
| РБ-014.1 | Edit the description of an existing task; persisted and shown again | task.docx РБ-014 | `DescriptionEditor` → `update` | `work-hierarchy.test.mjs`; `tasks-shell.spec.js` workspace | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-014.2 | «Вкладення» block; several files; photos, images, PDF, Word, Excel | task.docx РБ-014 | `TaskAttachments`; bucket allowlist incl. DOC/DOCX/XLS/XLSX (D-28) | `work-finalize.test.mjs` «attachments: Word, Excel and PDF…»; `tasks-shell.spec.js` «attachments show…» | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-014.3 | Show name, author, upload date | task.docx РБ-014 | `tasks_details.attachments` | same | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-014.4 | Open and download | task.docx РБ-014 | `tasks_file` check → signed URL 60 s (`download=<name>`) | same | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-014.5 | Remove attachments according to rights | task.docx РБ-014 | `attachment_remove`: uploader, author, planning scope | `work-finalize.test.mjs` (assignee / unrelated refused) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-014.6 | Image preview | task.docx РБ-014 | `Thumbnail` (signed URL 300 s) | `tasks-shell.spec.js` attachments | PASS (local) | — | VERIFIED |
| РБ-014.7 | Description and attachment operations in activity | task.docx РБ-014 | `TASK_UPDATED` before/after; `TASK_ATTACHMENT_ADDED/REMOVED` | `work-hierarchy.test.mjs`; new storage test | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| РБ-014.8 | Type and size checks, safe storage, access control, error handling | task.docx РБ-014 | private bucket 20 MiB + allowlist; `file_register` type / size / name-extension (D-39); per-file error states; storage policies | DB attachment tests; new «attachment storage…» test | **FAILED** before this audit: a removed file stayed readable by its uploader through Storage | D-47: migration `202611140001` + policy script; byte-level content check NOT IMPLEMENTED (L-2) | PARTIALLY VERIFIED |

### C. task.docx §6 — approved decisions У-001 … У-007

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| У-001 | Relevant = assignee, author, participant, process owner | task.docx §6 | see РБ-009.3 | — | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| У-002 | Team = direct subordination + access rights | task.docx §6 | see РБ-009.2 | — | local PASS; UAT not run (no authenticated session); indirect manager NOT TESTED | — | PARTIALLY VERIFIED |
| У-003 | Parent completion blocked while children unfinished | task.docx §6 | see РБ-010.7 | — | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| У-004 | Minimal parent chain, no unrelated siblings | task.docx §6 | see РБ-009.5 | — | local PASS; UAT not run (no authenticated session) | context rows no longer selectable (plan §4.8) | PARTIALLY VERIFIED |
| У-005 | «—» instead of a progress bar without direct children | task.docx §6 | see РБ-010.6 | — | PASS (local) | — | VERIFIED |
| У-006 | Reports / Schedule hidden and disabled; physical deletion later | task.docx §6 | see РБ-002 | — | PASS (local) | — | VERIFIED |
| У-007 | ClickUp as sorting / filtering reference; reuse components | task.docx §6 | toolbar, chips, sort + direction, «Вид»; existing RPC filters reused | `tasks-shell.spec.js`, PR14 | PASS (local) | — | VERIFIED |

### D. Mandatory scenarios (task.docx §8 = plan.md §12.4) — tests per scenario in the table «Mandatory acceptance scenarios» below

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| AS-01 | Task, subtask, third and deeper levels | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-02 | Subtask from a title only | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-03 | Move a subtask to another parent | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-04 | Cyclic hierarchy refused | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-05 | Completing a parent with open children refused | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-06 | All direct children done → parent completes | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-07 | Progress 2/4 = 50 % regardless of deeper levels | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-08 | No progress bar without children | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local, UI rule) | — | VERIFIED |
| AS-09 | Completed hidden; «Завершені» view | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-10 | Nested-only match shows only the parent chain | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-11 | Views Мої / Команди / Релевантні / Всі | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-12 | Edited description recorded in history | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-13 | Upload image and document; open; delete per rights | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); before D-47 the removed-file Storage path FAILED | D-47 (AS-13) | PARTIALLY VERIFIED |
| AS-14 | Comment by another user → personal notification | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-15 | Status change in the journal | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-16 | Notification read; task history intact | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-17 | Delete with dangerous-action confirmation | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local); hosted UAT NOT RUN | — | PARTIALLY VERIFIED |
| AS-18 | Recurrence works as before | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local PGlite); docker recurrence suite NOT RUN | — | PARTIALLY VERIFIED |
| AS-19 | «Звіти» / «Графік» unreachable via navigation and routes | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local, client-only) | — | VERIFIED |
| AS-20 | Other modules not broken | task.docx §8; plan.md §12.4 | see scenario table | see scenario table | PASS (local browser suites of all modules) | — | VERIFIED |

### E. task.docx §10 — acceptance criteria of the whole update

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| AC-01 | All 14 requirements implemented or with an approved exception | task.docx §10 | — | rows РБ-* | 13 of 14 complete locally; РБ-013 reply notifications missing | D-49 open | PARTIALLY VERIFIED |
| AC-02 | All 7 clarifications applied | task.docx §10 | — | rows У-* | PASS (local) | — | PARTIALLY VERIFIED |
| AC-03 | Existing data and business logic preserved | task.docx §10 | additive migrations, soft delete, recurrence untouched | migration review; DB tests | met (local); hosted data not inspected | — | PARTIALLY VERIFIED |
| AC-04 | Access rights not weakened | task.docx §10 | all new RPCs `authenticated` only; anon revoked; D-47 tightens Storage | DB tests; UAT anon probe: every Work RPC answers `42501` to anon | anon boundary confirmed on UAT; authenticated boundaries local only | — | PARTIALLY VERIFIED |
| AC-05 | Hierarchy, progress and completion consistent | task.docx §10 | trigger + `task_progress` + list/detail share one function | DB tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| AC-06 | Notifications and history without lost events | task.docx §10 | event and notifications written in the same transaction as the change | DB tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| AC-07 | Files available only to authorized users | task.docx §10 | `tasks_file`, `tasks_storage_select`, private bucket | new «attachment storage…» test | FAILED on any project with the 2026-10 Storage policy (UAT today); fixed in the repository | D-47 deploy pending | PARTIALLY VERIFIED |
| AC-08 | Interface checked on the main screen sizes | task.docx §10 | — | browser suite 375/768/1440; visual QA 1440/1024/768 (D-41) | PASS (local); 375 px basic scope | — | VERIFIED |
| AC-09 | Critical test scenarios passed | task.docx §10 | — | rows AS-* | PASS (local); hosted NOT RUN | — | PARTIALLY VERIFIED |
| AC-10 | Final report with changes, checks and known limitations | task.docx §10 | this matrix, decisions, rollout | — | delivered | — | VERIFIED |

### F. plan.md — principles, domain invariants and server contract

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| PL-0.2.3 | Server is authoritative for authorization, hierarchy, completion, file access, activity, notifications | plan.md §0.2 | SECURITY DEFINER RPCs + triggers; UI checks are hints | DB tests | met except Storage removed-file read (fixed, D-47) | D-47 | PARTIALLY VERIFIED |
| PL-0.2.9 | Evidence over claims; NOT RUN recorded as such | plan.md §0.2, §3.3 | this matrix (statuses per D-51) | — | met | vocabulary conflict recorded (D-51) | VERIFIED |
| PL-4.2.1-3 | No self-parent, no move under a descendant, forest without cycles | plan.md §4.2 | `task_parent_guard`, `set_parent` checks | DB tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.2.4-5 | Move changes only the parent link; atomic | plan.md §4.2 | single UPDATE inside the command transaction | DB five-level test | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.2.6 | Cycle validation on every parent-changing path, race-safe | plan.md §4.2 | create and `set_parent` take the exclusive `tasks_command` advisory lock (20261002,2); trigger re-checks | code review; no concurrent test | design verified, concurrency NOT TESTED | — | PARTIALLY VERIFIED |
| PL-4.2.7 | Actor may edit the task and use the new parent | plan.md §4.2 | creator / planning scope on the task; `task_can_read` on the parent | DB tests (unrelated user denied) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.2.8 | Clearing the parent makes a root task and keeps children | plan.md §4.2 | `parent_task_id` null | `work-hierarchy.test.mjs` | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.3 | Quick create: title only, ordinary defaults, no parent values copied, title kept on error, no phantom row | plan.md §4.3 | `QuickCreateInput`; server defaults | DB defaults parity; `tasks-shell.spec.js` quick create | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.4 | Progress: direct children, hidden completed count, independent of filters / paging, no N+1 round trips | plan.md §4.4 | `task_progress` evaluated in the same query for each returned row | DB tests | met; per-row subquery cost NOT TESTED at volume | — | PARTIALLY VERIFIED |
| PL-4.5 | Completion guard in the canonical path, stable code + localized message, race-safe, refresh after rejection | plan.md §4.5 | trigger on every status UPDATE; `SUBTASKS_INCOMPLETE`; `complete` holds the shared lock, child-creating / moving actions the exclusive one | DB tests; code review | met (local); concurrency NOT TESTED | — | PARTIALLY VERIFIED |
| PL-4.6 | Completed view within scope; completed ancestor shown only as context | plan.md §4.6 | `chain` includes authorized ancestors of any status as `match=false` | DB chain tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.7 | View definitions server-side, de-duplicated, never wider than access | plan.md §4.7 | `visible` = `task_can_read`; views filter inside it | `work-hierarchy.test.mjs` views | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-4.8 | Matching set vs context rows; context rows not counted, not selectable, not bulk targets | plan.md §4.8 | `match` flag; `matching` count; context checkboxes disabled and excluded from «Вибрати сторінку» | DB chain tests; `tasks-shell.spec.js` «hierarchical list…» (context rows disabled, «Вибрано: 1») | context rows were selectable before this audit | fixed in `TaskTreeTable.jsx` | PARTIALLY VERIFIED |
| PL-4.9 | Sibling sort, deterministic nulls and tie-break, root-group pagination, Expand All for loaded rows | plan.md §4.9 | `tasks_list` ranking; client expand set | DB tests; browser | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-6.1 | Actor from the session, payload validation, no disclosure differences, anon denied | plan.md §6.1 | `task_actor()` from `auth.uid()`; closed key lists (`INVALID_QUERY` / `INVALID_ARGUMENTS`); `TASKS_DENIED` for missing and forbidden | DB tests; UAT anon probe | anon denial confirmed on UAT; rest local | — | PARTIALLY VERIFIED |
| PL-6.2 | 15 server use cases mapped to the existing API | plan.md §6.2 | `tasks_list`, `tasks_details`, `tasks_events`, `tasks_parent_candidates`, `tasks_command` (create, update, set_parent, complete, delete, attachment_remove, file_register, notification_read, notifications_read_all), `tasks_file`, `tasks_notifications(_unread)` | DB tests per use case | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-6.3 | Stable machine-readable errors | plan.md §6.3 | `SELF_PARENT`, `PARENT_CYCLE`, `PARENT_FINAL`, `SUBTASKS_INCOMPLETE`, `TASK_HAS_SUBTASKS`, `TASKS_DENIED`, `ATTACHMENT_TYPE`, `ATTACHMENT_TOO_LARGE`, `TASK_VERSION_CONFLICT` + Ukrainian / Polish texts | DB tests assert codes | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-6.4 | Idempotency: create retries, uploads, notifications, mark-read | plan.md §6.4 | operation id per command (`p_operation`); upload id reused on retry; unique event+recipient; repeated mark-read returns the same row | DB tests (mark-read twice, dedup) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-7.1 | Activity coverage and minimal payloads | plan.md §7.1 | events in the same transaction; description before/after stored in the event, stripped from notification payloads | DB tests | coverage met except replies; full description text kept in history (L-5) | — | PARTIALLY VERIFIED |
| PL-7.2 | Recipient rules, actor suppression, re-check visibility when shown | plan.md §7.2 | `task_notify`; `tasks_notifications` hides task data when no longer readable | DB tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-7.3 | No duplicates on retry; no event lost after commit | plan.md §7.3 | synchronous, same transaction, unique key | DB tests | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-7.4 | Delivery mechanism chosen from the audit; behaviour documented | plan.md §7.4 | polling: unread count every 15 s, on window focus and after each own command; list on panel open; no realtime channel | `TasksApp.jsx` refresh; browser «notification centre states…» (focus refresh) | met (local); live delivery on UAT pending (guide §2 step 2) | — | PARTIALLY VERIFIED |
| PL-7.5 | Read state personal; mark-all keeps newer notifications unread; repeat-safe | plan.md §7.5 | `recipient_employee_id = actor`; `before_id` | `work-hierarchy.test.mjs` (other user's mark-read refused) | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-8.2a | Allowlist, server-side type / extension / size checks, storage key independent of the name, no path traversal | plan.md §8.2 | bucket + `file_register` (folder = own `auth.uid`, name extension ↔ MIME, size) | `work-finalize.test.mjs` attachments | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-8.2b | Detected content (magic bytes) validation; malware scanning | plan.md §8.2 | none (would need an Edge Function / scanner) | — | not implemented; residual risk documented (D-39) | — | NOT IMPLEMENTED |
| PL-8.2c | Orphan objects after interrupted uploads | plan.md §8.2 | unregistered uploads stay in the uploader's folder, readable only by them; no cleanup job | code review | not handled | limitation L-3 | NOT IMPLEMENTED |
| PL-8.3 | Every open / download authorizes task and attachment; short-lived URLs; IDOR tests | plan.md §8.3 | `tasks_file` + 60 s signed URL; Storage policy via `tasks_storage_select` (D-47) | DB tests (unrelated denied, removed denied at Storage level) | Storage path FAILED before D-47; fixed locally | D-47 deploy pending | PARTIALLY VERIFIED |
| PL-8.3b | Safe content-disposition / nosniff for opened files | plan.md §8.3 | download uses `download=<name>`; inline open relies on Supabase Storage headers | — | NOT TESTED | — | NOT TESTED |
| PL-8.4 | Deletion: server permission, soft removal, object kept, activity event | plan.md §8.4 | `removed_at`, object untouched, `TASK_ATTACHMENT_REMOVED` | DB tests incl. new Storage test | local PASS; UAT not run (no authenticated session) | — | PARTIALLY VERIFIED |
| PL-9 | Permission matrix (view, context, create, child, edit, parent, status, delete, activity, notifications, upload, open, remove file, admin) | plan.md §9 | server checks listed in the report §D / §E | DB tests for author, assignee, participant (commenter), direct manager, unrelated employee; anon on UAT | indirect manager, admin-only paths and other tenants NOT TESTED (single company) | — | PARTIALLY VERIFIED |
| PL-10 | Additive migrations, explicit FKs without cascade, rollback documented, tested on a production-like copy | plan.md §10 | four Work migrations reviewed (report §F) | PGlite full chain; production-like copy NOT RUN | partially met | — | PARTIALLY VERIFIED |

### G. plan.md — edge cases, security, performance, operations

| ID | Requirement | Source | Implementation (frontend · backend · database) | Evidence / tests | Verification result | Correction (2026-11-14) | Status |
|---|---|---|---|---|---|---|---|
| PL-12.5.1 | Root, one, four and many children | plan.md §12.5 | see note | DB tests (1–4 children); «many» NOT TESTED | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.2 | Completed child with an incomplete grandchild | plan.md §12.5 | see note | cannot arise: completion guard on the child, `PARENT_FINAL` on create / move, no reopen command (D-5) | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.3 | User matching several relevance roles → one row | plan.md §12.5 | see note | DB views test | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.4 | Several matches sharing ancestors → ancestors once | plan.md §12.5 | see note | DB chain test | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.5 | Accessible ancestor / inaccessible descendant and vice versa | plan.md §12.5 | see note | chain built from `visible` only; no dedicated test (NOT TESTED) | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.6 | Concurrent edits | plan.md §12.5 | see note | `TASK_VERSION_CONFLICT` (DB tests); concurrent sessions NOT TESTED | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.7-8 | Network loss / retry after timeout | plan.md §12.5 | see note | operation key kept until a definitive answer (`client.js`); NOT TESTED end-to-end | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.9 | Long titles, names, file names, translations | plan.md §12.5 | see note | visual audit + truncation with title attribute | PASS (local) | — | VERIFIED |
| PL-12.5.10 | Empty description, attachments, activity, notifications | plan.md §12.5 | see note | empty states in browser tests | PASS (local) | — | VERIFIED |
| PL-12.5.11 | Recurring task with children | plan.md §12.5 | see note | no test | NOT TESTED | — | NOT TESTED |
| PL-12.5.12 | Delete permission revoked after the dialog opened | plan.md §12.5 | see note | server re-checks at submit; NOT TESTED | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.13 | Recipient changes after process owner / assignee change | plan.md §12.5 | see note | recipients resolved at event time; DB reassignment test | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.14 | Notification target becomes inaccessible | plan.md §12.5 | see note | task data hidden when unreadable; DB test | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.15 | Time zone / DST for dates | plan.md §12.5 | see note | company time zone used; existing recurrence tests | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.16 | Large tree, slow network, many requests | plan.md §12.5 | see note | not measured | NOT TESTED | — | NOT TESTED |
| PL-12.5.17 | Parent move while filters / expansion active | plan.md §12.5 | see note | list reloads, manual expansion kept for rows still present; no dedicated test | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.5.18 | Completed ancestor as context for an active match | plan.md §12.5 | see note | DB chain test (context row, `match=false`) | PASS (local) | — | PARTIALLY VERIFIED |
| PL-12.6a | Security actors: author, assignee, participant, direct manager, unrelated employee, anonymous | plan.md §12.6 | — | DB tests; UAT anon probe (`42501` on all Work RPCs) | PASS (local); anon also on UAT | — | PARTIALLY VERIFIED |
| PL-12.6b | Security actors: indirect manager, admin, other tenant | plan.md §12.6 | — | — | NOT TESTED (no other tenant model) | — | NOT TESTED |
| PL-12.6c | IDOR (task, attachment, activity, notification), spoofing, file type / size, path traversal, cycle via API, completion via other paths, unauthorized writes, picker leakage | plan.md §12.6 | server checks | DB tests for each except activity IDOR and picker leakage (code-reviewed) | PASS (local); two items code-review only | — | PARTIALLY VERIFIED |
| PL-12.7 | Performance with realistic volumes and query plans | plan.md §12.7 | indexes `tasks_children_live`, `task_files_live`, notification inbox | no measurement | NOT TESTED | — | NOT TESTED |
| PL-15.1 | Observability for failures, denials, slow queries | plan.md §15.1 | no monitoring in the repository; errors surface in PostgREST / Supabase logs | — | not implemented | — | NOT IMPLEMENTED |
| PL-15.2 | Pre-release checklist (staging storage, notifications, backups) | plan.md §15.2 | rollout §8, §10, §11 | — | blocked on UAT access | — | BLOCKED |
| PL-15.3-4 | Deployment sequence and rollback principles documented | plan.md §15.3–15.4 | rollout §1, §4, §7, §7a, §10 | — | documented | — | VERIFIED |
| PL-16 | Hosted acceptance of the whole update (20 scenarios on UAT) | plan.md §16; task.docx §10 | rollout §11 | — | NOT RUN — no authenticated UAT session or credentials | — | BLOCKED |


## Acceptance coverage (2026-11-15)

| Measure | Rows |
|---|---|
| Requirements extracted (task.docx + plan.md) | 175 |
| Mapped to an implementation | 171 (4 NOT IMPLEMENTED) |
| Evidence names an automated test | 116 |
| Passing local evidence for at least part of the requirement (VERIFIED + PARTIALLY VERIFIED) | 164 |
| Supported by UAT evidence (schema / function presence, anon denial) | 6 — РБ-009.8, РБ-013.1, AC-04, PL-6.1, PL-9, PL-12.6a |
| Verified through authenticated API calls on UAT | 0 — no test credentials in this environment |
| Verified through browser acceptance on UAT | 0 — pending the operator's run (`docs/work-module-uat-acceptance-guide.md`) |
| BLOCKED | 2 |
| NOT IMPLEMENTED | 4 |

UAT database (D-54): the four Work migrations and the Storage policy are applied by schema evidence (operator P10,
2026-11-15; `tasks_storage_select` confirmed by anon probe). CLI history reconciliation is pending.

### Module coverage

Scope note: `task.docx` and `plan.md` describe the Work module update only. Other repository modules (Orders, Audit,
Worktime, Auth / PIN, Production plan, Organization, Access, Employees) are in scope only as regression
(AS-20, PL-0.2.10): their local browser and Node suites pass; they have no requirement rows of their own here.

| Module | Requirements | Local status | UAT status | Completion |
|---|---|---|---|---|
| Shell: header, sidebar, navigation, hidden Reports / Schedule | РБ-001 … РБ-003, У-006, AS-19 | VERIFIED (browser) | not run in the browser | complete locally |
| Task list: views, filters, sorting, pagination, «Вид», bulk actions, legacy fallback | РБ-007, РБ-009, РБ-011, У-001/2/4/7, PL-4.7–4.9 | PASS | functions present; authenticated run pending | partially verified |
| Hierarchy: subtasks, parent change, progress, completion guard | РБ-004, РБ-008, РБ-010, У-003/5, PL-4.2–4.6 | PASS (PGlite, five levels) | pending | partially verified |
| Create / edit form, recurrence presentation | РБ-005, РБ-006 | VERIFIED (UI); recurrence engine PASS on PGlite | pending | partially verified (docker suite not run) |
| Task workspace (details, description, edit) | РБ-012, РБ-014.1 | PASS | pending | partially verified |
| Attachments and Storage security | РБ-014.2–14.8, PL-8.x, AC-07 | PASS incl. removed-file Storage test | migration + policy applied; real-file run pending | partially verified |
| Activity history | РБ-013.9–13.10, PL-7.1 | PASS | 186 events present; behaviour not exercised | partially verified |
| Notifications | РБ-013.1–13.8, РБ-013.11, PL-7.2–7.5 | PASS (`work-notifications.test.mjs`, browser states) | 0 notifications explained (D-52); diagnostic + two-account run pending | partially verified; replies not implemented (D-49) |
| Deletion (single, bulk) | РБ-011, AS-17 | PASS | pending | partially verified |
| Planning, Work, Processes, Admin, Access, Organization screens (redesigned, behaviour unchanged) | G-04, AS-20 | PASS (browser), one pre-existing failure D-31 | not run | regression only |
| Security, performance, observability | PL-12.6, PL-12.7, PL-15 | security PASS; performance and observability not done | anon boundary confirmed | partially verified / not implemented |

Overall: not complete — no requirement that depends on the hosted database is verified through authenticated use yet.

## Known limitations (2026-11-14)

| # | Limitation | Priority | Reference |
|---|---|---|---|
| L-1 | Replies to comments are not modelled; a reply is an ordinary comment (its earlier commenters are notified as participants). | Medium | D-49 (product decision) |
| L-2 | File content is not inspected (no magic-byte check, no malware scan); type = Storage-recorded MIME + allowlist + name extension. | Medium | D-39 |
| L-3 | Uploads never registered (interrupted flow) stay in the uploader's folder, readable only by them; no cleanup job. | Low | D-47 |
| L-4 | The removed-attachment Storage fix exists only in the repository until migration `202611140001` and the policy script are applied. | High until deployed | D-47, rollout §10 |
| L-5 | Activity history keeps the full previous and new description text (visible to everyone who may read the task; never in notifications). | Low | plan §7.1 |
| L-6 | The list query stops descending at 200 levels and the breadcrumb at 100 (cycle-safe guards; data itself is unlimited). | Low | РБ-004.2 |
| L-7 | Default list view: approved «Всі завдання» (D-33) vs working-tree «Мої завдання» (D-46). | Decision | D-46 |
| L-8 | Concurrency (parallel reparent / completion) is protected by advisory locks but not exercised by a parallel test. | Medium | PL-4.2.6, PL-4.5 |
| L-9 | No performance measurement or query plans at realistic volume. | Medium | PL-12.7 |
| L-10 | UAT schema also lacks `202610260001_employee_positions` and `202610280001_shift_functions` (other modules); a blind `db push` would apply them. | Operational | rollout §9 |

## Verification run (2026-11-15, after the notification audit)

| Check | Result |
|---|---|
| Lint (`npm run lint`) | exit 0, no diagnostics |
| Unit + DB (`npm test`, PGlite, full chain) | 197 passed, 0 failed (new: `work-notifications.test.mjs`, 3 tests) |
| Build (`vite build --mode uat`, scratch output) | OK |
| Browser, full suite (port-5174 copies) | 242 passed, 6 skipped (У-006), 1 failed — pre-existing drag test at 375 px (D-31); new: «notification centre states…», «notification centre: mark all as read…» |
| UAT SQL files (pre-flight P10, post-flight, user checks, notification diagnostic) | executed end to end on PGlite in the states documented in `docs/work-module-uat-sql-editor.md` |
| UAT anon probe | `tasks_storage_select` present; Work RPCs deny anon |
| Authenticated / browser acceptance on UAT | NOT RUN — operator guide `docs/work-module-uat-acceptance-guide.md` |
| Re-check (2026-11-15, later) | lint exit 0; `npm test` 197/197; build OK (browser suite not re-run: no code change since) |
| Browser, full suite after the D-31 fix (2026-11-15) | 243 passed, 6 skipped (У-006), **0 failed** |
| Production package (2026-11-15, D-55) | `npm test` 200/200 incl. `tests/prod-inventory.test.mjs` (3); lint 0; build OK; the 10 `supabase/upgrades/prod/*.sql` files executed on PGlite in complete, Production-like, outdated and drifted states |
| Anon re-probe (2026-11-15), UAT `meuzkduxttjcuiynsnaa` | `tasks_list`, `tasks_details`, `tasks_events`, `tasks_parent_candidates`, `tasks_notifications`, `tasks_notifications_unread`, `tasks_storage_select` → 42501 (present, anon denied); `Tasks.deleted_at`, `Tasks.parent_task_id`, `Task_notifications` → 42501 |
| Anon re-probe (2026-11-15), PROD `ssheqxdgsmndiutthxvd` (`.env` now targets it) | same Work RPCs and columns present (42501) — the `202611110001` objects now exist on PROD, unlike 2026-11-13 (D-42); `tasks_storage_select` → PGRST202: **`202611140001` and the Storage policy upgrade are not applied on PROD**, so the removed-attachment Storage exposure (D-47) is still open there. Full-chain probe of both projects: rollout §9 (UAT also lacks `202610070001_manager_email_auth`). Read-only probes only; nothing written |

## Verification run (2026-11-14, after the requirements audit)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` (oxlint) | exit 0, no diagnostics |
| Unit + DB (PGlite, full migration chain incl. `202611140001`) | `npm test` | 194 passed, 0 failed |
| Build | `vite build --mode uat` (output to a scratch directory) | OK (pre-existing chunk-size warning) |
| Browser, full suite (final) | `npx playwright test` via port-5174 copies (D-30) | 240 passed, 6 skipped (У-006), 1 failed — pre-existing drag test at 375 px (D-31). First run of the day: 4 failed, of which 3 were PR14 default-view assertions aligned with D-46 |
| Browser, Tasks specs after the last edits | `tasks-shell`, `tasks`, `tasks-workspace` specs | 38 passed, 6 skipped; `tasks-shell` re-run after the context-row change: 19/19 passed |
| Security (Storage, removed attachment) | `node --test --test-name-pattern="attachment storage" tests/work-finalize.test.mjs` | passed: old policy exposes the removed file; upgrade script and fresh install deny it; six access cases asserted |
| Type check | — | not applicable (no TypeScript) |
| Docker DB suites | `tests/tasks-database.mjs`, `tests/tasks-processes-database.mjs` | NOT RUN (no docker) |
| UAT read-only probes (anon) | `POST /rest/v1/rpc/<fn>`, `GET /rest/v1/<table>?select=<col>&limit=0` | Work RPCs present, anon denied; `202611110001` objects present; `202610260001`, `202610280001` markers missing (rollout §9) |
| Authenticated integration on UAT | — | **BLOCKED** — no credentials / session |
| Production | — | not touched; not ready (rollout §8) |

Previous run (2026-11-13): lint clean, Node 192/192, browser 240 passed / 6 skipped / 1 failed (D-31).

## Mandatory acceptance scenarios (task.docx §8)

Result column = outcome of the referenced tests in the local run above. Hosted column = authenticated run on UAT.

| # | Scenario | Implementation | Exact tests | Result (local) | Hosted (UAT) |
|---|---|---|---|---|---|
| 1 | Task, subtask, third and deeper levels | `task_core` create with `parent_task_id`; `QuickCreateInput` | DB `work-hierarchy.test.mjs` «unlimited nesting, quick create defaults…»; browser `tasks-shell.spec.js` «hierarchical list…» (depth-2 rows) | PASSED | NOT RUN — blocked |
| 2 | Subtask from a title only | `create {title,parent_task_id}`; quick-create rows in list and workspace | DB `work-hierarchy.test.mjs` «unlimited nesting…» (defaults asserted); browser `tasks-shell.spec.js` «hierarchical list…», «task workspace…» | PASSED | NOT RUN — blocked |
| 3 | Move a subtask to another parent | `set_parent`, `TaskSearchSelect` parent field | DB `work-hierarchy.test.mjs` «unlimited nesting…» (`set_parent`, event `TASK_PARENT_CHANGED`); browser `tasks-shell.spec.js` «task workspace…» (parent picker → `set_parent`) | PASSED | NOT RUN — blocked |
| 4 | Cyclic hierarchy refused | `SELF_PARENT`, `PARENT_CYCLE`, `PARENT_FINAL` | DB `work-hierarchy.test.mjs` «unlimited nesting…» | PASSED | NOT RUN — blocked |
| 5 | Completing a parent with open children is refused | trigger `task_completion_guard` (`SUBTASKS_INCOMPLETE`) | DB `work-hierarchy.test.mjs` «parent completion is refused…» | PASSED | NOT RUN — blocked |
| 6 | All direct children done → parent completes | same trigger | DB `work-hierarchy.test.mjs` «parent completion is refused…» | PASSED | NOT RUN — blocked |
| 7 | Progress 2/4 = 50 % regardless of deeper levels | `app_private.task_progress` (direct children) | DB `work-hierarchy.test.mjs` «… progress counts direct children only» | PASSED | NOT RUN — blocked |
| 8 | No progress bar without children | progress `null` → «—» | browser `tasks-shell.spec.js` «hierarchical list…» (`.tk-progress-none` = «—»); unit `work-ui.test.mjs` tree helpers | PASSED | NOT RUN — blocked |
| 9 | Completed hidden; separate «Завершені» view | `tasks_list` `tab` | DB `work-hierarchy.test.mjs` «completed tasks leave active lists…»; browser `tasks-shell.spec.js` list tabs | PASSED | NOT RUN — blocked |
| 10 | Nested-only match shows just the parent chain | `tasks_list` minimal ancestor chain (`match=false` context rows) | DB `work-hierarchy.test.mjs` «… filters keep the minimal ancestor chain…»; browser `tasks-shell.spec.js` «hierarchical list…» (search «макети» → 2 context rows) | PASSED | NOT RUN — blocked |
| 11 | Views My / Team / Relevant / All | `tasks_list` `view` | DB `work-hierarchy.test.mjs` «My / Team / Relevant / All views…» | PASSED | NOT RUN — blocked |
| 12 | Edited description is in the history | `update` + `TASK_UPDATED` before/after | DB `work-hierarchy.test.mjs` «description, deadline and attachments…»; browser `tasks-shell.spec.js` «task workspace…» (description editor) | PASSED | NOT RUN — blocked |
| 13 | Upload image and document, open, delete per rights | `file_register`, `tasks_file`, `attachment_remove` | DB `work-hierarchy.test.mjs` «description, deadline and attachments…» (image) and `work-finalize.test.mjs` «attachments: Word, Excel and PDF…» (PDF/DOC/DOCX/XLS/XLSX, unsupported, oversized, foreign object, unauthorized read, removal rights); browser `tasks-shell.spec.js` «attachments show name, author and upload date…» (open + download) | PASSED | NOT RUN — blocked |
| 14 | Comment by another user → personal notification | `task_notify` on `COMMENT_ADDED` | DB `work-hierarchy.test.mjs` «personal notifications are scoped…» | PASSED | NOT RUN — blocked |
| 15 | Status change written to the journal | `task_event` with before/after | DB `work-finalize.test.mjs` «status changes are written to the activity log…» | PASSED | NOT RUN — blocked |
| 16 | Notification read; task history intact | `notification_read`, `notifications_read_all` | DB `work-hierarchy.test.mjs` «personal notifications…», `work-finalize.test.mjs` «status changes…» (event count unchanged); browser `tasks-shell.spec.js` «notification centre…» | PASSED | NOT RUN — blocked |
| 17 | Delete with dangerous-action confirmation | `delete` (D-26), `TasksConfirmationDialog` | DB `work-finalize.test.mjs` «deletion policy…», `work-hierarchy.test.mjs` «… deletion is safe»; browser `tasks-shell.spec.js` «hierarchical list… safe delete» | PASSED | NOT RUN — blocked |
| 18 | Recurrence works as before the redesign | shared recurrence rules unchanged; `TasksRecurrenceControl` presentation only | DB `task-process-schedules.test.mjs`, `tasks-database.mjs` recurrence cases; unit `work-ui.test.mjs` «recurrence summary…»; browser `tasks.spec.js` «simplified task defaults recurrence and locale» (375/768/1440) | PASSED | NOT RUN — blocked |
| 19 | «Звіти» and «Графік» unreachable via navigation and routes | nav entries and screen branches commented out (TODO У-006); `resolveScreen` never returns them | unit `work-ui.test.mjs` «hidden sections never resolve to Reports or Schedule…»; browser `tasks-shell.spec.js` «Reports and Schedule are disabled…» (even with report/schedule capabilities, no entry, no screen, no report RPC) | PASSED | NOT RUN — blocked |
| 20 | Other modules unaffected | global `src/ui`, `src/i18n` unchanged; one guarded hook in `ModuleShell` | browser `orders`, `audit`, `auth`, `employees`, `production-plan`, `worktime`, `organization`, `access` specs; `tasks-shell.spec.js` «module navigation…»; unit isolation test in `work-ui.test.mjs` | PASSED | NOT RUN — blocked |

## Tasks UI component library (`src/tasks/components/ui/`)

| Tasks component | Replaces inside Tasks | Notes |
|---|---|---|
| TasksButton, TasksIconButton | `src/ui/Button` | variants primary / secondary / ghost / danger / link |
| TasksIcon | `src/ui/Icon` | inline SVG set |
| TasksDialog | `src/tasks/components/Dialog` (kept, unused) | no language switcher (D-20) |
| TasksModalClose | `src/ui/ModalClose` | own styles, independent of `modal-close.css` |
| TasksConfirmationDialog | `src/ui/ConfirmDialog` | destructive confirmations |
| TasksDropdownMenu | `src/ui/ActionMenu` | row «⋯» menu, real button trigger |
| TasksPopover, useTasksDismissable | `src/ui/Popover`, `src/ui/useDismissable` | header menus, view menu, filters |
| TasksField | `src/ui/Field` | label / hint / error wiring |
| TasksTabs, TasksPagination, TasksBadge, TasksProgressBar, TasksStateMessage | same-named `src/ui` components | list, notifications, empty / loading / error states |
| TasksLanguageSwitcher | `src/i18n` LanguageSwitcher | header only |
| TasksRecurrenceControl | `src/shared/RecurrenceControl` | reuses shared RecurrenceFields and recurrence rules unchanged |
| TasksBackButton | — (new) | visible «Модулі» (D-22) |

Adoption (D-29): legacy Processes, Admin, Access, Organization, Planning, Work and Task-settings screens use `TasksButton`
(121 conversions), `TasksTabs` (process views), `StatusBadge`/`TasksBadge` (planning row) and `TasksButton size="lg"`
(64 px execution actions). Native inputs/selects/textareas share the Tasks tokens through one rule in `tasks-ui.css`.
The date picker is the Tasks-owned `DateTimeInput`; tooltips are native `title` attributes (no global tooltip component exists).

## Screen-by-screen redesign checklist (2026-11-12)

Visually verified = rendered and reviewed in the running app (mock data) at the listed widths; 375 px is covered by
the browser suite's layout assertions (basic phone support this phase).

| Area | Screen / dialog / overlay | Redesigned | Visually verified |
|---|---|---|---|
| Shell | Header (Модулі, language, bell, admin, settings, account) | yes | 1440 / 1024 / 768 |
| Shell | Sidebar (desktop), icon rail (tablet 601–900), bottom bar (phone) | yes | 1440 / 1024 / 768 |
| Shell | Notification centre panel, account menu | yes | 1440 / 768 |
| Shell | Text size settings dialog | yes | 1440 / 768 |
| Tasks | Task list: Мої / Команди / Релевантні / Всі (one component, view selector) | yes | 1440 / 1024 / 768 |
| Tasks | Tabs Активні / Завершені / Прострочені / Всі, search, sort, direction | yes | 1440 / 1024 / 768 |
| Tasks | Filter panel + active-filter chips | yes | 1440 / 768 |
| Tasks | «Вид» menu (compact rows, expand / collapse all), view selector popover | yes | 1440 / 768 |
| Tasks | Expanded / collapsed hierarchy, row action menu | yes | 1440 / 1024 / 768 |
| Tasks | Bulk bar, bulk delete confirmation (with blocked parents) | yes | 1440 / 768 |
| Tasks | Delete confirmation, blocked-delete explanation | yes | 1440 / 768 |
| Tasks | Create Task dialog (default, with subtasks / checklist / recurrence panel, close confirmation) | yes | 1440 / 1024 / 768 |
| Tasks | Task workspace (header, description, subtasks, checklist, attachments, comments, activity, properties) | yes | 1440 / 1024 / 768 |
| Tasks | Parent picker, dependency picker (TaskSearchSelect) | yes | 1440 (inside create / workspace captures) |
| Planning | Week plan (days, rows, plan parameters, quick actions) | yes | 1440 / 1024 / 768 |
| Planning | Month view (task rows) | yes | 1440 / 1024 / 768 |
| Planning | Plan date form (task workspace) | yes | 1440 / 768 |
| Work | Ready-to-start, next task / active task | yes | 1440 / 1024 / 768 |
| Processes | List (templates / active / history tabs, filters, table) | yes | 1440 / 1024 / 768 |
| Processes | Process view dialog | yes | 1440 / 768 |
| Processes | Wizard steps 1–3 (header, stepper, forms, hints, diagram toolbar) | yes — diagram nodes / handles unchanged | 1440 / 768 |
| Admin | Employees table, dictionaries | yes | 1440 / 768 |
| Admin | Employee edit dialog, invite dialog (shared EmailInvite) | yes | 1440 / 768 |
| Access | Roles, employees, employee access dialog, role permissions dialog | yes | 1440 / 768 |
| Organization | Structure chart, change-department dialog | yes | 1440 / 768 |

| Work | Critical-task interruption dialog (start, decline with required reason) | yes — no change needed | 1440 / 1024 / 768 |
| Processes | Process launch dialog (empty, validation, filled; reached via a mocked published template) | yes — form fixed (D-41) | 1440 / 1024 / 768 |
| Tasks | Attachments: list, uploading, uploaded, upload failure, unsupported type, >20 MB, DOC / DOCX / XLS / XLSX, delete confirmation, permission denied on open, open / download | yes — status lines, error style, hint fixed (D-41) | 1440 / 1024 / 768 |
| Admin | «Налаштування роботи та доступів» (work settings, departments, reporting lines, access grants, capacity, categories) | yes — field grid, primary submits (D-41) | 1440 / 1024 / 768 |
| All | Basic phone stability (list, create dialog, workspace, dialogs) | basic only (deferred phase) | 375 |

Reports and Schedule stay disabled (У-006) and were not redesigned.

## Task list audit (2026-11-13) — interaction inventory

| Control | Behaviour and backend dependency | Evidence | Status |
|---|---|---|---|
| Page title + «Режим перегляду» (Мої / Команди / Релевантні / Всі) | `set('view')` → `tasks_list.view`; title follows the requested view; team hidden when `team_available=false` | shell «view selector changes the server scope…», DB «My / Team / Relevant / All…» | VERIFIED |
| Tabs Активні / Завершені / Прострочені / Всі + counters | `set('tab')` → `tasks_list.tab`; counts from `counts` | shell «view selector…» (tab), DB «completed tasks leave active lists…» | VERIFIED |
| Search | 200 ms debounce → `tasks_list.search` (title substring, case-insensitive, or `#id`); ancestors auto-expand | shell «hierarchical list…» (search «макети»), DB five-level chain | VERIFIED |
| «Фільтри» panel + chips + «Скинути фільтри» | status / priority / assignee / category / deadline range → `tasks_list`; chips clear one key; reset keeps view / tab / sort | PR14 browser (filters), DB list tests | VERIFIED |
| Sort field + direction | `sort` resets `dir`; direction toggles asc / desc → `tasks_list.sort/dir`; siblings sorted inside each parent, id tie-break | shell «view selector…» (sort, dir), DB pr14 list | VERIFIED |
| «Вид» → Компактні рядки | row height 48 → 40 px; persisted per session | shell «view selector…» (row height before / after reload) | VERIFIED |
| «Вид» → Розгорнути / Згорнути всі підзавдання | expands every loaded parent / clears expansion; disabled when nothing to do | shell «hierarchical list…» | VERIFIED |
| Row expand toggle, hierarchy guides | `toggleExpanded`; collapsed by default; legacy payloads nested by `normalizeTreeRows` | shell «hierarchical list…», «legacy backend…», unit tree tests | VERIFIED |
| Row title | opens the task workspace; URL `?task=<id>` | shell deep-link tests | VERIFIED |
| Row checkbox / «Вибрати сторінку» | selects visible rows; reset on every reload | shell «bulk delete…» | VERIFIED |
| Bulk bar: Зняти вибір / Видалити вибрані | per-task `delete`; parents excluded; one request per task; result message | shell «bulk delete…» | VERIFIED |
| Row menu: Відкрити / Додати підзавдання / Видалити | open workspace; inline quick create `{title, parent_task_id}`; delete confirmation or blocked explanation | shell «hierarchical list… quick create and safe delete» | VERIFIED |
| «Створити завдання» (header, page, empty state) | Create Task dialog (parent picker → `parent_task_id`; subtasks section → children after create) | shell «create dialog: the parent picker…», workspace «wide task editor…» | VERIFIED |
| Pagination | top-level tasks per page (server default 10); page corrected when out of range; fallback page size | PR14 browser, DB five-level (`total` counts roots) | VERIFIED |
| Status / priority / assignee / deadline / parent / description / attachments | edited in the task workspace (RB-012), not inline in the list | shell workspace tests, DB hierarchy / finalize tests | VERIFIED (workspace) |

Subtask entry points (all send `parent_task_id`; created rows are ordinary tasks): list row menu, workspace «Додати
підзавдання», create-dialog «Підзавдання» section, create-dialog parent picker. Five-level nesting, quick-create defaults equal
to an ordinary task, parent links, list depths 0–4, chain filtering, direct-child progress, self / cycle refusal and subtree-
preserving reparenting are covered by `work-finalize.test.mjs` «five-level hierarchy…».

Context rows (filter ancestors, `match=false`) are not selectable and «Вибрати сторінку» skips them (2026-11-14, plan §4.8).
In legacy mode (server without `202611110001`, D-48) the list shows a notice, «Всі завдання», and disables the other
views, the direction toggle and the «Назва» sort.

**Hosted state (2026-11-14):** the configured project is now UAT, which has the `202611110001` objects (rollout §9).
The inventory above is verified locally (mocked API + PGlite with the full migration chain). Authenticated checks on UAT
are **BLOCKED** (no credentials); the production project still lacks the Work migrations (D-42) and is served by the
legacy fallbacks.
