# 30. COMPLETE PRODUCTION DATABASE GAP ANALYSIS — IDENTIFY EVERYTHING MISSING IN PROD

## 30.1 Primary objective

The developer suspects that the Production Supabase database is missing some migrations, functions, policies, configuration objects or other database changes that already exist in the UAT environment or are required by the current application code.

Perform a comprehensive, evidence-based Production Database Gap Analysis.

The objective is to answer:

1. What is currently present in PROD?
2. What is missing from PROD?
3. What is outdated in PROD?
4. Which database objects differ from the expected implementation?
5. Which migrations have not been applied?
6. Which functions have outdated implementations?
7. Which RLS policies are missing or incorrect?
8. Which Storage policies are missing or incorrect?
9. Which reference and configuration data is required?
10. Exactly which repository files and SQL scripts must be applied to PROD?

Do not limit the analysis to the Tasks module.

Inspect every database requirement arising from `task.docx`, `plan.md`, the current application code and its dependencies.

## 30.2 Three-way comparison

Perform a three-way analysis:

A. Repository expected database implementation.

B. Actual UAT database implementation.

C. Actual PROD database implementation.

Create a comparison table:

| Database object | Repository expected | UAT state | PROD state | Difference | Required action |
| --------------- | ------------------- | --------- | ---------- | ---------- | --------------- |

Include:

- Tables.
- Columns.
- Data types.
- Defaults.
- Constraints.
- Foreign keys.
- Indexes.
- Functions.
- Function signatures.
- Function definitions.
- Triggers.
- Views.
- RLS policies.
- Grants.
- Storage buckets.
- Storage policies.
- Required reference data.
- Migration history.

Do not assume UAT is perfect.

The repository and documented requirements are the primary implementation references. UAT is an important comparison environment, not an unquestionable source of truth.

## 30.3 Full migration inventory

Inspect EVERY SQL migration in:

- `supabase/migrations/`
- `supabase/upgrades/`
- `supabase/storage/`
- All other relevant SQL directories.

Do not limit the review to the three original Tasks migrations.

Include the subsequently introduced Work and Storage changes.

Inspect migrations related to:

- Employee positions.
- Shift functions.
- Employee management.
- Organization structure.
- Reporting lines.
- Departments.
- Locations.
- Authentication.
- Authorization.
- Tasks.
- Notifications.
- Activity history.
- Attachments.
- Storage.
- Other application modules.

For each migration establish:

- Exact filename.
- Full path.
- Purpose.
- Dependencies.
- Schema changes.
- Function changes.
- Data changes.
- Security changes.
- Whether it has already been applied in UAT.
- Whether it has already been applied in PROD.
- How its application status was verified.
- Whether it is required in PROD.
- Exact execution position.

Never conclude that a migration is missing solely because its history entry cannot be read.

Compare migration history with actual database objects and function definitions.

Clearly distinguish:

- CONFIRMED APPLIED.
- CONFIRMED NOT APPLIED.
- PARTIALLY APPLIED.
- HISTORY MISMATCH.
- UNKNOWN — INSUFFICIENT DATABASE ACCESS.

## 30.4 Identify all missing or outdated Production objects

Prepare a detailed missing-object report.

Include:

- Missing tables.
- Missing columns.
- Missing constraints.
- Missing indexes.
- Missing functions.
- Outdated function definitions.
- Missing triggers.
- Missing RLS policies.
- Incorrect permissions.
- Missing Storage policies.
- Missing buckets.
- Incorrect bucket configuration.
- Missing reference records.
- Incorrect reference values.
- Incompatible API contracts.

For function differences, compare actual deployed definitions with the expected repository implementation.

Where available, use normalized definitions or hashes to detect differences.

Do not compare only function names.

Function signatures, parameter types, return types, security-definer behavior, search_path, grants and function bodies matter.

## 30.5 Complete Production deployment file inventory

Produce an exact list of every file that must be considered for Production deployment.

Use this table:

| Order | Exact file path | Purpose | Required for PROD | Dependency | Risk | Execution method |
| ----- | --------------- | ------- | ----------------- | ---------- | ---- | ---------------- |

Separate:

A. Mandatory SQL migrations.

B. Additional SQL upgrade scripts.

C. Storage policy scripts.

D. Reference-data provisioning scripts.

E. Frontend files that depend on the database changes.

F. Backend or Edge Function deployment files, if applicable.

G. Environment and authentication configuration.

H. Documentation and operational instructions.

Clearly mark files that must NOT be deployed.

Do not copy UAT test data, UAT test employees, UAT Auth accounts or UAT-specific identifiers into Production.

## 30.6 Complete SQL preparation package

Create a dedicated directory:

`supabase/upgrades/prod/`

Prepare separate SQL scripts for Production.

At minimum:

1. `prod_preflight.sql`
2. `prod_migration_history.sql`
3. `prod_schema_inventory.sql`
4. `prod_function_inventory.sql`
5. `prod_policy_inventory.sql`
6. `prod_employee_inventory.sql`
7. `prod_reference_data_inventory.sql`
8. `prod_gap_analysis.sql`
9. `prod_postflight.sql`
10. `prod_acceptance_checks.sql`

All scripts intended for preflight and inventory must be READ-ONLY.

Clearly identify which SQL files contain actual migration statements and which only inspect the database.

Never mix inspection queries with write operations.

Prepare exact copy-paste SQL instructions for an authorized Production operator.

Do not execute any Production writes.

## 30.7 Production dependency and deployment plan

Determine the exact safe application order.

Check:

- Dependencies between migrations.
- Dependencies between functions and tables.
- Dependencies between triggers and functions.
- Dependencies between RLS policies and authorization functions.
- Dependencies between Storage policies and attachment validation functions.
- Frontend compatibility with database function signatures.
- Required deployment order for backend and frontend.
- Any required configuration changes.

Identify older pending migrations that are unrelated to the requested functionality.

Do not blindly apply every migration just because it exists in the repository.

However, do not skip a migration that is a genuine dependency.

Explain every inclusion and exclusion.

## 30.8 Production migration safety

For each proposed Production update document:

- Whether existing data changes.
- Whether existing rows are backfilled.
- Whether tables are locked.
- Expected execution duration risk.
- Transaction behavior.
- Idempotency.
- Rollback strategy.
- Recovery requirements.
- Required privileges.
- Post-execution verification.

Flag migrations that cannot be safely rerun.

Never invent rollback scripts.

Where rollback is unsafe, explain whether restoring a backup or applying a forward correction is appropriate.

The developer must approve Production changes separately.

---

# 31. COMPLETE EMPLOYEE MANAGEMENT BUSINESS LOGIC — UKRAINIAN DOCUMENTATION

## 31.1 Objective

Create comprehensive documentation explaining how employee management works throughout the actual application.

The documentation must be written in Ukrainian.

Do not produce generic HR explanations.

Derive every explanation from actual:

- Frontend components.
- Forms.
- Hooks.
- API services.
- Supabase RPC calls.
- Database schema.
- Migrations.
- Triggers.
- RLS policies.
- Authorization functions.
- Existing tests.

The documentation should be understandable to a business manager and technically accurate for another developer.

## 31.2 Complete Employee database model

Inspect the complete current schema of:

`public."Employees"`

Previously observed fields include:

- `id`
- `created_at`
- `name`
- `role`
- `location_id`
- `active`
- `auth_user_id`
- `pin_hash`
- `archived_at`
- `department_id`
- `production_role`

Do not assume this list is complete.

Inspect actual columns, constraints, types, defaults, foreign keys, indexes and triggers.

Explain every field in Ukrainian.

Produce:

| Database field | Українська назва | Призначення | Обов'язковість | Хто змінює | Залежності |
| -------------- | ---------------- | ----------- | -------------- | ---------- | ---------- |

Explain:

- Which fields are mandatory.
- Which fields are optional.
- Which values are automatically generated.
- Which fields are user-editable.
- Which fields affect login.
- Which fields affect permissions.
- Which fields affect task assignments.
- Which fields affect production processes.
- Which fields affect organization structure.

## 31.3 Positions, roles and production roles

Investigate the exact distinction between:

- Job position.
- Application access role.
- Employee role.
- Production role.
- Department.
- Location.
- Managerial responsibility.
- Workflow responsibility.

Do not assume these concepts are interchangeable.

Inspect all position-related migrations, especially:

`202610260001_employee_positions`

Determine how positions are stored and assigned.

Inspect all role-related database fields and permission functions.

Explain every actual role and position value found in the repository and database.

Create a complete Ukrainian mapping:

| Назва | Database value | Що означає | Які права дає | На що впливає |
| ----- | -------------- | ---------- | ------------- | ------------- |

Explain which roles:

- Control application access.
- Control employee management permissions.
- Affect task visibility.
- Affect task assignment.
- Affect approval workflows.
- Affect production operations.
- Are only descriptive or organizational.

Do not infer permissions from a role name without checking actual authorization logic.

## 31.4 Employee statuses and lifecycle

Investigate actual employee lifecycle behavior.

At minimum inspect:

- `active`
- `archived_at`
- `auth_user_id`
- PIN-related state.
- Invitation state.
- Authentication state.
- Any additional status fields.

Explain the difference between:

- Active employee.
- Inactive employee.
- Archived employee.
- Auth user without an Employee.
- Employee without an Auth account.
- Invited user.
- Confirmed user.
- Employee with an unlinked account.

Explain what happens to:

- Login.
- Tasks.
- Notifications.
- Activity history.
- Reporting lines.
- Production responsibilities.
- Employee visibility.
- Historical records.

Explain activation, deactivation, archiving and reactivation using actual code behavior.

## 31.5 Complete employee creation workflow

Trace the actual employee creation workflow from frontend to database.

Explain in Ukrainian:

1. Which screen opens employee creation.
2. Which form or dialog is used.
3. Who is authorized to create employees.
4. What information is entered.
5. Which fields are mandatory.
6. How validation works.
7. Which API or RPC is called.
8. What database records are created.
9. Which triggers execute.
10. Whether an Auth user is automatically created.
11. Whether the invitation is sent automatically.
12. How `auth_user_id` is assigned.
13. How login access becomes available.
14. How PIN authentication works, if supported.
15. How the position is assigned.
16. How the application role is assigned.
17. How production role is assigned.
18. How department and location are assigned.
19. How reporting lines are created.
20. What default values are applied.
21. How errors and partial failures are handled.

Clearly separate:

A. Employee record creation.

B. Supabase Auth user creation.

C. Email invitation.

D. Auth-to-Employee linking.

E. Access permissions.

F. Organizational hierarchy.

G. Production responsibilities.

Explain whether these steps happen in a single transaction or several independent operations.

If there is no public registration screen, explain the actual administrator-controlled provisioning process.

Include the invitation redirect and confirmation process.

Document common invitation failures, including obsolete deployment URLs and invalid redirect configuration, if applicable.

Do not invent functionality.

## 31.6 Authentication and account linking

Explain the actual relationship:

`auth.uid()` → `Employees.auth_user_id` → Employee record.

Inspect every relevant resolver and authentication guard.

Explain the exact conditions for successful application access.

Explain the actual meaning of:

"Brak dostępu. Konto musi być połączone z aktywnym pracownikiem. Skontaktuj się z managerem."

Document:

- Missing Employee.
- Inactive Employee.
- Archived Employee.
- Invalid or duplicate Auth mapping.
- Unconfirmed Auth user.
- Missing permissions.
- Login session problems.

Provide safe administrator instructions for account linking, unlinking and recovery.

Never expose passwords, PIN hashes, tokens or service-role keys.

## 31.7 Organizational hierarchy

Inspect:

`public."Employee_reporting_lines"`

Investigate its complete schema and related functions.

Explain:

- Which column represents the manager.
- Which column represents the subordinate.
- How reporting relationships are created.
- Whether multiple managers are supported.
- Whether relationships have dates or history.
- How cycles are prevented.
- Who may change reporting lines.
- How reporting lines affect access.
- How reporting lines affect task visibility.
- How they affect notifications.
- How they affect approval flows.

Provide Ukrainian diagrams and real examples.

Do not confuse an organizational reporting line with a task's `parent_task_id`.

## 31.8 Permissions matrix

Create a real permission matrix using backend authorization and RLS as the source of truth.

Include:

- Employee.
- Manager.
- Administrator.
- All other actual roles found.

For each role verify permissions for:

- View employees.
- Create employees.
- Edit employees.
- Activate and deactivate.
- Archive and reactivate.
- Assign positions.
- Change application roles.
- Change production roles.
- Link Auth accounts.
- Manage reporting lines.
- View subordinate information.
- Assign tasks.
- View tasks.
- Manage approvals.
- View notifications.
- Manage production responsibilities.

Mark each permission:

- ALLOWED.
- DENIED.
- CONDITIONAL.
- NOT IMPLEMENTED.
- NOT VERIFIED.

Explain the conditions.

---

# 32. COMPLETE UKRAINIAN EMPLOYEE DOCUMENTATION

Create four separate documents.

All explanatory text must be written in Ukrainian.

## 32.1 Employee Management Business Logic

File:

`docs/employee-management-business-logic-uk.md`

Explain:

- Overall employee management architecture.
- Employee data model.
- Positions.
- Roles.
- Production roles.
- Departments.
- Locations.
- Employee statuses.
- Employee creation.
- Account invitation.
- Account linking.
- Authentication.
- Reporting hierarchy.
- Permissions.
- Employee lifecycle.
- Deactivation and archiving.
- Task assignment.
- Notifications.
- Common errors.
- Real workflow examples.

This should be the main business explanation for managers and developers.

## 32.2 Employee Data Dictionary

File:

`docs/employee-data-dictionary-uk.md`

Document:

- Every Employee-related table.
- Every field.
- Data types.
- Nullability.
- Defaults.
- Constraints.
- Foreign keys.
- Indexes.
- Triggers.
- Related functions.
- Actual reference values.
- Ukrainian explanations.

Include reporting lines, positions, departments and locations.

## 32.3 Employee Provisioning Runbook

File:

`docs/employee-provisioning-runbook-uk.md`

Provide exact operational instructions for:

- Creating an Employee.
- Creating or inviting an Auth user.
- Confirming an invitation.
- Linking Auth to Employee.
- Assigning a position.
- Assigning application roles.
- Assigning production roles.
- Assigning departments.
- Assigning locations.
- Creating reporting relationships.
- Activating employees.
- Deactivating employees.
- Archiving employees.
- Restoring employees.
- Recovering access.
- Replacing or relinking Auth accounts.

For each operation include:

- Required permissions.
- Exact UI path.
- Required information.
- Expected result.
- Verification queries.
- Common errors.
- Safety considerations.

Prefer supported application flows over manual SQL.

## 32.4 Production Database Deployment Guide

File:

`docs/production-database-rollout-uk.md`

Document:

- UAT versus PROD.
- Actual Production differences.
- Missing database objects.
- Required migrations.
- Exact migration files.
- Additional SQL scripts.
- Reference data requirements.
- Execution order.
- Preflight checks.
- Backup strategy.
- Manual SQL Editor instructions.
- Postflight checks.
- Migration history synchronization.
- RLS and Storage verification.
- Application deployment dependencies.
- Rollback and recovery.
- Production acceptance criteria.

Do not state that Production has been updated.

---

# 33. EMPLOYEE AND PRODUCTION SQL INVENTORY

Create a dedicated directory:

`supabase/upgrades/prod/`

Prepare separate read-only SQL files to inspect:

- Employee schema.
- Employee records and statuses.
- Position tables and values.
- Application roles.
- Production roles.
- Departments.
- Locations.
- Reporting lines.
- Authentication-to-Employee mapping.
- Employee creation functions.
- Employee management RPCs.
- RLS policies.
- Permissions.
- Triggers.
- Required reference data.

Include a separate query showing active Employees without Auth accounts and Employees associated with Auth accounts.

Do not expose personal information unnecessarily.

Prefer IDs and status fields.

All files marked READ-ONLY must contain only read-only queries.

Do not execute Production modifications.

---

# 34. CRITICAL UAT DATA SEPARATION

UAT contains test employees and test accounts.

Examples include:

- UAT Su-chef B.
- UAT Employee E.
- UAT Unlinked.

These records are test fixtures.

Do not copy them into Production.

Do not copy UAT Auth UUIDs into Production.

Do not copy UAT employee IDs into Production.

Do not assume test positions, roles, departments or reporting lines are valid Production reference data.

For each required Production reference value, determine its legitimate business source.

Prepare separate provisioning instructions for required Production configuration.

---

# 35. FINAL COMBINED ACCEPTANCE REPORT

Produce a comprehensive report in Ukrainian with these sections:

A. Overall project requirement compliance.

B. Full repository module coverage.

C. UAT versus PROD database comparison.

D. Exact Production database differences.

E. Exact SQL files required for PROD.

F. Exact execution order and dependencies.

G. Missing functions, tables, indexes, triggers and policies.

H. Employee database architecture.

I. Complete explanation of positions, roles and production roles.

J. Employee statuses and lifecycle.

K. Employee creation and provisioning workflow.

L. Authentication and Employee linking.

M. Organizational hierarchy and reporting lines.

N. Employee permissions matrix.

O. Practical Ukrainian employee administration instructions.

P. Notification system integration.

Q. Security and RLS findings.

R. Required local and remote tests.

S. Remaining blockers and unknowns.

T. Production rollout readiness.

For every major conclusion provide evidence from actual code, SQL or test results.

Clearly distinguish:

- VERIFIED IN CODE.
- VERIFIED IN UAT.
- VERIFIED IN PROD.
- PARTIALLY VERIFIED.
- BLOCKED.
- INFERRED.
- NOT IMPLEMENTED.
- UNKNOWN.

The overall status must not be READY FOR PRODUCTION if the actual PROD schema has not been inspected or important Production dependencies remain unknown.

Confirm that:

- No Production changes were executed.
- No Git commits were created.
- No files were staged.
- Nothing was pushed.
- Existing UAT and Production data were preserved.

---

# 36. FINAL EXECUTION DIRECTIVE

Start by inspecting the complete repository and reading all primary requirements documents.

Then:

1. Inventory the entire database.
2. Audit every migration.
3. Compare repository, UAT and PROD.
4. Identify every Production database gap.
5. Prepare exact SQL deployment files and instructions.
6. Inspect the full Employee management implementation.
7. Derive the actual business logic.
8. Write the Ukrainian documentation.
9. Verify documentation against code and SQL.
10. Produce the final combined report.

Do not apply Production database changes.

Do not assume that UAT test data belongs in Production.

Do not invent business rules.

Do not skip employee provisioning, position management, organizational roles or authorization.

The result must enable the developer to understand exactly what needs updating in Production and how the employee management system actually operates, without requiring guesswork.
