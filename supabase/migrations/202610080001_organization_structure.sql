BEGIN;
-- Immutable published snapshots reference canonical Employees; no person copies or role changes.
CREATE TABLE public.organization_structure_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','archived','cancelled')),
 revision integer NOT NULL DEFAULT 1, is_baseline boolean NOT NULL DEFAULT false,
 effective_from date, effective_to date,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by_employee_id bigint REFERENCES public."Employees",
 scheduled_at timestamptz, scheduled_by_employee_id bigint REFERENCES public."Employees",
 activated_at timestamptz, cancelled_at timestamptz, notes text NOT NULL DEFAULT '',
 CHECK(effective_to IS NULL OR effective_to>effective_from),
 CHECK(status IN ('draft','cancelled') OR effective_from IS NOT NULL)
);
CREATE UNIQUE INDEX organization_one_scheduled ON public.organization_structure_versions((true)) WHERE status='scheduled';
CREATE UNIQUE INDEX organization_one_active ON public.organization_structure_versions((true)) WHERE status='active';
CREATE TABLE public.organization_structure_assignments (
 structure_version_id bigint NOT NULL REFERENCES public.organization_structure_versions,
 employee_id bigint NOT NULL REFERENCES public."Employees",
 department_id bigint REFERENCES public."Departments",
 manager_employee_id bigint REFERENCES public."Employees",
 PRIMARY KEY(structure_version_id,employee_id), CHECK(employee_id IS DISTINCT FROM manager_employee_id)
);
CREATE TABLE public.organization_structure_directors (
 structure_version_id bigint NOT NULL REFERENCES public.organization_structure_versions,
 department_id bigint NOT NULL REFERENCES public."Departments",
 employee_id bigint NOT NULL REFERENCES public."Employees",
 PRIMARY KEY(structure_version_id,department_id)
);
CREATE TABLE app_private.organization_structure_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 structure_version_id bigint NOT NULL REFERENCES public.organization_structure_versions,
 actor_employee_id bigint REFERENCES public."Employees", action text NOT NULL,
 before_value jsonb, after_value jsonb, reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_private.organization_structure_operations (
 operation_id uuid PRIMARY KEY,actor_employee_id bigint NOT NULL REFERENCES public."Employees",
 action text NOT NULL,args jsonb NOT NULL,result jsonb NOT NULL
);
INSERT INTO app_private.role_permissions(role,permission) VALUES ('owner','organization.manage'),('administrator','organization.manage') ON CONFLICT DO NOTHING;
CREATE FUNCTION app_private.org_version(p_date date) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT id FROM public.organization_structure_versions WHERE status IN ('scheduled','active','archived') AND effective_from<=p_date AND (effective_to IS NULL OR p_date<effective_to) ORDER BY effective_from DESC,id DESC LIMIT 1
$$;
CREATE FUNCTION app_private.org_assignments(p_date date)
RETURNS TABLE(employee_id bigint,department_id bigint,manager_employee_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.id,CASE WHEN v.id IS NULL THEN e.department_id ELSE a.department_id END,
 CASE WHEN v.id IS NULL THEN (SELECT r.manager_employee_id FROM public."Employee_reporting_lines" r WHERE r.employee_id=e.id AND r.effective_from<=p_date AND (r.effective_to IS NULL OR r.effective_to>p_date) ORDER BY r.effective_from DESC,r.id DESC LIMIT 1) ELSE a.manager_employee_id END
 FROM public."Employees" e LEFT JOIN public.organization_structure_versions v ON v.id=app_private.org_version(p_date)
 LEFT JOIN public.organization_structure_assignments a ON a.structure_version_id=v.id AND a.employee_id=e.id
$$;
CREATE FUNCTION app_private.org_manager(p_employee bigint,p_date date) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT manager_employee_id FROM app_private.org_assignments(p_date) WHERE employee_id=p_employee $$;
CREATE FUNCTION app_private.org_director(p_department bigint,p_date date) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT employee_id FROM public.organization_structure_directors WHERE structure_version_id=app_private.org_version(p_date) AND department_id=p_department $$;
CREATE FUNCTION app_private.org_activate_due() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v public.organization_structure_versions; b jsonb; BEGIN
 PERFORM pg_advisory_xact_lock(20261008,1);
 SELECT * INTO v FROM public.organization_structure_versions WHERE status='scheduled' AND effective_from<=app_private.task_today() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 b:=to_jsonb(v);
 UPDATE public.organization_structure_versions SET status='archived',effective_to=v.effective_from WHERE status='active';
 UPDATE public.organization_structure_versions SET status='active',activated_at=clock_timestamp() WHERE id=v.id;
 INSERT INTO app_private.organization_structure_events(structure_version_id,action,before_value,after_value,reason)
 SELECT id,'activate',b,to_jsonb(x),'Backend effective-date activation' FROM public.organization_structure_versions x WHERE id=v.id;
END $$;
CREATE FUNCTION app_private.org_validate(p_version bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT FROM public."Employees" e WHERE e.archived_at IS NULL AND NOT EXISTS(SELECT FROM public.organization_structure_assignments a WHERE a.structure_version_id=p_version AND a.employee_id=e.id)) THEN RAISE EXCEPTION 'ORG_MISSING_EMPLOYEE';END IF;
 IF EXISTS(SELECT FROM public.organization_structure_assignments a JOIN public."Departments" d ON d.id=a.department_id WHERE a.structure_version_id=p_version AND NOT d.active) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT';END IF;
 IF EXISTS(SELECT FROM public.organization_structure_assignments a JOIN public."Employees" m ON m.id=a.manager_employee_id WHERE a.structure_version_id=p_version AND (NOT m.active OR m.archived_at IS NOT NULL)) THEN RAISE EXCEPTION 'INVALID_MANAGER';END IF;
 IF EXISTS(WITH RECURSIVE tree(root,id,path,cycle) AS (
 SELECT employee_id,manager_employee_id,ARRAY[employee_id],employee_id=manager_employee_id FROM public.organization_structure_assignments WHERE structure_version_id=p_version
 UNION ALL SELECT t.root,a.manager_employee_id,t.path||t.id,a.manager_employee_id=ANY(t.path||t.id) FROM tree t JOIN public.organization_structure_assignments a ON a.structure_version_id=p_version AND a.employee_id=t.id WHERE NOT t.cycle AND t.id IS NOT NULL
 ) SELECT FROM tree WHERE cycle) THEN RAISE EXCEPTION 'REPORTING_CYCLE';END IF;
 IF EXISTS(SELECT FROM public.organization_structure_directors d LEFT JOIN public.organization_structure_assignments a ON a.structure_version_id=d.structure_version_id AND a.employee_id=d.employee_id JOIN public."Employees" e ON e.id=d.employee_id WHERE d.structure_version_id=p_version AND (a.department_id IS DISTINCT FROM d.department_id OR NOT e.active OR e.archived_at IS NOT NULL)) THEN RAISE EXCEPTION 'ORG_INVALID_DIRECTOR';END IF;
END $$;
CREATE FUNCTION public.organization_command(p_action text,p_args jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public."Employees"; v public.organization_structure_versions; prior app_private.organization_structure_operations; result jsonb;b jsonb;vid bigint;baseline bigint;day date; BEGIN
 actor:=app_private.task_actor(); IF NOT app_private.has_permission('organization.manage') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(20261002,2);
 IF p_operation IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(20261008,1);
 SELECT * INTO prior FROM app_private.organization_structure_operations WHERE operation_id=p_operation;
 IF FOUND THEN IF prior.actor_employee_id<>actor.id OR prior.action<>p_action OR prior.args<>p_args THEN RAISE EXCEPTION 'OPERATION_CONFLICT';END IF; RETURN prior.result;END IF;
 PERFORM app_private.org_activate_due();
 IF p_action='create' THEN
  IF p_args-ARRAY['name','notes','reason']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
  IF NOT EXISTS(SELECT FROM public.organization_structure_versions WHERE status IN ('active','scheduled','archived')) THEN
   -- Preserve the old dated source before cutover; do not silently discard scheduled legacy lines.
   IF EXISTS(SELECT FROM public."Employee_reporting_lines" WHERE effective_from>app_private.task_today() OR effective_to>app_private.task_today()) THEN RAISE EXCEPTION 'ORG_LEGACY_FUTURE_LINES';END IF;
   IF EXISTS(SELECT FROM public."Employee_reporting_lines" a JOIN public."Employee_reporting_lines" c ON a.employee_id=c.employee_id AND a.id<c.id AND daterange(a.effective_from,a.effective_to,'[)') && daterange(c.effective_from,c.effective_to,'[)')) THEN RAISE EXCEPTION 'ORG_LEGACY_OVERLAP';END IF;
   -- Capture source before making the baseline effective.
   INSERT INTO public.organization_structure_versions(name,status,effective_from,created_by_employee_id,activated_at) VALUES('Початкова структура','draft',app_private.task_today(),actor.id,clock_timestamp()) RETURNING id INTO baseline;
   INSERT INTO public.organization_structure_assignments SELECT baseline,* FROM app_private.org_assignments(app_private.task_today());
   PERFORM app_private.org_validate(baseline);
   UPDATE public.organization_structure_versions SET status='active',is_baseline=true WHERE id=baseline;
   INSERT INTO app_private.organization_structure_events(structure_version_id,actor_employee_id,action,after_value) VALUES(baseline,actor.id,'baseline',jsonb_build_object('effective_from',app_private.task_today()));
  END IF;
  INSERT INTO public.organization_structure_versions(name,notes,created_by_employee_id) VALUES(p_args->>'name',coalesce(p_args->>'notes',''),actor.id) RETURNING id INTO vid;
  INSERT INTO public.organization_structure_assignments SELECT vid,* FROM app_private.org_assignments(app_private.task_today());
  INSERT INTO public.organization_structure_directors SELECT vid,department_id,employee_id FROM public.organization_structure_directors WHERE structure_version_id=app_private.org_version(app_private.task_today());
 ELSE
  SELECT * INTO v FROM public.organization_structure_versions WHERE id=(p_args->>'id')::bigint FOR UPDATE;
  IF NOT FOUND OR v.revision IS DISTINCT FROM (p_args->>'revision')::integer THEN RAISE EXCEPTION 'ORG_VERSION_CONFLICT';END IF;
  vid:=v.id;b:=to_jsonb(v);
  IF p_action='cancel' THEN
   IF p_args-ARRAY['id','revision','reason']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
   IF v.status NOT IN ('draft','scheduled') OR (v.status='scheduled' AND v.effective_from<=app_private.task_today()) THEN RAISE EXCEPTION 'ORG_IMMUTABLE';END IF;
   UPDATE public.organization_structure_versions SET status='cancelled',cancelled_at=clock_timestamp() WHERE id=vid;
  ELSE
   IF v.status<>'draft' THEN RAISE EXCEPTION 'ORG_IMMUTABLE';END IF;
   IF p_action='assignment' THEN
    IF p_args-ARRAY['id','revision','employee_id','department_id','manager_employee_id','reason']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
    IF (p_args->>'employee_id')::bigint=(p_args->>'manager_employee_id')::bigint THEN RAISE EXCEPTION 'REPORTING_CYCLE';END IF;
    SELECT to_jsonb(a) INTO b FROM public.organization_structure_assignments a WHERE structure_version_id=vid AND employee_id=(p_args->>'employee_id')::bigint;
    INSERT INTO public.organization_structure_assignments VALUES(vid,(p_args->>'employee_id')::bigint,(p_args->>'department_id')::bigint,(p_args->>'manager_employee_id')::bigint)
    ON CONFLICT(structure_version_id,employee_id) DO UPDATE SET department_id=EXCLUDED.department_id,manager_employee_id=EXCLUDED.manager_employee_id;
   ELSIF p_action='director' THEN
    IF p_args-ARRAY['id','revision','department_id','employee_id','reason']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
    SELECT to_jsonb(d) INTO b FROM public.organization_structure_directors d WHERE structure_version_id=vid AND department_id=(p_args->>'department_id')::bigint;
    IF p_args->>'employee_id' IS NULL THEN DELETE FROM public.organization_structure_directors WHERE structure_version_id=vid AND department_id=(p_args->>'department_id')::bigint;
    ELSE INSERT INTO public.organization_structure_directors VALUES(vid,(p_args->>'department_id')::bigint,(p_args->>'employee_id')::bigint) ON CONFLICT(structure_version_id,department_id) DO UPDATE SET employee_id=EXCLUDED.employee_id;END IF;
   ELSIF p_action='schedule' THEN
    IF p_args-ARRAY['id','revision','effective_from','reason']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
    day:=(p_args->>'effective_from')::date;IF day IS NULL OR day<=app_private.task_today() THEN RAISE EXCEPTION 'ORG_INVALID_DATE';END IF;
    PERFORM app_private.org_validate(vid);
    IF EXISTS(SELECT FROM public.organization_structure_versions WHERE status='scheduled') THEN RAISE EXCEPTION 'ORG_SCHEDULE_CONFLICT';END IF;
    UPDATE public.organization_structure_versions SET status='scheduled',effective_from=day,scheduled_at=clock_timestamp(),scheduled_by_employee_id=actor.id WHERE id=vid;
   ELSE RAISE EXCEPTION 'INVALID_ACTION';END IF;
  END IF;
  UPDATE public.organization_structure_versions SET revision=revision+1 WHERE id=vid;
 END IF;
 SELECT jsonb_build_object('id',id,'revision',revision) INTO result FROM public.organization_structure_versions WHERE id=vid;
 INSERT INTO app_private.organization_structure_events(structure_version_id,actor_employee_id,action,before_value,after_value,reason) VALUES(vid,actor.id,p_action,b,p_args,p_args->>'reason');
 INSERT INTO app_private.organization_structure_operations VALUES(p_operation,actor.id,p_action,p_args,result);
 RETURN result;
END $$;
CREATE FUNCTION public.organization_structure(p_version bigint DEFAULT NULL,p_date date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public."Employees";vid bigint; day date:=coalesce(p_date,app_private.task_today()); BEGIN
 actor:=app_private.task_actor();IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 vid:=coalesce(p_version,app_private.org_version(day));
 IF p_version IS NOT NULL AND NOT EXISTS(SELECT FROM public.organization_structure_versions WHERE id=vid) THEN RAISE EXCEPTION 'ORG_VERSION_CONFLICT';END IF;
 RETURN jsonb_build_object('version_id',vid,'today',app_private.task_today(),'can_manage',app_private.has_permission('organization.manage'),
 'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('effective_status',CASE WHEN v.status IN ('active','scheduled','archived') THEN CASE WHEN v.id=app_private.org_version(app_private.task_today()) THEN 'active' WHEN v.effective_from>app_private.task_today() THEN 'scheduled' ELSE 'archived' END ELSE v.status END) ORDER BY v.created_at DESC),'[]') FROM public.organization_structure_versions v),
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'production_role',production_role,'active',active,'archived',archived_at IS NOT NULL) ORDER BY name),'[]') FROM public."Employees"),
 'departments',(SELECT coalesce(jsonb_agg(d ORDER BY name),'[]') FROM public."Departments" d),
 'assignments',CASE WHEN vid IS NULL THEN (SELECT coalesce(jsonb_agg(a),'[]') FROM app_private.org_assignments(day)a) ELSE (SELECT coalesce(jsonb_agg(a ORDER BY employee_id),'[]') FROM public.organization_structure_assignments a WHERE structure_version_id=vid) END,
 'directors',(SELECT coalesce(jsonb_agg(d),'[]') FROM public.organization_structure_directors d WHERE structure_version_id=vid),
 'events',(SELECT coalesce(jsonb_agg(e ORDER BY id DESC),'[]') FROM (SELECT * FROM app_private.organization_structure_events WHERE structure_version_id=vid ORDER BY id DESC LIMIT 100)e));
END $$;
-- Newly created/reassigned tasks snapshot the effective department, not stale legacy fields.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_core(text,jsonb,uuid)'::regprocedure);
 IF position('(SELECT department_id FROM public."Employees" WHERE id=dest)' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_core';END IF;
 EXECUTE replace(d,'(SELECT department_id FROM public."Employees" WHERE id=dest)','(SELECT department_id FROM app_private.org_assignments(app_private.task_today()) WHERE employee_id=dest)');
END $$;
-- Existing callers share date-aware hierarchy; privileges stay capability-based.
CREATE OR REPLACE FUNCTION app_private.task_descendant(p_root bigint,p_employee bigint,p_date date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE tree(id,path) AS(SELECT p_root,ARRAY[p_root] UNION ALL SELECT r.employee_id,t.path||r.employee_id FROM tree t JOIN app_private.org_assignments(p_date) r ON r.manager_employee_id=t.id WHERE NOT r.employee_id=ANY(t.path)) SELECT EXISTS(SELECT FROM tree WHERE id=p_employee)
$$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_scope(text,bigint)'::regprocedure);
 IF position('g.department_id=e.department_id' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_scope';END IF;
 EXECUTE replace(d,'g.department_id=e.department_id','g.department_id=(SELECT department_id FROM app_private.org_assignments(app_private.task_today()) WHERE employee_id=e.id)');
END $$;
CREATE OR REPLACE FUNCTION app_private.task_approver(p_employee bigint,p_creator bigint) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.id FROM public."Employees" e WHERE e.id<>p_employee AND e.active AND e.archived_at IS NULL AND EXISTS(SELECT FROM app_private.role_permissions p WHERE p.role=e.role AND p.permission='tasks.approve') AND
 (e.id=app_private.org_manager(p_employee,app_private.task_today()) OR e.id=app_private.org_director((SELECT department_id FROM app_private.org_assignments(app_private.task_today()) WHERE employee_id=p_employee),app_private.task_today()) OR e.id=p_creator)
 ORDER BY (CASE WHEN coalesce((SELECT NOT is_baseline FROM public.organization_structure_versions WHERE id=app_private.org_version(app_private.task_today())),false) THEN CASE WHEN e.id=app_private.org_manager(p_employee,app_private.task_today()) THEN 2 WHEN e.id=app_private.org_director((SELECT department_id FROM app_private.org_assignments(app_private.task_today()) WHERE employee_id=p_employee),app_private.task_today()) THEN 1 ELSE 0 END ELSE CASE WHEN e.id=p_creator THEN 2 ELSE 0 END END) DESC,e.id LIMIT 1
$$;
-- Preserve explicitly chosen process reviewers; otherwise resolve centrally at task creation.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app_private.process_command(text,jsonb,uuid)'::regprocedure);
 IF position('reviewer:=(t->>''approver_id'')::bigint;' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT process_command';END IF;
 EXECUTE replace(d,'reviewer:=(t->>''approver_id'')::bigint;','reviewer:=coalesce((t->>''approver_id'')::bigint,app_private.task_approver(dest,NULL)); t:=t||jsonb_build_object(''approver_id'',reviewer,''organization_structure_version_id'',app_private.org_version(app_private.task_today()));');
END $$;
ALTER TABLE public."Task_approval_requests" ADD COLUMN organization_structure_version_id bigint REFERENCES public.organization_structure_versions;
CREATE FUNCTION app_private.org_approval_stamp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN NEW.organization_structure_version_id:=app_private.org_version(app_private.task_today());RETURN NEW;END $$;
CREATE TRIGGER org_approval_stamp BEFORE INSERT ON public."Task_approval_requests" FOR EACH ROW EXECUTE FUNCTION app_private.org_approval_stamp();
-- A previously selected approver retains access only to their pending request's task.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_can_read(public."Tasks")'::regprocedure);
 IF position('RETURN p_task.assigned_to_employee_id=a.id' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_can_read';END IF;
 EXECUTE replace(d,'RETURN p_task.assigned_to_employee_id=a.id','RETURN EXISTS(SELECT FROM public."Task_approval_requests" r WHERE r.task_id=p_task.id AND r.status=''pending'' AND r.approver_employee_id=a.id AND app_private.has_permission(''tasks.approve'')) OR p_task.assigned_to_employee_id=a.id');
 d:=pg_get_functiondef('app_private.task_approval_command(text,jsonb,uuid)'::regprocedure);
 IF position('a.id=r.approver_employee_id AND (r.request_type=' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_approval_command';END IF;
 EXECUTE replace(d,'a.id=r.approver_employee_id AND (r.request_type=''task_creation'' OR app_private.task_scope(''tasks.approve'',t.assigned_to_employee_id))','a.id=r.approver_employee_id');
 d:=pg_get_functiondef('app_private.task_planning_command(text,jsonb,uuid)'::regprocedure);
 IF position('a.id=r.approver_employee_id AND app_private.task_scope' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_planning_command';END IF;
 EXECUTE replace(d,'a.id=r.approver_employee_id AND app_private.task_scope(''tasks.approve'',t.assigned_to_employee_id)','a.id=r.approver_employee_id');
END $$;
-- After snapshot adoption, old structural writers must not bypass version history.
CREATE FUNCTION app_private.org_legacy_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(20261008,1);
 IF EXISTS(SELECT FROM public.organization_structure_versions WHERE status IN ('active','scheduled','archived')) THEN
  IF TG_TABLE_NAME='Employees' THEN
   IF NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN RETURN NEW;END IF;
  END IF;
  RAISE EXCEPTION 'ORG_USE_VERSION';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER org_department_guard BEFORE UPDATE OF department_id ON public."Employees" FOR EACH ROW EXECUTE FUNCTION app_private.org_legacy_guard();
CREATE TRIGGER org_reporting_guard BEFORE INSERT OR UPDATE OR DELETE ON public."Employee_reporting_lines" FOR EACH ROW EXECUTE FUNCTION app_private.org_legacy_guard();
DO $$ DECLARE t text;f record;BEGIN
 FOREACH t IN ARRAY ARRAY['public.organization_structure_versions','public.organization_structure_assignments','public.organization_structure_directors','app_private.organization_structure_events','app_private.organization_structure_operations'] LOOP EXECUTE 'ALTER TABLE '||t||' ENABLE ROW LEVEL SECURITY';EXECUTE 'REVOKE ALL ON '||t||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;
 FOR t IN SELECT format('%I.%I',n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname IN ('public','app_private') AND c.relname LIKE 'organization_structure_%' LOOP EXECUTE 'REVOKE ALL ON SEQUENCE '||t||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_private' AND p.proname LIKE 'org_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.organization_command(text,jsonb,uuid),public.organization_structure(bigint,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.organization_command(text,jsonb,uuid),public.organization_structure(bigint,date) TO authenticated;
COMMIT;
