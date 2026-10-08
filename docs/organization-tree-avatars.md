# Organization tree and employee photos — UAT only

Branch: feature/org-structure-v2. No Production authorization.

## Current and future organization

OrganizationScreen uses the existing current/future/history selectors. It always
opens current. Department/person cards have CSS connectors within the reporting
tree, keyboard-operable collapse/expand and horizontal scrolling for large trees.
Owners stay at the top; populated departments are in the tree; empty departments
and unassigned employees have separate sections below. Cross-department managers
are named on the card rather than creating duplicate employee cards or inventing
department ownership. Missing references/cycles produce a warning and an ID-only
console diagnostic; invalid display edges are broken without changing saved data.

Migration 202610080003 adds organization_move_department(jsonb,uuid). It uses the
existing organization.manage gate, locks, snapshot tables, audit and operation
registry. It validates the expected current version and creates a new immutable
current snapshot. It preserves manager, system role, production role and all future
drafts/schedules. Current changes can therefore be superseded by an already planned
future version; the form explicitly says future versions remain unchanged.

Moving a designated department director removes that person's designation only
from the new current snapshot. This is disclosed in the form and audited. It does
not appoint a director to the destination automatically. Old snapshots remain.
Same-day revisions are ordered by ID; their exact edit timestamps are in audit.

Rollback: disable the new UI action; do not drop history. Restore a department by
another authorized audited move against the latest version. Do not modify future
versions as a side effect. Schema changes are additive.

## Employee photos

Migration 202610080004 adds nullable Employees.avatar_path, a unique index, private
bucket employee-avatars (5 MiB, JPG/PNG/WebP) and three narrow public functions:

- employee_avatar_allowed: Storage access gate;
- employee_avatar_unreferenced: only permits deleting an unused path;
- employee_avatar_set: serialized, optimistic, audited and idempotent reference change.

Read paths are included in the existing admin directory, access directory and
organization_structure RPC. No Auth account/login or permission assignments change.
Writes require tasks.admin + employees.manage and owner/administrator, exclude own
account and archived employees, matching the enabled Admin editor scope. Existing
role permissions are not expanded. Photo reads require tasks.admin. No public bucket,
anon access, UPDATE/upsert or frontend service role key.

EmployeePhoto supports add/change/remove in the existing editor. Creating an
employee has a “Зберегти й додати фото” path: create the Employee once, keep that
record open, then upload. Photo failure does not create another Employee or pretend
the employee creation was rolled back. Ordinary save behavior is unchanged.

UI validates size, MIME and file signature. Storage enforces size/MIME; the RPC checks
uploaded object metadata and a path tied to the employee ID and operation UUID.
Signed URLs last 5 minutes; missing/failed images fall back to initials. No avatar
bytes, credentials or signed URLs are stored in Employees.

Upload uses upsert:false. The same operation/path is retained during retry; metadata
is retained in localStorage, keyed by actor and employee, across browser restarts. If an upload had not completed before
reload, the user reselects a file of the same format for that pending path. The new
reference is committed before deleting the old object. Cleanup failure exposes retry
and blocks a new upload for that employee in the editor until resolved. A referenced
object cannot be deleted by Storage policy. Unfinished uploads require returning to
the editor to finish retry; this iteration has no server-wide orphan sweeping job.

## Storage deployment gate

The database migration intentionally does not CREATE POLICY on storage.objects.
After the migration, use Supabase Dashboard → Storage → Policies → employee-avatars
(or SQL Editor under the supported Storage-admin channel) to apply exactly
supabase/storage/employee-avatar-policies.sql:

- INSERT / authenticated / bucket employee-avatars AND employee_avatar_allowed(name,true)
- SELECT / authenticated / bucket employee-avatars AND employee_avatar_allowed(name,false)
- DELETE / authenticated / bucket employee-avatars AND employee_avatar_unreferenced(name)

No UPDATE or anon policies. Do not alter system owners or broaden grants. Review
conflicting policy names before creation. Deploy the frontend only after policies
exist and upload/read/delete smoke passes on UAT. No Production changes.

## Verification

Local organization DB suite covers prior future routing plus current moves to/null
and back, stale version rejection, permission denial, unchanged future snapshots and
roles, audit/idempotency. Storage-policy tests cover unauthorized upload/read,
reference metadata validation, oversized rejection, repeated attachment/removal,
protection of referenced files and safe deletion after detach.

Browser tests cover current default, future/history preservation, collapse/expand,
375/768/1440, current department changes, unassigned and empty department sections,
no duplicate people, photo upload retry with the same UUID and cleanup ordering.
Node tests cover malformed graph fallback and image validation.

Manual UAT smoke still requires an administrator session. Verify a controlled photo
upload, replacement, removal, reload and broken-image initials. Never use real
Production employee data for synthetic tests.

## Current department consistency (2026-10-07)

Admin Employees now reads effective assignments from the same organization_structure
RPC as the current tree. Department filters, employee cards and manager labels use
those assignments, including explicit nulls. Returning to Employees reloads both
reads. No migration, physical legacy-field synchronization or new permissions.

For existing employees, the profile's department/manager fields are read-only.
“Змінити відділ” opens the existing audited current-move dialog for that employee;
it requires organization management permission. Save pending profile edits before
using this action. Manager changes remain in structure versions. Ordinary profile
saves preserve the original legacy structural inputs, so editing a name after a
move cannot overwrite the effective department or trip ORG_USE_VERSION.

Regression covers employee-to-structure navigation, immediate list refresh,
reload, subsequent profile save at 375/768/1440, and PostgreSQL profile save after
an actual versioned move. Existing current/future/history tests remain enabled.

## UAT execution record (2026-10-06)

Migrations 202610080003 and 202610080004 applied only to meuzkduxttjcuiynsnaa after
snapshot/drift PASS. Existing constraints/indexes/RLS/grants preserved. Rollback-only
UAT smoke: current move, null department, idempotency and avatar reference reads PASS.
Bucket is private, 5242880-byte limit with the three allowed image MIME types.
No photos or organizational test snapshots persisted. Three Storage policies are
still pending in Dashboard because storage.objects is owned by supabase_storage_admin.
Frontend publication waits for that gate. Production was not accessed or changed.

Local checks: Node 131; full browser 170; final targeted browser 9;
organization/current/photo PostgreSQL 55; access 64; Tasks 164; Processes 66;
Worktime 58; Orders 33+189. Lint and build:uat PASS.
