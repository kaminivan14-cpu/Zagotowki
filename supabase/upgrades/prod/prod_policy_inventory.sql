-- Production RLS, grants and Storage inventory (READ-ONLY). A whole-file run shows R6 (attention list).
-- The application reads data through SECURITY DEFINER RPCs; most tables therefore have RLS on and NO policies
-- (nothing is readable directly). Policies exist mainly on storage.objects.

-- R1. RLS status and number of policies per table.
SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r', 'p') ORDER BY 1, 2;

-- R2. Every policy in public, app_private and storage.
SELECT schemaname AS schema, tablename AS table_name, policyname AS policy, permissive, cmd, roles, qual AS using_expr, with_check
FROM pg_policies WHERE schemaname IN ('public', 'app_private', 'storage') ORDER BY 1, 2, 3;

-- R3. Direct table privileges of the API roles (anon = not logged in, authenticated = any logged-in user).
SELECT n.nspname AS schema, c.relname AS table_name, r.rolname AS api_role,
       string_agg(DISTINCT x.privilege_type, ', ' ORDER BY x.privilege_type) AS privileges
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) x JOIN pg_roles r ON r.oid = x.grantee
WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r', 'p', 'v', 'm') AND r.rolname IN ('anon', 'authenticated')
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- R4. Storage buckets.
SELECT id, name, public, file_size_limit, array_to_string(ARRAY(SELECT unnest(allowed_mime_types) ORDER BY 1), ', ') AS allowed_mime_types,
       (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id) AS objects
FROM storage.buckets b ORDER BY id;

-- R5. Storage object policies (expected per bucket: supabase/storage/*.sql).
SELECT policyname AS policy, cmd, roles, qual AS using_expr, with_check,
       CASE WHEN qual LIKE '%tasks-private%' OR with_check LIKE '%tasks-private%' THEN 'tasks-private'
            WHEN qual LIKE '%audit-photos%' OR with_check LIKE '%audit-photos%' THEN 'audit-photos'
            WHEN qual LIKE '%employee-avatars%' OR with_check LIKE '%employee-avatars%' THEN 'employee-avatars' ELSE 'other' END AS bucket
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY 6, 1;

-- R6. Attention list.
SELECT 'public table without RLS (exposed schema)' AS finding, n.nspname || '.' || c.relname AS object, NULL::text AS detail
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
UNION ALL
SELECT 'API role has direct table privileges', n.nspname || '.' || c.relname, r.rolname || ': ' || string_agg(DISTINCT x.privilege_type, ',')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x JOIN pg_roles r ON r.oid = x.grantee
WHERE n.nspname IN ('public', 'app_private') AND c.relkind IN ('r', 'p', 'v', 'm') AND r.rolname IN ('anon', 'authenticated')
GROUP BY n.nspname, c.relname, r.rolname
UNION ALL
SELECT 'public bucket', id, 'objects readable without login' FROM storage.buckets WHERE public
UNION ALL
SELECT 'storage policy for anon', policyname, cmd FROM pg_policies WHERE schemaname = 'storage' AND 'anon' = ANY (roles)
UNION ALL
SELECT 'old tasks-private read rule', policyname, 'upgrade with supabase/storage/tasks-private-policies-202611140001.sql'
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'tasks_file_select' AND qual NOT LIKE '%tasks_storage_select%'
ORDER BY 1, 2;
