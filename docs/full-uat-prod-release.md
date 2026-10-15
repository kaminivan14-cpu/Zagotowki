# Full UAT → Production release gate — 2026-10-15

Current status: **BACKEND PASS; STOP before frontend — four Audit Storage policies missing.**

## Continuation: backend applied 2026-10-15

Applied individually with release journal entries:
- `202610130001_audit.sql` → `full_uat_audit_20261013`
- `202610150001_task_process_schedules.sql` → `full_uat_schedules_20261015`

Latest applied migration: `202610150001`; Production continues using its existing
private release journal, not a fabricated standard migration history.
The private audit-photos bucket and public.audit_photo_access now exist. **The
manual policy instructions below can now be executed.** No Storage policies,
employee-avatar rules, system owners, Orders configuration or frontend changed.

Preflight: six modified functions/ACL and affected columns/constraints matched the
tested baseline. Production's role_has_permission exclusion policy differs from
UAT intentionally and was preserved byte-for-byte and ACL-for-ACL. Full DDL
rehearsal rolled back successfully. Each committed migration had guards for
expected function definitions/ACL, unchanged original function definitions,
existing table ACL/RLS and business counts. Existing policies stayed identical;
final affected schema columns/constraints match the local upgraded baseline.

Targeted release validation:
- 17 Node/PGlite tests PASS.
- Local real PostgreSQL Audit upgrade/concurrency/capability suite PASS.
- 9 focused Audit/diagram/i18n browser cases PASS after updating one stale test
  assertion from the pre-i18n Polish module label to the shipped Ukrainian label.
  Only test text changed; no new application behavior was implemented.
- lint and Production build PASS using the verified Production public anon key
  only in process memory. Initial build correctly rejected the local UAT env;
  build safety was not weakened.
- Production rollback-only smoke PASS: Audit create/edit/snapshot/retry/complete/
  history/immutability; Tasks defaults/recurrence/retry; Process role resolution/
  launch/schedule/deadlines/central Tasks/dependencies/blocked→ready/completion/rating.
- Read-only transaction smoke PASS under authenticated role: auth profile,
  capabilities, Admin/Access/Organization/Worktime. Initial harness used the API
  read-only role and was denied auth_employee_profile; corrected to authenticated
  inside the test transaction. No grants were changed. Real credential login was
  not performed.
- Test Audit records/templates: 0; smoke Tasks retained: 0. New-menu template: 1.
  Business records were rolled back; normal PostgreSQL sequence gaps may remain.

No PR, merge, Production Vercel deployment or final frontend smoke yet. Stop at
manual Storage gate. No rollback currently required. Audit photo HTTP operations
remain unverified until policies exist. Full-app translation remains partial;
recurrence stores pending schedules and does not claim an active automatic
scheduler (existing UAT limitation; no new worker added during release).

## Initial preflight record (before backend continuation)

Production was queried read-only during the initial gate below.

## Source discovery

Fetched origin before preparation. Production/main: `68d4d0ee14b654586c9d9446e61b7b87ae060e18`.

| Source | SHA | Ahead / behind main | Merge base |
| --- | --- | --- | --- |
| codex/audyt-mvp | bc4977d5d2c7d715bd43aafee56f16e18a94d443 | 1 / 0 | 68d4d0e |
| feature/audyt-integration | f5d22540c22e644bac5b81796fda227b1cb940e2 | 2 / 0 | 68d4d0e |
| codex/processes-uat-v2 | 8965c993aeb336313b7b8dae473811e5b1db717e | 0 / 5 | 8965c99 |
| feature/tasks-processes-i18n | eb6f38218ee1768ddee8d733613599e8d7f0ee92 | 7 / 0 | 68d4d0e |

Created `release/full-uat-prod` from refreshed origin/main and cherry-picked only:

| UAT commit | Release commit | Change |
| --- | --- | --- |
| a36711e | 025755d | Integrated Audit MVP (Paweł source bc4977d) |
| f5d2254 | fb1b623 | Audit capability hardening / upgrade evidence |
| 736ae1c | 6076f65 | Tasks defaults, recurrence, deadlines, i18n foundation |
| a8355b4 | fb043a4 | Thin DAG connectors / target rewiring |
| f1bd0eb | 8d421d6 | Direct arrow drag |
| 5b78004 | 6547619 | Stage grouping / create dependency from task |
| eb6f382 | b726214 | One-step dependency undo |

Release code tree at b726214 equals UAT eb6f382 exactly. No conflicts or older-main overwrite.

## Database observations

Confirmed project identities: Production `ssheqxdgsmndiutthxvd` / First Zagotowki;
UAT `meuzkduxttjcuiynsnaa` / Zagotowki - UAT.
Read-only snapshots: local ignored `tmp/full-uat-prod/`, including functions/ACL,
columns, constraints, indexes, table grants/RLS, policies and release history.
These are schema snapshots, not a new full data backup or a completed drift PASS.

Release branch adds these migrations, in order:
1. `202610130001_audit.sql`
2. `202610150001_task_process_schedules.sql`

Both exist in UAT standard history; UAT head `202610150001`.
Production has no standard `supabase_migrations.schema_migrations`; existing
`app_private.production_module_releases` and `production_upgrade` are authoritative.
Latest release journal entry: `organization_processes_uat_v2`, 2026-10-08
20:34:32.771405+00. Earlier Orders ingestion/location/callback entries remain present.
Do not infer that all standard UAT migrations are missing or replay the baseline.
Detailed per-object baseline comparison/rehearsal remains pending at this STOP.

Production has no Audit tables, no audit-photos bucket, and none of the four
Audit Storage policies. UAT has all four policies (Dashboard suffixes on some
names), authenticated only. UAT bucket is private, 10485760 bytes, MIME:
image/jpeg, image/png, image/webp, image/heic, image/heif.

## Required order and manual Storage step

The Production Audit backend helper does not yet exist. **Do not attempt policy
creation before the Audit backend migration.** Resume with baseline/drift and
local upgrade verification, apply only the verified additive backend migrations,
then perform the manual Storage gate, then PR/checks/review/frontend.

In Supabase Dashboard select **First Zagotowki / ssheqxdgsmndiutthxvd** → Storage
→ Policies for private bucket `audit-photos`, after the backend creates it.
Create exactly these policies for `authenticated`:

| Name | Operation | Expression |
| --- | --- | --- |
| audit_photo_read | SELECT / USING | `bucket_id='audit-photos' AND public.audit_photo_access(name,'read')` |
| audit_photo_insert | INSERT / WITH CHECK | `bucket_id='audit-photos' AND public.audit_photo_access(name,'insert')` |
| audit_photo_delete | DELETE / USING | `bucket_id='audit-photos' AND public.audit_photo_access(name,'delete')` |
| audit_photo_cleanup_read | SELECT / USING | `bucket_id='audit-photos' AND public.audit_photo_access(name,'delete')` |

Exact SQL: `supabase/storage/audit-photo-policies.sql`. No UPDATE, anon, ownership
changes or expanded system grants. Existing employee-avatars policies must remain
unchanged. Verify policies read-only before frontend deploy. If the Dashboard
cannot create exactly these policies, stop; do not bypass ownership protections.

## Evidence and limits

Reuse UAT release evidence in audit-uat-integration.md, tasks-processes-i18n-uat.md
and process-diagram-uat.md: Audit 4 Node/DB + PostgreSQL upgrade/concurrency + 5
browser; Processes PostgreSQL 104 checks; Tasks/recurrence 21 targeted tests and
14 browser; final diagram 12 model tests and 6 focused browser tests, lint/build:uat.
These overlap and must not be summed as a unique full-suite count.
No new Production build, backend smoke, full drift PASS or Production login
result is claimed in this stopped preflight. RLS/capability rollout remains pending.

Localization is partial: Processes/Create Task and shared navigation are covered;
full body translations for remaining modules are documented as incomplete in
 tasks-processes-i18n-uat.md. No new translation development added during release.
Orders behavior/callback destination remains untouched. No template seed imported.

PR URL, merge commit, deployed Production SHA and final smoke: **not performed**.
Frontend release remains blocked until backend and manual Storage verification PASS.
