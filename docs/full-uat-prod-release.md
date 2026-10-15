# Full UAT → Production release gate — 2026-10-15

Status: **STOP — Production Audit Storage prerequisites missing.**
Production was queried read-only; no migrations, business writes, merge, push or deployment performed.

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
