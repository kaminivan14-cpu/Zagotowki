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
