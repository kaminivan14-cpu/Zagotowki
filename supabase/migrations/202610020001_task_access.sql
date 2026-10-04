BEGIN;
ALTER TABLE public."Employees" DROP CONSTRAINT employees_auth_role;
ALTER TABLE public."Employees" ADD CONSTRAINT employees_auth_role CHECK(role IN ('owner','administrator','director','expert','specialist','manager','su-chef','shift-manager','sushi-master','crafter','employee'));
ALTER TABLE public."Employees" DROP CONSTRAINT employees_auth_location;
ALTER TABLE public."Employees" ADD CONSTRAINT employees_auth_location CHECK(role IN ('owner','administrator','director','expert','specialist') OR location_id IS NOT NULL);
-- Owner receives explicit existing capabilities; it is not an alias for another identity.
INSERT INTO app_private.role_permissions SELECT 'owner',permission FROM app_private.role_permissions WHERE role='administrator';
INSERT INTO app_private.role_permissions SELECT r,p FROM unnest(ARRAY['owner','administrator','director','manager','expert','specialist']) r CROSS JOIN unnest(ARRAY['tasks.access','tasks.create.self','tasks.create.request','tasks.plan.self']) p;
INSERT INTO app_private.role_permissions SELECT r,p FROM unnest(ARRAY['owner','administrator','director','manager','expert']) r CROSS JOIN unnest(ARRAY['tasks.assign','tasks.read.scope','tasks.plan.scope','tasks.report.scope']) p;
INSERT INTO app_private.role_permissions SELECT r,p FROM unnest(ARRAY['owner','administrator','director','manager']) r CROSS JOIN unnest(ARRAY['tasks.approve','tasks.schedule.manage']) p;
INSERT INTO app_private.role_permissions VALUES('owner','tasks.admin'),('administrator','tasks.admin');
-- Explicit, bounded compatibility update of legacy admin predicates. No credentials change.
DO $$ DECLARE f record; d text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND
 ((n.nspname='public' AND (p.proname LIKE 'auth_%' OR p.proname IN ('create_production_plan','update_production_plan','complete_production_plan','reopen_production_plan','delete_production_plan','add_plan_item','update_plan_item','delete_plan_item','start_plan_item','complete_plan_item')))
 OR (n.nspname='app_private' AND p.proname IN ('can_read_location','can_read_plan','orders_actor','pin_admin'))) LOOP
  d:=pg_get_functiondef(f.oid);
  d:=regexp_replace(d, $p$\m(role|[a-z_]+\.role)\s*<>\s*'administrator'$p$, $r$\1 NOT IN ('owner','administrator')$r$,'g');
  d:=regexp_replace(d, $p$\m(role|[a-z_]+\.role)\s*=\s*'administrator'$p$, $r$\1 IN ('owner','administrator')$r$,'g');
  d:=replace(d,'''administrator'',''manager''','''owner'',''administrator'',''manager''');
  d:=replace(d,'''administrator'', ''manager''','''owner'', ''administrator'', ''manager''');
  IF f.oid='public.auth_save_employee(bigint,text,text,bigint,boolean)'::regprocedure THEN
   d:=replace(d,'''employee'',''crafter'',''sushi-master'',''shift-manager'',''su-chef'',''manager'',''administrator''','''employee'',''crafter'',''sushi-master'',''shift-manager'',''su-chef'',''manager'',''administrator'',''owner'',''director'',''expert'',''specialist''');
   d:=replace(d,'p_role<>''administrator'' AND p_location_id IS NULL','p_role NOT IN (''owner'',''administrator'',''director'',''expert'',''specialist'') AND p_location_id IS NULL');
   d:=replace(d,'p_role NOT IN (''owner'',''administrator'') AND p_location_id IS NULL','p_role NOT IN (''owner'',''administrator'',''director'',''expert'',''specialist'') AND p_location_id IS NULL');
  END IF;
  EXECUTE d;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION app_private.assert_requester(requester bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE e public."Employees"; BEGIN
 e:=app_private.actor();
 IF requester IS DISTINCT FROM e.id OR NOT app_private.has_permission('production.access') THEN RAISE EXCEPTION 'PRODUCTION_DENIED' USING ERRCODE='42501'; END IF;
END $$;
DROP POLICY auth_products ON public."Products";
CREATE POLICY auth_products ON public."Products" FOR SELECT TO authenticated USING(app_private.has_permission('production.access'));
DROP POLICY auth_recipes ON public."Recipe_ingredients";
CREATE POLICY auth_recipes ON public."Recipe_ingredients" FOR SELECT TO authenticated USING(app_private.has_permission('production.access'));
DROP POLICY auth_locations ON public."Locations";
CREATE POLICY auth_locations ON public."Locations" FOR SELECT TO authenticated USING(active AND app_private.can_read_location(id) AND (app_private.has_permission('production.access') OR app_private.has_permission('orders.access')));
CREATE TABLE public."Departments"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),active boolean NOT NULL DEFAULT true);
ALTER TABLE public."Employees" ADD COLUMN department_id bigint REFERENCES public."Departments";
CREATE TABLE public."Employee_reporting_lines"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public."Employees",manager_employee_id bigint NOT NULL REFERENCES public."Employees",effective_from date NOT NULL,effective_to date,CHECK(employee_id<>manager_employee_id),CHECK(effective_to IS NULL OR effective_to>effective_from));
CREATE INDEX reporting_employee ON public."Employee_reporting_lines"(employee_id,effective_from,effective_to);
CREATE INDEX reporting_manager ON public."Employee_reporting_lines"(manager_employee_id,effective_from,effective_to);
CREATE TABLE public."Task_scope_grants"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,grantee_employee_id bigint NOT NULL REFERENCES public."Employees",permission text NOT NULL CHECK(permission IN ('tasks.assign','tasks.read.scope','tasks.plan.scope','tasks.approve','tasks.report.scope','tasks.schedule.manage')),scope_type text NOT NULL CHECK(scope_type IN ('employee','department','hierarchy','location')),employee_id bigint REFERENCES public."Employees",department_id bigint REFERENCES public."Departments",location_id bigint REFERENCES public."Locations",CHECK((scope_type IN ('employee','hierarchy') AND employee_id IS NOT NULL AND department_id IS NULL AND location_id IS NULL) OR (scope_type='department' AND department_id IS NOT NULL AND employee_id IS NULL AND location_id IS NULL) OR (scope_type='location' AND location_id IS NOT NULL AND employee_id IS NULL AND department_id IS NULL)));
CREATE INDEX task_grantee ON public."Task_scope_grants"(grantee_employee_id,permission);
CREATE FUNCTION app_private.task_actor() RETURNS public."Employees" LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.actor(); IF a.archived_at IS NOT NULL OR NOT app_private.has_permission('tasks.access') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF; RETURN a; END $$;
CREATE FUNCTION app_private.task_descendant(p_root bigint,p_employee bigint,p_date date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE tree(id,path) AS(SELECT p_root,ARRAY[p_root] UNION ALL SELECT r.employee_id,t.path||r.employee_id FROM tree t JOIN public."Employee_reporting_lines" r ON r.manager_employee_id=t.id WHERE r.effective_from<=p_date AND (r.effective_to IS NULL OR r.effective_to>p_date) AND NOT r.employee_id=ANY(t.path)) SELECT EXISTS(SELECT FROM tree WHERE id=p_employee)
$$;
CREATE FUNCTION app_private.task_scope(p_permission text,p_employee bigint) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; e public."Employees"; BEGIN
 a:=app_private.task_actor(); SELECT * INTO e FROM public."Employees" WHERE id=p_employee;
 IF NOT FOUND THEN RETURN false; END IF;
 IF app_private.has_permission('tasks.admin') THEN RETURN true; END IF;
 IF NOT app_private.has_permission(p_permission) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT FROM public."Task_scope_grants" g WHERE g.grantee_employee_id=a.id AND g.permission=p_permission AND
 ((g.scope_type='employee' AND g.employee_id=e.id) OR (g.scope_type='department' AND g.department_id=e.department_id) OR (g.scope_type='location' AND g.location_id=e.location_id) OR (g.scope_type='hierarchy' AND app_private.task_descendant(g.employee_id,e.id,(now() AT TIME ZONE 'Europe/Warsaw')::date))));
END $$;
-- Admin updates and all hierarchy checks share one graph lock, including concurrent inserts.
CREATE FUNCTION app_private.task_reporting_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(20261002,1);
 IF EXISTS(WITH RECURSIVE path(id,lo,hi,seen) AS(
 SELECT NEW.manager_employee_id,NEW.effective_from,coalesce(NEW.effective_to,'infinity'::date),ARRAY[NEW.manager_employee_id]
 UNION ALL SELECT r.manager_employee_id,greatest(p.lo,r.effective_from),least(p.hi,coalesce(r.effective_to,'infinity'::date)),p.seen||r.manager_employee_id
 FROM path p JOIN public."Employee_reporting_lines" r ON r.employee_id=p.id WHERE r.id<>NEW.id AND r.effective_from<p.hi AND coalesce(r.effective_to,'infinity'::date)>p.lo AND NOT r.manager_employee_id=ANY(p.seen)) SELECT FROM path WHERE id=NEW.employee_id)
 THEN RAISE EXCEPTION 'REPORTING_CYCLE'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER reporting_guard BEFORE INSERT OR UPDATE ON public."Employee_reporting_lines" FOR EACH ROW EXECUTE FUNCTION app_private.task_reporting_guard();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['Departments','Employee_reporting_lines','Task_scope_grants'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP; END $$;
REVOKE ALL ON FUNCTION app_private.task_actor(),app_private.task_descendant(bigint,bigint,date),app_private.task_scope(text,bigint),app_private.task_reporting_guard() FROM PUBLIC,anon,authenticated;
COMMIT;
