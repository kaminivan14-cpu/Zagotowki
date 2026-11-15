# TASKS MODULE — COMPREHENSIVE TASK LIST LOGIC AUDIT, FUNCTIONAL CORRECTIONS, FINAL CODE REVIEW, DATABASE MIGRATION REVIEW AND TESTING

## 1. ROLE AND RESPONSIBILITIES

Continue working as a Lead Full Stack Developer, Senior Software Architect, Database Engineer, Lead QA Engineer, and Lead UI/UX Designer.

You are continuing work on an existing Tasks module that has already undergone a complete redesign and substantial functional implementation.

The next task is to verify the actual correctness of the implementation, especially the main task list screen and all functionality connected to it.

Your responsibilities:

- Perform a comprehensive functional audit of `TaskListScreen.jsx`.
- Inspect every component used by this screen.
- Inspect every dialog, modal, dropdown, popover, menu, form, and interactive element connected to it.
- Verify the actual business logic of every action.
- Verify task creation and subtask creation.
- Verify the hierarchy and parent-child relationships.
- Audit the functionality of the "Вид" (View) control and all its options.
- Compare the implementation against `plan.md` and `task.docx`.
- Identify and fix every discrepancy.
- Verify frontend, backend, API, database, and permission consistency.
- Preserve the existing Tasks design system.
- After implementing necessary corrections, perform FINAL CODE REVIEW.
- Then perform DATABASE MIGRATION REVIEW.
- Finally, execute comprehensive testing and prepare the final technical report.

**This task is primarily about functional correctness, business logic, data integrity, and verification — not another general visual redesign.**

Do not assume that previously implemented functionality works correctly just because the UI looks correct or earlier tests passed.

You must verify actual behavior.

---

# 2. PRIMARY WORKING DIRECTORY AND PROJECT SCOPE

Primary working directory:

`/Users/nazarii/Desktop/Zagotowki/src/tasks`

Start by inspecting this directory.

The main target of this task is:

`src/tasks/screens/TaskListScreen.jsx`

However, the audit must include ALL components and dependencies used by this screen.

You are explicitly allowed to navigate outside `/src/tasks` when necessary.

Inspect relevant:

- Shared hooks.
- API services.
- Backend endpoints.
- Database models.
- Supabase queries.
- Database migrations.
- Authentication.
- Authorization.
- Routing.
- Shared task utilities.
- Existing test infrastructure.

Do not treat `/src/tasks` as a strict access boundary.

However:

- Keep implementation changes focused on Tasks and its direct dependencies.
- Do not redesign unrelated modules.
- Do not refactor unrelated functionality.
- Do not change global UI components.
- Do not introduce unnecessary architecture changes.

If a shared business service must be modified, evaluate its other consumers before changing it.

The existing independent Tasks UI component library must remain the presentation layer for Tasks.

---

# 3. SOURCE OF TRUTH — REQUIRED DOCUMENTS

Before making changes, read and compare:

- `plan.md`
- `task.docx`
- `screens/`
- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Read the complete relevant sections, not just summaries.

The primary functional specifications are:

- All applicable requirements from `plan.md`.
- Requirements RB-001 through RB-014 from `task.docx`.
- Agreed decisions U-001 through U-007.
- All twenty mandatory acceptance scenarios.
- Additional approved product decisions in `docs/work-module-decisions.md`.

The screenshots in `screens/` are the visual reference.

The decisions document records additional approved behavior.

The requirements matrix must be checked against actual code and tests.

Do not blindly trust the current requirements matrix.

If a requirement is marked COMPLETED, verify that the underlying functionality actually works.

Do not invent new business rules.

If `plan.md` and `task.docx` contain conflicting requirements, identify and document the conflict before changing business behavior.

---

# 4. PHASE 1 — COMPLETE AUDIT OF TaskListScreen.jsx

This is the highest-priority part of the task.

Inspect:

`/Users/nazarii/Desktop/Zagotowki/src/tasks/screens/TaskListScreen.jsx`

Understand the entire component and its dependencies.

Do not inspect only the visual JSX.

Trace the complete data and interaction flow.

## 4.1 Component dependency audit

Identify every component imported or rendered by `TaskListScreen.jsx`.

Include:

- Child components.
- Shared Tasks UI components.
- Task-specific components.
- Hooks.
- Context providers.
- State management.
- API services.
- Utilities.
- Dialogs.
- Modals.
- Dropdowns.
- Popovers.
- Menus.
- Form components.
- Table components.
- Filter components.
- Search components.
- Sorting components.
- Pagination components.
- Bulk action components.
- Task hierarchy components.

Follow the dependency chain recursively where necessary.

If a child component opens another dialog, inspect that dialog too.

If a component triggers a backend operation, trace that operation to its actual API or database implementation.

**Do not consider a component audited simply because you inspected its parent component.**

## 4.2 Build an interaction inventory

Create a complete inventory of all visible and interactive elements in the task list screen.

Include at least:

| Element         | Expected behavior               | Actual behavior | Backend dependency       | Verification |
| --------------- | ------------------------------- | --------------- | ------------------------ | ------------ |
| Page header     | Correct title and context       | Inspect         | No                       | Test         |
| View selector   | Switch between available views  | Inspect         | Yes, where applicable    | Test         |
| Tabs            | Change active task category     | Inspect         | Yes                      | Test         |
| Search          | Find matching tasks             | Inspect         | Yes/local                | Test         |
| Filters         | Apply selected conditions       | Inspect         | Yes/local                | Test         |
| Sorting         | Order tasks correctly           | Inspect         | Yes/local                | Test         |
| Expand/collapse | Control hierarchy visibility    | Inspect         | No/possible data loading | Test         |
| Task creation   | Create a valid task             | Inspect         | Yes                      | Test         |
| Add subtask     | Create a child task             | Inspect         | Yes                      | Test         |
| Task title      | Open task details               | Inspect         | Yes                      | Test         |
| Checkbox        | Select or update task state     | Inspect         | Yes                      | Test         |
| Status          | Change task status              | Inspect         | Yes                      | Test         |
| Priority        | Change task priority            | Inspect         | Yes                      | Test         |
| Assignee        | Change task assignment          | Inspect         | Yes                      | Test         |
| Context menu    | Execute the selected action     | Inspect         | Depends on action        | Test         |
| Bulk delete     | Delete permitted selected tasks | Inspect         | Yes                      | Test         |
| Pagination      | Navigate through results        | Inspect         | Yes/local                | Test         |

This table is illustrative.

Expand it to cover every actual interactive element in the implementation.

For every action, verify:

1. The displayed control has an actual event handler.
2. The correct action is triggered.
3. The expected parameters are passed.
4. The backend receives the correct request.
5. Validation works.
6. The database is updated correctly.
7. The UI reflects the actual result.
8. Error states are handled.
9. Loading states are handled.
10. Duplicate submissions are prevented where necessary.

Fix non-functional or incorrectly implemented controls.

---

# 5. PHASE 2 — CRITICAL AUDIT OF TASK AND SUBTASK CREATION

A specific concern has been identified:

**When adding subtasks, they currently appear to be created as tasks.**

This behavior must be investigated carefully.

Do not assume that this is necessarily incorrect.

According to RB-004, every subtask must be a full task entity.

The important requirement is that the subtask must have a valid parent-child relationship.

A subtask being stored as a task record is CORRECT.

A subtask being created as an independent root task without a parent relationship is INCORRECT when it is intended to be nested under another task.

## 5.1 Verify the actual data model

Inspect:

- Existing task database model.
- `parent_task_id` or equivalent relationship.
- Task creation services.
- API payloads.
- Database insert operations.
- Task list queries.
- Hierarchical rendering logic.

Determine exactly how a subtask is created.

Check whether:

- A new task record is inserted.
- The correct parent task ID is assigned.
- The relationship is stored in the database.
- The task is returned with the correct parent relationship.
- The parent task's child collection is updated.
- The child appears under the correct parent in the task list.

Do not implement a separate subtask entity if the existing architecture uses ordinary task records with parent relationships.

## 5.2 Quick subtask creation

RB-004 explicitly requires that quick subtask creation requires ONLY the subtask title.

Verify this exact behavior.

When creating a subtask:

- The title is the only required input.
- The parent task ID must be supplied automatically from the task context.
- Other fields must receive the same standard default values as normal task creation.
- The operation must not require opening the full task creation form.
- The created subtask must be fully editable afterwards.

Check the actual API request.

The request must correctly identify the parent task.

Conceptually, the created entity must have:

`task.parent_task_id = parentTask.id`

Use the existing project data model rather than introducing a new one.

## 5.3 Different subtask creation entry points

Inspect every way a user can create a subtask:

- From the task row.
- From the task context menu.
- From an expanded parent task.
- From the task details interface.
- From any inline add-subtask action.
- From any existing dialog or popover.

All entry points must use consistent business logic.

Do not allow one creation method to produce a correctly linked child while another creates a root task.

## 5.4 Subtask editing

After a subtask is created, verify:

- Its title can be edited.
- Its description can be edited.
- Its status can be changed.
- Its priority can be changed.
- Its assignee can be changed.
- Its deadline can be changed.
- Its parent can be reassigned.
- It can contain its own subtasks.
- Its attachments work.
- Its activity history works.
- Its permissions are respected.

A subtask must remain a full task entity.

## 5.5 Parent reassignment

Verify that changing the parent:

- Updates the correct relationship.
- Preserves the task itself.
- Preserves all its descendants.
- Updates the hierarchy correctly.
- Updates relevant activity history.
- Prevents self-parenting.
- Prevents selecting descendants as parents.
- Prevents circular relationships.

Enforce hierarchy integrity on the backend.

## 5.6 Unlimited nesting

Test more than three levels of hierarchy.

For example:

Parent A

- Subtask B
  - Subtask C
    - Subtask D
      - Subtask E

Verify that:

- Every record exists correctly.
- Every `parent_task_id` is correct.
- The hierarchy renders correctly.
- Expansion and collapse work.
- Filtering preserves the parent chain.
- Progress calculations use immediate children only.
- No descendants are duplicated.

---

# 6. PHASE 3 — COMPLETE AUDIT OF THE "ВИД" (VIEW) FUNCTIONALITY

This is another critical requirement.

The functionality associated with the **"Вид" / View** control must be explicitly investigated.

Do not assume that it works correctly.

Do not confuse the task category tabs with the View selector unless the actual implementation defines them as the same thing.

Inspect the exact control and determine its intended purpose from:

- `plan.md`.
- `task.docx`.
- Reference screenshots.
- Existing implementation.
- Documented product decisions.

## 6.1 Discover all View options

List every available option in the "Вид" control.

For each option, document:

- Display label.
- Intended purpose.
- Actual behavior.
- State changes.
- Data query changes.
- Rendering changes.
- Persistence behavior.
- Permission requirements.

Do not invent additional view modes.

If the available options are not documented clearly, infer their intended behavior only from the existing UI and implementation, and record any genuine ambiguity.

## 6.2 View behavior verification

For every available view option, verify:

1. Can the user select it?
2. Does the selection actually change the displayed view?
3. Does the correct data appear?
4. Does it preserve task hierarchy?
5. Does it preserve filters?
6. Does it preserve sorting?
7. Does it work with pagination?
8. Does it handle empty states?
9. Does it handle loading states?
10. Does it behave correctly after refresh?
11. Does it behave correctly when navigating back from task details?
12. Does it respect permissions?

If a view selector only changes its label without changing the actual content or presentation, fix it.

If the view selector is intended to change task layout, verify that the layout truly changes.

If it is intended to change the task data scope, verify the actual backend query and filtering rules.

Do not assume the View control's purpose.

Trace its implementation.

## 6.3 Relationship between View and task categories

Explicitly verify how View interacts with:

- My Tasks.
- Team Tasks.
- Relevant to Me.
- All Tasks.
- Completed.
- Overdue.
- Active task filters.

Do not allow the View control and category tabs to produce conflicting or misleading states.

For example:

- Selecting All Tasks must not silently preserve an incompatible My Tasks filter.
- Switching views must not unintentionally remove permissions.
- Changing a layout must not unexpectedly change the underlying task data scope.
- Completed tasks must follow the specified visibility rules.

Make behavior predictable and consistent.

---

# 7. PHASE 4 — COMPLETE AUDIT OF ALL TASK LIST OPERATIONS

Verify every task list operation.

## 7.1 Task selection

Check:

- Individual checkbox.
- Select all.
- Deselect all.
- Selection across visible pages.
- Selection after applying filters.
- Selection after switching views.
- Selection after data refresh.

Ensure the bulk action bar reflects the real current selection.

Prevent stale selection state.

## 7.2 Bulk deletion

Preserve the approved bulk deletion policy.

Verify:

- Individual permission checks.
- Parent tasks with children are excluded.
- No cascading deletion.
- Multiple requests are handled correctly.
- Double-click does not generate duplicates.
- Partial success is reported correctly.
- Skipped tasks are identified.
- Failed tasks are reported.
- Successful deletions update the list.

Verify server-side protection.

## 7.3 Search

Verify:

- Search by task title.
- Other supported searchable fields.
- Partial matching.
- Case handling.
- Empty search.
- Search combined with filters.
- Search combined with task views.
- Search combined with hierarchy.

Ensure that search results preserve the required parent context.

## 7.4 Filters

Verify every filter field and option.

Check:

- Single filters.
- Combined filters.
- Clearing filters.
- Active filter chips.
- Filter persistence.
- Empty results.
- Search combined with filters.
- Filtering nested descendants.
- Correct parent chain.

Implement U-004 exactly.

When a nested task matches the filter:

- Show the matched task.
- Show the minimum required ancestor chain.
- Do not show unrelated siblings.
- Do not duplicate tasks.

## 7.5 Sorting

Verify every sorting option.

Check:

- Ascending order.
- Descending order.
- Relevant task fields.
- Sorting with active filters.
- Sorting with hierarchy.
- Sorting with pagination.
- Stable ordering when values are equal.

Sorting must not break parent-child relationships.

## 7.6 Pagination

Verify:

- Next page.
- Previous page.
- First page.
- Last page, if supported.
- Page size.
- Total count.
- Pagination after filtering.
- Pagination after searching.
- Pagination after deleting tasks.
- Pagination with nested hierarchy.

Do not split parent-child relationships in a way that makes the displayed hierarchy misleading.

If the existing pagination strategy has limitations with hierarchy, identify and correct them without inventing conflicting behavior.

## 7.7 Task status and priority

Verify:

- Status changes.
- Priority changes.
- Permission checks.
- Loading feedback.
- Error feedback.
- Persistence.
- Updated list rendering.
- Activity history.
- Notification behavior.

## 7.8 Task action menus

Test every action in every relevant menu.

Ensure:

- Open task works.
- Edit works.
- Delete follows the approved restrictions.
- Add subtask works.
- Parent selection works where available.
- No visible action is a placeholder.
- Unauthorized actions are blocked.

---

# 8. PHASE 5 — COMPLETE AUDIT OF ALL DIALOGS AND COMPONENTS CONNECTED TO TaskListScreen

Inspect every dialog opened from the task list and all of its dependencies.

Include:

- Create task dialog.
- Edit task dialog.
- Add subtask dialog or inline form.
- Parent task selection.
- Task deletion confirmation.
- Bulk deletion confirmation.
- Filters dialog.
- View configuration popover.
- Sorting controls.
- Assignee selection.
- Deadline selection.
- Priority selection.
- Status selection.
- Dependencies.
- Recurrence.
- Attachment dialogs.
- Any other relevant dialog or overlay.

For each dialog, verify:

### Presentation

- Header.
- Title.
- Content.
- Footer.
- Buttons.
- Alignment.
- Scrolling.
- Dropdown positioning.

### Functionality

- Open.
- Close.
- Cancel.
- Save.
- Submit.
- Validation.
- Loading.
- Error handling.
- Duplicate submission prevention.
- Data persistence.
- Permissions.

### Data consistency

- Values are loaded correctly.
- Changes are saved correctly.
- The parent task relationship is retained where appropriate.
- The task list updates after successful operations.
- No stale or duplicate data is displayed.

Maintain the existing Tasks UI library.

Do not create duplicate components unnecessarily.

---

# 9. PHASE 6 — VERIFY COMPLIANCE WITH plan.md AND task.docx

After the screen-level audit, compare every relevant behavior against the original documentation.

Pay special attention to the following requirements.

### RB-004 — Unlimited nested subtasks

The subtask must be a complete task entity linked to its parent.

Quick creation requires only the title.

### RB-007 — Nested task list

- Child tasks appear under their parents.
- Expand/collapse works at every depth.
- All levels are collapsed by default.
- Expand all and Collapse all work.
- Indentation is consistent.
- Hierarchy is preserved during sorting and filtering.

### RB-009 — Views, sorting and filters

Verify:

- My Tasks.
- Team Tasks.
- Relevant to Me.
- All Tasks.

Ensure the view definitions follow U-001 and U-002.

Filtering must follow U-004.

### RB-010 — Completed tasks and progress

- Completed tasks are hidden from active lists by default.
- Completed view is available.
- Completed subtasks may be shown separately.
- Progress uses immediate children only.
- No children means `—`.
- A parent cannot be completed while immediate children are unfinished.
- Backend enforcement exists.
- No child status changes automatically.

### RB-011 — Task deletion

- Confirmation.
- Permissions.
- Safe handling of parents with children.
- No unintended cascading.

### RB-012 — Task details

- Main task fields are available.
- Editing works.
- Subtasks work.
- Activity history is available.
- Attachments are available.
- Layout remains stable.

### RB-014 — Attachments

- Description editing.
- File uploads.
- Multiple attachments.
- Image previews.
- Opening.
- Downloading.
- Permission-controlled deletion.
- Correct author and timestamp.
- Activity recording.

### Additional approved decisions

Verify the All Tasks default view, supported document formats, and bulk-delete behavior as recorded in `docs/work-module-decisions.md`.

Do not assume that passing earlier tests proves these rules are still correctly implemented after subsequent changes.

---

# 10. PHASE 7 — IMPLEMENT REQUIRED CORRECTIONS

Only after completing the investigation should you implement corrections.

Prioritize:

1. Incorrect task/subtask relationships.
2. Incorrect View functionality.
3. Incorrect data queries.
4. Hierarchical filtering and sorting defects.
5. Broken buttons and controls.
6. Incorrect dialog behavior.
7. Backend validation issues.
8. Permission issues.
9. State synchronization issues.
10. Remaining UI inconsistencies.

Preserve working functionality.

Do not replace correct existing implementations.

Do not create new architecture without a technical reason.

Do not silently change documented business rules.

If a requirement is not implemented correctly, fix the actual cause rather than adding superficial UI workarounds.

---

# 11. PHASE 8 — FINAL CODE REVIEW

**Perform FINAL CODE REVIEW only AFTER the functional audit and all necessary corrections have been completed.**

Review:

- `TaskListScreen.jsx`.
- All its child components.
- All related dialogs.
- Hooks.
- Services.
- API calls.
- State management.
- Task hierarchy utilities.
- View functionality.
- Filtering.
- Sorting.
- Pagination.
- Bulk operations.
- Permission checks.
- Backend task operations.

Check:

- Duplicate logic.
- Dead code introduced by recent changes.
- Incorrect state handling.
- Race conditions.
- Missing error handling.
- Unnecessary API requests.
- Incorrect effect dependencies.
- Memory leaks.
- Stale data.
- Incorrect loading states.
- Inconsistent return values.
- Missing validations.

Do not refactor unrelated files.

Do not make large architectural changes unless a verified issue requires them.

Preserve the independent Tasks UI architecture.

---

# 12. PHASE 9 — DATABASE MIGRATION REVIEW

After functional corrections and final code review, inspect all relevant migrations.

Known migration files include:

- `supabase/migrations/202611120001_work_finalize.sql`
- `supabase/migrations/202611120002_attachment_name_type.sql`

Discover and inspect every other migration related to this implementation.

Verify:

- Task hierarchy relationships.
- Parent task references.
- Constraints.
- Indexes.
- Foreign keys.
- Activity history structures.
- Notification structures.
- Attachment-related changes.
- File metadata.
- Permissions.
- RLS policies.
- Storage access.
- Data preservation.
- Migration dependencies.
- Compatibility with existing records.

Verify that application logic and database constraints are consistent.

Pay special attention to task hierarchy integrity and attachment security.

Do not drop existing tables.

Do not delete existing task data.

Do not reset the database.

The currently configured Supabase project contains test data according to the user, and continued testing with the existing connection is authorized.

You may use the existing database connection where appropriate.

Before applying migrations:

1. Inspect the migration.
2. Confirm the target project.
3. Check migration history.
4. Verify backup or recovery options.
5. Understand possible data impact.

Do not claim migration execution was successful unless it was actually performed and verified.

Do not require the user to switch Supabase projects merely because the current project reference says PROD.

---

# 13. PHASE 10 — COMPREHENSIVE TESTING

Only after the functional corrections, code review, and migration review, perform the final testing phase.

## Unit and database tests

Add or update tests for every identified defect.

Especially test:

- Creating normal tasks.
- Creating subtasks.
- Nested subtasks.
- Correct `parent_task_id`.
- Parent reassignment.
- Cycle prevention.
- Task defaults.
- Progress calculations.
- Completion restrictions.
- Deletion restrictions.
- Bulk deletion.
- Permissions.
- Attachment validation.

## Browser tests

Test the actual running UI.

Verify:

- Every View option.
- Every task category.
- Search.
- Filters.
- Sorting.
- Pagination.
- Task selection.
- Bulk deletion.
- Task creation.
- Subtask creation.
- Task editing.
- Dialog behavior.
- Task navigation.
- Direct task URLs.
- Task status changes.
- Priority changes.

The test suite must verify actual user workflows, not just component rendering.

## Existing browser failure

The process-diagram drag test at 375px is a documented baseline failure on commit `adf7936`.

Keep it separate from newly introduced regressions.

Verify it has not worsened.

Do not weaken the test or remove it merely to produce a green test report.

## Visual testing

Prioritize:

- 1440px desktop.
- 1024px.
- 768px tablet.

Perform basic stability checks at 375px.

## Quality commands

Run the existing project commands:

- Lint.
- Unit tests.
- Database tests.
- Browser tests.
- Build.

Report actual results.

---

# 14. PHASE 11 — UPDATE DOCUMENTATION

Update:

- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Document:

- TaskListScreen audit results.
- Every audited child component.
- Every reviewed dialog.
- Subtask creation verification.
- Correct parent-child data relationships.
- All View options and their actual behavior.
- Filtering and sorting verification.
- Corrected defects.
- Final code review.
- Database migration review.
- Test results.
- Remaining blockers.

Do not mark requirements as completed without evidence.

Each requirement must have an accurate status:

- COMPLETED.
- VERIFIED.
- BLOCKED.
- NOT TESTED.

---

# 15. GIT AND FILE PRESERVATION RULES

## ABSOLUTELY NO GIT COMMIT

The user explicitly does not want Git commits at this stage.

Therefore:

- Do NOT create a Git commit.
- Do NOT stage files for a commit.
- Do NOT push.
- Do NOT amend commits.
- Do NOT create a new branch.
- Do NOT reset the current branch.
- Do NOT run destructive Git commands.
- Do NOT overwrite existing user changes.

You may use read-only Git commands to inspect the working tree and existing changes.

Leave all implementation changes uncommitted.

## File preservation

Do not delete, rename, or move existing files.

If a UI element must no longer be displayed:

- Comment out its usage at the appropriate location.
- Add an explanatory `TODO:` comment.
- Preserve its original implementation.

Do not modify global presentation components.

Do not redesign unrelated modules.

Do not commit temporary files or scratchpad artifacts.

---

# 16. FINAL EXECUTION ORDER — MANDATORY

The order of operations is important.

Do not skip ahead to final code review or migrations before verifying actual functionality.

Follow this exact sequence:

**STEP 1 — Documentation and architecture inspection**

- Read `plan.md`.
- Read `task.docx`.
- Review existing decisions.
- Inspect TaskListScreen and its complete dependency tree.

**STEP 2 — Interactive element inventory**

- Enumerate all controls.
- Enumerate all dialogs.
- Enumerate all actions.
- Map actual behavior to expected behavior.

**STEP 3 — Task and subtask logic audit**

- Verify creation.
- Verify parent relationships.
- Verify defaults.
- Verify all entry points.
- Verify hierarchy persistence.

**STEP 4 — View functionality audit**

- Inspect every View option.
- Verify data scope.
- Verify rendering.
- Verify interactions and state persistence.
- Correct any discrepancies.

**STEP 5 — Full TaskListScreen functionality audit**

- Tabs.
- Search.
- Filters.
- Sorting.
- Pagination.
- Selection.
- Bulk actions.
- Context menus.
- Status and priority operations.
- Every dialog and form.

**STEP 6 — Compare against documentation**

- RB-001 through RB-014.
- U-001 through U-007.
- All twenty acceptance scenarios.
- Additional requirements from plan.md.

**STEP 7 — Implement all necessary corrections**

- Fix confirmed functional defects.
- Preserve correct business logic.
- Update or add tests.

**STEP 8 — FINAL CODE REVIEW**
Review the corrected implementation and its dependencies.

**STEP 9 — DATABASE MIGRATION REVIEW**
Review schema, constraints, indexes, permissions, RLS, migration history, and data integrity.

**STEP 10 — COMPREHENSIVE TESTING**
Run all relevant unit, database, browser, build, and regression checks.

**STEP 11 — FINAL REPORT**
Update documentation and provide actual evidence.

Do not reverse this order.

---

# 17. FINAL REPORT

Provide a detailed report containing:

## A. TaskListScreen audit

List all inspected components and dependencies.

## B. Interactive elements

List every control, dialog, menu, and action with its verification status.

## C. Subtask implementation

Explain:

- How subtasks are stored.
- How parent relationships are established.
- Whether `parent_task_id` is correctly assigned.
- Whether quick creation requires only the title.
- Whether default values are correct.
- Results for all subtask creation entry points.
- Whether recursive nesting works.

## D. View functionality

List every View option.

Describe:

- Its intended behavior.
- Its actual behavior.
- Any corrections.
- Its tests.

## E. Functional corrections

List all identified defects and their fixes.

## F. Code review

Report important technical findings and corrections.

## G. Database migration review

List migration files, schema changes, risks, and verification results.

## H. Testing

Report actual:

- Unit tests.
- Database tests.
- Browser tests.
- Build.
- Lint.
- Regression results.

## I. Requirements compliance

Provide a requirement-by-requirement status for `plan.md`, RB-001 through RB-014, U-001 through U-007, and all twenty acceptance scenarios.

## J. Remaining issues

Clearly identify incomplete or blocked requirements.

## K. Git and file preservation

Explicitly confirm:

- No commits were created.
- No files were deleted.
- No files were renamed or moved.
- No unrelated modules were modified.
- Global presentation components remain untouched.

---

# FINAL DIRECTIVE

Your highest priority is to verify the real functionality of:

`src/tasks/screens/TaskListScreen.jsx`

and EVERY component, dialog, modal, menu, hook, service, API operation, and interaction connected to it.

Do not assume that creating subtasks as task records is incorrect: verify that each intended subtask is correctly linked to its parent using the existing hierarchy model.

Pay particular attention to the "Вид" (View) functionality and verify that every available option actually performs its intended operation.

Compare all behavior with `plan.md`, `task.docx`, and the approved decisions.

Fix discrepancies before proceeding.

Only after the functional audit and corrections are completed, perform FINAL CODE REVIEW, DATABASE MIGRATION REVIEW, and comprehensive testing.

Do not create Git commits or stage files.

Do not restart the redesign.

Do not merely produce a report or checklist.

**Inspect the implementation, verify actual behavior, fix real problems, test everything, and deliver a technically correct and reliable Tasks module.**
