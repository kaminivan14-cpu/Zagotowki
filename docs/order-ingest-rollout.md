# Order ingest rollout

Only Production `ssheqxdgsmndiutthxvd`. No UAT generator or other module changes. Isolated branch `codex/order-ingest` starts from main `d145b001cfca587c74807674af97dc429d22e3d2`.

## Change manifest

Migration: `202610100001_order_ingest.sql`.
- Orders: nullable unique integration_sbid, nullable comment. Existing source/external_order_id unique remains.
- Order_items: is_external default false, nullable comment. Existing order_product_id is already nullable; its check is extended only for external lines with SKU. Historical catalog/set rows and FK remain unchanged. External lines cannot masquerade as catalog/set lines.
- The existing Orders dispatch check is extended for integration dispatch without a fabricated employee. Existing human dispatch behavior is unchanged.
- Private order_ingest_receipts, order_integration_log, order_callbacks with RLS and no client table grants.
- New service-role-only order_ingest and bounded order_ingest_log RPCs; no public/anon/authenticated execution.
- Guarded changes to orders_command for external 0 PLN rate and orders_board for comments/references. No auth/permission changes.
- Completion trigger enqueues prepared exactly once using unique(order_id,status). No outbound sender.

Edge Function order-ingest: JWT gateway disabled **only for this function** because a separate constant-time compared integration bearer secret is required inside the handler. Service role stays inside the trusted Edge runtime.

Secrets: ORDERS_INTEGRATION_LOCATION_ID=1 (already configured by user choice), ORDERS_INTEGRATION_SECRET (cryptographically generated >=32 characters, never repository/logs). Standard SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are supplied by Supabase. Missing/inactive location fails closed before any new order.

## Gates and order

1. Fresh encrypted full DB backup + schema + roles; verify restore locally. Confirm current release journal (Production uses app_private.production_module_releases rather than a fabricated migration history).
2. Capture and compare existing function definitions/ACL, constraints, policies, indexes to the tested baseline. Stop on incompatible drift.
3. Apply only this migration and a release journal entry in one transaction. Verify original functions unrelated to Orders and original grants unchanged.
4. Set integration secret securely; deploy only order-ingest. Verify 401, malformed input and configuration failures before business test data.
5. Controlled authorized SBIDs prefixed INTEGRATION-SMOKE: success, retry, conflict, quantity, race. Test Kitchen commands using isolated synthetic data locally and a controlled Production operator flow. Never impersonate an existing user's live browser session.
6. Deliver only the small Orders UI diff through a reviewed PR/main deployment; do not merge org-structure-v2. Verify comments in both Kitchen modes and unchanged catalog orders. No UAT-only tools.
7. Do not erase audit or Orders history to clean smoke data. Keep test SBIDs clearly identified; any cancellation/removal requires a supported existing mechanism.

## Rollback / stop

Disable order-ingest (remove the function or rotate/unset ORDERS_INTEGRATION_SECRET) to stop new inbound traffic. Revoke service_role EXECUTE on public.order_ingest(jsonb,bigint,uuid) if necessary. Queue remains disabled. Keep accepted orders, receipts, callbacks and audit. **Do not delete accepted data or blindly down-migrate nullable product support**: these orders need the external-compatible workflow. The frontend may be reverted to its previous deployment, but that hides comments; suspend integration first. Restore the database only as an incident recovery step with explicit authorization, using the verified encrypted backup and documented post-restore steps. No destructive automatic rollback.

## Current verification

Local Node 134 PASS; endpoint handler 9 tests included. Orders PostgreSQL 231 PASS including concurrent ingest/claims and external completion. Production upgrade regression 239 PASS. Existing Orders browser scenarios 29 PASS; new responsive external scenarios 3 PASS after fixing the test selector to exclude hidden mode. Lint and build:uat PASS. Production migration and Edge deployment now completed; frontend deployment is still pending.


## Production execution, 2026-10-07

- Backup: `backups/order-ingest-20261007T133958Z/production.dump.age`, 936266 bytes, SHA256 `d47a4dd6168700ef74fde88cbdca47acb794f6bd0905d92aa7f91d6f8bb86bfa`. Schema and role dumps also encrypted. Local restore exit 0; schema/functions/grants/constraints/indexes/RLS/history match after normalizing implicit owner ACLs. 51 public/app_private table counts compared: one new append-only order_operations row occurred at 13:45:22 after backup began at 13:39:58; all 58 backed-up operation rows were hash-identical. No source data was changed for verification.
- Migration applied atomically; Production release journal now includes `order_ingest_v1`. No fabricated supabase_migrations baseline.
- Only existing functions orders_command and orders_board changed; their ACLs unchanged. All existing RLS policies and unrelated schema unchanged. Ingest RPC is service_role-only.
- Edge `order-ingest` ACTIVE version 1, own bearer authentication. Other function metadata unchanged except automatic version increments when project-wide secrets were updated: sync-products 10→11, pin-login 5→6, manage-employee-pin 5→6, invite-employee 3→4. Their code/config was not uploaded or changed.
- Strong integration secret stored in Supabase and separately at `~/.config/zagotowki-integrations/order-ingest-production.env`, mode 0600; never printed or committed. Location remains 1/SB_Wroclaw.
- HTTP smoke PASS: create/retry/conflict/missing sbid/missing items/wrong secret/quantity=2/concurrent duplicate. Two accepted orders, two duplicates, one conflict audited.
- Test SBIDs retained: `INTEGRATION-SMOKE-20261007T135405Z-A` and `INTEGRATION-SMOKE-20261007T135405Z-B`. Explicit titles/comments say not to prepare. No customer orders deleted or modified; audit retained.
- Production transactional Kitchen smoke PASS: existing administrator authorization evaluated through SQL test context, no browser/session used; partial claim/whole claim/0 PLN/ready/cutting/issue/prepared-once/board. **All those workflow writes rolled back**. The two HTTP test orders remain unclaimed; no fake completed work or callback remains.
- Queue delivery disabled; no external callback requests sent. UAT untouched.
- Frontend: local 29 existing + 3 added browser cases PASS, Node 134, Orders DB 231, Production regression 239, lint/build:uat PASS. Actual Production UI smoke still requires frontend rollout.

Evidence (local, untracked): `tmp/order-ingest/` in the original repository: pre/post catalogs, migration result, restore verification, HTTP/backend smoke, Edge metadata and deploy output. Secret values are not in these evidence files.
