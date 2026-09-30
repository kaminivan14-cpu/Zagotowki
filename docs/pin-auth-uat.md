# PIN Auth POC — UAT only

Status: implemented locally; NOT migrated, NOT deployed, real UAT session flow pending.
Target: `meuzkduxttjcuiynsnaa`. Production `ssheqxdgsmndiutthxvd` is prohibited.
Administrator email/password and recovery remain unchanged. PIN is an alternative way to acquire the same Supabase session, not another authorization system.

## Implemented flow

Browser POST `/api/pin-login` with exactly `{ pin: string }` → Vercel Preview gateway → signed POST to Edge `pin-login` → PostgreSQL reservation/limits → bcrypt verification → server-established Employees/Auth identity → admin `generateLink(type: magiclink)` → separate per-request public Auth client `verifyOtp(type: email, token_hash)` → verify session UID and active profile again → return access/refresh tokens with `no-store` → browser SDK `setSession` → existing AuthGate/RLS.

No email is sent by generateLink. No hand-minted JWT, custom employee session or public legacy login_employee. The Auth client created for OTP verification does not persist or refresh sessions. The SDK version is pinned to 2.116.0 in Edge entrypoints.

The gateway is needed because Edge must not trust arbitrary X-Forwarded-For. Vercel's platform-controlled `x-vercel-forwarded-for` is read only inside a Vercel Preview Function; a shared server secret signs time, nonce, source pseudonym and body. Direct unsigned Edge calls fail. Do not deploy this gateway on an ordinary HTTP server or behind a custom trusted-IP override without revisiting the trust boundary.
Reference: https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for

## PIN and limits

Exactly four ASCII digits; kept as a string, including leading zeros. PINs supplied by the administrator in the UI, never committed as operational seed data. Database stores bcrypt (cost 10, random salt), no plaintext. Hash never leaves SQL verification or employee table. Direct table/column reads and internal RPC execution are denied to anon/authenticated.

Uniqueness is checked with bcrypt under a transaction advisory lock, across all existing non-null PIN hashes (including inactive profiles). UNIQUE(pin_hash) is not used. Administrator PINs and PINs without an Auth link are prohibited by constraints. Existing normal Auth accounts are not silently converted to technical accounts.

Before bcrypt: atomic reservation in its own committed transaction. At most 5 attempts/source/rolling minute, 10 unsuccessful or unfinished attempts/source/15 minutes then 15-minute source lock, global 20 admitted attempts/rolling minute. At most two concurrent bcrypt verification transactions using PostgreSQL advisory locks; no waiting queue for expensive verification. A reserved attempt is one-use and expires after 30 seconds. Failures/crashes count conservatively. Requests denied by the limiter do not run bcrypt. Sources are HMAC pseudonyms, not raw IPs. Old attempt records are pruned after one day; unused expired source entries are removed. At most 32 PIN profiles may be scanned; beyond this cap login fails closed.

Global saturation and shared NAT can deny legitimate logins. Four digits have only 10,000 combinations: these controls make this a bounded, protected UAT POC, NOT a production security approval. Keep Vercel Preview deployment protection. No PIN or other credentials may be added to telemetry, request-body tracing, error messages or SQL parameter audit logs.

## Provisioning / retry semantics

`manage-employee-pin` verifies bearer with Auth.getUser; private SQL rechecks active administrator and target role. `pin_prepare` reserves random `<UUID>@pin.uat.invalid` technical email + provisioning UUID once. Auth user is created with email_confirm and administrative correlation metadata, WITHOUT a password. `pin_finish` verifies that metadata and email, links the unique UID, and stores the salted hash in one transaction.

A retry after Auth creation locates that exact account by the reserved email and metadata. Concurrent duplicate creation falls back to re-reading the reservation. The SQL finalization serializes assignments/resets, never overwrites a different existing UID, and records operation UUIDs. Same operation + same target + same currently installed PIN is idempotent; an older operation cannot reset a later PIN. No existing users are deleted as compensation. If interrupted, keep the same target and retry; an unlinked account has no business access.

The UI retains an operation UUID only in component memory and clears PIN after each attempt. Retry in that form with the same PIN. After closing/reopening, a new reset operation is intentional; technical account reservation is still reused. Entered PIN is shown only during assignment, never retrieved later.

## Local verification

- `npm test` (includes Auth, PIN handler/proxy and bootstrap tests).
- `npm run test:browser -- tests/browser/auth.spec.js` (mock API; real browser SDK sessions).
- `npm run lint`, `npm run build`, `git diff --check`.
- Real PostgreSQL/pgcrypto, no Supabase network:

```sh
docker run --rm -d --name zagotowki-pin-test --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=local-test-only public.ecr.aws/supabase/postgres:17.6.1.166
node tests/pin-database.mjs
docker stop zagotowki-pin-test
```

The script creates/removes its own uniquely named database inside that container only. It tests all four migrations on real PostgreSQL, bcrypt, constraints/grants, role/location access, provisioning/reset/retry, and parallel connection limits. Auth users here are local synthetic fixtures, not real Auth API users. Handler tests exercise the installed SDK generateLink/verifyOtp contract with a mock transport, not the hosted Auth server.

## UAT enablement — operator steps (not performed)

1. Confirm branch feature/auth and review this diff. Back up UAT schema before applying. Confirm `supabase/.temp/project-ref` equals `meuzkduxttjcuiynsnaa`; stop if different. Confirm project identity with CLI read-only projects list.
2. Read-only migration list; dry-run must list ONLY `202609290001_employee_pin.sql`. Do not continue with any unexpected migration. After review, apply using the standard CLI migration mechanism. Do not apply the UAT seed again or touch Production.
3. Technical addresses are fixed to `<UUID>@pin.uat.invalid`, enforced by SQL and backend validation. No domain, DNS, mailbox or domain secret is needed. Hosted Auth acceptance remains to be confirmed by the first UAT provisioning/login test. Do not change existing admin email/recovery settings.
4. Generate a high-entropy random `PIN_PROXY_SECRET` (at least 32 characters) using a password manager. Set the same secret in Supabase UAT Edge secrets and Vercel Preview **feature/auth** only. Never use a VITE_ prefix for this secret, pass it on the command line, commit it, or paste it into chat.
5. UAT Edge configuration: existing `APP_URL` must match the trusted Preview origin. Verify platform-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` exist and belong to UAT. Do not expose their values. Vercel Preview's existing `VITE_SUPABASE_URL` must be the UAT URL; gateway is disabled for VERCEL_ENV other than preview.
6. Deploy only `pin-login` and `manage-employee-pin` to explicit project ref `meuzkduxttjcuiynsnaa`. Config disables gateway JWT checks ONLY for those functions: pin-login verifies gateway HMAC, management verifies bearer and SQL administrator. Existing invite-employee configuration is unchanged.
7. Publish the reviewed frontend plus `/api/pin-login` to a Preview of feature/auth. Confirm the Vercel Node function is built and the platform IP header is present. Do not disable Preview protection. Verify a direct unsigned Edge call is refused and spoofed XFF cannot vary the trusted source. Do not log request bodies while checking.
8. Sign in using the existing UAT Administrator email/password. Open Pracownicy. Find **UAT Manager A** by name and location (do not assume an ID). Choose **Nadaj / resetuj PIN**, enter a unique four-digit test PIN of your choice and submit. Success provisions/links the technical account and sets the hash. Do not send an email invitation for this account.
9. Sign out. Select **Pracownik — logowanie PIN**, enter the same PIN. This performs the real generateLink → verifyOtp → setSession chain without an email. Confirm profile and location, then logout, reload/refresh session, active=false denial and Location B isolation. Repeat for Su-chef A and Employee A, each with a different PIN.
10. Re-run administrator email/password and recovery smoke tests. Record only success/failure and UID equality as a boolean; no tokens, PINs or hashes. Only after all live tests pass mark the POC operational.

The real UAT flow is a required acceptance gate, not covered by mocks. If generateLink/verifyOtp fails on hosted Auth, stop; do not replace with custom JWT or bypass RLS.

## Recovery and limitations

- Missing secret, invalid internal email, wrong project, untrusted source, limiter error: fail closed. Safe Edge logs include random request ID, operation, outcome code, timing; never exception payloads.
- Turn off the gateway by removing its Preview-only secret / withdrawing the Preview when authorized. Existing administrator flow is independent. Do not drop Auth users or migration tables as an automatic rollback.
- Resetting PIN prevents future use of the old PIN; it does not revoke existing sessions. active=false blocks business operations immediately through existing live RLS/RPC checks, even with an unexpired token. Re-enabling may restore access to old sessions; revocation policy is a Production prerequisite.
- Profile refresh clears employee UI and product cache after access loss. Supabase tokens retain normal SDK lifetime/refresh behavior; no second session store is introduced.
- PIN-only enforcement is NOT guaranteed: an authenticated technical user can attempt other Auth APIs (password/email changes). Technical email appears in session data and is not secret. This must be resolved before Production rollout without weakening RLS.
- A PIN-enabled profile cannot be promoted to administrator while pin_hash exists. Deprovisioning/clearing PIN and session revocation need a separately reviewed administrative workflow; do not bypass the constraint.
- Provisioning a profile already linked to a non-PIN Auth account is deliberately refused. An operator must review any such UAT record before conversion; there is no automatic unlink/delete.
- Vercel gateway request limit/abuse protection complements but does not replace the DB limits. Verify infrastructure logging redacts request bodies before live use. No raw IP is stored in rate-limit tables.

### Exact CLI sequence after access/configuration is available

Run from the reviewed repository; these commands have NOT been run against UAT in this task:

```sh
cat supabase/.temp/project-ref
# MUST be meuzkduxttjcuiynsnaa; otherwise STOP (do not automatically relink).
npx supabase projects list
npx supabase migration list --linked
npx supabase db push --linked --dry-run
# MUST propose only 202609290001_employee_pin.sql; otherwise STOP.
npx supabase db push --linked
npx supabase functions deploy pin-login --project-ref meuzkduxttjcuiynsnaa
npx supabase functions deploy manage-employee-pin --project-ref meuzkduxttjcuiynsnaa
```

Set secrets using the UAT Dashboard/secret manager, not literal command arguments or tracked env files. If any step fails, stop; inspect safe error codes and do not retry migration/deployment blindly. Auth provisioning itself supports documented retries. Frontend publication and git operations require the operator's separate instruction.

The reserved `.invalid` domain cannot route to a real public mailbox. Our createUser(email_confirm)/generateLink/verifyOtp flow sends no email. This does not disable attempts through other Auth endpoints; PIN-only restrictions remain unresolved. PIN_PROXY_SECRET is unchanged.
