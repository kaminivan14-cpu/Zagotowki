# TASKS MODULE — SUPABASE MIGRATION INTEGRATION, SERVER-SIDE FUNCTIONALITY VERIFICATION AND FINAL DATABASE VALIDATION

## 1. ROLE

Continue as a Lead Full Stack Developer, Senior Backend Engineer, Database Architect, and QA Engineer.

The Tasks module has completed its major UI/UX redesign and local functional implementation.

A recent investigation identified that some apparent task hierarchy problems are caused by the configured Supabase project missing the required Work-module migrations.

**Do not rewrite the task/subtask creation logic. The existing investigation confirmed that subtasks are stored correctly as task records with the correct `parent_task_id`.**

Your task is to complete the missing backend integration, verify the server-side functionality, fix remaining issues, and prepare the database for reliable operation.

This is a continuation of existing work, not a new implementation.

---

# 2. PROJECT SCOPE

Primary working directory:

`/Users/nazarii/Desktop/Zagotowki/src/tasks`

You may inspect and modify directly related files outside this directory when necessary.

Inspect:

- TaskListScreen.jsx.
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

Do not redesign unrelated modules.

Do not modify global presentation components.

Preserve the existing independent Tasks UI architecture.

---

# 3. CRITICAL FINDING — SUBTASK CREATION IS ALREADY CORRECT

The previous investigation verified:

- Subtasks are stored as normal task records.
- Each subtask has the correct `parent_task_id`.
- All four subtask creation entry points pass the correct parent ID.
- Quick-created subtasks receive standard default values.
- Five levels of nesting were tested.
- Parent reassignment preserves the moved task's subtree.
- Cycles and self-parenting are rejected.

Do not replace the existing task model.

Do not introduce a separate subtask table.

Do not rewrite working subtask creation functionality.

The issue is that the currently configured Supabase project still exposes the old task-list function.

The old function returns flat task rows without the hierarchy fields required by the frontend.

The frontend fallback has already been implemented.

Preserve that fallback as a compatibility mechanism, but do not treat it as a substitute for the new server-side functionality.

After the required migrations are applied, verify that the new server response provides the correct hierarchy information.

---

# 4. REQUIRED MIGRATIONS

The following migrations must be reviewed and applied in the exact order below:

1. `supabase/migrations/202611110001_work_hierarchy.sql`
2. `supabase/migrations/202611120001_work_finalize.sql`
3. `supabase/migrations/202611120002_attachment_name_type.sql`

First, inspect all three complete SQL files.

Understand their dependencies and execution order.

Do not change the order.

## 4.1 Migration review

Inspect:

- Functions.
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
- Task hierarchy functions.
- Completion guards.
- Soft deletion.
- Attachment validation.

Verify that migrations are compatible with the current schema and existing data.

Confirm that they do not accidentally:

- Delete tasks.
- Delete users.
- Drop existing tables.
- Remove existing records.
- Break task relationships.
- Weaken permissions.

Check the migration history before attempting execution.

Do not blindly rerun migrations that have already been applied.

---

# 5. SUPABASE CONNECTION AND EXECUTION PERMISSIONS

The user has explicitly confirmed that the currently configured Supabase project contains test data and that continued use of the existing connection is acceptable.

Do not block work merely because the project reference is labelled PROD.

Do not unnecessarily replace `.env` or migrate to another Supabase project.

However, the environment currently has only the Supabase public anon key.

The anon key is not sufficient to apply database schema migrations.

**NEVER attempt to apply DDL migrations using the public anon key or through an unauthorized workaround.**

Do not request or expose secrets in chat or logs.

If privileged database access is unavailable:

1. Continue reviewing all migration files.
2. Prepare exact execution instructions.
3. Identify the required database permissions.
4. Prepare SQL suitable for execution by an authorized database operator.
5. Document how to verify successful execution.
6. Continue all independent frontend and testing work.
7. Clearly state that database migration execution remains pending.

Do not claim migrations were applied if they were only reviewed.

The user can execute approved migrations through an authorized Supabase database session or provide an appropriate secure access mechanism.

Before applying migrations, confirm the target project and the availability of a backup or recoverable snapshot.

Preserve all existing test data.

---

# 6. TASK LIST RPC — CRITICAL INTEGRATION

The old server function currently rejects parameters:

- `view`
- `page_size`
- `dir`

These parameters were previously commented out in:

`src/tasks/screens/TaskListScreen.jsx`

The new server implementation is expected to support the updated task list behavior.

## 6.1 Inspect the new function signatures

Discover the actual function definitions in the migrations.

Do not assume their names or signatures.

Verify:

- Supported parameters.
- Parameter types.
- Default values.
- Return columns.
- Permissions.
- Filtering behavior.
- Sorting behavior.
- Pagination behavior.
- Hierarchical data fields.

## 6.2 Restore frontend parameters where supported

If the new server function correctly supports `view`, `page_size`, and `dir`, update the frontend API call to pass the correct values.

Do not keep old compatibility restrictions unnecessarily.

Ensure frontend parameters exactly match the actual server function signature.

Do not pass unsupported or incorrectly typed parameters.

## 6.3 Hierarchical data response

Verify that the new server function returns enough information to represent the task hierarchy correctly.

Check:

- Task ID.
- Parent task ID.
- Hierarchy depth or equivalent.
- Required task metadata.
- Pagination metadata.
- Total count.
- Relevant view information.

The frontend must correctly render the response.

Keep the legacy hierarchy fallback for compatibility with older server versions where appropriate.

Ensure it does not duplicate children when the server already supplies hierarchical fields.

---

# 7. NOTIFICATION FUNCTIONS

A previous read-only Supabase probe reported:

`PGRST202: function tasks_notifications_unread not found`

Inspect the relevant migration and determine the actual notification RPC functions.

Verify:

- Function names.
- Function signatures.
- Execution privileges.
- Return structure.
- Authentication behavior.
- User-specific notification filtering.
- Unread count.
- Read and unread status.
- Mark as read.
- Mark all as read.
- Duplicate notification prevention.

After migrations have been applied, verify that the notification functions are accessible through the expected API.

If PGRST202 persists, investigate:

- Incorrect function name.
- Incorrect parameter signature.
- Incorrect schema.
- Missing execute permissions.
- PostgREST schema cache synchronization.

Do not create duplicate functions merely to hide an API integration issue.

---

# 8. OTHER BACKEND FUNCTIONALITY

Verify that all relevant server-side functionality becomes available after migrations.

## Task hierarchy

- Unlimited nesting.
- Parent reassignment.
- Cycle prevention.
- Parent foreign keys.
- Completion guard.
- Data integrity.

## Task completion

- Reject parent completion when immediate subtasks remain unfinished.
- Enforce the restriction on the backend.
- Do not automatically change child statuses.

## Soft deletion

- Verify existing soft-delete behavior.
- Ensure deleted tasks are hidden from active lists according to requirements.
- Preserve historical records and relationships.
- Verify bulk deletion uses the same server-side policy.

## Activity history

- Verify history is recorded on the server.
- Verify relevant task actions generate activity events.
- Verify ordinary task editing cannot arbitrarily modify historical records.

## Notifications

- Verify notification records are separate from activity records.
- Verify recipient rules.
- Verify idempotency.
- Verify read state.

Do not assume that local in-process database tests establish that the Supabase RPC integration works against the configured project.

Test the actual API boundary where access is available.

---

# 9. ATTACHMENT ACCESS — SECURITY FIX REQUIRED

A known limitation remains:

**An uploader can still open their own removed attachment.**

Investigate the cause.

Inspect:

- Attachment metadata records.
- Attachment deletion behavior.
- Storage object paths.
- Storage RLS policies.
- Signed URL generation.
- Download endpoints.
- Attachment read authorization.

The uploader's ownership of a storage folder must not automatically grant access to an attachment that is no longer associated with an active task.

## Required behavior

After an attachment is deleted from a task:

- Its active attachment relationship must be removed or marked deleted.
- Normal download and open endpoints must reject access.
- Direct storage access must not bypass the application permission policy.
- The deleted attachment must not remain accessible merely because the requester uploaded it.
- Activity history must retain an appropriate deletion record.

Preserve the current attachment metadata and audit history.

Do not delete unrelated files.

Where storage retention is required, ensure that retained objects cannot be accessed as active attachments.

If a storage policy change is necessary, prepare a safe migration.

Do not weaken RLS policies.

Add tests covering:

1. Owner opens an active attachment — permitted.
2. Authorized participant opens an active attachment — permitted according to existing permissions.
3. Unauthorized user opens an attachment — denied.
4. Uploader opens their removed attachment — denied.
5. Deleted attachment is not returned as an active task attachment.
6. Deletion remains visible in activity history.

---

# 10. VIEW, FILTER, SORTING AND PAGINATION

Verify the actual semantics of the following controls.

## View categories

- My Tasks.
- Team Tasks.
- Relevant to Me.
- All Tasks.

Verify that each mode changes the actual server-side data scope appropriately.

## Presentation settings

The separate "Вид" menu currently contains:

- Компактні рядки.
- Розгорнути всі підзавдання.
- Згорнути всі підзавдання.

Preserve this distinction.

Compact rows must change density, not the underlying task dataset.

Expand/collapse must change hierarchy visibility, not task permissions or server-side scope.

## Sorting and pagination

After the server-side function is updated, verify:

- `view`.
- `page_size`.
- `dir`.
- Sort field.
- Page number.
- Total count.

Ensure the frontend sends correct parameters.

Ensure the API response is parsed correctly.

Verify filtering and sorting preserve hierarchy.

Do not display unrelated siblings when only a nested descendant matches a filter.

---

# 11. REQUIRED VERIFICATION AFTER MIGRATIONS

Once the three migrations are applied by an authorized operator, perform a complete integration check.

Verify the following against the actual configured Supabase project.

### A. Task list

- New RPC exists.
- Expected parameters are accepted.
- Hierarchical task fields are returned.
- Pagination works.
- Sorting works.
- All task views work.

### B. Subtasks

- Parent-child relationships are returned correctly.
- Five or more levels render correctly.
- No duplicate rows appear.
- Parent progress is correct.
- Parent completion guard works.

### C. Notifications

- Unread notification function exists.
- Unread count is correct.
- Read state is persisted.
- Mark all as read works.
- No duplicate notifications are created.

### D. Task workspace

- Open task.
- Edit task.
- Change status.
- Change priority.
- Change assignee.
- Change parent.
- View activity history.
- View and manage attachments.

### E. Deletion

- Single deletion.
- Bulk deletion.
- Soft-delete behavior.
- Parent task with children is protected.
- No cascading deletion.

Do not use mock responses as proof of successful server integration.

---

# 12. TESTING

Run tests in the correct order.

Before migrations:

- SQL review.
- Local unit tests.
- Local database tests.
- Existing browser tests.
- Build.
- Lint.

After migrations:

- RPC integration tests.
- Database integrity tests.
- Permission tests.
- Task hierarchy tests.
- Notification tests.
- Attachment security tests.
- Browser acceptance tests.
- Full regression tests.

Maintain the known baseline process-diagram failure at 375px as a separate documented issue.

The six disabled Reports and Schedule screen tests may remain skipped, provided the routes remain explicitly tested as inaccessible.

Do not weaken existing tests.

Do not silently modify expected results just to make tests pass.

---

# 13. FINAL CODE REVIEW

Only after the migration integration and functional corrections are complete, perform the final code review.

Review:

- TaskListScreen.jsx.
- Its complete dependency tree.
- Task API integration.
- RPC calls.
- Hierarchy utilities.
- View controls.
- Filters.
- Sorting.
- Pagination.
- Notification integration.
- Attachment integration.
- Backend authorization.
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

Fix genuine problems.

Do not introduce unnecessary refactoring.

---

# 14. DATABASE MIGRATION REVIEW

After the code review, perform the final database migration review.

Inspect every migration introduced by this work, including the three required migrations.

Verify:

- Execution order.
- Dependencies.
- Existing data preservation.
- Constraint correctness.
- Indexes.
- Foreign keys.
- RLS.
- Storage access.
- RPC signatures.
- Function privileges.
- Trigger behavior.
- Migration status.

Document which migrations have:

- Only been reviewed.
- Been applied.
- Been verified against the database.

Never confuse these statuses.

---

# 15. DOCUMENTATION

Update:

- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Record:

- Task list API requirements.
- Actual RPC signatures.
- Hierarchical response format.
- Legacy fallback behavior.
- View semantics.
- Notification function names.
- Attachment deletion access policy.
- Migration execution order.
- Actual migration status.
- Post-migration test results.

Provide exact instructions for applying migrations if privileged database access is unavailable.

---

# 16. ABSOLUTELY NO GIT OPERATIONS THAT CHANGE THE REPOSITORY HISTORY

The user explicitly does not want Git commits at this stage.

Therefore:

- Do not create commits.
- Do not stage files.
- Do not push.
- Do not amend commits.
- Do not create branches.
- Do not reset the repository.
- Do not discard user changes.
- Do not overwrite existing changes.

Read-only Git inspection is allowed.

Leave all changes in the working tree.

---

# 17. FINAL REPORT

Provide:

1. Complete TaskListScreen audit.
2. All audited child components and dependencies.
3. Complete interactive element inventory.
4. Subtask creation and parent relationship verification.
5. Five-level nesting test results.
6. View functionality audit.
7. Search, filters, sorting and pagination audit.
8. All dialogs and menus verification.
9. Attachment deletion security fix.
10. Backend RPC verification.
11. Notification verification.
12. Final code review.
13. Database migration review.
14. Actual migration application status.
15. Unit, database, browser, build and lint results.
16. Updated requirements matrix.
17. Remaining limitations.
18. Confirmation that no Git commit or staging operation was performed.

Clearly distinguish:

- Verified locally.
- Verified against Supabase.
- Pending migration.
- Pending UAT.
- Not tested.

---

# FINAL DIRECTIVE

The previous investigation established that subtasks are already stored correctly as tasks with `parent_task_id`.

Do not rewrite this mechanism.

The immediate priority is to integrate the new server-side database functionality by reviewing and applying the required migrations through an authorized database connection.

Verify the actual implementation of `TaskListScreen.jsx`, its View functionality, hierarchy response, pagination, filtering, sorting, notifications, and attachment access.

Fix every confirmed defect.

Only after these corrections perform FINAL CODE REVIEW, DATABASE MIGRATION REVIEW, and comprehensive testing.

**No Git commits, no staging, no push, no deletion of files, and no unrelated redesign.**

The expected outcome is a fully integrated Tasks module whose frontend, backend, database, and business rules work together correctly.
