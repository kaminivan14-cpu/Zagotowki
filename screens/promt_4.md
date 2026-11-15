# TASKS MODULE — ADVANCED UI/UX REDESIGN, FUNCTIONAL REFINEMENT, REQUIREMENTS COMPLIANCE AND RELEASE READINESS

## 1. ROLE AND EXPECTATIONS

Continue working as a Lead UI/UX Designer, Lead Product Designer, Senior Full Stack Developer, Software Architect, and QA Engineer.

You are continuing an existing Tasks module implementation that has already undergone a substantial redesign and functional development phase.

Your objective is to bring the Tasks module to a genuinely polished, consistent, intuitive, and production-quality state.

This is not a new project and not a complete rewrite.

You must:

- Improve the existing UI/UX significantly.
- Fix visual and layout defects.
- Redesign problematic screens and dialogs.
- Improve usability and interaction patterns.
- Complete missing functionality required by the technical specification.
- Refactor duplicated UI where appropriate.
- Verify all existing functionality.
- Preserve working business logic.
- Prepare the module for UAT and eventual production deployment.

**The most important priority is actual product quality, not simply making tests pass.**

A successful build and passing unit tests do not automatically mean that the application has good UX or a finished design.

You must critically evaluate the actual rendered application and improve it where necessary.

---

# 2. PROJECT SCOPE

Primary working directory:

`/Users/nazarii/Desktop/Zagotowki/src/tasks`

This is the main implementation scope.

You must begin by inspecting this directory and understanding its existing architecture.

You are allowed to go outside this directory whenever necessary.

Examples:

- API services.
- Database services.
- Supabase integrations.
- Shared business logic.
- Authentication and authorization.
- Routing and navigation.
- Application shell.
- Existing reusable utilities.
- Database migrations.
- Localization.
- Test infrastructure.

Do not artificially restrict yourself to the Tasks directory if a dependency outside it needs to be inspected or corrected.

However:

- Do not redesign unrelated application modules.
- Do not perform unrelated refactoring.
- Do not modify global UI components to implement Tasks-specific visual changes.
- Do not introduce unnecessary changes outside Tasks.
- Preserve existing integrations with other modules.

If a shared dependency must be modified, evaluate its impact on all existing consumers.

If a presentation component outside Tasks needs a different appearance or behavior inside Tasks, implement or improve its Tasks-specific equivalent inside:

`src/tasks/components/ui/`

Tasks must remain visually independent from the global presentation layer.

---

# 3. SOURCE OF TRUTH — TECHNICAL REQUIREMENTS

Before implementing anything, inspect and compare these files:

- `plan.md`
- `task.docx`
- `screens/`
- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Read the complete technical specification, not just its summary.

Use `task.docx` and `plan.md` as the primary sources of functional and product requirements.

Use `screens/` to understand the intended visual direction.

Use the decisions document to preserve already approved business rules.

Use the requirements matrix to identify the implementation and test status of individual scenarios.

Do not invent new business rules or silently replace existing requirements with your own assumptions.

If a requirement is unclear:

1. Inspect the existing implementation.
2. Check the technical specification.
3. Check documented decisions.
4. If the ambiguity affects a critical business operation, record it explicitly instead of inventing a policy.

## Mandatory requirements

Verify all applicable requirements:

- RB-001 through RB-014.
- U-001 through U-007.
- All twenty acceptance scenarios.
- Every additional requirement in `plan.md`.
- Every approved decision documented during previous implementation.

The existing requirements matrix must be verified against actual source code and test results.

Do not assume that a requirement is complete simply because the matrix marks it as completed.

At the end, update the matrix with accurate implementation and verification statuses.

---

# 4. EXISTING IMPLEMENTATION — PRESERVE AND IMPROVE

A substantial amount of work has already been completed.

Do not recreate existing functionality unnecessarily.

## 4.1 Independent Tasks UI library

An independent Tasks UI library already exists:

`src/tasks/components/ui/`

It contains 18 Tasks-specific reusable components and an independent stylesheet.

Existing conventions:

- `Tasks*` component naming.
- `tk-` CSS class prefix.
- `--tk-*` design tokens.
- Independent styling.
- Reusable presentation components.

Preserve this architecture.

Do not create a second UI library.

Do not duplicate components that already exist.

Improve the existing components when necessary.

## 4.2 Existing UI migration

The following screens have already been migrated toward the Tasks design system:

- Processes wizard.
- Task list.
- Task viewing.
- Task launching.
- Admin.
- Access.
- Organization.
- Planning.
- Work.
- Task settings.

Approximately 121 native buttons have already been converted to `TasksButton`.

Existing shared Tasks components include tabs, badges, buttons, inputs, selects, and other reusable controls.

Inspect the current implementation before changing it.

Identify actual remaining inconsistencies rather than performing another mechanical migration.

## 4.3 Global presentation components

Global presentation components outside Tasks remain independent.

Do not import global Button, Dialog, Dropdown, Sidebar, Input, Select, or similar presentation components into Tasks when a Tasks-specific alternative already exists.

Do not change global component styling to solve local Tasks problems.

Tasks-specific components must be maintained within the Tasks library.

Business logic, API services, authentication, localization, and other non-presentation infrastructure may be reused where appropriate.

## 4.4 Language switcher

Preserve `TasksLanguageSwitcher` in the Tasks header.

Do not display language controls inside dialogs unless explicitly required by the technical specification.

Preserve the existing locale-switching behavior.

## 4.5 Module navigation

Preserve:

- The visible return-to-modules button.
- Direct task links through `?task=<id>`.
- Address bar synchronization.
- Server-side read permissions.
- Normal module navigation.
- Correct handling of inaccessible or invalid task IDs.

Do not break the integration in `src/orders/ModuleShell.jsx`.

## 4.6 Deletion policy

Preserve the agreed safe deletion behavior:

- Tasks without subtasks may be deleted after confirmation and permission checks.
- Tasks with subtasks cannot be deleted.
- No cascading deletion.
- The backend enforces the same restrictions.
- Users receive understandable explanations.

Never introduce automatic deletion of task descendants.

Preserve hierarchy integrity.

## 4.7 Notification policy

Preserve the existing approved reassignment notification rules.

Notify:

- New assignee.
- Task author.
- Participants.
- Process owner.

Do not notify:

- The actor about their own change.
- Previous assignee solely because they were previously assigned.

Do not create duplicate notifications.

Do not notify when the assignee remains unchanged.

## 4.8 Attachments

Preserve:

- Images.
- PDF.
- DOC.
- DOCX.
- XLS.
- XLSX.
- File validation.
- Server-side size validation.
- Permission-controlled reading.
- Opening.
- Downloading.
- Image previews.
- Permission-controlled removal.

The current maximum file size is 20 MB.

Verify consistency between frontend, backend, and storage validation.

Preserve the existing support for `.doc` and `.xls`.

---

# 5. HIGHEST PRIORITY — COMPLETE REDESIGN OF THE TASK LIST SCREEN

The provided screenshot of the "Мої завдання" screen shows significant visual inconsistencies.

This screen must receive a dedicated UI/UX redesign.

Do not limit the work to changing colors, margins, or button sizes.

Reconsider the composition, hierarchy, spacing, and interactions of the entire screen.

## 5.1 Header composition

Redesign the upper part of the screen.

The following elements must have a clear and consistent layout:

- Page title.
- View or list selector.
- Page description.
- Filter button.
- View selector.
- Create task button.

Use a coherent alignment system.

The page title and description must be visually grouped.

Actions must be consistently aligned.

Avoid arbitrary spacing and inconsistent button heights.

The Create Task action should have appropriate visual prominence without overwhelming the rest of the interface.

## 5.2 Task navigation and filtering toolbar

Redesign the area containing:

- Active tasks.
- Completed tasks.
- Overdue tasks.
- All tasks.
- Search.
- Sorting.
- Sort direction.
- Filters.

All elements must be aligned and visually balanced.

Requirements:

1. Tabs must have a consistent height.
2. Counters must use reusable badge components.
3. Active tabs must be clearly distinguishable.
4. Search must have appropriate width and alignment.
5. Sorting controls must not appear disconnected from the search.
6. Sort direction must be visually understandable.
7. Filter controls must have consistent dimensions.
8. The entire toolbar must remain readable at tablet and desktop widths.

Do not force all controls into one row if the available space is insufficient.

Create a deliberate responsive layout that moves secondary controls into a second row when necessary.

Avoid horizontal overflow.

## 5.3 Task table

Improve the task table's visual structure.

Standardize:

- Header height.
- Row height.
- Column alignment.
- Text positioning.
- Checkbox positioning.
- Task identifiers.
- Task titles.
- Status badges.
- Priority indicators.
- Assignee avatars.
- Assignee names.
- Hover states.
- Selected row states.

Use a consistent column grid.

Column headings must align precisely with their corresponding content.

Avoid unnecessary empty space.

Task titles should remain readable and should not collide with identifiers or badges.

Status and priority should be visually distinct but not excessively colorful.

Assignee information must have consistent alignment and spacing.

## 5.4 Hierarchical tasks

Preserve nested task functionality.

Improve the visual representation of:

- Parent tasks.
- Child tasks.
- Nested descendants.
- Expanded and collapsed states.
- Hierarchy indentation.
- Expand/collapse controls.

Ensure that indentation communicates hierarchy without consuming excessive horizontal space.

Do not compromise task row readability.

## 5.5 Bulk actions

Where supported by the existing functionality and specification, ensure selected tasks expose appropriate bulk actions.

The selection state must be visually clear.

Do not introduce bulk operations that violate task permissions or hierarchy rules.

## 5.6 Filters

Review filter behavior and usability.

Ensure:

- Filter controls are understandable.
- Selected filters are visible.
- Filters can be cleared.
- Search and filtering work together.
- Filtering does not break the task hierarchy.
- The active filter state is preserved where appropriate.

A particularly important hierarchy rule:

When a filter matches a nested task, display only:

- The matched task.
- Its necessary ancestor chain.

Do not display unrelated sibling tasks merely because they share the same parent.

Preserve the original task hierarchy and do not mutate source data to implement filtering.

---

# 6. HIGHEST PRIORITY — COMPLETE REDESIGN OF THE CREATE TASK DIALOG

The provided Create Task screenshot reveals serious layout and UX defects.

This is not acceptable for a polished application.

**Treat the existing dialog as a broken implementation that requires structural redesign, not cosmetic adjustment.**

Rebuild the layout using the existing Tasks component library and the established Tasks design system.

Preserve all existing business functionality and form fields required by `task.docx`.

## 6.1 Main layout architecture

Implement a clear, structured dialog.

Recommended desktop composition:

- Main form content on the left.
- Secondary task settings on the right.
- A stable footer at the bottom.
- A distinct dialog header at the top.

The layout must have clearly separated regions.

The left and right sections must have intentional widths and spacing.

Avoid overlapping content.

The dialog must never display:

- Form content behind its header.
- Text overlapping other fields.
- The footer covering inputs.
- The right panel extending outside the dialog.
- Inconsistent column widths.
- Clipped field labels.
- Unnecessary horizontal scrollbars.

## 6.2 Dialog header

Create a dedicated header with:

- Dialog title.
- Short explanatory subtitle.
- Close button.

The header must have its own layout space.

The title and subtitle must never overlap form content.

Use consistent padding.

The close button must have a predictable position and an appropriate hit area.

If the dialog has a scrollable body, the header must remain visually separated from it.

## 6.3 Main form content

Organize fields into logical sections.

Examples of sections, subject to the actual technical specification:

- Basic task information.
- Description.
- Checklist.
- Dependencies.
- Comments.

Each section must have:

- Clear section heading.
- Appropriate icon where useful.
- Optional/required indication.
- Consistent internal spacing.
- Consistent separators.
- Appropriate field grouping.

Do not make every section visually heavy.

Use a clean hierarchy based on spacing, typography, and subtle borders.

Avoid unnecessary borders around every individual field.

## 6.4 Right-side settings panel

Organize secondary settings logically.

Preserve all required fields, such as:

- Assignee.
- Deadline.
- Estimated duration.
- Work interruption or pause settings.
- Recurrence.
- Parent task.

The exact fields and their behavior must follow the technical specification and existing business logic.

Use consistent vertical spacing.

Fields must have consistent labels, heights, and control widths.

The panel must not appear disconnected from the main form.

On desktop, the panel may use an independently scrollable area if this improves usability.

However, scrolling must remain predictable and must not create nested-scroll confusion.

## 6.5 Footer

The footer must have a stable position.

It must contain:

- Cancel.
- Primary Create Task action.

The footer must not overlap the scrollable form.

When the form becomes taller than the available viewport, the content should scroll independently while the footer remains accessible.

Respect safe spacing around the footer.

The primary action must have a clear visual hierarchy.

Disable the Create button when appropriate.

Show loading states while submitting.

Prevent accidental duplicate submissions.

## 6.6 Dialog sizing

Define sensible responsive dimensions.

At desktop widths:

- Use the available viewport effectively.
- Avoid unnecessarily narrow forms.
- Avoid excessive empty space.
- Keep the dialog visually balanced.
- Ensure all content remains accessible.

At tablet widths:

- Reduce unnecessary horizontal complexity.
- Adjust column proportions.
- Allow a single-column form layout when necessary.
- Preserve clear separation between form sections and secondary settings.

Do not force a desktop two-column layout into a narrow tablet viewport.

## 6.7 Dialog interaction quality

Verify:

- Open and close.
- Escape behavior where supported.
- Validation.
- Error states.
- Loading states.
- Successful creation.
- Cancel behavior.
- Unsaved changes handling where applicable.
- Keyboard navigation.
- Focus management.
- Dropdown positioning.
- Date and time selection.
- Parent task selection.
- Dependencies.
- Recurrence settings.

Do not remove existing fields simply because the current layout is difficult to manage.

Reorganize them instead.

---

# 7. DESIGN SYSTEM — CONSISTENCY ACROSS ALL TASKS SCREENS

The Tasks module should feel like one coherent product.

Use ClickUp as the primary UX reference and Jira for task-management rules and interaction patterns where appropriate.

Do not copy either product blindly.

The actual implementation must follow `task.docx`, `plan.md`, and the supplied visual references.

## 7.1 Design tokens

Review and centralize:

- Primary colors.
- Background colors.
- Surface colors.
- Border colors.
- Text colors.
- Typography.
- Spacing.
- Border radius.
- Shadows.
- Component heights.
- Icon sizes.
- Focus states.
- Disabled states.

Use the existing `--tk-*` token architecture.

Avoid arbitrary values repeated across individual screens.

## 7.2 Reusable components

Review existing Tasks components and reuse them consistently.

Where a UI element appears repeatedly, use a shared Tasks component.

Examples:

- Buttons.
- Dialogs.
- Inputs.
- Selects.
- Dropdowns.
- Search fields.
- Badges.
- Tabs.
- Tooltips.
- Avatars.
- Status indicators.
- Priority indicators.
- Form labels.
- Section headers.
- Empty states.
- Loading indicators.
- Confirmation dialogs.

Do not create separate implementations of visually identical controls for each screen.

If an existing component lacks a necessary variant, extend it without breaking existing usages.

## 7.3 Alignment

This is a mandatory quality requirement.

All repeated UI elements must follow consistent alignment rules.

Pay particular attention to:

- Buttons in toolbars.
- Inputs in forms.
- Dropdowns.
- Labels.
- Dialog headers.
- Dialog footers.
- Table headers.
- Table rows.
- Navigation elements.
- Icons inside controls.

No arbitrary one-off positioning fixes.

Use consistent layout primitives, flex/grid structures, and spacing tokens.

---

# 8. RESPONSIVE PRIORITIES

Responsive development must prioritize desktop and tablet.

Full mobile optimization is not a requirement for this phase.

## Priority 1 — Desktop

Primary target:

- 1440px.
- 1920px.

Ensure excellent layout quality.

Check:

- Content proportions.
- Sidebars.
- Tables.
- Dialogs.
- Toolbars.
- Forms.
- Dropdowns.
- Multi-column layouts.

## Priority 2 — Tablet

Primary target:

- 768px.
- 1024px.

Ensure:

- No major horizontal overflow.
- Correct sidebar behavior.
- Readable task tables.
- Usable filters.
- Proper dialog resizing.
- Correct form column adaptation.
- Accessible actions.
- Consistent component alignment.

Tablet UX must be genuinely usable, not merely a scaled-down desktop layout.

## Priority 3 — Mobile

Target:

- 375px.

Only basic functionality and layout stability are required at this stage.

Ensure:

- No completely broken screens.
- No inaccessible primary actions.
- No severe content overlap.
- No blocking interaction defects.
- No major runtime errors.

Do not spend disproportionate development time on complete mobile optimization.

Mobile-specific enhancements can be scheduled as a separate future phase.

---

# 9. FUNCTIONAL AND BUSINESS LOGIC VERIFICATION

Perform a complete audit of the existing Tasks functionality.

Preserve all approved behavior.

In particular, verify:

## 9.1 Task hierarchy

- Parent-child relationships.
- Multiple nesting levels.
- Creating subtasks.
- Moving tasks where supported.
- Expanding and collapsing.
- Parent task deletion restrictions.
- Correct progress calculations.
- Correct task filtering.

Important hierarchy requirements:

**Progress calculation**

A parent task's progress must be calculated using its immediate children only, not all descendants.

Do not double-count grandchildren.

**Deletion**

Never cascade-delete descendants.

**Filtering**

When a nested task matches a filter, show only the matching task and the necessary ancestor chain, not unrelated siblings.

Verify these rules in both frontend and backend wherever applicable.

## 9.2 Permissions

Verify:

- Read permissions.
- Create permissions.
- Edit permissions.
- Delete permissions.
- Attachment permissions.
- Assignment permissions.
- Administrative permissions.

Frontend restrictions must not replace backend authorization.

## 9.3 Task lifecycle

Verify:

- Creation.
- Editing.
- Status changes.
- Priority changes.
- Assignment.
- Deadlines.
- Completion.
- Reopening where supported.
- Activity history.

## 9.4 Dependencies

Verify:

- Dependency selection.
- Dependency validation.
- Correct display.
- Circular dependency prevention where required.
- Permission enforcement.

## 9.5 Recurrence

Verify:

- Available recurrence options.
- Recurrence configuration.
- Saving.
- Editing.
- Correct execution.
- Timezone handling.

Follow the specification and existing approved behavior.

## 9.6 Notifications

Verify recipient selection, duplicate prevention, and unchanged-assignee behavior.

## 9.7 Attachments

Verify upload, preview, download, access restrictions, deletion, file size, and supported formats.

---

# 10. DATABASE, API AND BACKEND QUALITY

Review the existing backend implementation.

Pay special attention to the migration:

`supabase/migrations/202611120001_work_finalize.sql`

Inspect:

- SQL correctness.
- Constraints.
- Indexes.
- Foreign keys.
- Data integrity.
- Permissions.
- RLS policies where applicable.
- Backward compatibility.
- Existing data preservation.

Do not run destructive migrations without understanding their impact.

The user has confirmed that the currently configured Supabase project contains test data and that continuing to use the existing connection is acceptable.

You may continue using the current connection.

Do not unnecessarily reconfigure `.env` or interrupt the existing development server.

However:

- Do not expose secrets.
- Do not delete existing data.
- Do not perform destructive operations without a clear reason.
- Do not claim UAT migration was completed if it was not.
- Do not claim hosted acceptance was completed if it was not.

Check frontend/backend validation consistency.

Verify that security-sensitive operations are enforced on the server.

---

# 11. TESTING AND QUALITY ASSURANCE

Testing must cover both functional correctness and visual quality.

## 11.1 Existing test suite

Run:

- Lint.
- Node unit tests.
- Database tests.
- Browser tests.
- Build.
- Relevant integration tests.

Use the actual repository test commands.

Do not fabricate successful test results.

## 11.2 Existing browser test failure

The process-diagram drag test at 375px was already failing on commit `adf7936`, before the previous Tasks changes.

Previous testing confirmed that it fails with the same assertion on both the baseline and current implementation.

Do not automatically classify it as a regression.

However:

1. Reproduce the issue.
2. Compare the baseline behavior.
3. Verify that new changes do not worsen it.
4. Document it accurately.

Fix it only if it can be done safely within scope and without breaking diagram geometry.

## 11.3 Skipped tests

Six legacy Reports and Schedule tests are currently skipped because these screens are disabled.

Preserve the intended restrictions.

Verify that disabled screens remain unreachable even when a user has unrelated reporting permissions.

Do not reactivate disabled functionality unless the specification explicitly requires it.

## 11.4 Visual regression testing

Capture screenshots at:

- 1440px.
- 1024px.
- 768px.
- 375px.

Prioritize 1440px and 768px.

Capture both the reference and current implementation where applicable.

Review the actual screenshots, not just automated viewport measurements.

Verify:

- Main task screen.
- Create task dialog.
- Task details.
- Task hierarchy.
- Filters.
- Dropdowns.
- Planning.
- Work.
- Processes.
- Admin and Access.

## 11.5 Accessibility

Check:

- Keyboard navigation.
- Focus visibility.
- Accessible names.
- Semantic controls.
- Form labels.
- Dialog focus behavior.
- Error messages.
- Color contrast.
- Interactive target sizes.

Do not sacrifice accessibility for visual appearance.

---

# 12. IMPLEMENTATION RULES

These rules are mandatory.

### Do not delete files

Do not delete, rename, or move existing files unless the user explicitly approves it.

If an existing element should no longer be displayed:

- Comment out its usage at the appropriate location.
- Add a clear `TODO:` explanation.
- Preserve the implementation for future reference.

Do not comment out large amounts of unrelated code.

### Do not duplicate existing components

Before creating a new component, inspect the existing Tasks UI library.

Extend existing components whenever possible.

### Preserve business logic

Do not rewrite working business logic just to make UI changes easier.

Separate presentation changes from business logic changes.

### Avoid unnecessary refactoring

Refactor only when there is a clear improvement in:

- Maintainability.
- Reusability.
- Performance.
- Reliability.
- UX consistency.

### Do not introduce fake functionality

Every visible control must perform its advertised action.

Do not leave buttons without behavior.

Do not use mock data in place of real application data.

Do not silently disable functionality to make tests pass.

### No unrelated redesign

Changes outside Tasks must be limited to necessary integrations.

Do not change the appearance of unrelated modules.

### Preserve existing user data

Do not delete test records, users, tasks, attachments, or relationships to simplify development.

---

# 13. PERFORMANCE AND CODE QUALITY

Review the implementation for:

- Unnecessary re-renders.
- Duplicate API requests.
- Excessive component complexity.
- Unnecessary state.
- Memory leaks.
- Incorrect effects.
- Race conditions.
- Missing loading states.
- Missing error handling.
- Unhandled promises.
- Expensive hierarchy calculations.
- Unnecessary DOM operations.

Avoid premature optimization.

Prioritize real problems and measurable improvements.

Ensure that large task lists remain usable.

---

# 14. DOCUMENTATION AND DECISION MANAGEMENT

Keep these documents accurate:

- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Update them only where necessary.

Record:

- Implemented improvements.
- Confirmed business rules.
- Remaining issues.
- Known limitations.
- Testing evidence.
- Migration status.
- UAT requirements.
- Release instructions.

Do not silently change approved policies.

If you discover an undocumented business decision that requires user approval, record it as an open question.

Do not block unrelated implementation work because of a non-critical open question.

---

# 15. EXECUTION ORDER

Follow this implementation sequence.

## Phase 1 — Inspect the current state

1. Inspect `/Users/nazarii/Desktop/Zagotowki/src/tasks`.
2. Inspect relevant dependencies outside Tasks.
3. Read all required documents.
4. Inspect the existing Tasks UI library.
5. Inspect the actual rendered application.
6. Review the provided screenshots.
7. Identify remaining issues.

Produce a concise internal implementation checklist based on real findings.

Do not stop after producing a report.

Proceed directly to implementation.

## Phase 2 — Fix the two highest-priority screens

First:

- Redesign the My Tasks screen.
- Redesign the Create Task dialog.

These are mandatory deliverables.

Do not postpone them in favor of minor refactoring or cosmetic improvements elsewhere.

## Phase 3 — Global Tasks UI consistency

1. Audit shared Tasks components.
2. Improve design tokens.
3. Standardize spacing.
4. Standardize alignment.
5. Improve interaction states.
6. Remove visual inconsistencies.
7. Ensure reusable components are used consistently.

## Phase 4 — Remaining screens

Review all other Tasks screens.

Prioritize issues affecting:

- Navigation.
- Task creation and editing.
- Task execution.
- Planning.
- Processes.
- Administration.
- Access management.
- Task settings.

Apply the same design language.

## Phase 5 — Functional verification

Verify all business requirements and existing approved policies.

Fix any genuine functional defects.

## Phase 6 — Responsive verification

Prioritize desktop and tablet.

Perform basic mobile stability checks.

## Phase 7 — Testing

Run all available relevant tests.

Capture visual evidence.

Compare screenshots.

Fix regressions.

## Phase 8 — Release preparation

Update documentation.

Prepare the UAT runbook.

Report what has and has not been verified.

Do not claim production readiness until all required release gates have actually passed.

---

# 16. ACCEPTANCE CRITERIA

The work is considered complete only when the following criteria are satisfied.

### UI/UX

- [ ] My Tasks screen has been redesigned and visually improved.
- [ ] Create Task dialog has been structurally redesigned.
- [ ] No overlapping header, form, or footer content.
- [ ] Consistent component dimensions.
- [ ] Consistent button and dropdown alignment.
- [ ] Consistent typography and spacing.
- [ ] Consistent design across all Tasks screens.
- [ ] Reusable Tasks components are used consistently.
- [ ] No unnecessary global component dependencies.
- [ ] Visual comparison against `screens/` has been performed.
- [ ] Desktop experience is polished.
- [ ] Tablet experience is polished.
- [ ] Mobile remains functionally usable.

### Functionality

- [ ] All twenty acceptance scenarios are verified.
- [ ] All RB and U requirements are checked.
- [ ] Task hierarchy works correctly.
- [ ] Parent progress uses immediate children only.
- [ ] No cascading deletion.
- [ ] Hierarchy filtering displays only matches and required ancestors.
- [ ] Permissions are enforced.
- [ ] Notifications follow approved rules.
- [ ] Attachments work correctly.
- [ ] Deep links work correctly.
- [ ] Module navigation works correctly.
- [ ] Reports and Schedule restrictions remain enforced.

### Technical quality

- [ ] No new lint warnings.
- [ ] No new console errors.
- [ ] No new browser test regressions.
- [ ] Build succeeds.
- [ ] Database integrity is preserved.
- [ ] Backend validation is correct.
- [ ] Existing functionality remains compatible.
- [ ] No files were deleted, renamed, or moved.
- [ ] No unrelated modules were redesigned.

### Release readiness

- [ ] Local verification completed.
- [ ] Visual QA completed.
- [ ] Database migration reviewed.
- [ ] UAT runbook updated.
- [ ] UAT migration completed or clearly identified as pending.
- [ ] Hosted acceptance completed or clearly identified as pending.
- [ ] Production release blockers documented.

---

# 17. FINAL REPORT

At the end, provide a structured report containing:

## A. Implemented changes

List all actual improvements.

## B. UI/UX improvements

Describe:

- My Tasks redesign.
- Create Task dialog redesign.
- Other improved screens.
- Tasks UI library improvements.
- Responsive improvements.

## C. Functional improvements

List all implemented and corrected functionality.

## D. Requirements compliance

Provide a table containing:

- Requirement ID.
- Description.
- Implementation status.
- Verification status.
- Related test or evidence.

## E. Testing results

Provide actual results for:

- Lint.
- Unit tests.
- Database tests.
- Browser tests.
- Build.
- Visual QA.

Clearly identify pre-existing failures and skipped tests.

## F. Known issues

List every remaining issue and its impact.

## G. UAT and deployment readiness

Clearly distinguish:

- Locally verified.
- Database verified.
- UAT verified.
- Hosted acceptance verified.
- Production deployment ready.

## H. Modified files

List new and modified files.

Confirm that no existing files were deleted, renamed, or moved.

## I. Remaining decisions

List only questions that genuinely require user approval.

---

# FINAL INSTRUCTION

Act as an experienced Lead Product Designer and Lead Full Stack Engineer who is responsible for delivering a polished, reliable product.

Do not optimize for the smallest possible code change.

Optimize for the best maintainable solution that satisfies the actual product requirements.

The existing implementation is a foundation, not a reason to accept poor UX.

In particular, do not consider the current My Tasks screen or Create Task dialog finished simply because they technically work.

They must be redesigned to a professional standard.

Prioritize desktop and tablet usability.

Preserve existing business logic and approved decisions.

Do not remove files.

Do not redesign unrelated modules.

Do not invent requirements.

Do not stop after analysis.

**Inspect, implement, test, compare, refine, and deliver the highest-quality Tasks module possible within the defined scope.**
