-- Reference and configuration data inventory (READ-ONLY). Target: First Zagotowki, ssheqxdgsmndiutthxvd.
-- A whole-file run shows D9 (summary with verdicts). No personal data is returned.
-- Production reference data has a business owner; it is never copied from UAT (UAT test employees, Auth UUIDs,
-- employee IDs, test positions or test reporting lines do not belong in Production).

-- D1. Role -> permission matrix as stored (Production: upgrades/production/06, 10, 11 change it on purpose).
SELECT role, count(*) AS permissions, string_agg(permission, ', ' ORDER BY permission) AS permission_list
FROM app_private.role_permissions GROUP BY role ORDER BY role;

-- D2. Who effectively holds each module entry permission (has_permission applies the Production filter too).
SELECT p.permission, string_agg(DISTINCT p.role, ', ' ORDER BY p.role) AS roles
FROM app_private.role_permissions p WHERE p.permission LIKE '%.access' OR p.permission IN ('tasks.admin', 'employees.manage', 'organization.manage')
GROUP BY 1 ORDER BY 1;

-- D3. Departments (business dictionary; code 'production' enables production roles).
SELECT id, name, code, active FROM public."Departments" ORDER BY id;

-- D4. Locations (business dictionary; required for location-bound roles and Orders routing).
SELECT id, name, city, active, external_id IS NOT NULL AS has_external_id FROM public."Locations" ORDER BY id;

-- D5. Task categories and module settings.
SELECT 'category' AS kind, id::text AS id, name, active::text AS state FROM public."Task_categories"
UNION ALL SELECT 'module setting', NULL, s.key_value, NULL
FROM (SELECT to_jsonb(t)::text AS key_value FROM public."Task_module_settings" t) s
ORDER BY 1, 2;

-- D6. Process templates and organisation structure versions.
SELECT 'process template' AS kind, count(*)::text AS value FROM public."Process_templates"
UNION ALL SELECT 'process versions (published)', count(*)::text FROM public."Process_versions" WHERE status = 'published'
UNION ALL SELECT 'structure version ' || status, count(*)::text FROM public.organization_structure_versions GROUP BY status;

-- D7. Storage buckets.
SELECT id, public, file_size_limit, array_to_string(ARRAY(SELECT unnest(allowed_mime_types) ORDER BY 1), ', ') AS allowed_mime_types
FROM storage.buckets ORDER BY id;

-- D8. Release journal entries (Production) - names and dates only.
SELECT (xpath('/row/release/text()', r))[1]::text AS release, (xpath('/row/applied_at/text()', r))[1]::text AS applied_at
FROM unnest(xpath('/table/row', query_to_xml(CASE WHEN to_regclass('app_private.production_module_releases') IS NULL
       THEN 'SELECT NULL::text AS release, NULL::text AS applied_at WHERE false'
       ELSE 'SELECT release, applied_at::text AS applied_at FROM app_private.production_module_releases ORDER BY applied_at' END,
       false, false, ''))) AS r;

-- D9. Summary with verdicts.
SELECT check_name, value, verdict FROM (VALUES
  (1, 'roles with permissions', (SELECT count(DISTINCT role) FROM app_private.role_permissions)::text, 'information (D1)'),
  (2, 'roles with tasks.access', coalesce((SELECT string_agg(role, ', ' ORDER BY role) FROM app_private.role_permissions WHERE permission = 'tasks.access'), 'none'),
      'Production: administrator, manager + owner, director, expert, specialist (11_work_module_access)'),
  (3, 'roles with tasks.admin', coalesce((SELECT string_agg(role, ', ' ORDER BY role) FROM app_private.role_permissions WHERE permission = 'tasks.admin'), 'none'),
      'Work admin panel; Production filter leaves it to administrator (and manager if granted)'),
  (4, 'orders.test.generate rows', (SELECT count(*) FROM app_private.role_permissions WHERE permission = 'orders.test.generate')::text,
      CASE WHEN EXISTS (SELECT FROM app_private.role_permissions WHERE permission = 'orders.test.generate') THEN 'Production must have 0 (06_release_policy)' ELSE 'OK' END),
  (5, 'active departments', (SELECT count(*) FROM public."Departments" WHERE active)::text, 'business dictionary - owner: management'),
  (6, 'department code production', (SELECT count(*) FROM public."Departments" WHERE code = 'production')::text,
      CASE WHEN EXISTS (SELECT FROM public."Departments" WHERE code = 'production') THEN 'OK' ELSE 'needed for production roles' END),
  (7, 'active locations', (SELECT count(*) FROM public."Locations" WHERE active)::text, 'business dictionary - owner: management'),
  (8, 'active task categories', (SELECT count(*) FROM public."Task_categories" WHERE active)::text, 'optional'),
  (9, 'process templates', (SELECT count(*) FROM public."Process_templates")::text, 'optional; the UAT example seed is NOT for Production'),
  (10, 'buckets', coalesce((SELECT string_agg(id, ', ' ORDER BY id) FROM storage.buckets), 'none'),
      'expected: audit-photos, employee-avatars, tasks-private (all private)')
) AS v(nr, check_name, value, verdict) ORDER BY nr;
