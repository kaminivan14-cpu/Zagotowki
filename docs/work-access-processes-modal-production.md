# Work access, Processes navigation and modal close

Production Supabase: `ssheqxdgsmndiutthxvd`.

## Access

Additive upgrade `11_work_module_access.sql` adds only `tasks.access` to owner, director, expert and specialist and narrowly admits this capability in the existing Production policy. Administrator and manager retain their grants. No Tasks/Processes RPC, RLS, scope grants or role codes change.

Production rollout journal: `work_module_access_v1`. Migration SHA256: `1efabb184f849da66d0a615ab0f1a130fc89fb762631abd52d3a1a14f154a20a`.

Production smoke uses temporary synthetic identities inside a savepoint, tests all six roles, rejects Admin/Processes for newly admitted roles, confirms self-only assignable people and rejects inactive identities. Fixtures are rolled back before committing grants. Postflight compares all public/private function definitions and ACLs, RLS policies, active locations and permission rows. Only role_has_permission and four grant rows changed.

## Navigation

`TasksApp.jsx` owns a top-level `processes` view, gated by `processes.read`. `ProcessesScreen.jsx` loads existing directory data for administrators using the same RPCs as previously; non-administrators use already scoped people/context/location data without fetching Admin directory. It renders the original Processes component, retaining its state and domain operations. `AdminScreen.jsx` and `admin/labels.js` no longer include Processes. The access summary model now reflects the new navigation gate. Existing navigation styles handle active state and wrapping.

## Modals

Shared `src/ui/ModalClose.jsx` and `modal-close.css` provide the localized, keyboard accessible close button. Integrated centrally into Tasks and Audit Dialog wrappers and into the existing Auth confirmation, Orders deletion, Worktime logout and correction dialogs. The ProcessWizard's old close icon is removed. Existing footer buttons, Escape and outside-click behavior are preserved. Close is disabled during existing busy operations.

Exception: the critical-task dialog uses its existing onClose handler to request a reason; it does not silently dismiss the mandatory task workflow. Worktime overlays retain their existing Escape behavior (no new Escape handler). Native dialogs retain their existing Escape handlers. Browser-owned alert/confirm dialogs are not app components.

## Validation and rollout

Targeted DB tests use a captured Production permission baseline, compare the entire capability matrix, verify idempotence and exercise RPCs under authenticated roles. Browser tests cover six-role Production entry, Processes active state and removal from Admin, read-only Processes without Admin access, and one close icon with click/Enter/Space/Escape/localization at 375/768/1440 widths. Existing Auth, Orders, Tasks, Audit and production regression suites run in Application checks.

Frontend must follow branch → PR → successful Application/Vercel checks → user approval → merge → Production deployment. Production backend is applied; frontend SHA must be recorded only after an approved deployment, not inferred from Preview success.
