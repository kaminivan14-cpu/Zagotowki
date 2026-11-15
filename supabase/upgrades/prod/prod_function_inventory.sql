-- Production function inventory (READ-ONLY): every function in public / app_private with the attributes that matter
-- for the API contract and security. md5_source is md5(prosrc) - the same fingerprint prod_gap_analysis.sql compares
-- against every repository version. A whole-file run shows F3 (functions that deserve attention).

-- F1. All functions.
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS returns, l.lanname AS language, p.prosecdef AS security_definer,
       CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END AS volatility,
       coalesce(array_to_string(p.proconfig, ', '), '') AS config, md5(p.prosrc) AS md5_source,
       pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname IN ('public', 'app_private')
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
ORDER BY 1, 2, 3;

-- F2. Public API surface: functions PostgREST exposes (public schema) and who may call them.
SELECT p.proname AS rpc, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_only_if_others_false
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
ORDER BY 1, 2;

-- F3. Attention list: SECURITY DEFINER without a fixed search_path, and functions callable by anon.
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
       CASE WHEN p.prosecdef AND NOT coalesce(array_to_string(p.proconfig, ',') LIKE '%search_path=%', false)
              THEN 'SECURITY DEFINER without fixed search_path'
            WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'callable by anon (no login) - confirm it is meant to be public' END AS attention
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'app_private')
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  AND ((p.prosecdef AND NOT coalesce(array_to_string(p.proconfig, ',') LIKE '%search_path=%', false))
       OR has_function_privilege('anon', p.oid, 'EXECUTE'))
ORDER BY 4, 1, 2;
