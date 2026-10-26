-- Read-only snapshot of Production permission policy before work access rollout.
DELETE FROM app_private.role_permissions;
INSERT INTO app_private.role_permissions(role,permission) VALUES
('administrator','production.access'),
('manager','production.access'),
('su-chef','production.access'),
('shift-manager','production.access'),
('sushi-master','production.access'),
('crafter','production.access'),
('employee','production.access'),
('administrator','production.work.today'),
('manager','production.work.today'),
('su-chef','production.work.today'),
('shift-manager','production.work.today'),
('sushi-master','production.work.today'),
('crafter','production.work.today'),
('employee','production.work.today'),
('administrator','production.plan.manage'),
('administrator','production.history'),
('administrator','orders.access'),
('administrator','orders.dispatch'),
('administrator','orders.history.local'),
('manager','production.plan.manage'),
('manager','production.history'),
('manager','orders.access'),
('manager','orders.dispatch'),
('manager','orders.history.local'),
('su-chef','production.plan.manage'),
('su-chef','production.history'),
('shift-manager','production.plan.manage'),
('shift-manager','production.history'),
('administrator','orders.cut'),
('administrator','orders.issue'),
('administrator','orders.work'),
('administrator','orders.rates.manage'),
('administrator','orders.finance'),
('administrator','employees.manage'),
('manager','employees.manage'),
('owner','production.access'),
('owner','production.work.today'),
('owner','production.plan.manage'),
('owner','production.history'),
('owner','tasks.interrupt'),
('administrator','tasks.interrupt'),
('director','tasks.interrupt'),
('su-chef','orders.access'),
('su-chef','orders.work'),
('su-chef','orders.cut'),
('su-chef','orders.issue'),
('shift-manager','orders.access'),
('owner','employees.manage'),
('shift-manager','orders.work'),
('administrator','tasks.access'),
('shift-manager','orders.cut'),
('manager','tasks.access'),
('shift-manager','orders.issue'),
('sushi-master','orders.access'),
('sushi-master','orders.work'),
('administrator','tasks.create.self'),
('sushi-master','orders.cut'),
('manager','tasks.create.self'),
('sushi-master','orders.issue'),
('crafter','orders.access'),
('crafter','orders.work'),
('administrator','tasks.create.request'),
('crafter','orders.cut'),
('manager','tasks.create.request'),
('crafter','orders.issue'),
('administrator','tasks.plan.self'),
('manager','tasks.plan.self'),
('administrator','tasks.assign'),
('manager','tasks.assign'),
('administrator','tasks.read.scope'),
('manager','tasks.read.scope'),
('administrator','tasks.plan.scope'),
('manager','tasks.plan.scope'),
('administrator','tasks.report.scope'),
('manager','tasks.report.scope'),
('administrator','tasks.approve'),
('manager','tasks.approve'),
('administrator','tasks.schedule.manage'),
('manager','tasks.schedule.manage'),
('administrator','tasks.admin'),
('administrator','worktime.access'),
('administrator','worktime.read.scope'),
('administrator','worktime.export'),
('administrator','worktime.correct'),
('manager','worktime.access'),
('manager','worktime.read.scope'),
('manager','worktime.export'),
('manager','worktime.correct'),
('administrator','worktime.read.all'),
('administrator','worktime.self'),
('crafter','worktime.self'),
('employee','worktime.self'),
('manager','worktime.self'),
('owner','worktime.self'),
('shift-manager','worktime.self'),
('su-chef','worktime.self'),
('sushi-master','worktime.self'),
('director','worktime.self'),
('expert','worktime.self'),
('specialist','worktime.self'),
('owner','employees.read'),
('administrator','employees.read'),
('owner','organization.manage'),
('administrator','dictionaries.read'),
('administrator','organization.manage'),
('administrator','dictionaries.manage'),
('employee','audit.access'),
('administrator','processes.read'),
('specialist','audit.access'),
('administrator','processes.manage'),
('crafter','audit.access'),
('administrator','processes.launch'),
('owner','audit.access'),
('director','audit.access'),
('sushi-master','audit.access'),
('administrator','audit.access'),
('expert','audit.access'),
('shift-manager','audit.access'),
('su-chef','audit.access'),
('manager','audit.access'),
('administrator','orders.delete'),
('manager','orders.delete');
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
 (p_permission IN ('orders.access','orders.work','orders.cut','orders.issue') AND p_role IN ('su-chef','shift-manager','sushi-master','crafter')) OR
 NOT (p_permission LIKE 'orders.%' OR p_permission LIKE 'tasks.%' OR p_permission LIKE 'processes.%' OR p_permission LIKE 'dictionaries.%')))
$function$
;
CREATE OR REPLACE FUNCTION public.auth_capabilities()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT p.permission FROM public."Employees" e JOIN app_private.role_permissions p ON p.role=e.role
 WHERE e.auth_user_id=auth.uid() AND app_private.has_permission(p.permission) ORDER BY p.permission
$function$
;
CREATE OR REPLACE FUNCTION app_private.has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT EXISTS(SELECT FROM public."Employees" e WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL AND app_private.role_has_permission(e.role,p_permission))
$function$
;