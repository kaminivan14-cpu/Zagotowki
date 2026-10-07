# Production Orders location routing

Target: `ssheqxdgsmndiutthxvd`. Additive migration `202610100002_order_location_routing.sql`; explicit repeatable Production seed `supabase/seeds/production/order-location-routing.sql`. No UAT generator or frontend changes.

## Contract

`location` is required by order-ingest. Backend trims leading/trailing whitespace, lowercases and converts `ł` to `l`. Only podgorna, czerwca, pulaski and damrota are allowed. Unsupported/missing/empty/non-string/unmapped location: HTTP 400, no order. Inactive target: 503. Errors never expose internal location IDs.

Existing Production names are **SB_Wroclaw** and **SB_Poznan 2.0**, preserved byte-for-byte. New names are SB_Podgorna and SB_Katowice. Mapping is held in existing app_private.order_location_mappings under source external-v1, never in frontend code. Seed locks Locations, inserts only missing exact names, refuses ambiguous/inactive targets or an existing conflicting mapping, and never overwrites a location.

## Minimal database change

- Nullable external_location on private order_ingest_receipts records the canonical code for new routed receipts only. Existing receipts and Orders are not backfilled or changed.
- New service-role-only public.order_ingest_routed(jsonb,uuid) validates/resolves location, uses the original SBID transaction advisory lock, verifies original order location and delegates item validation/atomic creation to the unchanged order_ingest function.
- Canonical location aliases retry successfully. Another location for the same SBID yields 409, including legacy pre-routing receipts, without moving or replacing an order.
- The legacy internal ingest RPC remains unchanged for rollback compatibility; it is not exposed to anon/authenticated. The new Edge path exclusively calls the routed RPC.
- All existing RLS/capabilities/grants and Kitchen/quantity/completion/callback logic remain unchanged. Callback payload stays SBID/status/prepared_at; outbound delivery remains disabled.

## Edge / configuration

Only order-ingest is redeployed. The handler no longer reads or uses ORDERS_INTEGRATION_LOCATION_ID. The existing secret is retained unmodified for rollback; ORDERS_INTEGRATION_SECRET authentication is unchanged. No new secrets are required.

This is an intentional API contract change: external callers must add location. Missing location is rejected instead of silently defaulting to a restaurant.

## Rollout / rollback

1. Verify fresh encrypted backup and local restore; snapshot Production Locations, mappings, functions/ACL and release history.
2. Apply migration + explicit seed + release journal atomically with a fresh drift check. Stop on ambiguity/constraint/grant/schema mismatch.
3. Compare existing Locations and Orders byte-for-byte/row digests: no changes allowed. Verify four mappings and service-role-only routed RPC.
4. Deploy only order-ingest and compare other functions' versions/config unchanged.
5. Controlled HTTP smoke for all mappings, normalization, missing/unknown location, identical retry and changed-location 409. Mark test orders NIE PRZYGOTOWYWAĆ. Verify Kitchen projection read-only in transaction test context; no fabricated completed work.
6. Keep test orders and audit identified; no destructive cleanup.

Rollback: stop inbound traffic first if routing fails. Restore the prior Edge source only if resuming the single-location contract is explicitly approved; old configuration is retained. Do not delete locations, mappings, receipts, or orders and do not down-migrate with accepted multi-location orders. The original ingest function has not changed. Prefer fixing the route forward while preserving accepted orders. Restore the whole DB only with explicit incident authorization.

## Tests before rollout

Orders/PostgreSQL 282 PASS; legacy Production upgrade/regression 239 PASS; Node 133 PASS; lint PASS. Tests include all four destinations, seed twice, exact preservation of existing locations, no migration of old orders/receipts, same-SBID same/different-location races, canonical Polish/case/whitespace aliases, invalid values, inactive location, legacy retries, board per location, callback unchanged, unauthorized RPC denial.

## Production execution — 2026-10-07

**PRODUCTION LOCATION ROUTING PASS** (backend/API and Kitchen board RPC). No frontend or UAT deployment.

| Code | Production location ID | Name | Result |
| --- | --- | --- | --- |
| podgorna | 4 | SB_Podgorna | Created, active; HTTP + Kitchen PASS |
| czerwca | 2 | SB_Poznan 2.0 | Existing, unchanged; HTTP + Kitchen PASS |
| pulaski | 1 | SB_Wroclaw | Existing, unchanged; HTTP + Kitchen PASS |
| damrota | 5 | SB_Katowice | Created, active; HTTP + Kitchen PASS |

Fresh backup directory (local, ignored): `backups/order-routing-20261007T145741Z/`. Encrypted custom dump: `production.dump.age`, 958561 bytes, SHA256 `8c1b2f5bcb7750b61351234603f26ee477eb990de702267748a283d66a62c774`. Encrypted schema and role snapshots plus metadata accompany it. Full local restore and migration rehearsal as postgres PASS. One live append-only operation appeared after the backup snapshot; all 65 backed-up rows of that table matched by digest. No data-loss discrepancy. Production catalog drift matched the rehearsal before/after rollout.

Applied migration `202610100002_order_location_routing.sql` and the explicit Production seed atomically, with release journal `order_location_routing_v1`. Original Orders row digests and existing Locations were checked unchanged inside that transaction. Final functions, columns, table ACL/RLS, policies, indexes and constraints match expected schema.

Only `order-ingest` deployed: version **2**, ACTIVE, `verify_jwt=false` (existing own bearer authentication). Other Edge Functions' metadata unchanged. Both integration secrets' digests match their original values; no secret write was issued. Full secret metadata comparison differed after deploy, but the before metadata was not persisted, so the exact differing field cannot be established. This does not establish a secret-value change; critical values were independently verified. The legacy location secret remains 1 and is not read by the new handler.

Production smoke created exactly four retained technical orders, IDs **3–6**, SBIDs `LOCATION-SMOKE-20261007T151611Z-{podgorna,czerwca,pulaski,damrota}`. All titles/comments explicitly say **NIE PRZYGOTOWYWAĆ**. Do not prepare these technical orders. HTTP initial creation, duplicate/parallel retry, case/whitespace/Polish-letter normalization PASS. Missing/empty/unknown location: 400 with no order; different location for the same SBID: 409; wrong bearer: 401. Integration audit confirms 4 creates, 11 duplicates, 3 validation errors and 1 conflict.

Kitchen `orders_board` was verified read-only for each location using the existing PostgreSQL connection, transaction-local administrator JWT context and authenticated role: each technical order appears only in its destination, with its external title and quantity 2. No authenticated browser/user session was used; visual browser smoke is not claimed. No work was started/completed and no callback sent. Existing callback definitions are unchanged.

Evidence is retained locally in ignored `tmp/order-routing/` (preflight/postflight, backup metadata, rehearsal, HTTP smoke, backend smoke and Edge verification). No credentials are included in this document. Source is committed on `codex/order-location-routing`; this rollout does not require a frontend deployment. Publishing/merging that branch remains a separate source-control step.

