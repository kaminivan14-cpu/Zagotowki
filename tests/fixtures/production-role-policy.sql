CREATE OR REPLACE FUNCTION app_private.role_has_permission(p_role text, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT p_permission<>'orders.test.generate' AND EXISTS(
 SELECT FROM app_private.role_permissions p
 WHERE p.role=p_role AND p.permission=p_permission
 AND (p_role IN ('administrator','manager') OR
 NOT (p_permission LIKE 'orders.%' OR p_permission LIKE 'tasks.%' OR p_permission LIKE 'processes.%' OR p_permission LIKE 'dictionaries.%')))
$function$
;
