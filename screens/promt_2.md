# MASTER PROMPT — TASKS MODULE

# COMPLETE REDESIGN, COMPONENT ISOLATION, FULL-STACK REFACTORING AND FEATURE IMPLEMENTATION

## 1. ROLE

Act as a Lead UI/UX Designer, Lead Product Designer, Senior Software Architect, and Lead Full Stack Developer.

Your responsibility is to transform the existing Tasks module into a polished, modern, fully functional, responsive, and production-ready task management experience.

You must combine:

- Professional SaaS product design.
- ClickUp-inspired UX/UI.
- Jira-inspired task management rules.
- Consistent reusable component architecture.
- Reliable frontend and backend implementation.
- Existing application compatibility.
- High-quality responsive behavior.

This is an improvement and redesign of an EXISTING module, not the creation of a new application or a replacement module.

Do not stop at recommendations, mockups, or planning. Implement actual changes in the existing project.

---

## 2. WORKING DIRECTORY AND PROJECT SCOPE

### Primary starting directory

`/Users/nazarii/Desktop/Zagotowki/src/tasks`

Start your investigation from this exact directory.

First understand the existing Tasks module, its components, pages, styles, hooks, services, state management, routing, and existing functionality.

### IMPORTANT: External directory access is permitted

The Tasks directory is the primary implementation scope, NOT a strict filesystem access boundary.

You are explicitly allowed to navigate outside `/src/tasks` whenever necessary.

You may inspect:

- Shared components.
- Application layouts.
- Routing.
- Global styles.
- API services.
- Backend controllers.
- Backend services.
- Database models.
- Database migrations.
- Authentication.
- Authorization.
- File storage.
- Notifications.
- Configuration.
- Dependencies.
- Tests.

You may inspect any other project file required to understand the existing implementation.

### Modification boundaries

You may modify files outside `/src/tasks` only when necessary for correct Tasks functionality.

Examples:

- Existing task API integration.
- Task-related backend endpoints.
- Database changes required by task functionality.
- Existing authentication or permission integration.
- Shared services required for file attachments.
- Task-related route registration.

However:

**Do not redesign, refactor, or change unrelated modules.**

Inspect broadly when necessary, but implement narrowly.

The primary implementation target must remain `/src/tasks` and its directly related dependencies.

### Required resources

Locate and inspect:

- `plan.md`
- `task.docx`
- `screens/`

Read the complete technical specification and implementation plan.

Inspect every relevant screenshot.

Do not assume that the technical requirements are fully contained in the Tasks source directory.

---

## 3. SOURCE OF TRUTH

The implementation must comply with:

1. All applicable requirements from `task.docx`.
2. All applicable requirements from `plan.md`.
3. The agreed decisions U-001 through U-007.
4. All requirements RB-001 through RB-014.
5. The twenty mandatory acceptance test scenarios.
6. All additional instructions in this prompt.
7. The supplied reference screenshots.

Specific business requirements in the technical specification take precedence over visual preferences.

Do not silently change existing business logic.

If a requirement conflicts with existing functionality, investigate the reason before changing it.

Document genuine conflicts and avoid destructive decisions without approval.

---

## 4. DESIGN DIRECTION

### ClickUp — primary reference

Use ClickUp as the main UX/UI reference.

Create a professional interface with:

- Compact application header.
- Clean vertical sidebar.
- Efficient task lists.
- Hierarchical task presentation.
- Contextual task actions.
- Inline editing.
- Compact forms.
- Modern dialogs.
- Search and filtering.
- Clear task status indicators.
- Consistent spacing and alignment.
- Responsive layouts.

### Jira — secondary reference

Use Jira for:

- Parent-child relationships.
- Hierarchy validation.
- Task workflow rules.
- Completion restrictions.
- Permissions.
- Safe task operations.

The overall appearance must remain ClickUp-inspired.

Do not copy proprietary source code or reproduce third-party interfaces mechanically.

Use the existing project's technology stack.

---

## 5. INDEPENDENT TASKS UI COMPONENT LIBRARY — CRITICAL REQUIREMENT

This is one of the most important architectural requirements.

**The Tasks module must have its OWN independent set of UI components.**

Do not directly modify global UI components outside `/src/tasks` to achieve the Tasks redesign.

Do not make the Tasks design dependent on global components whose styles or behavior may change independently.

### 5.1 Existing shared component investigation

Before creating components, inspect existing shared UI implementations outside `/src/tasks`.

Understand their:

- Functionality.
- API.
- Props.
- Events.
- Validation.
- Accessibility.
- Interaction behavior.
- Existing styling.
- Dependencies.

Use these implementations as functional and architectural references.

### 5.2 Create Tasks-specific duplicates

If an equivalent shared component already exists outside `/src/tasks`, create a Tasks-specific implementation inside the Tasks module.

Use the `Tasks` prefix in component names.

Examples:

| Existing component | Required Tasks component |
| ------------------ | ------------------------ |
| Button             | TasksButton              |
| IconButton         | TasksIconButton          |
| Dialog             | TasksDialog              |
| Modal              | TasksModal               |
| Sidebar            | TasksSidebar             |
| Dropdown           | TasksDropdown            |
| DropdownMenu       | TasksDropdownMenu        |
| Input              | TasksInput               |
| Select             | TasksSelect              |
| Checkbox           | TasksCheckbox            |
| Switch             | TasksSwitch              |
| Tooltip            | TasksTooltip             |
| Popover            | TasksPopover             |
| Badge              | TasksBadge               |
| Avatar             | TasksAvatar              |
| DatePicker         | TasksDatePicker          |
| SearchBar          | TasksSearchBar           |
| ConfirmationDialog | TasksConfirmationDialog  |

This list is illustrative. Inspect the actual project before determining the final component inventory.

### 5.3 Component isolation

All Tasks-specific components must:

- Be implemented within `/src/tasks`.
- Have independent styling.
- Have independent component-level configuration.
- Follow the new Tasks design system.
- Support the required functionality.
- Be reusable across all Tasks screens.
- Avoid unnecessary dependencies on global presentation components.

Do not import global Button, Dialog, Sidebar, Dropdown, Input, Select, or equivalent presentation components directly into Tasks screens when a Tasks-specific equivalent is required.

Do not modify the original global components to accommodate Tasks styling.

Preserve their original behavior for other application modules.

### 5.4 Reuse implementation knowledge, not global presentation dependencies

You may reuse:

- Existing business logic.
- Validation rules.
- API services.
- Data models.
- Hooks.
- Utility functions.
- Type definitions.
- Functional patterns.

However, the visual UI layer must remain independently customizable within Tasks.

Avoid copying unrelated business logic or creating unnecessary duplicated API implementations.

Where possible, separate presentation from business logic.

### 5.5 Reusable Tasks components

Create a structured Tasks component library.

Suggested organization:

`src/tasks/components/ui/`

- TasksButton
- TasksIconButton
- TasksInput
- TasksSelect
- TasksDropdown
- TasksDialog
- TasksModal
- TasksBadge
- TasksTooltip
- TasksPopover
- TasksCheckbox
- TasksSwitch

`src/tasks/components/layout/`

- TasksLayout
- TasksHeader
- TasksSidebar
- TasksPageHeader
- TasksBackButton

`src/tasks/components/task/`

- TasksTaskRow
- TasksTaskCard
- TasksTaskTree
- TasksTaskStatus
- TasksTaskPriority
- TasksTaskProgress
- TasksTaskActions
- TasksSubtaskList
- TasksTaskDetails

`src/tasks/components/common/`

- TasksSearch
- TasksFilter
- TasksSort
- TasksEmptyState
- TasksLoadingState
- TasksErrorState

Adapt the structure to the existing project conventions.

Do not create unnecessary components just to match this example.

### 5.6 Single source of truth inside Tasks

Every repeated Tasks UI element must use the same Tasks-specific component.

For example:

- All Tasks buttons use TasksButton.
- All Tasks dialogs use TasksDialog.
- All Tasks dropdowns use TasksDropdown.
- All Tasks inputs use TasksInput.
- All task status indicators use TasksTaskStatus.

Do not create separate button or dropdown implementations for individual pages.

Use variants and configuration properties.

The result must be a cohesive, independent Tasks UI component library.

---

## 6. CENTRALIZED TASKS DESIGN SYSTEM

Create a consistent design system inside `/src/tasks`.

Standardize:

- Colors.
- Typography.
- Spacing.
- Component heights.
- Border radiuses.
- Borders.
- Shadows.
- Icon sizes.
- Breakpoints.
- Hover states.
- Focus states.
- Disabled states.
- Active states.
- Loading states.

Use centralized tokens.

Avoid arbitrary inline styles and inconsistent local overrides.

All Tasks screens must use the same visual language.

Pay particular attention to:

- Button alignment.
- Dropdown dimensions.
- Input dimensions.
- Dialog spacing.
- Page header alignment.
- Task row heights.
- Icon positioning.
- Sidebar spacing.
- Form field alignment.

All repeated elements must have consistent dimensions and behavior.

---

## 7. NAVIGATION AND LAYOUT

Implement all requirements RB-001, RB-002, and RB-003.

### Header

Create a compact unified header containing:

- LanguageSwitcher.
- Module name "Робота".
- Authenticated user name.
- Settings.
- Navigation to modules.
- Logout.
- Notification center entry point.

Keep the LanguageSwitcher in the main header.

Remove redundant LanguageSwitcher instances from Dialog and Modal interfaces.

Do not remove language switching functionality.

### Sidebar

Implement a compact vertical sidebar with:

- Робота.
- Планування.
- Процеси.
- Завдання.

Keep a separate Create task action.

Move Admin panel into the header or settings menu.

Remove Reports and Schedule from visible navigation.

Disable their relevant routes without deleting their implementation.

### Back to modules

Implement a clearly visible Back to modules button.

Users must be able to return to the existing module overview from Tasks-related screens.

Do not rely exclusively on browser history.

Maintain predictable navigation even when users open a task directly through its URL.

### File preservation

Preserve Reports and Schedule source files, data, and existing implementations.

Comment out relevant navigation and route usages where appropriate.

Add explanatory TODO comments.

---

## 8. TASK FUNCTIONALITY

Implement every applicable requirement from RB-004 through RB-014.

### RB-004 — Unlimited nested subtasks

Support unlimited nesting.

Every subtask must be a full task entity.

Quick creation must require only the title.

Preserve standard defaults for other fields.

Prevent:

- Self-parenting.
- Circular relationships.
- Assigning descendants as parents.

Enforce hierarchy integrity on the backend.

### RB-005 — Recurring tasks

Redesign recurrence settings into a compact configuration control.

Use Google Calendar as the UI reference.

Preserve all existing recurrence business logic.

Do not change recurrence calculations or existing supported recurrence behavior.

### RB-006 — Task creation form

Create a wider, more compact, better-organized task creation interface.

Preserve all existing fields, validation, defaults, and business rules.

### RB-007 — Hierarchical task list

Display subtasks beneath their parent tasks.

Support arbitrary nesting.

Collapse all hierarchy levels by default.

Provide:

- Expand all subtasks.
- Collapse all subtasks.

Use clear indentation and stable row heights.

### RB-008 — Parent reassignment

Allow changing and clearing the parent task.

Preserve child relationships.

Prevent circular hierarchy.

Drag-and-drop is not required.

### RB-009 — Task views

Implement:

- My tasks.
- Team tasks.
- Relevant to me.
- All tasks.

Respect existing permissions and organizational relationships.

Relevant tasks must follow U-001.

Team tasks must follow U-002.

### Hierarchical filtering

Implement U-004 exactly.

When a nested task matches a filter:

- Show the matching task.
- Show only its necessary parent chain.
- Do not show unrelated sibling tasks.
- Do not display unnecessary tasks.
- Preserve hierarchy context.

### RB-010 — Completion and progress

Hide completed tasks from active lists by default.

Provide a separate Completed view.

Allow showing completed subtasks within a parent task.

Calculate progress using immediate children only.

Example:

2 completed immediate subtasks out of 4 = 50%.

Do not include deeper descendants in the parent's progress calculation.

If no immediate children exist, display `—` without a progress bar.

Enforce U-003: a parent cannot be completed while any immediate child remains unfinished.

Enforce this on the backend.

Do not automatically change child statuses.

### RB-011 — Task actions

Provide:

- Open task.
- Delete task.

Require confirmation for deletion.

Verify user permissions.

**CRITICAL: Hierarchy deletion safety**

Do not implicitly delete an entire task hierarchy.

If a parent has subtasks:

- Display a clear warning.
- Explain the potential consequences.
- Respect an explicitly approved existing deletion policy.
- Do not silently cascade-delete descendants.
- If no approved policy exists, prevent destructive execution and request clarification.

Do not invent a deletion policy that risks data loss.

### RB-012 — Task details

Redesign the existing task details interface.

Use a unified viewing and editing workspace.

Include:

- Title.
- Description.
- Status.
- Priority.
- Assignee.
- Deadline.
- Parent task.
- Existing task fields.
- Subtasks.
- Activity history.
- Attachments.

Use inline editing where appropriate.

Avoid unnecessary navigation and layout shifts.

### RB-013 — Notifications and activity

Implement a notification center.

Include:

- All.
- Unread.
- Read.
- Mark as read.
- Mark all as read.
- Navigation to related tasks.

Implement separate notification and activity history entities.

Record important task events on the backend.

Avoid duplicated notifications.

Preserve history when notifications are marked as read.

### RB-014 — Descriptions and attachments

Allow editing existing task descriptions.

Record changes in activity history.

Support multiple attachments:

- Images.
- PDF.
- Word.
- Excel.
- Other permitted files.

Display:

- File name.
- Author.
- Upload date.

Implement:

- Upload.
- Preview.
- Open.
- Download.
- Permission-controlled deletion.
- Validation.
- Error handling.
- Secure storage.

---

## 9. BACKEND AND DATA INTEGRITY

Preserve existing business logic.

Reuse existing API services, models, and infrastructure where appropriate.

Implement necessary missing functionality.

All important business rules must be enforced server-side.

Verify:

- Task hierarchy integrity.
- Parent reassignment.
- Completion restrictions.
- Permissions.
- Attachment access.
- Notification access.
- Activity history access.

Do not bypass authorization for convenience.

Do not delete existing database data or tables.

Use safe migrations when required.

Preserve referential integrity.

Avoid unnecessary changes to unrelated backend functionality.

---

## 10. FILE PRESERVATION POLICY

**NEVER DELETE EXISTING FILES.**

Do not delete:

- Components.
- Pages.
- Hooks.
- Services.
- Utilities.
- Styles.
- Assets.
- Configurations.
- Existing implementations.

When an existing UI element must no longer be rendered:

1. Preserve its implementation.
2. Comment out its usage at the location where it is rendered.
3. Add a clear TODO comment explaining why it is disabled.
4. Ensure the code remains syntactically valid.
5. Verify it is no longer visible.

Example:

```tsx
{
  /* TODO: Disabled because this component is not required in the redesigned Tasks interface. */
}
{
  /* <LegacyComponent /> */
}
```

Use the appropriate syntax for the existing framework.

Do not globally disable shared components that are used elsewhere.

Do not delete unused source code.

Do not rename or move existing files.

This restriction applies to files inside and outside the Tasks directory.

---

## 11. RESPONSIVE DESIGN

The entire Tasks module must work correctly on:

- Large desktops.
- Standard desktops.
- Laptops.
- Tablets.
- Mobile devices.

Verify:

- Header.
- Sidebar.
- Task lists.
- Nested task rows.
- Forms.
- Dialogs.
- Dropdowns.
- Task details.
- Notifications.
- Attachments.

Avoid horizontal overflow.

Preserve essential functionality on small screens.

Ensure keyboard navigation, focus visibility, accessible labels, and sufficient contrast.

---

## 12. IMPLEMENTATION PROCESS

### Phase 0 — Targeted investigation

Start at `/src/tasks`.

Inspect relevant external dependencies only when needed.

Read `plan.md`, `task.docx`, and `screens/`.

Prepare a requirements matrix:

Requirement → Existing implementation → Required changes → Files → Risks → Tests.

Identify existing business logic that must be preserved.

Identify shared components that require Tasks-specific implementations.

### Phase 1 — Architecture and component isolation

Establish the Tasks-specific component structure.

Create the Tasks design tokens.

Implement the Tasks-specific Button, Dialog, Dropdown, Input, Select, Sidebar, and other necessary reusable components.

Ensure the original global components remain unchanged.

### Phase 2 — Navigation and layout

Implement:

- Compact header.
- Sidebar.
- Navigation.
- Back to modules.
- Removal of unnecessary navigation elements.
- Responsive layout.

### Phase 3 — Task creation and editing

Implement RB-004, RB-005, RB-006, RB-008, RB-012, and RB-014.

### Phase 4 — Hierarchical task management

Implement RB-007, RB-009, RB-010, and RB-011.

### Phase 5 — Notifications and activity

Implement RB-013.

Ensure event recording is integrated into task operations.

### Phase 6 — Quality assurance

Run all relevant tests.

Verify all twenty mandatory acceptance scenarios.

Compare rendered interfaces with screenshots.

Check regressions.

---

## 13. MANDATORY TESTING

Test all twenty scenarios from the technical specification.

Additionally verify:

1. Tasks-specific components are used throughout Tasks.
2. Global components outside Tasks have not been modified unnecessarily.
3. Changes in global component styling cannot unexpectedly break the Tasks design.
4. No duplicated local Button, Dialog, or Dropdown implementations exist.
5. LanguageSwitcher remains in the header.
6. LanguageSwitcher is absent from redundant dialogs.
7. Back to modules works.
8. Reports and Schedule are hidden and disabled as required.
9. No existing files have been deleted, renamed, or moved.
10. Hierarchical deletion cannot cause unintended cascading data loss.
11. Parent progress uses immediate children only.
12. Hierarchical filtering displays only the necessary parent chain.
13. All task views respect permissions.
14. Attachments are protected by backend authorization.
15. Notifications and activity history remain separate.
16. Existing recurrence functionality is preserved.
17. Responsive layouts work correctly.
18. Shared global components continue working in unrelated modules.

Run existing:

- Build.
- Type checks.
- Lint.
- Unit tests.
- Integration tests.
- End-to-end tests.

Do not claim that tests passed unless they were actually executed.

---

## 14. REQUIREMENT TRACKING

Track all:

- RB-001 through RB-014.
- U-001 through U-007.
- Twenty acceptance scenarios.

Use:

- NOT STARTED.
- IN PROGRESS.
- COMPLETED.
- BLOCKED.

For every requirement, record:

- Implementation status.
- Changed files.
- Verification.
- Remaining issues.

Do not mark a requirement complete merely because its interface exists.

The actual business functionality must work.

---

## 15. EXECUTION RULES

1. Do not stop after analysis.
2. Do not stop after creating a plan.
3. Implement actual code changes.
4. Work in small logical stages.
5. Preserve existing functionality.
6. Do not delete files.
7. Do not modify global presentation components for Tasks styling.
8. Create independent Tasks-specific UI components.
9. Reuse suitable business logic and services.
10. Inspect external dependencies whenever necessary.
11. Do not redesign unrelated modules.
12. Do not invent business rules.
13. Ask for approval before unresolved destructive operations.
14. Continue independent implementation work if one requirement is blocked.
15. Verify actual UI rendering and functionality.

---

## 16. FINAL IMPLEMENTATION REPORT

Provide:

1. Overall implementation summary.
2. UI/UX redesign results.
3. New Tasks-specific component inventory.
4. Existing Tasks components refactored.
5. Backend changes.
6. Database changes.
7. Implemented RB-001 through RB-014.
8. Implemented U-001 through U-007.
9. Twenty acceptance scenario results.
10. Bug fixes.
11. Files created.
12. Files modified.
13. Confirmation that no existing files were deleted, renamed, or moved.
14. Confirmation that global presentation components were preserved.
15. Disabled UI elements and corresponding TODO comments.
16. Build, lint, type-check, and test results.
17. Remaining blockers.
18. Production readiness assessment.

Clearly distinguish completed, failed, blocked, and untested requirements.

Do not claim production readiness if critical functionality remains incomplete or unverified.

---

# FINAL OBJECTIVE

Deliver a fully redesigned, production-quality Tasks module with an independent, reusable UI component library.

The module must:

- Follow ClickUp-inspired UX/UI principles.
- Apply Jira-inspired task management rules.
- Implement all applicable requirements from `task.docx` and `plan.md`.
- Use independent Tasks-prefixed UI components.
- Preserve existing business logic and data.
- Maintain secure backend functionality.
- Support unlimited nested tasks.
- Provide correct hierarchical filtering and progress.
- Include notifications, activity history, and attachments.
- Work responsively.
- Integrate with the existing application.

The project must remain stable and compatible with unrelated modules.

Start from:

`/Users/nazarii/Desktop/Zagotowki/src/tasks`

Inspect outside this directory whenever necessary, but keep implementation changes limited to Tasks and its directly required dependencies.

**Do not delete files. Do not unnecessarily modify global UI components. Build an independent, consistent, maintainable Tasks experience that can evolve without affecting the rest of the application.**
