# Manager email authentication rollout

## Production invitation-only recovery — 2026-10-05

The deployed frontend was ahead of its backend. Read-only comparison found that
both UAT and Production lacked `auth_email_access`, `auth_invite_command`, and
`app_private.employee_invitations`. Their invite-employee v1 bundles were identical.
Production uses `app_private.production_module_releases`, not the CLI migration table.

Applied `supabase/upgrades/production/08_invitation_backend.sql` on Production only,
recorded as `employee_invitation_v1`. This creates the private RLS audit/reservation
table, unique pending-per-employee index, and two RPCs. It changes no existing
Employees/Auth rows, PIN eligibility, existing functions, existing grants or policies.
Only active owner/administrator callers can invite active email-role employees;
only service_role can execute the command, and Edge verifies the caller JWT.
The existing invite-employee was updated from v1 to v2 to use this reservation flow.
No secrets, Auth URL configuration, other Edge functions, frontend or main changed.

Do **not** run the combined `202610070001_manager_email_auth.sql` on this Production
baseline: its invitation objects now exist. Any remaining PIN or test-account cleanup
must be reconciled into a separate reviewed upgrade. No test-account cleanup was run.
Existing technical Auth links still require explicit identity cleanup before invitation;
they are not silently replaced. ID 12 is eligible for invitation; ID 2 remains linked
to technical Auth; ID 8 remains inactive/linked. No employee record was merged or added.

Evidence: encrypted backup `backups/production-gate-20261005T204708Z`, with metadata,
SHA256 checksums and full local restore verification. Canonical comparison passed
with the documented local GraphQL grants and verified extension owner/grantor drift.
The exact upgrade also passed on that restored copy as postgres with Employees
unchanged. Local tests: 298 upgrade checks, 125 Node tests, 20 browser tests,
Orders 33 + 189 database checks, Tasks 164, Worktime 58, Processes 66; lint/build:uat PASS.
Production smoke: administrator access-state RPC PASS; correct-origin preflight 204,
foreign origin 403, unauthenticated POST 401. No real invitation email was sent.
Retry/concurrency and linking are covered with synthetic local accounts; live email
delivery/acceptance remains a manual smoke after the frontend PR is reviewed.

The following original full-rollout plan is historical and must not be replayed unchanged.

Branch: feature/manager-email-auth. Production project: ssheqxdgsmndiutthxvd.
No new manager account or email is created during cleanup. No UAT rollout requested.

## Model

Email/password: administrator, manager, director, expert, specialist.
PIN: su-chef, shift-manager, sushi-master, crafter, legacy employee.
Existing owner authorization is preserved; no new owner invitation path is introduced.
Employees.role/production_role and all existing capabilities are unchanged.

Migration 202610070001_manager_email_auth.sql removes manager from PIN verify/confirm/admin and legacy provisioning candidates/prepare/finish. Deprecated pre-cutover PIN RPC execution is revoked (the current production-role PIN flow is unchanged). Historic manager hashes can remain while auth_user_id is NULL. No Employees or Auth rows are changed by the migration itself.

## Invitations

Existing invite-employee uses service-only auth_invite_command, with verified caller identity. Only an active owner/administrator may invite an active email-role employee. A durable per-employee reservation prevents concurrent delivery. Existing Auth email conflicts never link accounts by email. Completion checks the employee remains unlinked and matches the reserved email, and records actor, target, timestamp, outcome and Auth UUID. An uncertain provider/network result retains the reservation: no automatic resend or guessed recovery. An administrator must reconcile Auth/provider results before releasing it.

The service_role-only former auth_link_employee helper is revoked to prevent bypassing the reservation. Deploy the new invite function immediately after the migration; the old function fails closed in that interval.

Access state uses Auth email, confirmation, password presence and ban state, not mere UUID presence. Pending/uncertain requests are shown separately from confirmed sent invitations. A technical PIN identity must first go through the explicit cleanup, never automatic UI unlinking.

## Deployment gates and exact order

1. Complete Node, isolated browser, PostgreSQL upgrade and module regressions; lint and build.
2. Push feature/manager-email-auth, open PR to main, obtain required review and green checks. Do not use Keychain or user sessions for authentication.
3. Fresh encrypted full Production backup using docs/production-release-readiness.md, verify archive/restore, capture migration journal and schema. Compare affected function definitions, grants, Employees constraints and dependencies against the read-only baseline. Drift mismatch stops rollout.
4. Apply only 202610070001_manager_email_auth.sql, transactionally; retain its SHA256 in the private release journal. Verify role_permissions and all Employee/business records unchanged.
5. Deploy only invite-employee, verify_jwt=false as before (handler verifies the JWT with Auth); exact Production CORS origin. Never deploy other Edge functions.
6. Merge reviewed PR; verify Vercel Production SHA equals merged main. No UAT generator.
7. Set Auth Site URL to https://zagotowki.vercel.app, preserving redirect https://zagotowki.vercel.app/?auth=password and other verified required redirects.
8. Immediately before cleanup recheck FK/dependencies and files for Employee 2 and 8, expected manager roles and technical Auth mapping. Any new dependency requires review.
9. Execute supabase/upgrades/production/07_manager_test_accounts.sql only after verifying the Production project. It preserves Employees and PIN hashes, audits old UUIDs, detaches Auth and removes their obsolete pin_accounts. It is idempotent only against its own audit record.
10. For each recorded old UUID use trusted Auth Admin updateUserById with ban_duration='876000h'. Do not delete Auth users. Verify banned_until. A ban is not immediate JWT invalidation; old JWTs must fail profile/capability/business access because they no longer map to an Employee. Do not obtain or print real-user tokens for smoke.
11. Verify both employees show no email access and invite action. New accounts will be invited manually by the administrator later; do not invent email addresses or claim live email/password smoke without an actual user test.

## Recovery

No restoration of the test managers' old login is required. Keep old Auth identities banned. Never restore the whole database over newer business data as an automatic rollback. On uncertain invitation keep its reservation and investigate privately. On backend/deployment failure stop further changes, preserve the audit, and report exactly which transaction/deployment completed. Historic UUIDs remain in the audit and banned Auth records.

## Security and evidence

No new RLS policies or direct client table grants; all invitation tables are private with RLS enabled. Service credentials remain in Edge only. Logs contain operation/actor/Employee IDs and safe stages, never email, PIN, tokens or provider exception details. Business history uses Employee IDs. Storage paths use Auth UUIDs; the audited Production tables were empty, but this must be checked again at cleanup time.

## Local verification before PR

- Node: 122 PASS.
- Full isolated Chromium headless: 156 PASS (one worker). Initial parallel run had timing failures under load; the fresh complete sequential run passed.
- Production legacy upgrade + new migration + cleanup/reinvite + all remaining PIN roles: 284 checks PASS.
- Tasks PostgreSQL: 164 PASS; Admin/Processes: 66 PASS; Worktime: 58 PASS; Orders: 33 PASS.
- Existing plan-items migration/idempotency/security suite PASS; lint and build:uat PASS.
- These are local synthetic tests, not live Production email/password/PIN login claims.
- Production migration, Edge deployment, Auth Site URL correction and employee cleanup have NOT been applied at this checkpoint. PR/checks, fresh backup/drift and deployment remain gates.
