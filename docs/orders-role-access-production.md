# Orders role access — Production, 2026-10-26

Target: Supabase `ssheqxdgsmndiutthxvd`.

The operator first requested module access, then explicitly extended the scope to claiming orders and progressing through the existing workflow to issue, without deletion. All four additional roles (`su-chef`, `shift-manager`, `sushi-master`, `crafter`) therefore receive exactly `orders.access`, `orders.work`, `orders.cut`, and `orders.issue`.

Production previously granted these roles no Orders capabilities and blocked all `orders.*` through `role_has_permission`. Upgrade `supabase/upgrades/production/10_orders_role_access.sql` adds 16 permission rows and a narrowly bounded exception for those four capabilities/roles. Other effective permissions are checked unchanged in the rollout transaction. No role codes, locations, RLS policies, Orders RPC definitions, callback/ingest functions, Worktime, history or workflow are changed. Administrator and manager retain their original capabilities and deletion behavior. The four new roles still cannot dispatch NEW orders or administer/delete orders.

The frontend changes only the Production Orders module gate in `src/orders/environment.js`. Existing General/Operational views and action buttons continue to follow their capabilities. Tasks and other module access gates are unchanged.

## Verification and rollout

- Read-only snapshot of complete permissions, original policy definition, function fingerprints/ACLs and RLS saved locally before rollout. This is the backup of the affected configuration; no customer data export is needed for the additive permission change.
- Node suite: 160 PASS, including the Production policy matrix, full workflow for all four new roles, scope isolation, inactive account denial and single/bulk delete denial.
- Production transaction: `SIX_ROLES_ACCESS_WORKFLOW_SCOPE_DELETE_PASS`. Synthetic users/locations/orders were rolled back before committing the permission update. Admin/manager single and bulk deletion were tested only on synthetic orders.
- Postflight: only `app_private.role_has_permission(text,text)` changed among 193 existing functions. RLS and locations match baseline. Other grants unchanged. Release journal: `orders_role_access_v1`.
- Production-mode browser suite: 13 PASS; lint and Production-mode build PASS.
- Polish/Ukrainian UI regression coverage uses synthetic sessions; live user login is not claimed. CI now includes the Production module visibility suite as well as the existing Auth, Zagotówki and Orders browser suite.
- Frontend PR/checks/approval/merge/Production deployment: pending. No new deployed frontend SHA yet.

## Requested persistent smoke orders

Created exactly three user-authorized test orders in `SB_Wroclaw` (location 1): IDs **695, 696, 697**, displayed as `SMOKE — TEST 1/2/3 / 2026-10-26`, with quantities 2, 3 and 1 respectively. They are `is_test=true`, source `operator-smoke`, integration SBID NULL, no integration receipts and no callback.

They are NEW. An administrator/manager first uses the existing dispatch action to send them to Kitchen; the four roles can then claim, mark ready, cut and issue using their own active shifts. Test item names/comments clearly say not to prepare real food. Test lines have no catalog product, so the unchanged external-line workflow uses zero work rate. Testing still records real shift time and normal history; nothing is silently erased. An administrator/manager may archive the test orders afterward.

## Recovery

Revert the frontend gate to hide access if required. To undo the backend policy change, restore the captured original `role_has_permission` definition and remove only the 16 newly inserted grant pairs (preserving any independently changed permissions). Do not undo work already completed, delete historical records or change callbacks. No automatic down migration.
