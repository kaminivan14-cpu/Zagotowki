# TASKS MODULE — FINALIZATION AND PRODUCTION READINESS

Continue working on the existing Tasks module based on the current implementation.

Do NOT restart the project, redesign it from scratch, or repeat already completed work.

First, inspect the existing implementation and review:

- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- The current Tasks-specific component library.
- The existing implementation changes.
- The latest test results.

Your goal is to complete the remaining work and close all outstanding requirements.

## 1. Complete Tasks UI component adoption

The Tasks-specific UI library already exists in:

`src/tasks/components/ui/`

It contains 18 Tasks-prefixed components and its own styling system.

Do not create duplicates of existing Tasks components.

Inspect all relevant screens inside the Tasks module, especially:

- Processes wizard.
- Admin.
- Access.
- Planning.
- Work.

Identify repeated native buttons and other locally implemented presentation elements that have not yet been migrated.

Replace repeated UI elements with the existing Tasks-specific components.

Standardize:

- Buttons.
- Icon buttons.
- Inputs.
- Dropdowns.
- Selects.
- Dialogs.
- Modals.
- Tooltips.
- Badges.
- Date pickers.
- Navigation controls.
- Other repeated UI elements.

Ensure all affected screens follow the same Tasks design system.

Do not modify their underlying business logic.

Preserve all existing functionality.

Inspect the LanguageSwitcher implementation. Ensure the Tasks header uses its own Tasks-specific presentation component if it currently depends on a global presentation component. Reuse existing language and localization logic without unnecessarily duplicating services.

## 2. Preserve global components

Do not modify global presentation components outside Tasks to support the Tasks redesign.

The existing global components must remain unchanged.

Tasks must use its independent UI layer.

Verify that all updated screens use the correct Tasks components.

Ensure shared business services, API integrations, and utilities remain reusable.

## 3. Finalize the task deletion policy

Use the following safe deletion policy:

- Tasks without subtasks can be deleted after confirmation and permission validation.
- A task with one or more subtasks cannot be deleted.
- Never cascade-delete the task hierarchy.
- Display a clear explanation when deletion is blocked.
- Tell users to move or reassign subtasks before deleting the parent.
- Ensure the backend enforces the same rule.
- Add tests proving that no child tasks are deleted when parent deletion is attempted.

Document this as the agreed deletion policy.

## 4. Finalize notification recipients

Implement the following notification recipient policy for task reassignment:

- Always notify the newly assigned user.
- Notify the task author, relevant participants, and responsible person for a related process when the event affects them.
- Do not notify the actor about their own action.
- Do not notify the previous assignee solely because they were previously assigned.
- Notify the previous assignee only if they remain relevant through another relationship, such as author or participant.
- Respect all existing permissions.
- Prevent duplicate notifications.

Ensure notifications are created only when appropriate.

Add tests covering initial assignment, reassignment, self-assignment, and removal of an assignee.

Document this decision.

## 5. Complete attachment testing

Add dedicated tests for non-image documents.

At minimum test:

- PDF.
- DOC.
- DOCX.
- XLS.
- XLSX.
- Unsupported file types.
- Oversized files.
- Unauthorized file access.
- File download.
- Permission-controlled deletion.

Verify that attachment author, filename, and upload date are displayed correctly.

Confirm that attachments are securely stored and accessed through the existing permission system.

## 6. Complete the remaining acceptance testing

Review all twenty acceptance scenarios from the technical specification.

For each scenario verify:

- The corresponding implementation.
- The exact test.
- The actual test result.
- Relevant evidence.

Do not mark a scenario as completed without a passing test.

For Reports and Schedule, ensure the disabled navigation and routes are explicitly tested. Skipping legacy screen-rendering tests does not replace testing their required disabled state.

Investigate the failed browser test for the process-diagram drag interaction at 375px.

Compare it with the previous commit and document the evidence that it is a pre-existing issue.

Do not expand the Tasks scope to fix unrelated existing failures unless the latest changes introduced them.

Clarify which browser test specifications were executed from temporary copies and which changes are actually present in the repository.

Do not leave uncommitted test modifications in temporary scratch locations without documenting them.

## 7. Verify external integration changes

Review the modification in:

`src/orders/ModuleShell.jsx`

Confirm that the seven-line deep-link integration does not break other modules.

Test:

- Direct task URL access.
- Invalid task IDs.
- Unauthorized task access.
- Switching between tasks.
- URL synchronization.
- Normal module navigation.

Do not introduce unrelated changes to the Orders module.

## 8. UAT preparation and verification

Prepare and execute the UAT validation where access is available.

Before migration:

- Inspect the migration.
- Review its impact on existing data.
- Confirm a valid backup exists.
- Ensure rollback or recovery procedures are understood.

Run migrations only in the approved UAT environment.

After migration:

- Verify existing tasks.
- Verify task hierarchy.
- Verify existing recurrence behavior.
- Verify permissions.
- Verify attachments.
- Verify activity history.
- Verify notifications.
- Run the hosted acceptance tests.

Never run production migrations without explicit authorization.

If UAT infrastructure or access is unavailable, report the exact blocker rather than claiming production readiness.

## 9. Final visual audit

Compare all relevant Tasks screens.

Verify that:

- Repeated controls use Tasks-specific components.
- No outdated styles remain unintentionally.
- Dialogs are consistent.
- Buttons and dropdowns are aligned.
- Inputs have consistent dimensions.
- Header and sidebar are consistent.
- Task details and nested lists are visually consistent.
- Responsive behavior remains correct.
- No broken layouts have been introduced.

Do not modify unrelated modules.

## 10. Final report

Update the requirement matrix and decision document.

Provide:

- Completed components.
- Screens converted to Tasks UI components.
- Remaining native presentation elements and reasons.
- Final deletion policy.
- Notification recipient policy.
- Attachment test results.
- All twenty acceptance scenario results.
- Browser suite results.
- UAT migration status.
- Hosted acceptance status.
- All modified files.
- Any remaining blockers.

Explicitly confirm:

- No files were deleted, renamed, or moved.
- Global presentation components were not modified.
- Existing business logic was preserved unless specifically required to change.
- The Tasks module uses its independent UI component library.

Do not claim production readiness until all critical implementation, migration, security, and UAT acceptance checks have passed.

Work directly in the existing project. Continue from the current implementation without starting over.
