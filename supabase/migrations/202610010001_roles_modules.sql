-- Role compatibility only: no credential, Auth identity or session changes.
BEGIN;
CREATE TABLE app_private.role_permissions(role text NOT NULL, permission text NOT NULL, PRIMARY KEY(role,permission));
REVOKE ALL ON app_private.role_permissions FROM PUBLIC,anon,authenticated;
INSERT INTO app_private.role_permissions
SELECT r,p FROM unnest(ARRAY['administrator','manager','su-chef','shift-manager','sushi-master','crafter','employee']) r
CROSS JOIN unnest(ARRAY['production.access','production.work.today']) p;
INSERT INTO app_private.role_permissions
SELECT r,p FROM unnest(ARRAY['administrator','manager','su-chef','shift-manager']) r
CROSS JOIN unnest(ARRAY['production.plan.manage','production.history','orders.access','orders.dispatch','orders.history.local']) p;
INSERT INTO app_private.role_permissions
SELECT r,p FROM unnest(ARRAY['administrator','su-chef','shift-manager']) r
CROSS JOIN unnest(ARRAY['orders.cut','orders.issue']) p;
INSERT INTO app_private.role_permissions VALUES
('administrator','orders.work'),('administrator','orders.rates.manage'),('administrator','orders.finance'),
('administrator','orders.test.generate'),('manager','orders.test.generate'),
('administrator','employees.manage'),('manager','employees.manage'),
('sushi-master','orders.access'),('sushi-master','orders.work'),('sushi-master','orders.history.own');
CREATE FUNCTION app_private.has_permission(p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM public."Employees" e JOIN app_private.role_permissions p ON p.role=e.role
 WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL AND p.permission=p_permission)
$$;
REVOKE ALL ON FUNCTION app_private.has_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.has_permission(text) TO authenticated;
CREATE FUNCTION public.auth_capabilities() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.permission FROM public."Employees" e JOIN app_private.role_permissions p ON p.role=e.role
 WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL ORDER BY p.permission
$$;
REVOKE ALL ON FUNCTION public.auth_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.auth_capabilities() TO authenticated;
ALTER TABLE public."Employees" DROP CONSTRAINT employees_auth_role;
ALTER TABLE public."Employees" ADD CONSTRAINT employees_auth_role CHECK(role IS NOT NULL AND role IN
 ('employee','crafter','sushi-master','shift-manager','su-chef','manager','administrator'));
ALTER TABLE public."Employees" DROP CONSTRAINT employees_pin_role;
ALTER TABLE public."Employees" ADD CONSTRAINT employees_pin_role CHECK(pin_hash IS NULL OR
 (role IN ('employee','crafter','sushi-master','shift-manager','su-chef','manager') AND auth_user_id IS NOT NULL));
-- Expand ONLY role allowlists in existing UAT routines, preserving their guards and bcrypt.
DO $$ DECLARE f record; d text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname IN ('pin_verify','pin_confirm','auth_save_employee','auth_link_employee',
 'create_production_plan','update_production_plan','complete_production_plan','reopen_production_plan','delete_production_plan',
 'add_plan_item','update_plan_item','delete_plan_item')) OR (n.nspname='app_private' AND p.proname='pin_admin') LOOP
  d:=pg_get_functiondef(f.oid);
  d:=replace(d,'''manager'',''su-chef'',''employee''','''manager'',''su-chef'',''shift-manager'',''sushi-master'',''crafter'',''employee''');
  d:=replace(d,'''employee'',''su-chef'',''manager'',''administrator''','''employee'',''crafter'',''sushi-master'',''shift-manager'',''su-chef'',''manager'',''administrator''');
  d:=replace(d,'''employee'',''su-chef''','''employee'',''crafter'',''sushi-master'',''shift-manager'',''su-chef''');
  d:=replace(d,'''administrator'', ''manager'', ''su-chef''','''administrator'', ''manager'', ''su-chef'', ''shift-manager''');
  d:=replace(d,'''administrator'',''manager'',''su-chef''','''administrator'',''manager'',''su-chef'',''shift-manager''');
  IF f.oid IN (SELECT oid FROM pg_proc WHERE proname IN ('create_production_plan','update_production_plan','complete_production_plan','reopen_production_plan','delete_production_plan','add_plan_item','update_plan_item','delete_plan_item')) THEN
   d:=regexp_replace(d, $pattern$(v_role|requester.role) not in \('administrator', 'manager', 'su-chef', 'shift-manager'\)$pattern$, $replacement$NOT app_private.has_permission('production.plan.manage')$replacement$, 'gi');
  END IF;
  EXECUTE d;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION app_private.can_read_plan(target_location bigint,target_status text,target_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app_private.has_permission('production.access') AND EXISTS(SELECT FROM public."Employees" e
 WHERE e.auth_user_id=auth.uid() AND e.active IS TRUE AND e.archived_at IS NULL
 AND (e.role='administrator' OR e.location_id=target_location)
 AND (app_private.has_permission('production.history') OR
 (app_private.has_permission('production.work.today') AND target_status='active' AND target_date=(now() AT TIME ZONE 'Europe/Warsaw')::date)))
$$;
COMMIT;
