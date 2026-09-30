# Existing Production Auth upgrade — local implementation, NOT deployed

Target of any FUTURE authorized rollout: `ssheqxdgsmndiutthxvd`.
UAT `meuzkduxttjcuiynsnaa` and all existing applied migrations are unchanged.
Do not run `supabase db push` against legacy Production: it has existing tables but
no Supabase migration history. These files are a separate versioned upgrade path,
not fresh-database migrations. Never execute BASE on that database, and never mark
BASE/Auth/POC migrations applied merely to silence CLI pending migrations.

## Data contract

`Employees.id/name/role/location_id/active/pin_hash` are unchanged by upgrade and
identity provisioning. No PIN input is accepted by the provisioning tool. No hash
is exported, copied into a provisioning journal, rehashed or normalized.

PREPARE adds nullable `auth_user_id`, nullable `archived_at`, and `pin_legacy`.
All legacy profiles (and profiles created by the still-running old system before
CUTOVER) have `pin_legacy=true`. This flag does not grant access: it only permits
4–8 digit login verification against an existing hash. PIN remains a string.
The new assignment/reset API still accepts exactly four digits, hashes with cost
10, and sets `pin_legacy=false`. After CUTOVER new rows default to false.

Existing bcrypt 2a cost 6 and cost 10 are accepted. Other formats fail PREPARE;
there is no automatic reset or conversion. The administrator's old hash stays
stored and marked legacy, but `pin_verify`/`pin_confirm` exclude administrator.
Inactive profiles can be provisioned without activating them. Login and RLS
continue to require active=true; archived implies inactive through a constraint.

The only routine that deliberately changes a PIN is the existing explicit
assignment/reset operation. The migration/provisioning path never calls it.

## PREPARE

1. Obtain separate deployment approval, confirm actual project identity from an
   explicitly targeted read-only connection, and compare live schema to this
   tested contract. Stop on drift. Never relink implicitly or rely on the default
   project alone. Record release SHA and SHA-256 of each SQL file, without secrets.
2. Confirm protected backup/PITR and an isolated restore test. Do not produce
   ad-hoc plaintext dumps of PIN hashes or credentials.
3. Keep the old frontend and old access available. Execute **only**
   `supabase/upgrades/production/01_prepare.sql`, then `02_provisioning_api.sql`, followed by `02b_readiness_coverage.sql`,
   on the verified Production connection. Each file is transactional. No BASE,
   UAT seed, fresh Auth migration or historical POC migration is run.
4. PREPARE deliberately does not revoke old business grants/policies/RPCs. It
   adds the new narrow Auth APIs, private rate-limit tables, PIN verifier, and
   service-only identity provisioning APIs. It creates no Auth users.
5. `app_private.production_upgrade` records the separate upgrade version/phase.
   It is not a fabricated `supabase_migrations.schema_migrations` history.
   Re-running PREPARE fails closed before modifying anything. An interrupted
   transaction rolls back; an already committed stage must be inspected, not
   blindly replayed. If 01 committed and 02 failed, repair/review 02 and apply
   only 02. Do not run 01 again.
6. Before future normal `db push` is enabled, design/review a migration-history
   reconciliation manifest. This path intentionally does not pretend that the
   fresh-database historical migration chain ran on Production.

## PROVISION (without PIN)

1. The operator creates or identifies a confirmed email/password Auth account
   owned by the existing administrator through the supported Auth workflow. The
   administrator chooses their password privately. No credential is placed in a
   command, report or chat. Do not convert this profile to a technical account.
2. Supply `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from an operator secret
   manager to a short-lived process. The key must never be VITE-prefixed. The
   script's URL guard rejects anything except the explicit Production URL.
3. After separate approval, invoke the operator tool in administrator-link mode:
   `node scripts/provision-legacy-employees.mjs --confirm-production ssheqxdgsmndiutthxvd --link-admin <employee-id> <auth-user-id>`.
   IDs are identifiers, not credentials. The SQL checks confirmed real email,
   a password credential, active administrator role, no PIN-account metadata,
   and no conflicting existing link. It preserves the old hash.
4. For the worker batch, invoke the same tool without `--link-admin` and its two
   arguments. It lists only legacy profiles with hashes in the three worker
   roles, including inactive ones. No employee names, hashes, PINs or emails are
   emitted. Results contain employee_id and LINKED / REVIEW_OR_RETRY only.
5. For each employee, `upgrade_pin_prepare` reserves one random
   `<UUID>@pin.prod.invalid` plus provisioning UUID in the private mapping.
   Auth `createUser(email_confirm=true)` creates an account with no password and
   no email delivery. Recovery after a crash finds that same account using its
   reserved email and protected app_metadata. Mismatches fail closed.
6. `upgrade_pin_finish` takes only employee ID/Auth UUID. It locks the row,
   rechecks role/hash presence/legacy flag/account metadata/confirmation and
   conflicting links. It updates **only auth_user_id**, and the private mapping.
   It never sets name, role, location, active or pin_hash. Repeated calls are
   no-ops for the same identity. A batch stops at its first failed employee and
   may be restarted; already linked employees reuse their original account.
7. Do not delete an unlinked Auth account as compensation. Inspect its reserved
   mapping and rerun the same operation after the cause is resolved.

## Ready frontend and backend BEFORE CUTOVER

Environment binding is explicit:

| Runtime | Selector | Required database | Technical domain |
|---|---|---|---|
| Vercel Preview / Edge UAT | VERCEL_ENV=preview / APP_ENV=uat | UAT ref | pin.uat.invalid |
| Vercel Production / Edge PROD | VERCEL_ENV=production / APP_ENV=production | PROD ref | pin.prod.invalid |

Vercel requires `VITE_SUPABASE_URL`, the matching public client key,
`PIN_PROXY_SECRET`, and server-side `APP_URL`. Edge requires `APP_ENV`, `APP_URL`,
`PIN_PROXY_SECRET`, and system-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Do not duplicate platform secrets manually. Secrets
are independent per environment. APP_URL must be an HTTPS origin (no credentials,
path, query or fragment). Cross-environment URL pairs and foreign Origin fail
before a remote SDK call. The browser login accepts 4–8 digits; new assignment UI
and management endpoint remain exactly four digits. No identity/role/location
is accepted from the PIN login client.

Deploy backend/proxy and the reviewed Auth-compatible frontend **before** the
RLS switch, when separately authorized. PREPARE exposes the narrow Auth profile
APIs while the old client remains usable. The new frontend can log in and use the
existing business RPCs; the CUTOVER adds mandatory session guards to those RPCs.
Technical readiness and login coverage are separate. Apply the additive
`02b_readiness_coverage.sql` after the already-applied PREPARE scripts; do not rerun
01 or 02. It replaces readiness in place and adds service-only
`upgrade_login_coverage()`, without updating employee data or Auth timestamps.
A ban is always a technical blocker, including for an inactive linked account.
Missing `last_sign_in_at` does not block a correctly provisioned identity.
Coverage returns LOGIN_TESTED / LOGIN_NOT_TESTED independently of technical readiness.
A timestamp proves only an Auth sign-in, not its method or RLS correctness.

Operator-confirmed representative Production tests: administrator ID 1 email/password
PASS and manager ID 2 PIN PASS. IDs 3–7 have NOT been reported login-tested.
Do not collect or reset their PINs to obtain coverage. Keep the representative test
record as a separate operational gate; technical READY alone is not rollout approval.
Verify all active workers
have a linked PIN identity and all non-null worker PINs (including inactive)
have mappings. More than 32 hashed profiles fail readiness for this bounded POC.

Compatibility must include existing open tabs and cached assets: communicate a
reload, and ensure every working client has the compatible frontend before the
switch. Old anonymous tabs will lose business access at CUTOVER. This code cannot
prove Vercel deployment readiness or guarantee zero downtime across two hosted
services. Do not cut over solely because the SQL readiness query is green.

## CUTOVER

1. Run `upgrade_readiness()` read-only and resolve every non-READY row. Confirm
   separate `upgrade_login_coverage()` output and representative test evidence; do not
   infer full login coverage from technical READY.
2. Independently confirm compatible frontend release, backend, redirect settings,
   smoke results, backup and rollback release. Freeze employee administrative
   edits for the short cutover window.
3. On the same explicitly verified connection, set session setting
   `app.rollout_frontend_release` to the verified immutable release SHA, then run
   `03_cutover.sql`. Do not set this marker before confirming the release.
4. The script takes an employee-table lock, rechecks technical identities/bans, adds
   constraints, switches policies/grants and wraps business RPCs with auth.uid()
   guards in **one transaction**. Failure rolls back the whole switch, leaving
   the old access model in place. Success records phase=cutover and the release.
5. New Auth APIs remain callable as appropriate; old login/create/change/update/
   list/active RPCs lose PUBLIC/anon/authenticated execution. Legacy definitions
   are retained. No Employees/Auth row is deleted. No hash is updated.

## VERIFY

Run `04_verify.sql` read-only. Check phase, identities, legacy counts, RLS and
revoked old RPC grants. Then smoke-test actual administrator/recovery and workers
using their own old PINs, current-day/location restrictions, START/GOTOWE, session
refresh, logout, deactivate/reactivate and history. Existing sync-products must
still work; its remote implementation is not in this repository.

## ROLLBACK

- Failure inside a SQL stage: PostgreSQL rolls back that transaction. Inspect
  phase before deciding what remains. Do not retry blindly after an uncertain
  connection loss.
- Before CUTOVER: stop the rollout, retain the old frontend/access plus additive
  objects and reserved/created identities. No credentials are reset. Restart the
  idempotent provisioning process after review.
- After CUTOVER: use a **previously verified Auth-compatible** frontend/backend
  release. Retain RLS, Auth links, hashes and tables. Fix forward when possible.
- Do not regrant unsafe anonymous RPCs, restore the pre-Auth frontend alone,
  delete Auth users or DROP upgrade columns/tables as an automatic rollback.
- A full backup restore is a separately approved disaster-recovery decision
  requiring reconciliation of all business writes since the backup.

## Local proof and remaining rollout gates

`tests/production-upgrade.mjs` creates a fresh **synthetic legacy PROD fixture**
from schema-only checked-in audit/legacy function definitions; it does not execute
BASE or any fresh-database Auth migration. The fixture has administrator,
manager, su-chef, employee and inactive employee, bcrypt cost 6 and 4/6/8 digit
PINs with leading zeros. SQL compares every original profile field and hash after
PREPARE, provisioning and CUTOVER; only booleans/counts are returned. Synthetic
hashes never appear in successful/failing assertion output. No Production data
is used. The test also checks failed readiness rollback, old login before
cutover, privileges after cutover, identity spoofing, RLS/production actions,
inactive access, new four-digit PIN and repeat provisioning.

Hosted generateLink/verifyOtp delivery, actual legacy PIN collision handling,
PIN-only enforcement against alternate Auth endpoints, public endpoint abuse/
shared NAT limits, session revocation policy, production SMTP/CAPTCHA settings,
Vercel configuration and sync-products compatibility remain rollout gates.
The four-digit space/rate limits are unchanged from the POC. A login matching
multiple profiles fails closed; never silently choose the first employee or
reset a PIN. Operator decision is required if that occurs.

No remote action is authorized by this document. The current implementation is
ready for review and offline verification, not an unconditional Production GO.

Reproduce the PostgreSQL upgrade test locally (cached official image, no network):

```sh
docker run --rm -d --name zagotowki-upgrade-test --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=local-test-only public.ecr.aws/supabase/postgres:17.6.1.166
node tests/production-upgrade.mjs
docker stop zagotowki-upgrade-test
```

Other checks: `npm test`, `npm run test:browser`, `node tests/pin-database.mjs`
(with its documented isolated container), `npm run lint`, `npm run build`,
`git diff --check`. Never point these fixture loaders at a hosted database.
