-- Employee management inventory (READ-ONLY). Target: First Zagotowki, ssheqxdgsmndiutthxvd (also runs on UAT).
-- Identifiers and status flags only: no names, e-mail addresses, PIN hashes, passwords or tokens are returned.
-- Run one numbered query at a time to read a section; a whole-file run shows E17 (summary with verdicts).
-- Explanation of every field and rule: docs/employee-data-dictionary-uk.md, docs/employee-management-business-logic-uk.md.

-- E1. Columns of the employee-related tables.
SELECT n.nspname || '.' || c.relname AS table_name, a.attnum AS position, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null,
       CASE WHEN a.attidentity <> '' THEN 'identity' ELSE pg_get_expr(d.adbin, d.adrelid) END AS default_expr
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND (n.nspname, c.relname) IN (('public', 'Employees'), ('public', 'Employee_reporting_lines'), ('public', 'Departments'),
       ('public', 'Locations'), ('public', 'Employee_capacity_settings'), ('public', 'Task_scope_grants'),
       ('public', 'organization_structure_versions'), ('public', 'organization_structure_assignments'),
       ('public', 'organization_structure_directors'), ('app_private', 'employee_invitations'), ('app_private', 'pin_accounts'),
       ('app_private', 'employee_auth_events'), ('app_private', 'role_permissions'))
ORDER BY 1, 2;

-- E2. Constraints and triggers of Employees and Employee_reporting_lines.
SELECT c.relname AS table_name, 'constraint' AS kind, k.conname AS name, pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
WHERE c.oid IN (to_regclass('public."Employees"'), to_regclass('public."Employee_reporting_lines"'))
UNION ALL
SELECT c.relname, 'trigger', g.tgname, pg_get_triggerdef(g.oid)
FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
WHERE c.oid IN (to_regclass('public."Employees"'), to_regclass('public."Employee_reporting_lines"')) AND NOT g.tgisinternal
ORDER BY 1, 2, 3;

-- E3. Status matrix: role x status x login link.
SELECT e.role,
       CASE WHEN e.archived_at IS NOT NULL THEN 'archived' WHEN e.active THEN 'active' ELSE 'inactive' END AS status,
       count(*) AS employees,
       count(*) FILTER (WHERE e.auth_user_id IS NOT NULL) AS linked_to_auth,
       count(*) FILTER (WHERE e.auth_user_id IS NULL) AS without_auth,
       count(*) FILTER (WHERE e.pin_hash IS NOT NULL) AS with_legacy_pin_hash
FROM public."Employees" e GROUP BY 1, 2 ORDER BY 1, 2;

-- E4. ACTIVE employees WITHOUT a login account (cannot sign in until invited / given a PIN).
SELECT e.id AS employee_id, e.role, e.location_id, e.department_id, e.production_role,
       e.position IS NOT NULL AS has_position, e.created_at::date AS created
FROM public."Employees" e
WHERE e.active AND e.archived_at IS NULL AND e.auth_user_id IS NULL
ORDER BY e.role, e.id;

-- E5. Employees linked to an Auth account and the state of that account (no e-mail values).
SELECT e.id AS employee_id, e.role, e.active, e.archived_at IS NOT NULL AS archived, e.auth_user_id,
       CASE WHEN u.id IS NULL THEN 'AUTH USER MISSING'
            WHEN u.email LIKE '%@pin.%.invalid' THEN 'pin (technical address)' ELSE 'email' END AS login_type,
       u.email_confirmed_at IS NOT NULL AS email_confirmed,
       coalesce(u.encrypted_password, '') <> '' AS has_password,
       u.last_sign_in_at::date AS last_sign_in,
       coalesce(u.banned_until > now(), false) AS banned
FROM public."Employees" e LEFT JOIN auth.users u ON u.id = e.auth_user_id
WHERE e.auth_user_id IS NOT NULL
ORDER BY e.active DESC, e.role, e.id;

-- E6. Auth accounts that belong to NO employee (they can sign in but get "Brak dostępu" in the app).
SELECT u.id AS auth_user_id, u.created_at::date AS created,
       CASE WHEN u.email LIKE '%@pin.%.invalid' THEN 'pin (technical address)' ELSE 'email' END AS login_type,
       u.email_confirmed_at IS NOT NULL AS email_confirmed, u.last_sign_in_at::date AS last_sign_in,
       coalesce(u.banned_until > now(), false) AS banned
FROM auth.users u WHERE NOT EXISTS (SELECT FROM public."Employees" e WHERE e.auth_user_id = u.id)
ORDER BY u.created_at;

-- E7. Integrity checks (each row = one employee with a problem; empty result = clean).
SELECT e.id AS employee_id, e.role, problem FROM public."Employees" e
CROSS JOIN LATERAL (VALUES
  (CASE WHEN e.active AND e.archived_at IS NULL AND e.location_id IS NULL
         AND e.role NOT IN ('owner', 'administrator', 'director', 'expert', 'specialist') THEN 'location required for this role but missing' END),
  (CASE WHEN e.location_id IS NOT NULL AND EXISTS (SELECT FROM public."Locations" l WHERE l.id = e.location_id AND l.active IS NOT TRUE)
         AND e.active THEN 'active employee at an inactive location' END),
  (CASE WHEN e.production_role IS NOT NULL AND NOT EXISTS (SELECT FROM public."Departments" d WHERE d.id = e.department_id AND d.code = 'production')
         THEN 'production_role set outside the production department' END),
  (CASE WHEN e.active AND e.archived_at IS NULL AND NOT EXISTS (SELECT FROM app_private.role_permissions p WHERE p.role = e.role)
         THEN 'role has no permissions at all (cannot use any module)' END),
  (CASE WHEN e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL AND NOT EXISTS (SELECT FROM auth.users u WHERE u.id = e.auth_user_id)
         THEN 'linked Auth user does not exist' END),
  (CASE WHEN (SELECT count(*) FROM public."Employee_reporting_lines" r WHERE r.employee_id = e.id AND r.effective_from <= current_date
              AND (r.effective_to IS NULL OR r.effective_to > current_date)) > 1 THEN 'more than one current reporting line' END),
  (CASE WHEN e.active AND EXISTS (SELECT FROM public."Employee_reporting_lines" r JOIN public."Employees" m ON m.id = r.manager_employee_id
              WHERE r.employee_id = e.id AND r.effective_from <= current_date AND (r.effective_to IS NULL OR r.effective_to > current_date)
              AND (NOT m.active OR m.archived_at IS NOT NULL)) THEN 'current manager is inactive or archived' END)
) AS p(problem)
WHERE problem IS NOT NULL ORDER BY 3, 1;

-- E8. Positions (business job titles, free text) in use.
SELECT lower(btrim(regexp_replace(e.position, '\s+', ' ', 'g'))) AS position_normalised,
       count(*) AS employees, count(*) FILTER (WHERE e.active AND e.archived_at IS NULL) AS active_employees
FROM public."Employees" e WHERE e.position IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1;

-- E9. System roles in use and the number of permissions each role carries.
SELECT r.role, coalesce(x.employees, 0) AS employees, coalesce(x.active_employees, 0) AS active_employees,
       (SELECT count(*) FROM app_private.role_permissions p WHERE p.role = r.role) AS permissions
FROM (SELECT DISTINCT role FROM public."Employees" UNION SELECT DISTINCT role FROM app_private.role_permissions) r
LEFT JOIN (SELECT role, count(*) AS employees, count(*) FILTER (WHERE active AND archived_at IS NULL) AS active_employees
           FROM public."Employees" GROUP BY role) x ON x.role = r.role
ORDER BY 1;

-- E10. Production roles and departments.
SELECT coalesce(e.production_role, '(none)') AS production_role, coalesce(d.code, '(no code)') AS department_code,
       count(*) AS employees, count(*) FILTER (WHERE e.active AND e.archived_at IS NULL) AS active_employees
FROM public."Employees" e LEFT JOIN public."Departments" d ON d.id = e.department_id
GROUP BY 1, 2 ORDER BY 1, 2;

-- E11. Departments.
SELECT d.id, d.name, d.code, d.active,
       (SELECT count(*) FROM public."Employees" e WHERE e.department_id = d.id AND e.active AND e.archived_at IS NULL) AS active_employees
FROM public."Departments" d ORDER BY d.id;

-- E12. Locations.
SELECT l.id, l.name, l.city, l.active,
       (SELECT count(*) FROM public."Employees" e WHERE e.location_id = l.id AND e.active AND e.archived_at IS NULL) AS active_employees
FROM public."Locations" l ORDER BY l.id;

-- E13. Organisation: structure versions and today's effective department / manager per active employee.
SELECT 'structure version' AS kind, v.id::text AS id, v.status AS value, v.effective_from::text AS detail
FROM public.organization_structure_versions v
UNION ALL
SELECT 'today', a.employee_id::text, coalesce(a.department_id::text, '-') || ' / manager ' || coalesce(a.manager_employee_id::text, '-'),
       CASE WHEN v.id IS NULL THEN 'source: Employees + Employee_reporting_lines' ELSE 'source: structure version ' || v.id END
FROM app_private.org_assignments(current_date) a
JOIN public."Employees" e ON e.id = a.employee_id AND e.active AND e.archived_at IS NULL
LEFT JOIN public.organization_structure_versions v ON v.id = app_private.org_version(current_date)
ORDER BY 1, 2;

-- E14. Invitations (owner / administrator e-mail invitations; empty when the table does not exist).
SELECT (xpath('/row/status/text()', r))[1]::text AS status, (xpath('/row/result/text()', r))[1]::text AS result,
       (xpath('/row/n/text()', r))[1]::text AS invitations, (xpath('/row/latest/text()', r))[1]::text AS latest
FROM unnest(xpath('/table/row', query_to_xml(CASE WHEN to_regclass('app_private.employee_invitations') IS NULL
       THEN 'SELECT NULL::text AS status, NULL::text AS result, NULL::text AS n, NULL::text AS latest WHERE false'
       ELSE 'SELECT status, result, count(*)::text AS n, max(created_at)::text AS latest FROM app_private.employee_invitations GROUP BY 1, 2 ORDER BY 1, 2' END,
       false, false, ''))) AS r;

-- E15. PIN login state (counts only; never the hash).
SELECT e.role, count(*) FILTER (WHERE e.pin_hash IS NOT NULL) AS with_pin_hash,
       count(*) FILTER (WHERE e.auth_user_id IS NOT NULL) AS linked,
       (xpath('/row/n/text()', query_to_xml(CASE WHEN to_regclass('app_private.pin_accounts') IS NULL
          THEN 'SELECT NULL::text AS n' ELSE format('SELECT count(*)::text AS n FROM app_private.pin_accounts p JOIN public."Employees" x ON x.id = p.employee_id WHERE x.role = %L', e.role) END,
          false, false, '')))[1]::text AS pin_accounts
FROM public."Employees" e WHERE e.active AND e.archived_at IS NULL
GROUP BY e.role ORDER BY 1;

-- E16. Employee-management RPCs and who may execute them.
SELECT p.proname AS rpc, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('auth_employee_profile', 'auth_capabilities', 'auth_list_employees', 'auth_save_employee',
  'auth_employee_lifecycle', 'auth_email_access', 'auth_invite_command', 'auth_link_employee', 'auth_employee_names',
  'tasks_admin_directory', 'tasks_admin_command', 'organization_structure', 'organization_command', 'organization_move_department',
  'employee_avatar_set', 'pin_verify', 'pin_confirm', 'pin_reserve', 'pin_prepare', 'pin_finish')
ORDER BY 1, 2;

-- E17. Summary with verdicts.
SELECT check_name, value, verdict FROM (VALUES
  (1, 'employees total', (SELECT count(*) FROM public."Employees")::text, 'information'),
  (2, 'active (not archived)', (SELECT count(*) FROM public."Employees" WHERE active AND archived_at IS NULL)::text, 'information'),
  (3, 'inactive (not archived)', (SELECT count(*) FROM public."Employees" WHERE NOT coalesce(active, false) AND archived_at IS NULL)::text, 'information'),
  (4, 'archived', (SELECT count(*) FROM public."Employees" WHERE archived_at IS NOT NULL)::text, 'information'),
  (5, 'active without login account', (SELECT count(*) FROM public."Employees" WHERE active AND archived_at IS NULL AND auth_user_id IS NULL)::text,
      'these people cannot sign in yet (E4)'),
  (6, 'Auth accounts without employee', (SELECT count(*) FROM auth.users u WHERE NOT EXISTS (SELECT FROM public."Employees" e WHERE e.auth_user_id = u.id))::text,
      'they see "Brak dostępu" (E6)'),
  (7, 'active owners / administrators with login',
      (SELECT count(*) FROM public."Employees" WHERE role IN ('owner', 'administrator') AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL)::text,
      CASE WHEN (SELECT count(*) FROM public."Employees" WHERE role IN ('owner', 'administrator') AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL) = 0
           THEN 'STOP: nobody can administer employees' ELSE 'OK' END),
  (8, 'integrity problems (E7)', (SELECT count(*) FROM public."Employees" e WHERE
        (e.active AND e.archived_at IS NULL AND e.location_id IS NULL AND e.role NOT IN ('owner', 'administrator', 'director', 'expert', 'specialist'))
     OR (e.production_role IS NOT NULL AND NOT EXISTS (SELECT FROM public."Departments" d WHERE d.id = e.department_id AND d.code = 'production'))
     OR ((SELECT count(*) FROM public."Employee_reporting_lines" r WHERE r.employee_id = e.id AND r.effective_from <= current_date
          AND (r.effective_to IS NULL OR r.effective_to > current_date)) > 1))::text, 'details in E7'),
  (9, 'department with code production', (SELECT count(*) FROM public."Departments" WHERE code = 'production' AND active)::text,
      CASE WHEN EXISTS (SELECT FROM public."Departments" WHERE code = 'production' AND active) THEN 'OK'
           ELSE 'production roles cannot be assigned until a department with code production exists' END),
  (10, 'active locations', (SELECT count(*) FROM public."Locations" WHERE active)::text,
      CASE WHEN EXISTS (SELECT FROM public."Locations" WHERE active) THEN 'OK' ELSE 'STOP: location-bound roles cannot be saved' END),
  (11, 'active organisation structure version', coalesce((SELECT id::text FROM public.organization_structure_versions WHERE status = 'active'), 'none'),
      CASE WHEN EXISTS (SELECT FROM public.organization_structure_versions WHERE status = 'active')
           THEN 'departments / managers come from the structure version' ELSE 'departments / managers come from Employees + Employee_reporting_lines' END),
  (12, 'employees with a position', (SELECT count(*) FROM public."Employees" WHERE position IS NOT NULL AND active AND archived_at IS NULL)::text,
      'process steps by position need at least one active, linked employee per position')
) AS v(nr, check_name, value, verdict) ORDER BY nr;
