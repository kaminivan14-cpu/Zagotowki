# TASKS MODULE — FINAL VISUAL VERIFICATION, PRODUCT DECISIONS AND RELEASE COMPLETION

Continue from the current implementation.

The complete Tasks module redesign has already been implemented, and seven visual QA rounds have been completed at 1440px, 1024px, and 768px.

Do NOT restart development, repeat the entire redesign, or unnecessarily modify already completed screens.

Your objective is to close the remaining visual verification gaps, confirm the agreed product decisions, perform a final consistency audit, and prepare the project for UAT and production deployment.

## 1. PRESERVE THE CURRENT IMPLEMENTATION

Preserve all existing work, including:

- Independent Tasks UI component library.
- Redesigned My Tasks screen.
- Redesigned Create Task dialog.
- Redesigned existing Tasks screens and dialogs.
- Unified design tokens and styling.
- Tasks-specific navigation.
- Responsive desktop and tablet layouts.
- Task hierarchy and business logic.
- Attachments.
- Notifications.
- Activity history.
- Bulk actions.
- Existing tests.
- Existing approved decisions.

Do not recreate existing components or introduce duplicate implementations.

Do not undo existing changes.

Do not modify global presentation components.

## 2. FINISH THE REMAINING VISUAL VERIFICATION

Four areas have not yet received a complete visual review.

They must be inspected in the running application.

### A. Critical-task interruption dialog

Inspect the entire dialog.

Verify:

- Header.
- Title.
- Description.
- Form controls.
- Interruption settings.
- Action buttons.
- Footer.
- Spacing.
- Alignment.
- Validation.
- Loading states.
- Error feedback.
- Responsive behavior.

Compare its appearance with the Tasks design system.

Fix actual visual or functional defects.

### B. Process launch dialog

Inspect the process launch dialog.

The current sample process is a draft, so its launch action is disabled.

Use a safe test fixture or an existing permitted test scenario to inspect the dialog without changing real business data or bypassing the process lifecycle rules.

Verify its actual layout, forms, buttons, validation, and interaction states.

Do not modify process business logic simply to make the dialog accessible for visual testing.

### C. Attachment upload states

Inspect and verify:

- Initial empty state.
- File selection.
- Upload in progress.
- Successful upload.
- Upload failure.
- Unsupported file type.
- File size validation.
- Attachment preview.
- Open action.
- Download action.
- Delete confirmation.
- Permission-denied state.

Verify PDF, DOC, DOCX, XLS, XLSX, and image handling.

Ensure all states follow the independent Tasks design system.

### D. Admin — Work and Access settings

Inspect the entire "Work and Access settings" section.

Verify:

- Layout.
- Typography.
- Form structure.
- Labels.
- Inputs.
- Dropdowns.
- Buttons.
- Dialogs.
- Alignment.
- Section spacing.
- Permission-related feedback.

Do not change unrelated administrative functionality.

## 3. CONFIRM THE FOLLOWING PRODUCT DECISIONS

Treat these decisions as approved for the current implementation.

### Default task view

Keep `All Tasks` as the default list view.

Display the correct title:

`Всі завдання`

Preserve all four required views:

- My Tasks.
- Team Tasks.
- Relevant to Me.
- All Tasks.

Ensure every view follows the existing permission rules.

Do not restore `view: "my"` as the default unless explicitly requested.

### Legacy Word and Excel formats

Keep support for:

- DOC.
- DOCX.
- XLS.
- XLSX.

These formats are required as part of Word and Excel attachment support.

Maintain the existing 20 MB size limit unless the infrastructure requires a documented adjustment.

Validate files server-side using the existing security mechanisms.

Do not rely exclusively on file extensions or client-provided MIME types.

### Bulk delete

Keep the newly implemented bulk-delete functionality.

Requirements:

- Confirm the operation before deleting.
- Respect individual task permissions.
- Never cascade-delete task hierarchies.
- Do not delete parent tasks that contain subtasks.
- Clearly identify excluded tasks.
- Display understandable results after the operation.
- Handle partial success and failure correctly.
- Prevent duplicate deletion requests.
- Preserve the existing single-task deletion policy.
- Ensure the backend independently enforces deletion restrictions.

Bulk deletion is an additional UX feature and must not replace or weaken RB-011.

Record these decisions in `docs/work-module-decisions.md`.

## 4. FINAL SCREEN-BY-SCREEN CONSISTENCY AUDIT

Review the entire Tasks module one final time.

Pay particular attention to:

- My Tasks.
- Team Tasks.
- Relevant to Me.
- All Tasks.
- Completed Tasks.
- Overdue Tasks.
- Task creation.
- Task editing.
- Task details.
- Nested task hierarchy.
- Planning.
- Processes.
- Process wizard.
- Process execution.
- Admin.
- Access.
- Organization.
- Work.
- Task settings.
- Notifications.
- Activity history.
- Attachments.
- All dialogs and modals.
- Dropdowns and popovers.
- Confirmation dialogs.
- Filters and sorting.

Verify that:

- All repeated controls use shared Tasks components.
- All dialogs follow one visual structure.
- Button dimensions are consistent.
- Inputs and selects have consistent heights.
- Page headers are aligned.
- Table rows follow the same visual rules.
- Colors use the `--tk-*` tokens.
- Styling uses the `tk-` prefix.
- No unintended legacy visual styles remain.
- No incorrect LanguageSwitcher instances appear inside dialogs.
- No visible controls are non-functional.

Do not redesign screens again when they already meet the requirements.

Make targeted corrections only where actual inconsistencies are found.

## 5. RESPONSIVE VERIFICATION

Prioritize desktop and tablet.

Verify:

- 1440px.
- 1024px.
- 768px.

Perform basic stability checks at 375px.

Do not spend disproportionate time on complete mobile optimization, which is deferred to a future phase.

Preserve the tablet vertical icon rail and its interaction behavior.

Ensure the My Tasks screen, Create Task dialog, other dialogs, and Admin settings remain usable.

## 6. PRESERVE THE EXISTING SUPABASE CONNECTION

The user has explicitly confirmed that the currently configured Supabase project, although identified as PROD, currently contains test data.

Continuing to use the existing connection for development and testing is acceptable.

Do not:

- Replace the current `.env` configuration unnecessarily.
- Migrate the project to another Supabase instance solely because of the PROD project reference.
- Stop the existing development server without necessity.
- Delete or reset test data.
- Expose credentials.

Distinguish between:

- Local verification using the currently configured Supabase project.
- UAT migration.
- Hosted acceptance.
- Actual production release.

Do not claim that UAT migration or hosted acceptance has passed unless they have actually been executed.

If UAT credentials remain unavailable, preserve the existing runbook and report the limitation accurately.

## 7. REVIEW THE EXISTING FAILED BROWSER TEST

The process-diagram drag test at 375px is a confirmed pre-existing failure on commit `adf7936`.

Keep its baseline status documented.

Do not introduce unrelated changes merely to force it to pass.

Verify that the current implementation does not make the failure worse.

All other available browser tests must remain passing.

## 8. VERIFY REQUIREMENTS AND TESTS

Recheck:

- RB-001 through RB-014.
- U-001 through U-007.
- All twenty acceptance scenarios.
- Additional approved decisions.

Verify the actual implementation and associated tests.

Run:

- Lint.
- Node tests.
- Database tests.
- Browser tests.
- Build.

Record actual results.

Do not report tests as passed unless they were executed.

Maintain accurate statuses in `docs/work-module-requirements-matrix.md`.

## 9. DOCUMENTATION AND RELEASE PREPARATION

Update:

- `docs/work-module-decisions.md`
- `docs/work-module-requirements-matrix.md`
- `docs/work-module-rollout.md`

Document:

- Confirmed default view.
- DOC and XLS support.
- Bulk-delete policy.
- Visual verification of the four remaining areas.
- Current test results.
- Existing browser baseline failure.
- UAT migration requirements.
- Hosted acceptance requirements.
- Any remaining known limitations.

If visual evidence can be captured, save representative final screenshots in an organized QA evidence directory or provide them with the final report.

Do not commit temporary test files or unrelated scratchpad artifacts.

## 10. FILE PRESERVATION

Do not delete, rename, or move existing files.

Preserve existing implementations.

If any UI element is no longer needed:

- Comment out its usage.
- Add an explanatory `TODO:` comment.
- Preserve the original implementation.

Do not modify global presentation components.

Do not redesign unrelated modules.

## 11. FINAL REPORT

Provide:

1. Four remaining visual verification results.
2. Final Tasks screen-by-screen checklist.
3. Confirmation of the three approved product decisions.
4. Bulk-delete verification.
5. Attachment verification.
6. Responsive verification.
7. Final results for all twenty acceptance scenarios.
8. Lint, build, unit, database, and browser test results.
9. Known issues and baseline failures.
10. UAT and hosted acceptance status.
11. Modified and newly created files.
12. Confirmation that no existing files were deleted, renamed, or moved.
13. Final production readiness assessment.

Clearly distinguish local verification from UAT and production verification.

Do not claim production readiness until the required release checks have actually passed.

# FINAL DIRECTIVE

Continue from the current implementation.

Do not start over.

Complete the four outstanding visual reviews, confirm the approved decisions, perform the final consistency audit, and prepare the module for release.

The objective is to close all remaining local implementation and verification work without introducing unnecessary changes or breaking existing functionality.

**Deliver a complete, polished, consistent, and fully verified Tasks module that satisfies `plan.md`, `task.docx`, and all previously approved product requirements.**
