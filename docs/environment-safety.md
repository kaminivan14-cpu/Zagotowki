# UAT / Production environment separation

## Build configuration

Vite loads `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local`, in that
order; existing process environment variables take precedence over files.
Confirmed against the installed Vite implementation. `vite build` defaults to
production mode; Vercel Preview normally uses that same mode.

- `.env`: shared non-secret feature flags only; no default Supabase project/key.
- `.env.local`: optional local development settings, ignored by Git. Avoid PROD.
- `.env.uat`: ignored local UAT configuration, copied from `.env.uat.example`
  and populated with the UAT public anon key. Use `npm run build:uat`.
- Local development against UAT: `npm run dev -- --mode uat`.
- Vercel Preview: process variables must reference UAT. Check branch-specific
  overrides as well as shared Preview variables before deployment.
- Vercel Production: retain the existing Production variables referencing PROD.
  No Production environment changes were performed for this work.
- Public key: prefer `VITE_SUPABASE_ANON_KEY`; existing
  `VITE_SUPABASE_PUBLISHABLE_KEY` fallback remains supported.

Do not place service-role keys, management tokens or server secrets in VITE_
variables. Actual env files and backups are ignored by Git. The previous local
`.env` was preserved at `backups/uat-preflight/original.env` (mode 0600), outside
Vite's env loading. It is a configuration backup, **not** a database snapshot.

## Guard

`vite.config.js` validates resolved variables on every build, including direct
`vite build` invocations. `VERCEL_ENV=preview` requires UAT even with Vite's
default production mode. `VERCEL_ENV=production` requires production mode and
the PROD URL. Local builds require explicit uat or production mode.

The URL must match exactly. Missing public keys, secret key prefixes, and JWT
keys whose role/ref do not match anon/the target are rejected. Opaque publishable
keys cannot be associated with a project offline; verify those in the provider.
JWT inspection is a configuration check, not signature verification.

`npm run build` without supplied Production configuration now stops rather than
silently using a shared `.env`. Existing correctly configured Vercel Production
builds remain supported. Dev-server tests with mock Supabase URLs are unaffected.

## Preflight evidence — 2026-10-02

Read-only Supabase Management API confirmed:

| Environment | Project ref | Name | Status | URL |
| --- | --- | --- | --- | --- |
| UAT | meuzkduxttjcuiynsnaa | Zagotowki - UAT | ACTIVE_HEALTHY | https://meuzkduxttjcuiynsnaa.supabase.co |
| PROD | ssheqxdgsmndiutthxvd | First Zagotowki | ACTIVE_HEALTHY | https://ssheqxdgsmndiutthxvd.supabase.co |

UAT migration history was read with `read_only: true` and saved in ignored
`backups/uat-preflight/migration-history.json`. Versions:
202609220001, 202609230001, 202609230002, 202609290001, 202609300001,
202610010001, 202610010002, 202610010003. No Tasks migrations applied.
This matches the expected prerequisite version list; it does not prove absence
of drift in table/function/policy definitions.

Vercel project identity, current Preview/Production deployments, domains, commit,
and both sets of remote environment variables remain **unverified**. No Vercel
connector or CLI credentials were found in the checked standard locations;
computer-use access to Safari was not approved. Historical Preview URL in
`docs/orders-pin-uat-fix.md` is not current deployment evidence.

Status: **STOP**. An authorized Vercel connection/session is required to inspect
the project and both environments, and fix only Preview if necessary. No remote
configuration was changed. No migration or deployment was performed.

Schema snapshot readiness: UAT read-only SQL API access works. Schema/grants/RLS/
RPC/roles snapshot and recovery verification remain outstanding before rollout.
Migration history alone is not a recoverable backup.

Validation: 91 unit tests passed; UAT build passed. Actual Vite builds rejected
UAT→PROD, Preview→PROD, and Production→UAT combinations. Correct Preview→UAT and
Production→PROD local builds passed; these did not deploy or access either DB.
Existing >500 kB bundle warning remains. No new commits created in this step.

## Global Vercel env cleanup (manager-email-auth)

Desired model, NOT a confirmation of the live Vercel inventory:

| Variable | Production | Preview (all branches) |
| --- | --- | --- |
| VITE_SUPABASE_URL | https://ssheqxdgsmndiutthxvd.supabase.co | https://meuzkduxttjcuiynsnaa.supabase.co |
| VITE_SUPABASE_ANON_KEY | Production public/publishable key | UAT public/publishable key |
| PIN_PROXY_SECRET | Secret matching Production pin-login | Secret matching UAT pin-login |
| APP_URL | https://zagotowki.vercel.app | Not needed after dynamic-origin proxy is deployed |

VITE_SUPABASE_ANON_KEY takes precedence over VITE_SUPABASE_PUBLISHABLE_KEY in both src/supabase.js and build-environment.mjs. A nonempty ANON_KEY prevents fallback; an empty/missing one does not. Remove the legacy PUBLISHABLE_KEY only after checking the global public key for BOTH targets. A publishable key prefix alone does not prove its project identity; check the source project. Never use service_role/sb_secret_ in VITE_* variables.

The PIN proxy derives exact Preview origins from VERCEL_URL and VERCEL_BRANCH_URL, both provided by Vercel without a protocol. No request Host/Origin reflection or wildcard is used. Production still uses explicit APP_URL. Legacy APP_URL/PIN_MANAGEMENT_ORIGINS fallback remains only when no VERCEL_URL exists. Enable access to System Environment Variables in Vercel project settings before removing Preview APP_URL. No per-branch settings are required for this proxy when the system variables are available.

Manual cleanup when no Vercel API credential is available:
1. Project zagotowki → Settings → Environment Variables. Inspect target AND Git branch of each entry, plus linked Shared Environment Variables.
2. Verify the global values in the table above (Preview must apply to all branches). Keep working Production values unchanged.
3. Remove only the replaced Preview overrides for feature/orders and release/orders-tasks-prod, one identified entry at a time. Do not delete a combined Production/Preview entry without preserving its necessary Production scope.
4. Remove legacy VITE_SUPABASE_PUBLISHABLE_KEY only after step 2. Do not remove unrelated env by name/age alone.
5. After the dynamic-origin commit, remove redundant Preview APP_URL/PIN_MANAGEMENT_ORIGINS entries; keep Production APP_URL. Enable system variables. Confirm main remains the Production branch.
6. Deploy only feature/manager-email-auth to Preview (new push or Redeploy with current env), inspect its SHA and environment, then check Vercel and Application checks on that SHA. Env edits alone do not repair an old deployment.

Separate limitation: Supabase Edge invitation/management CORS and Auth redirect allowlists are not Vercel variables. New branch builds and the server PIN proxy can use global UAT config, but invitation/reset/password callback flows on arbitrary Preview origins still require an independently valid Supabase configuration. No Supabase changes are authorized in this cleanup.

Reference: https://vercel.com/docs/environment-variables/system-environment-variables
