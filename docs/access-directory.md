# Admin access directory

Branch: `feature/org-structure-v2`. UAT first; no Production rollout is authorized.

## UI

`Адмін панель → Доступи` defaults to `Ролі`. Cards show Ukrainian role names,
user counts, capability-derived summaries and available modules. Details contain
module checks, grouped readable permissions and users. `Працівники` provides a
searchable compact table with employee details, effective capabilities, current
reporting hierarchy, assigned location and explicit scope grants.

System role, production role and department remain separate. No permission editing
or automatic role conversion is introduced. Initials are used because current
employee records have no avatar source. Counts include inactive/archived employees;
individual status and effective permissions make that distinction visible.

An unavailable permissions read shows unknown states and retry. Legacy directory
capabilities are never treated as effective permissions. Core role cards remain
visible even if the access RPC fails. Scope grants are shown as existing rules;
permission and object checks still happen in the backend. An assigned location is
not a promise of unrestricted access to every object at that location.

## Source of truth

Migration `202610080002_access_directory.sql` depends on the organization migration
`202610080001_organization_structure.sql`.

- `tasks_access_directory()` is a read-only, `tasks.admin`-gated RPC.
- `app_private.role_permissions` remains the only capability assignment source.
- The installed `has_permission(text)` role predicate is extracted into private
  `role_has_permission(text,text)`. `has_permission` keeps employee identity,
  active and archived checks and calls that same predicate. This shares enforcement
  with inspection instead of introducing a second permission matrix.
- Extraction preserves the installed UAT or Production exclusions, including the
  Production test-generator prohibition. Unsupported definitions raise SCHEMA_DRIFT.
- Employee capabilities additionally require an Auth link. `auth_capabilities()`
  is unchanged; tests compare its results before/after and against the directory.
- Current organization assignments and existing task descendant rules supply
  reporting. Existing `Task_scope_grants` supply explicit exceptions.
- Frontend mapping is capability-to-module presentation, not role-to-permission.
  Worktime screen requires `worktime.access`; `worktime.self` alone is not enough.

No role permission rows, Employees, Auth accounts, RLS policies, existing table
privileges or system owners change. The private helper is not callable by API roles.
The public RPC is granted only to authenticated; its internal gate rejects nonadmins.

## Verification

- Access PostgreSQL: UAT and Production policy fixtures; all existing roles;
  active/inactive/archived/unlinked employees; role without users; permission
  equality before/after; directory equality with auth_capabilities; RLS/grants
  preservation; unauthorized and direct private helper access rejected.
- Browser: role counts, empty role, user details, keyboard, error/retry without
  false denial and 375/768/1440 layouts, using isolated synthetic data.
- Node capability presentation checks; full browser suite and Tasks, Processes,
  Orders, Worktime DB regressions; lint and build:uat.
- Screenshots: `tmp/access/screenshots/roles-{375,768,1440}.png` and matching
  `details-{375,768,1440}.png`. These are local evidence, not committed assets.

## UAT rollout

1. Snapshot schema and migration history; compare the eight organization helpers
   and `has_permission(text)` with the expected baseline. Stop on drift.
2. Push the feature branch and verify Preview points to `meuzkduxttjcuiynsnaa`.
3. Apply only 080001 then 080002, recording migration checksums/history. Do not
   apply unrelated migrations absent from UAT through an indiscriminate db push.
4. Read-only smoke as administrator: role counts, module access, employee details,
   and effective capability consistency. Confirm nonadmins cannot call directory.
5. Organization Cron activation remains the separate documented setup in
   `organization-structure-v2.md`; it is not required to read date-effective access.

Production is untouched. Production rollout would need separate authorization,
fresh backup/drift review and the preserved Production predicate test.
