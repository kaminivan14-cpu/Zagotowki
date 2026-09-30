-- Read-only post-cutover checks. No PINs, hashes, emails, UID values or tokens returned.
BEGIN READ ONLY;
SELECT version,phase,frontend_release,prepared_at,cutover_at FROM app_private.production_upgrade;
SELECT employee_id,ready AS technical_ready,reason FROM public.upgrade_readiness();
SELECT employee_id,login_status FROM public.upgrade_login_coverage();
SELECT count(*) AS employees,count(*) FILTER(WHERE auth_user_id IS NOT NULL) AS linked,
 count(*) FILTER(WHERE pin_hash IS NOT NULL AND pin_legacy) AS preserved_legacy_credentials,
 count(*) FILTER(WHERE role='administrator' AND pin_hash IS NOT NULL) AS preserved_admin_credentials
 FROM public."Employees";
SELECT p.oid::regprocedure::text AS signature,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND proname IN ('login_employee','create_employee','change_employee_pin','get_employees','update_employee','set_employee_active');
SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r';
COMMIT;
