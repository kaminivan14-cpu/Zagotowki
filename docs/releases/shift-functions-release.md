# Shift functions, cutter view and status colors — release gate

## Baseline and recovery

- Production Supabase: `ssheqxdgsmndiutthxvd`.
- origin/main before release: `d0e98463c72b6d0d50f285a579a42f022e1593b9` (PR #14 merged).
- Full encrypted backup: `backups/shift-functions-20261027T202506Z`. Full custom-format dump, schema and roles, age encryption with existing identity, SHA256 checksums verified. Restore exit 0 in isolated PostgreSQL 17 container with no network and cron disabled.
- Schema, RPC, policies, grants, constraints and indexes matched. Row hashes verified for 65 application tables, excluding new live rows added after the snapshot. One newly ingested order explains raw count differences; existing row content matched.
- Production uses `app_private.production_module_releases`; `supabase_migrations.schema_migrations` does not exist. Most recent recorded application release is `pr14_positions_tasks_v1` (2026-10-26). Callback batch RPC/worker v5 is separately deployed; this release does not modify it.
- Rehearsal on the restored Production database passed. Exactly four function definitions changed: the new private shift-function validator and existing worktime audit, worktime command and Orders command. Existing function grants, table grants and RLS remained identical.

## Model and behavior

`Work_shifts.current_shift_function` is nullable with stable codes `prep`, `sushi`, `cutter`. It is separate from `Employees.role`, `Employees.production_role` and position. No role or capability is added. Choice applies to existing role codes su-chef, sushi-master, crafter and requires the existing worktime capability in UI.

Start uses existing `worktime_command`; changing function uses its new `function` action. The same employee advisory lock serializes work and function changes. Idempotency uses existing order_operations. The existing audit trigger records `WORK_SHIFT_FUNCTION_CHANGED` with actor, timestamp, shift ID and complete before/after snapshots (including employee ID). Shift start time, shift ID and end time remain unchanged. Last choice is a local user preference, not a role-derived assignment. Legacy shifts with no function retain existing behavior until a function is selected.

Prep retains Zagotówki and loses operational Orders actions. Cutter retains cutting/issuing and cannot claim/prepare sushi work. Sushi retains existing capability-checked Orders flow. Backend Orders RPC enforces the same restrictions after its existing capability, scope, shift and deletion checks. Function changes never grant permissions. Existing ownership checks remain.

The cutter filter is inside Orders, shared by General and the operational/ProductionMode rendering. It retains operational leaves with unfinished assignments, including preparation in progress, cutting, and waiting for issue. Existing explicit item_type routing is reused: products/addons already enter the cutting pipeline; sets are containers, drinks are excluded. No name heuristics, new workflow state, new query, or N+1 lookup.

`statusStyles.js` centralizes distinct pastel colors for the six real backend statuses and existing lifecycle projections; unknown values use a neutral fallback. Header and task badges share it. Urgency/deadline card styles remain independent. New labels are PL/UA through the existing locale state.

## Migration and rollback

Migration: `202610280001_shift_functions.sql`. Adds one nullable column and one private helper, extends the existing audit event CHECK, and patches existing RPCs in place with drift guards. No row/table removal, role changes or RLS weakening. It has only been rehearsed locally; Production application is gated on release approval.

Rollback: restore the three previous RPC definitions saved in the protected preflight (`tmp/shift-functions/rpc-before.json`) and redeploy the previous approved frontend. Retain the additive column and audit events to preserve history. Do not overwrite a live database with an older full dump: it would lose newer orders. The encrypted dump and verified restore are available for disaster recovery. Test-order soft deletion is recorded separately and does not need to be reversed to roll back the feature.

## Cleanup

See `shift-functions-cleanup.md` for the pre-cleanup table and evidence. IDs 3,4,6,695,696,697 were soft-deleted through existing `order_delete` on 2026-10-27 20:36:42 UTC. Identity and callback absence were revalidated inside the transaction. Order_items count was unchanged, audit/history retained, no physical DELETE and no callback replay or new jobs.

## Verification before PR

- Targeted backend: 6 tests PASS, including all three roles, same shift/time, idempotent event creation, prep/cutter RPC denials and full sushi/cutting/issue flow.
- New browser coverage: 6 viewport/language scenarios PASS (1440/768/390 × PL/UA) plus legacy-null-function regression PASS. Screenshot evidence includes Normal/Large/Very large text scales.
- Full Node: 173 PASS, no skipped tests.
- Lint: PASS.
- Production build: PASS (existing >500kB chunk-size advisory).
- Production UI policy suite: 19 PASS.
- Full PostgreSQL regression: all 11 suites PASS; 1,360 explicitly counted checks plus audit and plan-item migration scenario suites. Existing Organization/Tasks fixtures were aligned with already-released nullable position, critical-task authorization and duration defaults; no product logic, skips or timeout increases.
- Full browser suite: 223/223 PASS, followed by the newly added legacy-null-function test 1/1 PASS. Application CI will run all 224 together on the PR head.
- UI evidence: 80 screenshots retained in local release evidence. Existing module regression includes Auth, Zagotówki, Orders, Worktime, Tasks, planning/reports/grafik, Processes, Organization, Admin, Audit and Access. No blocking layout failures found; constrained table scrolling remains intentional.
- PR/checks/approval: pending.
- Merge/deployed SHA/final Production feature smoke: pending approval and deployment.

This document is not a Production PASS declaration.
