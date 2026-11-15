# MASTER TASK — COMPLETE PROJECT REQUIREMENTS AUDIT, IMPLEMENTATION VERIFICATION, SUPABASE INTEGRATION, DATABASE VALIDATION AND FINAL ACCEPTANCE

## 1. ROLE AND OBJECTIVE

Continue as a Lead Full Stack Developer, Senior Backend Engineer, Database Architect, QA Engineer, and Technical Auditor.

Your objective is to conduct a complete, evidence-based audit of the existing project, compare its actual implementation against all requirements in `task.docx` and `plan.md`, fix confirmed defects, complete the required backend integration, and verify the final implementation.

This is a continuation of existing work, not a new implementation.

The goal is to establish whether the project genuinely satisfies its documented functional, technical, architectural, security, and business requirements.

Do not assume that previous investigations, existing documentation, or implementation claims are correct without verification.

Do not rewrite correctly implemented functionality.

Do not introduce unnecessary refactoring or unrelated redesign.

---

# 2. PRIMARY REQUIREMENTS DOCUMENTS

Before modifying anything, locate and fully inspect:

1. `task.docx`
2. `plan.md`
3. `docs/work-module-decisions.md`
4. `docs/work-module-requirements-matrix.md`
5. `docs/work-module-rollout.md`

The first two documents are the primary sources of project requirements.

Read the complete contents, including tables, lists, acceptance criteria, technical constraints, and dependencies.

If documents contain overlapping or conflicting requirements:

- Identify the conflict.
- Record both original requirements.
- Determine whether one document explicitly supersedes the other.
- Do not silently discard either requirement.
- Preserve unresolved conflicts in the final report.

Do not assume that this assignment's detailed Tasks requirements represent the entire scope of `task.docx` and `plan.md`.

The complete scope must be derived from both documents.

---

# 3. REQUIREMENTS TRACEABILITY MATRIX

Create a complete requirements traceability matrix before implementing changes.

For every individual requirement, record:

- Unique requirement ID.
- Original requirement.
- Source document.
- Document section or location.
- Related frontend components.
- Related backend services.
- Related database objects.
- Existing implementation.
- Supporting evidence.
- Existing test coverage.
- Actual verification result.
- Required correction.
- Final verification result.

Use these statuses:

- VERIFIED — implementation and required behavior are confirmed by sufficient evidence.
- PARTIALLY VERIFIED — some but not all expected behavior is confirmed.
- NOT IMPLEMENTED — functionality is missing.
- FAILED — implementation exists but does not meet the requirement.
- BLOCKED — verification is impossible because of missing access or dependencies.
- NOT TESTED — no sufficient test has been performed.

Important:

A component existing in the repository does not prove that it works.

A function existing in SQL does not prove that it is deployed.

A passing mocked test does not prove Supabase integration.

A successful local database test does not prove remote API authorization.

Never mark a requirement VERIFIED without appropriate evidence.

---

# 4. PROJECT SAFETY AND PRESERVATION RULES

These restrictions are mandatory.

- Preserve existing project architecture.
- Preserve existing user data.
- Preserve existing files.
- Preserve existing working functionality.
- Do not redesign unrelated modules.
- Do not modify global presentation components unnecessarily.
- Do not replace working implementations with new abstractions.
- Do not weaken security policies.
- Do not modify expected test results merely to make tests pass.
- Do not remove tests to conceal failures.
- Do not silently skip requirements.

Absolutely prohibited Git operations:

- No commits.
- No staging.
- No pushing.
- No amend.
- No branch creation.
- No reset.
- No checkout operations that discard changes.
- No destructive repository operations.

Read-only Git inspection is permitted.

All modifications must remain in the working tree.

Before editing files, inspect their existing state and preserve unrelated user modifications.

Never delete files or overwrite existing work without an explicit requirement.

---

# 5. PHASE 1 — COMPLETE INITIAL PROJECT AUDIT

Before implementing changes, inspect the entire relevant project structure.

Inspect:

- Frontend screens.
- React components.
- Hooks.
- State management.
- API services.
- Supabase integration.
- RPC calls.
- Database schema.
- SQL migrations.
- RLS policies.
- Storage policies.
- Authentication.
- Authorization.
- Business logic.
- Notifications.
- Activity history.
- Attachments.
- Error handling.
- Loading states.
- Empty states.
- Validation.
- Tests.
- Documentation.

Inspect all dependencies of the relevant screens, not only their top-level files.

Identify:

- Missing functionality.
- Incomplete functionality.
- Incorrect behavior.
- Incorrect permissions.
- Duplicate queries.
- Stale frontend state.
- Race conditions.
- Incorrect RPC signatures.
- Inconsistent response structures.
- Missing validations.
- Data integrity risks.
- Security vulnerabilities.
- Uncovered acceptance criteria.

Do not begin broad refactoring.

Produce an initial audit and defect list.

---

# 6. TASKS MODULE — SUPABASE MIGRATION INTEGRATION

Primary working directory:

`/Users/nazarii/Desktop/Zagotowki/src/tasks`

Inspect:

- `TaskListScreen.jsx`.
- Task-related hooks.
- API services.
- Supabase RPC calls.
- Database models.
- SQL migrations.
- RLS policies.
- Storage policies.
- Attachment services.
- Notifications.
- Activity history.
- Relevant tests.
- Documentation.

The Tasks module has already completed its major UI/UX redesign and local functional implementation.

## 6.1 Critical finding: subtask creation is already correct

Previous investigation established:

- Subtasks are stored as normal task records.
- Each subtask has the correct `parent_task_id`.
- All four subtask creation entry points pass the correct parent ID.
- Quick-created subtasks receive standard default values.
- Five levels of nesting were tested.
- Parent reassignment preserves the moved task's subtree.
- Cycles and self-parenting are rejected.

Do not rewrite the existing task/subtask creation mechanism.

Do not introduce a separate subtask table.

Preserve the legacy hierarchy fallback as a compatibility mechanism.

The actual configured Supabase project previously exposed an old task-list function returning flat task rows without the required hierarchy information.

The objective is to complete the server-side implementation and verify the frontend against the updated RPC response.

## 6.2 Required migrations

Review these complete SQL files in exactly this order:

1. `supabase/migrations/202611110001_work_hierarchy.sql`
2. `supabase/migrations/202611120001_work_finalize.sql`
3. `supabase/migrations/202611120002_attachment_name_type.sql`

Inspect all three complete files before any execution.

Review:

- Function definitions.
- Function signatures.
- Tables.
- Columns.
- Constraints.
- Foreign keys.
- Indexes.
- Triggers.
- RLS policies.
- Storage policies.
- Permissions.
- Notification functions.
- Hierarchy functions.
- Completion guards.
- Soft deletion.
- Attachment validation.

Check compatibility with the existing schema and existing data.

Verify that they do not accidentally:

- Delete tasks.
- Delete users.
- Drop existing tables.
- Remove existing records.
- Break relationships.
- Weaken permissions.

Do not change migration order.

## 6.3 Supabase project identification

Use `docs/work-module-rollout.md` as the primary deployment reference.

Distinguish:

UAT:
`meuzkduxttjcuiynsnaa`

PROD:
`ssheqxdgsmndiutthxvd`

Inspect the actual local Supabase configuration without exposing credentials.

Determine which project is the intended target.

The user has explicitly authorized continued work with the currently configured project containing test data, even if its reference is labelled PROD.

Do not unnecessarily replace `.env`.

Do not migrate to another project without authorization.

Before any database operation:

1. Confirm the target project.
2. Inspect current schema.
3. Inspect migration history.
4. Run documented read-only preflight queries.
5. Confirm backup or recoverable snapshot.
6. Inspect all three migration files.
7. Identify every pending migration in the repository.

Do not assume `supabase db push` applies only the three requested migrations.

Never use the public anon key for DDL or privileged schema changes.

Never expose credentials in logs or chat.

If privileged database access is unavailable:

- Continue all independent work.
- Review all SQL.
- Prepare exact execution instructions.
- Identify required database permissions.
- Prepare safe SQL execution instructions.
- Document preflight and postflight checks.
- Mark database application as PENDING.

Do not claim that migrations have been applied if they have only been reviewed.

Do not execute destructive or irreversible database operations without explicit authorization.

---

# 7. TASK LIST RPC INTEGRATION

The previous server function rejected:

- `view`
- `page_size`
- `dir`

These parameters were previously commented out in:

`src/tasks/screens/TaskListScreen.jsx`

Inspect the actual function definitions in the migrations.

Do not assume names or signatures.

Verify:

- Supported parameters.
- Parameter types.
- Defaults.
- Return columns.
- Permissions.
- Filtering.
- Sorting.
- Pagination.
- Hierarchical data fields.
- Total count.
- Relevant view information.

Explicitly verify these expected RPC interfaces:

- `tasks_list(jsonb)`
- `tasks_details`
- `tasks_events`
- `tasks_parent_candidates`
- `tasks_notifications`
- `tasks_notifications_unread`

If the actual definitions differ, document the real definitions.

Do not create duplicate functions to hide integration issues.

If supported by the actual function signature, restore the correct frontend parameters.

Ensure frontend parameters exactly match the server contract.

Verify that the hierarchical response includes:

- Task ID.
- Parent task ID.
- Hierarchy depth or equivalent.
- Required metadata.
- Pagination information.
- Total count.
- Relevant view information.

Preserve compatibility fallback for older server versions.

Ensure fallback does not duplicate children when the server already provides hierarchy fields.

---

# 8. TASK VIEWS, FILTERS, SORTING AND PAGINATION

Verify all view modes:

- My Tasks.
- Team Tasks.
- Relevant to Me.
- All Tasks.

Each view must change the actual server-side data scope appropriately.

Presentation settings in the separate "Вид" menu must remain distinct:

- Компактні рядки.
- Розгорнути всі підзавдання.
- Згорнути всі підзавдання.

Compact rows must change presentation density only.

Expand/collapse must change hierarchy visibility only.

Neither operation should unintentionally change permissions or server-side data scope.

Verify:

- Search.
- Filters.
- Sort field.
- Sort direction.
- Page number.
- Page size.
- Total count.
- `view`.
- `page_size`.
- `dir`.

Filtering and sorting must preserve hierarchy.

Do not display unrelated siblings when only a nested descendant matches a filter.

Verify parent progress calculations and the behavior of nested descendants.

---

# 9. SUBTASK AND TASK BUSINESS RULES

Verify:

- Unlimited nesting according to the documented requirements.
- Correct parent-child relationships.
- Parent reassignment.
- Subtree preservation.
- Cycle prevention.
- Self-parenting rejection.
- Parent foreign keys.
- Completion guard.
- Data integrity.

A parent task must not be completed when immediate subtasks remain unfinished, if this is the documented business rule.

Enforce completion restrictions on the backend.

Do not automatically change child statuses.

Verify that parent progress reflects the actual child states.

Test five or more hierarchy levels.

Do not confuse locally verified nesting with remote Supabase verification.

---

# 10. SOFT DELETION

Inspect existing soft-delete implementation.

Verify:

- Single task deletion.
- Bulk deletion.
- Deleted tasks hidden from active lists.
- Historical records preserved.
- Relationships preserved.
- Parent deletion behavior.
- No unintended cascading deletion.

Bulk deletion must follow the same server-side authorization and business rules as single deletion.

A parent task with children must be protected according to documented requirements.

Do not physically delete historical records unless explicitly required and authorized.

---

# 11. NOTIFICATION FUNCTIONS

A previous read-only Supabase probe reported:

`PGRST202: function tasks_notifications_unread not found`

Inspect the actual migration definitions.

Verify:

- Function names.
- Signatures.
- Schema.
- Execute permissions.
- Authentication behavior.
- User-specific filtering.
- Unread count.
- Read state.
- Mark as read.
- Mark all as read.
- Duplicate notification prevention.
- Idempotency.

Verify that notifications are separate from activity records.

If PGRST202 persists, investigate:

- Incorrect function name.
- Incorrect parameter signature.
- Incorrect schema.
- Missing execute privileges.
- PostgREST schema cache synchronization.

Do not introduce duplicate notification functions merely to hide an API integration issue.

---

# 12. ACTIVITY HISTORY

Verify that activity history is recorded on the server.

Inspect:

- Event creation.
- Event types.
- Actor.
- Recipient.
- Task association.
- Timestamps.
- Authorization.
- Historical immutability.

Relevant task actions must produce the expected activity events.

Ordinary task editing must not permit arbitrary modification of historical records.

Verify deletion events remain available after soft deletion.

---

# 13. ATTACHMENT SECURITY — REQUIRED INVESTIGATION AND FIX

Known security issue:

An uploader can still open their own removed attachment.

Investigate:

- Attachment metadata.
- Attachment deletion.
- Storage object paths.
- Storage RLS.
- Signed URL generation.
- Download endpoints.
- Attachment read authorization.

The uploader's ownership of a storage folder must not automatically grant access to a removed attachment.

Required behavior:

After removal from a task:

- Active attachment relationship must be removed or marked deleted.
- Normal download endpoints must reject access.
- Direct Storage requests must not bypass application authorization.
- Uploader must not retain access merely because they uploaded the file.
- Activity history must preserve a deletion event.
- Unrelated files must remain untouched.

Preserve attachment metadata and audit history.

If Storage policy changes are required, prepare a safe migration.

Do not weaken RLS.

Required tests:

1. Owner opens active attachment — permitted.
2. Authorized participant opens active attachment — permitted according to existing permissions.
3. Unauthorized user opens attachment — denied.
4. Uploader opens removed attachment — denied.
5. Deleted attachment is excluded from active task attachments.
6. Deletion remains visible in activity history.

Verify both application-level and Storage-level access behavior.

IMPORTANT:

Extension-to-MIME validation is not equivalent to actual file-content verification.

Do not claim byte-level file validation unless implemented and tested.

Document this limitation explicitly if it remains unresolved.

---

# 14. COMPLETE TASK WORKSPACE VERIFICATION

Verify:

- Open task.
- Edit task.
- Change status.
- Change priority.
- Change assignee.
- Change parent.
- View activity history.
- View attachments.
- Upload attachment.
- Open attachment.
- Remove attachment.
- Verify permissions.
- Verify error states.
- Verify loading states.

Inspect all dialogs, menus, dropdowns, interactive controls, and nested components.

Preserve existing independent Tasks UI architecture.

---

# 15. TASKLISTSCREEN COMPLETE AUDIT

Perform a complete audit of:

`TaskListScreen.jsx`

Inspect its complete dependency tree.

Create an inventory of all interactive elements, including:

- Buttons.
- Menus.
- Dropdowns.
- Search fields.
- Filters.
- Sort controls.
- Pagination controls.
- View selectors.
- Dialogs.
- Task cards.
- Expand/collapse controls.
- Subtask creation controls.
- Drag-and-drop functionality, if present.
- Attachment controls.
- Context menus.

For every element, verify:

- Intended behavior.
- Actual behavior.
- State management.
- API integration.
- Error handling.
- Permissions.
- Test coverage.

Identify inert controls, stale state, duplicate queries, incorrect callbacks, and race conditions.

Do not change working behavior unnecessarily.

---

# 16. PHASE 2 — IMPLEMENTATION CORRECTIONS

After completing the initial audit:

1. Prioritize confirmed defects.
2. Fix critical security issues first.
3. Fix backend integration defects.
4. Fix incorrect API parameters.
5. Fix hierarchy response handling.
6. Fix notification integration.
7. Fix attachment authorization.
8. Fix remaining functional defects.
9. Add appropriate tests.
10. Update documentation.

Do not rewrite working subtask creation.

Do not weaken security.

Do not change acceptance criteria.

Do not introduce unrelated refactoring.

For each correction, record:

- Problem.
- Root cause.
- Files modified.
- Solution.
- Tests added or updated.
- Verification result.

If a correction requires unavailable Supabase privileges, prepare the migration and mark the deployment BLOCKED or PENDING.

---

# 17. PHASE 3 — TESTING

Run tests in the correct order.

## Before remote migrations

- SQL review.
- Local unit tests.
- Local database tests.
- Existing browser tests.
- Build.
- Lint.
- Static analysis.
- Security-related tests.

Maintain the known baseline process-diagram failure at 375px as a separate documented issue.

The six disabled Reports and Schedule screen tests may remain skipped, provided the routes remain explicitly tested as inaccessible.

Do not weaken existing tests.

## After successful remote migrations

Perform actual integration tests against the configured Supabase project:

- RPC integration.
- Database integrity.
- Permission tests.
- Hierarchy tests.
- Notification tests.
- Attachment security tests.
- Browser acceptance tests.
- Full regression tests.

Do not use mock responses as evidence of successful remote integration.

Do not claim remote verification if it was not performed.

---

# 18. REQUIRED POST-MIGRATION ACCEPTANCE TESTS

After an authorized operator applies the migrations, verify against the actual configured project.

## A. Task list

- Updated RPC exists.
- Expected parameters accepted.
- Hierarchical fields returned.
- Pagination works.
- Sorting works.
- All views work.
- Total count is correct.

## B. Subtasks

- Correct parent-child relationships.
- Five or more levels render correctly.
- No duplicate rows.
- Parent progress is correct.
- Completion guard works.
- Parent reassignment preserves descendants.

## C. Notifications

- Unread notification function exists.
- Unread count is correct.
- Read state persists.
- Mark all as read works.
- No duplicate notifications.

## D. Task workspace

- Open task.
- Edit task.
- Change status.
- Change priority.
- Change assignee.
- Change parent.
- View activity history.
- Manage attachments.

## E. Deletion

- Single deletion.
- Bulk deletion.
- Soft-delete behavior.
- Parent protection.
- No cascading deletion.
- Historical data preservation.

---

# 19. PHASE 4 — FINAL CODE REVIEW

Only after implementation corrections and testing, perform the final code review.

Review:

- TaskListScreen.jsx.
- Complete dependency tree.
- API integration.
- RPC calls.
- Hierarchy utilities.
- View controls.
- Filters.
- Sorting.
- Pagination.
- Notification integration.
- Attachment integration.
- Authorization.
- Database constraints.

Look for:

- Incorrect parameter handling.
- Duplicate queries.
- Stale frontend state.
- Incorrect error handling.
- Missing validations.
- Race conditions.
- Permission bypasses.
- Legacy fallback conflicts.
- Data duplication.
- Inconsistent API responses.

Fix genuine remaining problems.

Avoid unnecessary refactoring.

---

# 20. PHASE 5 — FINAL DATABASE MIGRATION REVIEW

Review every migration introduced by this work, including the three required migrations.

Verify:

- Execution order.
- Dependencies.
- Existing data preservation.
- Constraints.
- Indexes.
- Foreign keys.
- RLS.
- Storage policies.
- RPC signatures.
- Function privileges.
- Trigger behavior.
- Migration status.

For every migration, distinguish:

- REVIEWED — SQL inspected.
- APPLIED — confirmed in actual database migration history.
- VERIFIED — expected database behavior confirmed against the actual project.

Never confuse these statuses.

Do not claim that a reviewed migration has been applied.

Do not claim that an applied migration has been functionally verified without testing.

---

# 21. PHASE 6 — DOCUMENTATION

Update:

- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Document:

- Actual task list API requirements.
- Actual RPC signatures.
- Hierarchical response structure.
- Legacy fallback behavior.
- View semantics.
- Notification function names.
- Attachment deletion access policy.
- Migration execution order.
- Actual migration status.
- Preflight instructions.
- Post-migration verification instructions.
- Test results.
- Remaining limitations.

Update the requirements matrix with evidence-based statuses.

Include requirements from both `task.docx` and `plan.md`, not only the Tasks-specific requirements.

Prepare exact instructions for an authorized database operator if privileged access is unavailable.

---

# 22. FINAL ACCEPTANCE REPORT

Provide a comprehensive final report.

## Section A — Requirements compliance

- Total requirements extracted.
- Verified.
- Partially verified.
- Failed.
- Not implemented.
- Blocked.
- Not tested.

Include the complete requirements traceability matrix.

## Section B — Frontend audit

- TaskListScreen audit.
- All audited child components.
- Dependency tree.
- Interactive element inventory.
- Dialogs and menus.
- Search and filters.
- Sorting and pagination.
- View functionality.
- Hierarchy rendering.

## Section C — Subtasks

- Creation entry points.
- Parent relationship verification.
- Five-level nesting test results.
- Parent reassignment.
- Cycle prevention.
- Completion guard.
- Parent progress.

## Section D — Backend

- RPC functions.
- Actual signatures.
- Permissions.
- Hierarchical response.
- Notifications.
- Activity history.
- Soft deletion.
- Attachment authorization.

## Section E — Security

- RLS.
- Storage policies.
- Attachment access.
- Deleted attachment behavior.
- File validation limitations.
- Remaining vulnerabilities.

## Section F — Database migrations

For each of the three migrations report:

- Reviewed: YES/NO.
- Applied: YES/NO/PENDING.
- Verified: YES/NO/PENDING.
- Execution evidence.
- Remaining issues.

## Section G — Testing

Report actual results for:

- Unit tests.
- Database tests.
- Browser tests.
- Integration tests.
- Build.
- Lint.
- Security tests.
- Regression tests.

Distinguish local tests from real Supabase integration tests.

## Section H — Documentation

List all updated documents and explain what was changed.

## Section I — Remaining issues

List:

- Critical blockers.
- High-priority issues.
- Medium-priority issues.
- Low-priority issues.
- Pending UAT.
- Pending database operations.
- Untested functionality.

## Section J — Final project status

Choose one:

- READY FOR UAT.
- PARTIALLY VERIFIED — BLOCKED BY EXTERNAL DEPENDENCIES.
- NOT READY — CRITICAL ISSUES REMAIN.
- VERIFIED AGAINST REQUIREMENTS — PENDING FORMAL UAT ACCEPTANCE.

Do not declare production readiness based solely on local tests.

Do not claim UAT acceptance without actual acceptance evidence.

Confirm explicitly that:

- No Git commits were created.
- No files were staged.
- Nothing was pushed.
- No destructive repository operations were performed.
- Existing user data and unrelated files were preserved.

---

# 23. EXECUTION PRINCIPLES

Follow these principles throughout the assignment:

1. Requirements first, implementation second.
2. Inspect before modifying.
3. Verify before claiming.
4. Preserve correctly implemented functionality.
5. Prioritize security and data integrity.
6. Use real Supabase evidence for backend integration claims.
7. Never use public anon credentials for privileged database changes.
8. Do not hide blockers.
9. Do not weaken tests.
10. Maintain complete requirements traceability.
11. Document every significant correction.
12. Separate local verification, remote verification, and pending UAT.

If privileged access is unavailable, continue every independent task rather than stopping the entire assignment.

Do not wait for database access to complete frontend auditing, local tests, SQL review, documentation, and migration preparation.

The final objective is a fully verified implementation whose frontend, backend, database, security policies, and business rules satisfy the actual requirements in `task.docx` and `plan.md`.

Start by inspecting the repository and reading the complete primary requirements documents. Then proceed phase by phase.

Do not perform Git history-changing operations under any circumstances.

# 24. FINAL FULL-REPOSITORY IMPLEMENTATION COVERAGE AUDIT

The audit must cover every relevant implementation described in task.docx
and plan.md, not only the Tasks module.

Before final acceptance, build a complete repository implementation inventory.

Inspect all relevant:

- Application modules.
- Screens and routes.
- Frontend components.
- Shared components.
- Hooks and state management.
- API services.
- Backend functions.
- Database tables and relationships.
- SQL migrations.
- RLS and Storage policies.
- Authentication and authorization.
- Integrations.
- Background jobs.
- Notifications.
- File handling.
- Business rules.
- Automated tests.

For every requirement, establish a traceable relationship between:

1. Original requirement.
2. Actual implementation.
3. Related source files.
4. Backend implementation.
5. Database implementation.
6. Relevant tests.
7. Runtime verification evidence.
8. Remaining limitations.

Do not assume that checking Tasks proves that the entire project
satisfies its requirements.

Do not assume that every component existing in the repository
is correctly implemented.

Check all functional requirements, including positive behavior,
negative behavior, permissions, error states and boundary conditions.

Where browser, API or database verification is possible,
perform actual runtime tests.

Where verification is impossible, clearly record the blocker.

Create a coverage summary showing every module and its requirements.

# 25. CURRENT UAT DATABASE BASELINE

The latest reported UAT preflight identified:

- 202611110001_work_hierarchy.sql — APPLIED
- 202611120001_work_finalize.sql — APPLIED
- 202611120002_attachment_name_type.sql — APPLIED
- 202611140001_attachment_storage_read.sql — APPLIED
- tasks-private-policies-202611140001.sql — APPLIED

These statuses were reported by schema and function evidence
from P10, not necessarily by independently reconciled CLI history.

Reconfirm the actual state before making any database changes.

Never rerun already-applied migrations merely to repeat verification.

Migration history synchronization must be assessed separately.

The latest reported UAT data baseline was:

- 47 tasks.
- 2 subtasks.
- 186 activity events.
- 0 soft-deleted tasks.
- 0 attachment metadata records.
- 0 removed attachments.
- 0 notifications.
- 0 Storage objects.

Recheck the actual values.

Preserve all existing records.

# 26. FINAL STORAGE SECURITY ACCEPTANCE

The Storage security fix is not fully verified until real files
have been tested.

Prepare and execute an authorized acceptance scenario:

1. Upload an attachment through the actual application.
2. Confirm that the owner can open it.
3. Confirm that an authorized participant can open it.
4. Confirm that an unauthorized user cannot open it.
5. Remove the attachment from the task.
6. Confirm that the uploader cannot open it anymore.
7. Attempt direct Storage API access.
8. Confirm that access remains denied.
9. Confirm the deletion event remains in activity history.
10. Confirm unrelated Storage objects remain unaffected.

Test both application-level authorization and direct Storage access.

Do not mark attachment security VERIFIED until these checks pass.

If test files or test accounts are unavailable,
record the requirement as BLOCKED or PARTIALLY VERIFIED.

# 28. FINAL ACCEPTANCE COVERAGE

The final report must show:

- Total requirements.
- Requirements mapped to implementation.
- Requirements covered by automated tests.
- Requirements verified locally.
- Requirements verified against UAT.
- Requirements verified through authenticated API access.
- Requirements verified through browser acceptance.
- Requirements blocked by missing access.
- Requirements not implemented.

A requirement must not be marked VERIFIED merely because
its code exists or its SQL migration was applied.

Provide a separate completion status for every project module.

The overall project must not be declared complete
while critical requirements remain unverified.

# 29. COMPLETE NOTIFICATION SYSTEM AUDIT — NOTIFICATIONCENTER.JSX

Primary component:

`/Users/nazarii/Desktop/Zagotowki/src/tasks/notifications/NotificationCenter.jsx`

## 29.1 Objective

Perform a complete investigation of the Tasks notification system.

The developer currently cannot see notifications in the NotificationCenter interface.

The latest reported UAT database baseline contained:

- 0 notification records.
- 186 activity history records.

Determine why no notifications are visible.

Do not assume that activity history records automatically generate notifications.

Do not assume that an existing notification component means the notification system works.

The goal is to establish the complete notification lifecycle, identify missing functionality or integration defects, and provide an exact practical testing guide.

## 29.2 Inspect the complete frontend dependency tree

Inspect:

- NotificationCenter.jsx.
- Every imported component.
- Notification-related hooks.
- API services.
- Supabase RPC calls.
- State management.
- Authentication context.
- User identity resolution.
- Realtime subscriptions.
- Polling or refresh mechanisms.
- Unread counters.
- Notification dropdowns or panels.
- Navigation badge integration.
- Loading states.
- Empty states.
- Error handling.
- Mark-as-read interactions.
- Mark-all-as-read interactions.

Determine exactly:

1. Where NotificationCenter is mounted.
2. Which screens or layouts render it.
3. Whether it is visible for all authorized users.
4. Which hook loads notifications.
5. Which RPC functions it invokes.
6. Which parameters it passes.
7. How the current user's identity is determined.
8. How the unread count is calculated.
9. How the UI refreshes after receiving a notification.
10. Whether notifications appear without refreshing the page.

Find any conditions that could cause notifications to remain invisible.

## 29.3 Identify the actual origin of every notification

Trace notification generation from beginning to end.

Inspect:

- Database functions.
- Database triggers.
- Task command functions.
- Notification helper functions.
- Task_notifications table.
- Notification-related migrations.
- Recipient resolution.
- Supabase RPC functions.
- Frontend API services.

For each implemented notification type, document:

| Field             | Required information                              |
| ----------------- | ------------------------------------------------- |
| Notification type | Actual event type                                 |
| Trigger action    | What causes it                                    |
| Source            | Frontend action, RPC, trigger or backend function |
| Sender            | Who generates the event                           |
| Recipient         | Who receives the notification                     |
| Database          | Where the record is stored                        |
| Payload           | Actual payload structure                          |
| Read state        | How unread/read is represented                    |
| Frontend          | How NotificationCenter retrieves and displays it  |

Determine exactly which user actions create notifications.

Investigate possible notification events, including:

- Task assignment.
- Task reassignment.
- Task creation.
- Comments.
- Comment mentions.
- Replies to comments.
- Status changes.
- Priority changes.
- Deadlines.
- Parent or subtask changes.
- Other events explicitly supported by the project requirements.

Do not assume all these events are implemented.

Identify which events intentionally do not generate notifications.

Previously identified limitation:

Notifications for replies to comments were reported as not implemented because a comment reply model does not exist.

Verify whether this limitation remains valid.

Do not invent missing event types or claim unsupported functionality exists.

## 29.4 Distinguish notifications from activity history

Investigate the relationship between:

- Activity history.
- Task events.
- Notification records.

Establish whether each event is recorded in one or both systems.

Verify that:

- Activity records are not automatically assumed to be notifications.
- Notifications have their own recipient and read state.
- An activity event does not create duplicate notifications.
- Notification recipients follow actual business rules.
- Users cannot see another user's private notifications.

Explain why the database might contain activity events but zero notifications.

## 29.5 Verify Supabase notification RPC integration

Explicitly inspect:

- `tasks_notifications`
- `tasks_notifications_unread`

Verify their actual deployed signatures.

Check:

- Schema.
- Parameters.
- Return structure.
- User-specific filtering.
- Execute privileges.
- Authentication.
- RLS interactions.
- Unread count.
- Pagination or limits.
- Read status.
- Mark as read.
- Mark all as read.

Verify that frontend calls match the deployed function signatures.

Investigate PostgREST schema-cache issues if relevant.

Do not create duplicate RPC functions to conceal incorrect frontend integration.

## 29.6 Why notifications are currently not visible

Provide a root-cause investigation.

Check:

- Are notification records actually created?
- Do notification triggers execute?
- Are recipient IDs resolved correctly?
- Are recipient IDs mapped to authenticated users correctly?
- Are RPC functions returning records?
- Does the frontend receive the expected response?
- Is the component mounted?
- Does it filter notifications incorrectly?
- Does it incorrectly exclude unread or read entries?
- Is there a stale cache or state problem?
- Does the component require a realtime event that never arrives?
- Are errors silently swallowed?
- Are notification records excluded by RLS?

Distinguish:

1. No notification was generated.
2. Notification was generated for the wrong recipient.
3. Notification exists but cannot be read.
4. RPC returns data but the frontend does not render it.
5. Notification is rendered but the UI indicator is missing.

Do not guess the root cause.

Support each finding with code, SQL, or runtime evidence.

## 29.7 Create a practical end-to-end testing guide

This is mandatory.

Provide an exact step-by-step testing manual that the developer can follow manually in the application.

Use two authorized UAT test accounts:

- User A.
- User B.

Start by explaining how to verify that both accounts are valid employees and correctly associated with Supabase authentication identities.

Then identify the actual supported actions that can generate notifications.

Prepare a test scenario table:

| Step | Account | User action | Expected database result | Expected UI result |
| ---- | ------- | ----------- | ------------------------ | ------------------ |

Include applicable scenarios such as:

1. User A assigns a task to User B.
2. User B opens the application.
3. User B receives the expected notification.
4. User B opens the notification.
5. Notification is marked as read.
6. Unread count decreases.
7. User A checks that User B's private notification is not visible to User A.
8. A supported second event generates another notification.
9. Mark all as read works.
10. Refreshing the page preserves the correct state.

Only include scenarios supported by actual implementation.

For every test specify:

- Exact navigation path.
- Which account must be logged in.
- Exact UI action.
- Expected notification title or content based on actual code.
- Expected recipient.
- Expected database record.
- Expected unread count before and after.
- Expected UI result.
- How to determine PASS or FAIL.

Do not invent notification wording or event names.

## 29.8 Test all NotificationCenter interface states

Verify:

- No notifications.
- One unread notification.
- Multiple unread notifications.
- Read notification.
- Mixed read/unread notifications.
- Loading state.
- Error state.
- Mark as read.
- Mark all as read.
- Navigation from a notification to its related task.
- Refresh after new notification.
- User switching and logout/login behavior.
- Long notification text.
- Missing or deleted related task.

Check whether the component correctly handles all supported states.

## 29.9 Verify live notification delivery

Determine whether notification updates are implemented using:

- Supabase Realtime.
- PostgreSQL changes.
- Broadcast.
- Polling.
- Manual refresh.
- Refetch after user actions.
- Another mechanism.

Document the actual implementation.

Test whether a notification created for User B appears while User B is already logged in, without manually refreshing the page.

If automatic delivery is not implemented, document this explicitly.

Do not claim realtime behavior merely because the component subscribes to a channel.

Verify subscription configuration, filtering, authentication, cleanup, and actual event delivery.

## 29.10 Notification security and reliability

Verify:

- Notification isolation by recipient.
- RLS.
- Execute privileges.
- User identity validation.
- Duplicate prevention.
- Idempotency.
- Transactional notification creation.
- Correct handling of deleted tasks.
- Unauthorized direct table access.
- No ability to modify another user's notification.
- Read/unread state persistence.

Test two users and attempt unauthorized access.

Do not weaken notification security.

## 29.11 Add missing tests and fix confirmed defects

Add or update tests for:

- Notification generation.
- Recipient resolution.
- Notification RPC responses.
- Unread counter.
- Mark as read.
- Mark all as read.
- Notification isolation.
- Duplicate prevention.
- NotificationCenter rendering.
- Realtime updates, if implemented.
- Empty and error states.

Fix confirmed issues without unnecessary refactoring.

Do not create artificial database notifications merely to make the component appear populated.

Use real application actions for end-to-end notification testing.

## 29.12 Final notification report

Provide:

1. Complete NotificationCenter audit.
2. Complete dependency tree.
3. Exact location where notifications originate.
4. Complete list of implemented notification events.
5. List of unsupported notification events.
6. Database schema and RPC signatures.
7. Notification recipient rules.
8. Explanation of why no notifications were visible.
9. Whether generation works against actual UAT.
10. Whether authenticated retrieval works.
11. Whether live delivery works.
12. Whether mark-as-read works.
13. Whether mark-all-as-read works.
14. Security and permission test results.
15. Exact manual end-to-end testing instructions.
16. Files modified.
17. Tests executed.
18. Remaining defects and limitations.

Clearly distinguish:

- Verified locally.
- Verified against UAT.
- Verified through authenticated application usage.
- Blocked.
- Not implemented.
- Not tested.

Do not report the notification system as complete solely because the RPC functions exist.

The objective is to explain and prove the entire notification lifecycle, from the original task action to the notification appearing in NotificationCenter for the correct user.
