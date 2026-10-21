# Orders deletion — Production

Target: `ssheqxdgsmndiutthxvd` only. No UAT migration or data changes.

## Behavior

Orders are soft-deleted with `deleted_at`, `deleted_by` and optional `delete_reason`. Items, assignments, earned amounts, work shifts, receipts, events and integration logs remain linked. Both Kitchen views and active notices omit deleted orders. Workflow commands reject further mutations; deleted work does not prevent ending a shift through either Orders or Worktime. Historical work is not marked completed or issued artificially.

`order_delete(p_location_id, p_order_id, p_operation, p_reason)` and `orders_delete_bulk(p_location_id, p_order_ids, p_operation, p_reason)` are transactional security-definer RPCs with a fixed search path. Only authenticated active administrator/manager identities with `orders.access` and new `orders.delete` capability may use them. Managers retain their existing location scope. Explicit role checks still reject other roles if they accidentally acquire the capability. No direct table writes are granted.

Bulk requires an explicit location and a nonempty snapshot of up to 10,000 IDs from the displayed view. The server validates every ID belongs to that location, locks them in order, and archives them atomically. There is no unscoped/all-table operation. Filters and location are shown in the confirmation dialog; newly arriving orders are not added to the confirmed snapshot. The user must type `USUŃ` or `DELETE`. Single confirmation displays internal ID, SBID, location and item count. New copy supports the existing Polish/Ukrainian locale preference.

Each deleted order produces `ORDER_DELETED` with actor snapshots, timestamp, mode, SBID, location, operation UUID and reason. Bulk additionally produces `ORDERS_BULK_DELETED` with IDs and actual count. The existing private operation journal preserves retry results. A fresh request for an already deleted order returns count zero; repeating the same UUID returns the original response.

Pending callbacks receive `cancelled_at`; claim and result RPCs exclude cancelled jobs. Sent history remains unchanged. The callback producer ignores deleted orders. **An outstanding worker lease, even expired, blocks the whole deletion with `CALLBACK_IN_FLIGHT`.** This prevents a payload already handed to a worker being sent after a successful deletion. A stranded lease requires investigation/resolution; deletion does not silently clear it. No worker/cron pause or external callback is necessary for rollout.

## Preflight and rollout

Production read-only catalog inspection on 2026-10-21 confirmed RESTRICT-linked Orders/items/assignments/events/worktime, private import receipts/integration logs and the active prepared-callback scheduler. There was no generic Orders-administration capability; `orders.delete` is narrowly granted to the two requested roles.

The additive upgrade is `supabase/upgrades/production/09_orders_delete.sql`, deliberately outside the shared migration chain: current main does not include the already-deployed callback baseline. Guarded edits reject unexpected function drift. Do not run a general `supabase db push`.

Required gates:

1. Fresh age-encrypted full backup, schema and roles, followed by isolated local restore verification.
2. Catalog comparison against the read-only preflight and migration rehearsal on the restored database. Preserve function ACLs and unrelated data.
3. Atomic Production upgrade plus `orders_delete_v1` release journal entry.
4. Synthetic transactional Production smoke, rolled back; never delete customer orders. The worker cannot see uncommitted fixtures.
5. PR checks PASS, operator approval, merge, Vercel Production deployment and deployed-SHA verification.

Rollback: revert frontend to hide deletion actions; revoke authenticated execution of the two new RPCs to disable further deletes if necessary. Retain archived orders and audit. Do not drop archive columns, restore customer orders automatically, or re-enable cancelled callbacks. Recovery of a specific archived order requires a separate audited procedure.

## Verification checkpoint

- Node suite: 159 PASS.
- PostgreSQL Orders suite: 318 checks PASS, including new deletion permissions, location isolation, preserved items, audit, idempotency, callback cancellation/leases/sent history, concurrent deletion and shift completion.
- Playwright Orders: 38 PASS, including six new deletion scenarios (admin/manager, scoped bulk, typed confirmation, failure/cancel, Ukrainian copy and role denial).
- Lint: PASS. Production-mode build and migration regression: PASS.
- Backup `orders-delete-20261021T124222Z`: full data, schema and roles encrypted with existing age identity. Full isolated restore exit 0; catalog and all 65 table counts match. Full dump SHA-256: `de3ba8b611364551738e686677406637345361345a9751160c9b5244bfcdc387`.
- Production migration committed at 2026-10-21 12:53 UTC; release journal `orders_delete_v1`. Migration SHA-256: `6f65c47c934df41bf5833b5578439b58590dd2273c280a8d0fcdd810781577cd`.
- Production synthetic smoke PASS inside the migration transaction, rolled back to a savepoint before commit. Customer Orders and callback contents verified unchanged. Postflight tables, columns, indexes, policies, functions/ACLs and constraints match the rehearsed state.
- Additional local restored-data smoke confirms active cutting blocks Worktime before deletion, then permits ending the shift while preserving unfinished cutting history.
- Frontend push/PR is awaiting explicit operator approval required by automatic approval review. Merge/deployed SHA remain pending.

Limits: archival has no restore UI; a busy callback must settle before deletion; each bulk snapshot is capped at 10,000 IDs. Browser tests use synthetic RPC responses and do not constitute a live Production login test.
