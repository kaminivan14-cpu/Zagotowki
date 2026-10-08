# Organization structure v2 — UAT first

Branch: `feature/org-structure-v2`, based on `origin/main` at `d145b00`.
Production deployment is not authorized before UAT manual validation.

## Model and authority

Employees remains the identity/person table; roles, login, production_role and
business history are not copied or converted. New version assignments contain only
Employee/Department foreign keys and reporting links. Department directors have one
row per department/version. No director is inferred from a person's system role.

Before adoption, current/historical reporting uses existing Employee_reporting_lines.
First draft creation freezes a baseline snapshot for today, then copies it into a
separate draft. Existing future legacy reporting dates or overlapping intervals
block adoption rather than silently losing them. Earlier dates continue to use the
legacy reporting source. Historical department placement before adoption is not
available because the legacy model never recorded department history.

`app_private.org_version(date)` chooses the applicable published snapshot directly
by date, including scheduled versions whose effective date has arrived. No browser,
cron timing, or employee-field materialization determines routing. One future version
may be scheduled at a time. Publishing is atomic under a shared graph lock and has
optimistic revisions. Published/cancelled versions remain immutable.

`org_activate_due()` updates active/archived metadata and writes one activation audit
entry transactionally; retries are no-ops. A Supabase Cron job calls it every minute.
The job may record actual observation shortly after midnight; routing uses the exact
company date regardless. Scheduling/cancellation commands also reconcile due metadata.
Cancellation after the effective date is forbidden. There is no automatic destructive rollback.

## Permissions and integration

Only the new `organization.manage` capability (initially owner/administrator) can
create/edit/schedule/cancel. Reading requires existing tasks.admin. Direct access to
new tables and private helpers is revoked, with RLS enabled. Public RPCs validate the
current actor in the backend. No service_role is used in the frontend.

Existing capabilities and explicit scope grants are preserved. Manager/director
hierarchy scopes use versioned reporting; department grants use the versioned
employee department. A director title alone does not create new permissions/grants.
Task creation/reassignment snapshots the effective department. Planning, queue,
reporting, and Processes continue using existing central task_scope checks.

New routing after a scheduled version becomes effective selects the available manager,
then designated department director, then the legacy creator fallback, subject to
existing approval capability checks. Baseline adoption preserves legacy creator
priority. Each new Task_approval_request records its organization version. Existing
pending requests retain their original approver and can be resolved even if today's
hierarchy changed, while still requiring tasks.approve and the original assigned
approver (or administrator).

Process templates may retain explicitly chosen reviewers. If none is chosen, the
backend resolves the reviewer at task creation, recording both reviewer and structure
version in the task's step metadata. Existing process tasks are never rerouted.

After baseline adoption, legacy department/reporting writes are blocked with
ORG_USE_VERSION. Nonstructural employee edits remain available. Legacy fields are
not materialized: consumers in this scope use the central resolver. New employees
not in a snapshot appear unassigned and must be included before the next version
can be scheduled. System-role/production-role edits remain separate.

## UI and recovery

Ukrainian current/future/history tabs, owner section, expandable departments and
recursive employee rows. PersonAvatar accepts a future avatar URL; the current model
has no avatar source, so initials are used. No new upload/storage policies.
Draft forms can be closed without saving. Confirmed edits are audited; repair an edit
with another explicit draft edit. Cancel is confirmed and retains the version.

Mutations retain one UUID and payload in sessionStorage across network failures/reloads.
Retry cannot create a second version or assignment. Completed operation responses are
stored server-side and tied to actor/action/payload. Uncertain failures never silently
submit a different operation. PostgreSQL failures roll back the whole command.

## UAT rollout gates

1. Run Node, organization PostgreSQL, Tasks/Processes/Worktime/Orders regressions,
   isolated browser checks (375/768/1440), lint and build:uat.
2. Capture UAT schema and migration history; compare all eight modified helper
   definitions/ACLs with the local pre-migration baseline. Stop on drift.
3. Push this branch and verify Preview uses project `meuzkduxttjcuiynsnaa`.
4. Apply only `202610080001_organization_structure.sql` and record its checksum/history.
   Do not replay the unrelated manager/PIN migration absent from UAT.
5. Enable Cron: UAT Supabase Dashboard → Integrations → Cron → Enable pg_cron.
   Then run `supabase/upgrades/uat/organization_structure_cron.sql` as postgres.
   Verify `cron.job` and a successful `cron.job_run_details` entry. Never run this
   against Production during this iteration.
6. Read-only smoke current tree/permissions. Synthetic UAT mutation smoke must be
   inside a transaction that rolls back. Do not send real approvals or alter real
   reporting without manual validation of a future draft.
7. Manually review owners/directors/unassigned people; prepare a draft, verify current
   remains unchanged, edit reporting, schedule/cancel, and review history. Confirm
   old/new approval routing using controlled test accounts.
8. Production requires a separate reviewed rollout after UAT PASS, with backup/restore
   and fresh drift-check. No merge or Production deploy in this iteration.

Supabase Cron setup follows https://supabase.com/docs/guides/cron/install and
https://supabase.com/docs/guides/cron/quickstart. No system ownership changes are needed.
