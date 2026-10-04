BEGIN;
DO $baseline$ BEGIN
IF md5(pg_get_functiondef('app_private.task_dispatch(text,jsonb,uuid)'::regprocedure))<>'4fb7a876e2887af1cc514945c0c090f5' THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_dispatch';END IF;
IF md5(pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure))<>'039ab3f9d908cfea4bd2bf97d6642564' THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_validate_args';END IF;
IF md5(pg_get_functiondef('app_private.task_settings_command(text,jsonb,uuid)'::regprocedure))<>'75f5d46e21e3cbf68a4d13a05ca2ac32' THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_settings_command';END IF;
IF md5(pg_get_functiondef('public.tasks_context()'::regprocedure))<>'27f98c3777a7335b6eb7b7ffea58c410' THEN RAISE EXCEPTION 'SCHEMA_DRIFT tasks_context';END IF;
END $baseline$;
ALTER TABLE public."Departments" ADD COLUMN code text UNIQUE;
UPDATE public."Departments" d SET code=v.code FROM (VALUES ('marketing','Маркетинг'),('finance','Фінанси'),('it','ІТ'),('quality','Якість'),('hr','HR'),('operations','Операційний'),('production','Виробничий'))v(code,name) WHERE d.id=(SELECT min(id) FROM public."Departments" WHERE name=v.name AND code IS NULL);
INSERT INTO public."Departments"(code,name) SELECT v.code,v.name FROM (VALUES ('marketing','Маркетинг'),('finance','Фінанси'),('it','ІТ'),('quality','Якість'),('hr','HR'),('operations','Операційний'),('production','Виробничий'))v(code,name) WHERE NOT EXISTS(SELECT FROM public."Departments" WHERE code=v.code);
ALTER TABLE public."Employees" ADD COLUMN production_role text CHECK(production_role IN ('su-chef','shift-manager','sushi-master','crafter'));
INSERT INTO app_private.role_permissions(role,permission) SELECT role,p FROM app_private.role_permissions CROSS JOIN unnest(ARRAY['employees.read','employees.manage','dictionaries.read','dictionaries.manage','processes.read','processes.manage','processes.launch'])p WHERE permission='tasks.admin' ON CONFLICT DO NOTHING;
CREATE TABLE public."Task_admin_events"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_employee_id bigint NOT NULL REFERENCES public."Employees",entity text NOT NULL,entity_id text NOT NULL,action text NOT NULL,old_value jsonb,new_value jsonb,operation_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public."Process_templates"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 300),active boolean NOT NULL DEFAULT true,created_by_employee_id bigint REFERENCES public."Employees",created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public."Process_versions"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,template_id bigint NOT NULL REFERENCES public."Process_templates",number integer NOT NULL CHECK(number>0),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),revision integer NOT NULL DEFAULT 1,definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),created_by_employee_id bigint REFERENCES public."Employees",created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(template_id,number));
CREATE TABLE public."Process_instances"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,version_id bigint NOT NULL REFERENCES public."Process_versions",owner_employee_id bigint NOT NULL REFERENCES public."Employees",starts_on date NOT NULL,department_id bigint REFERENCES public."Departments",location_id bigint REFERENCES public."Locations",operation_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public."Task_results"(task_id bigint PRIMARY KEY REFERENCES public."Tasks",value jsonb NOT NULL,submitted_by bigint NOT NULL REFERENCES public."Employees",approved_by bigint REFERENCES public."Employees",submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),approved_at timestamptz);
CREATE TABLE public."Task_files"(id uuid PRIMARY KEY,object_key text NOT NULL UNIQUE,name text NOT NULL,mime text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),uploaded_by bigint NOT NULL REFERENCES public."Employees",task_id bigint REFERENCES public."Tasks",version_id bigint REFERENCES public."Process_versions",created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((task_id IS NULL)<>(version_id IS NULL)));
CREATE INDEX process_task_instance ON public."Tasks"((source_metadata->>'process_instance_id')) WHERE source_type='process';
CREATE FUNCTION app_private.task_admin_audit(p_entity text,p_id text,p_action text,p_old jsonb,p_new jsonb,p_op uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ INSERT INTO public."Task_admin_events"(actor_employee_id,entity,entity_id,action,old_value,new_value,operation_id) VALUES((app_private.task_actor()).id,p_entity,p_id,p_action,p_old,p_new,p_op) $$;
CREATE FUNCTION app_private.process_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF OLD.status='published' THEN RAISE EXCEPTION 'PROCESS_VERSION_IMMUTABLE';END IF;RETURN NEW;END $$;
CREATE TRIGGER process_immutable BEFORE UPDATE OR DELETE ON public."Process_versions" FOR EACH ROW EXECUTE FUNCTION app_private.process_immutable();
CREATE FUNCTION app_private.process_validate(p_definition jsonb,p_publish boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb;t jsonb;d jsonb;prev text;keys text[]:='{}';edges jsonb:='[]';file_id text; BEGIN
 IF length(trim(coalesce(p_definition->>'name',''))) NOT BETWEEN 1 AND 300 OR jsonb_typeof(p_definition->'stages') IS DISTINCT FROM 'array' OR jsonb_array_length(p_definition->'stages')>50 THEN RAISE EXCEPTION 'INVALID_PROCESS';END IF;
 IF p_publish AND jsonb_array_length(p_definition->'stages')=0 THEN RAISE EXCEPTION 'EMPTY_PROCESS';END IF;
 IF p_definition->>'owner_employee_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Employees" WHERE id=(p_definition->>'owner_employee_id')::bigint AND active AND archived_at IS NULL) THEN RAISE EXCEPTION 'INVALID_MANAGER';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_definition->'stages') LOOP
 prev:=NULL;
  IF length(trim(coalesce(s->>'name','')))=0 OR jsonb_typeof(s->'tasks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_PROCESS';END IF;
  IF p_publish AND jsonb_array_length(s->'tasks')=0 THEN RAISE EXCEPTION 'EMPTY_STAGE';END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   IF coalesce(t->>'key','')!~'^[a-zA-Z0-9_-]{1,80}$' OR t->>'key'=ANY(keys) OR length(trim(coalesce(t->>'title',''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
   IF coalesce((t->>'parallel')::boolean,true)=false AND prev IS NOT NULL THEN edges:=edges||jsonb_build_array(jsonb_build_object('from',t->>'key','to',prev));END IF;prev:=t->>'key';
   keys:=array_append(keys,t->>'key');IF cardinality(keys)>300 THEN RAISE EXCEPTION 'PROCESS_TOO_LARGE';END IF;
   IF coalesce(t->>'priority','') NOT IN ('low','medium','high','critical') OR coalesce(t->>'result_type','') NOT IN ('done','comment','photo','file','link','number','approval') THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
   IF t->>'estimated_minutes' IS NOT NULL AND (t->>'estimated_minutes')::integer NOT BETWEEN 1 AND 525600 THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
   IF t->>'offset_days' IS NOT NULL AND (t->>'offset_days')::integer NOT BETWEEN 0 AND 3660 THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
   IF t->>'category_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Task_categories" WHERE id=(t->>'category_id')::bigint AND active) THEN RAISE EXCEPTION 'INACTIVE_CATEGORY';END IF;
   IF t->>'department_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Departments" WHERE id=(t->>'department_id')::bigint AND active) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT';END IF;
   FOR d IN SELECT value FROM jsonb_array_elements(coalesce(t->'depends_on','[]')) LOOP edges:=edges||jsonb_build_array(jsonb_build_object('from',t->>'key','to',d#>>'{}'));END LOOP;
   IF coalesce(t->>'relative_to','')<>'' THEN edges:=edges||jsonb_build_array(jsonb_build_object('from',t->>'key','to',t->>'relative_to'));END IF;
   IF jsonb_typeof(coalesce(t->'checklist','[]'))<>'array' OR jsonb_array_length(coalesce(t->'checklist','[]'))>100 THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT FROM jsonb_array_elements(edges)e WHERE NOT (e->>'to'=ANY(keys)) OR e->>'to'=e->>'from') THEN RAISE EXCEPTION 'INVALID_DEPENDENCY';END IF;
 IF EXISTS(WITH RECURSIVE walk(root,node) AS(SELECT e->>'from',e->>'to' FROM jsonb_array_elements(edges)e UNION SELECT w.root,e->>'to' FROM walk w JOIN jsonb_array_elements(edges)e ON e->>'from'=w.node) SELECT FROM walk WHERE root=node) THEN RAISE EXCEPTION 'DEPENDENCY_CYCLE';END IF;
 FOR file_id IN SELECT jsonb_path_query(p_definition,'$.**.attachments[*]')#>>'{}' LOOP
  IF NOT EXISTS(SELECT FROM public."Task_files" WHERE id=file_id::uuid AND version_id IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_ATTACHMENT';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.tasks_admin_directory() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM app_private.task_actor();IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 RETURN public.tasks_admin_state()||jsonb_build_object(
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'role',e.role,'active',e.active,'archived',e.archived_at IS NOT NULL,'department_id',e.department_id,'production_role',e.production_role,'location_id',e.location_id,'linked',e.auth_user_id IS NOT NULL,'capabilities',(SELECT coalesce(jsonb_agg(permission ORDER BY permission),'[]') FROM app_private.role_permissions WHERE role=e.role)) ORDER BY e.name,e.id),'[]') FROM public."Employees"e),
 'departments',(SELECT coalesce(jsonb_agg(d ORDER BY name),'[]') FROM public."Departments"d),
 'categories',(SELECT coalesce(jsonb_agg(c ORDER BY sort_order,id),'[]') FROM public."Task_categories"c),
 'locations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM public."Locations" WHERE active),
 'audit',(SELECT coalesce(jsonb_agg(x ORDER BY id DESC),'[]') FROM(SELECT id,entity,entity_id,action,actor_employee_id,created_at FROM public."Task_admin_events" ORDER BY id DESC LIMIT 100)x));END $$;
CREATE FUNCTION app_private.tasks_employee_save(p jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees";before_e jsonb;after_e jsonb;eid bigint;dep bigint;manager bigint;prod text;BEGIN
 a:=app_private.task_actor();IF NOT app_private.has_permission('tasks.admin') OR NOT app_private.has_permission('employees.manage') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 dep:=(p->>'department_id')::bigint;manager:=(p->>'manager_id')::bigint;
 IF dep IS NOT NULL AND NOT EXISTS(SELECT FROM public."Departments" WHERE id=dep AND active) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT';END IF;
 prod:=CASE WHEN EXISTS(SELECT FROM public."Departments" WHERE id=dep AND code='production') THEN p->>'production_role' END;
 IF manager=(p->>'id')::bigint THEN RAISE EXCEPTION 'REPORTING_CYCLE';END IF;
 IF manager IS NOT NULL AND NOT EXISTS(SELECT FROM public."Employees" WHERE id=manager AND active AND archived_at IS NULL) THEN RAISE EXCEPTION 'INVALID_MANAGER';END IF;
 SELECT jsonb_build_object('name',name,'role',role,'active',active,'location_id',location_id,'department_id',department_id,'production_role',production_role) INTO before_e FROM public."Employees" WHERE id=(p->>'id')::bigint;
 IF before_e IS NOT NULL THEN before_e:=before_e||jsonb_build_object('manager_id',(SELECT manager_employee_id FROM public."Employee_reporting_lines" WHERE employee_id=(p->>'id')::bigint AND effective_from<=app_private.task_today() AND (effective_to IS NULL OR effective_to>app_private.task_today()) ORDER BY effective_from DESC LIMIT 1));END IF;
 eid:=public.auth_save_employee((p->>'id')::bigint,p->>'name',p->>'role',(p->>'location_id')::bigint,(p->>'active')::boolean);
 UPDATE public."Employees" SET department_id=dep,production_role=prod WHERE id=eid;
 IF manager=eid THEN RAISE EXCEPTION 'REPORTING_CYCLE';END IF;
 IF manager IS DISTINCT FROM (SELECT manager_employee_id FROM public."Employee_reporting_lines" WHERE employee_id=eid AND effective_from<=app_private.task_today() AND (effective_to IS NULL OR effective_to>app_private.task_today()) ORDER BY effective_from DESC LIMIT 1) THEN
  -- Preserve effective history; today's entry can be replaced without an invalid zero-length range.
  DELETE FROM public."Employee_reporting_lines" WHERE employee_id=eid AND effective_from=app_private.task_today();
  UPDATE public."Employee_reporting_lines" SET effective_to=app_private.task_today() WHERE employee_id=eid AND effective_from<app_private.task_today() AND (effective_to IS NULL OR effective_to>app_private.task_today());
  IF manager IS NOT NULL THEN INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(eid,manager,app_private.task_today());END IF;
 END IF;
 SELECT jsonb_build_object('name',name,'role',role,'active',active,'location_id',location_id,'department_id',department_id,'production_role',production_role,'manager_id',manager) INTO after_e FROM public."Employees" WHERE id=eid;
 PERFORM app_private.task_admin_audit('employee',eid::text,CASE WHEN before_e IS NULL THEN 'created' ELSE 'updated' END,before_e,after_e,p_op);
 RETURN jsonb_build_object('id',eid);END $$;
CREATE FUNCTION app_private.process_command(p_action text,p jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees";v public."Process_versions";tpl bigint;vid bigint;inst bigint;def jsonb;old jsonb;s jsonb;t jsonb;dep jsonb;map jsonb:='{}';dest bigint;created jsonb;real_task public."Tasks";day date;zone text;prev text;ids jsonb;reviewer bigint;BEGIN
 a:=app_private.task_actor();IF NOT app_private.has_permission(CASE WHEN p_action='process_launch' THEN 'processes.launch' ELSE 'processes.manage' END) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(20261006,1);
 IF p_action='process_create' THEN
  def:=p->'definition';PERFORM app_private.process_validate(def,false);
  INSERT INTO public."Process_templates"(name,created_by_employee_id) VALUES(def->>'name',a.id) RETURNING id INTO tpl;
  INSERT INTO public."Process_versions"(template_id,number,definition,created_by_employee_id) VALUES(tpl,1,def,a.id) RETURNING id INTO vid;
 ELSIF p_action IN ('process_save','process_publish','process_version','process_duplicate','process_launch') THEN
  SELECT * INTO v FROM public."Process_versions" WHERE id=(p->>'version_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND';END IF;tpl:=v.template_id;vid:=v.id;old:=to_jsonb(v);
  IF p_action IN ('process_save','process_publish') THEN
   IF v.status<>'draft' THEN RAISE EXCEPTION 'PROCESS_VERSION_IMMUTABLE';END IF;
   IF v.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'PROCESS_VERSION_CONFLICT';END IF;
   def:=CASE WHEN p_action='process_save' THEN p->'definition' ELSE v.definition END;
   PERFORM app_private.process_validate(def,p_action='process_publish');
   UPDATE public."Process_versions" SET definition=def,status=CASE WHEN p_action='process_publish' THEN 'published' ELSE 'draft' END,revision=revision+1 WHERE id=v.id;
   UPDATE public."Process_templates" SET name=def->>'name' WHERE id=tpl;
  ELSIF p_action IN ('process_version','process_duplicate') THEN
   IF p_action='process_duplicate' THEN INSERT INTO public."Process_templates"(name,created_by_employee_id) VALUES(v.definition->>'name',a.id) RETURNING id INTO tpl;END IF;
   INSERT INTO public."Process_versions"(template_id,number,definition,created_by_employee_id) VALUES(tpl,(SELECT coalesce(max(number),0)+1 FROM public."Process_versions" WHERE template_id=tpl),v.definition,a.id) RETURNING id INTO vid;
  ELSE
   IF v.status<>'published' THEN RAISE EXCEPTION 'PROCESS_NOT_PUBLISHED';END IF;
   PERFORM app_private.process_validate(v.definition,true);
   day:=(p->>'starts_on')::date;IF day IS NULL OR day<app_private.task_today() OR day>app_private.task_today()+(SELECT planning_horizon_days FROM public."Task_module_settings") THEN RAISE EXCEPTION 'INVALID_PLAN_DATE';END IF;
   IF p->>'location_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Locations" WHERE id=(p->>'location_id')::bigint AND active) THEN RAISE EXCEPTION 'INVALID_LOCATION';END IF;
   IF p->>'department_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Departments" WHERE id=(p->>'department_id')::bigint AND active) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT';END IF;
   SELECT company_timezone INTO zone FROM public."Task_module_settings";
   INSERT INTO public."Process_instances"(version_id,owner_employee_id,starts_on,department_id,location_id,operation_id) VALUES(v.id,coalesce((v.definition->>'owner_employee_id')::bigint,a.id),day,(p->>'department_id')::bigint,(p->>'location_id')::bigint,p_op) RETURNING id INTO inst;
   FOR s IN SELECT value FROM jsonb_array_elements(v.definition->'stages') LOOP
    FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
     dest:=coalesce((p->'assignments'->>(t->>'key'))::bigint,(t->>'assigned_to_employee_id')::bigint,(p->>'default_employee_id')::bigint);
     IF dest IS NULL OR NOT app_private.task_scope('tasks.assign',dest) THEN RAISE EXCEPTION 'PROCESS_ASSIGNEE_REQUIRED';END IF;
     reviewer:=(t->>'approver_id')::bigint;
     IF (coalesce((t->>'requires_confirmation')::boolean,false) OR t->>'result_type'='approval') AND (reviewer IS NULL OR reviewer=dest OR NOT EXISTS(SELECT FROM public."Employees" e WHERE id=reviewer AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL AND EXISTS(SELECT FROM app_private.role_permissions WHERE role=e.role AND permission='tasks.access'))) THEN RAISE EXCEPTION 'PROCESS_APPROVER_REQUIRED';END IF;
     created:=app_private.task_dispatch('create',jsonb_strip_nulls(jsonb_build_object('title',t->>'title','description',concat_ws(E'\n\n',nullif(v.definition->>'instruction',''),nullif(t->>'description',''),nullif(t->>'instruction',''),nullif(t->>'expected_result','')),'assigned_to_employee_id',dest,'category_id',t->'category_id','priority',coalesce(t->>'priority','medium'),'estimated_minutes',t->'estimated_minutes','planned_date',CASE WHEN coalesce(t->>'relative_to','')='' THEN day END,'deadline_at',CASE WHEN coalesce(t->>'relative_to','')='' THEN coalesce((t->>'deadline_at')::timestamptz,((day+coalesce((t->>'offset_days')::integer,0)+1)::timestamp AT TIME ZONE zone)-interval '1 minute') END)),p_op);
     SELECT * INTO real_task FROM public."Tasks" WHERE id=(created->>'id')::bigint;
     ids:=coalesce(v.definition->'attachments','[]')||coalesce(t->'attachments','[]');
     UPDATE public."Tasks" SET source_type='process',source_namespace='process:'||inst,source_external_id=t->>'key',source_metadata=jsonb_build_object('process_instance_id',inst,'process_version_id',v.id,'stage',s->>'name','step',t,'attachments',ids),location_id=(p->>'location_id')::bigint,department_id=coalesce((t->>'department_id')::bigint,(p->>'department_id')::bigint,department_id),version=version+1 WHERE id=real_task.id;
     PERFORM app_private.task_event(real_task.id,'TASK_UPDATED',p_op,to_jsonb(real_task),jsonb_build_object('reason','process_launch'));
     FOR dep IN SELECT value FROM jsonb_array_elements(coalesce(t->'checklist','[]')) LOOP
      SELECT * INTO real_task FROM public."Tasks" WHERE id=real_task.id;
      PERFORM app_private.task_approval_command('checklist_add',jsonb_build_object('task_id',real_task.id,'version',real_task.version,'text',dep#>>'{}'),p_op);
     END LOOP;
     map:=map||jsonb_build_object(t->>'key',real_task.id);
    END LOOP;
   END LOOP;
   FOR s IN SELECT value FROM jsonb_array_elements(v.definition->'stages') LOOP
    prev:=NULL;
    FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
     ids:=coalesce(t->'depends_on','[]');
     IF coalesce((t->>'parallel')::boolean,true)=false AND prev IS NOT NULL THEN ids:=ids||to_jsonb(prev);END IF;
     IF coalesce(t->>'relative_to','')<>'' THEN ids:=ids||to_jsonb(t->>'relative_to');END IF;
     FOR dep IN SELECT value FROM jsonb_array_elements(ids) LOOP
      SELECT * INTO real_task FROM public."Tasks" WHERE id=(map->>(t->>'key'))::bigint;
      PERFORM app_private.task_core('dependency',jsonb_build_object('task_id',real_task.id,'version',real_task.version,'depends_on_task_id',(map->>(dep#>>'{}'))::bigint),p_op);
     END LOOP;prev:=t->>'key';
    END LOOP;
   END LOOP;
   PERFORM app_private.task_admin_audit('process_instance',inst::text,'launched',NULL,jsonb_build_object('version_id',v.id,'tasks',map),p_op);
   RETURN jsonb_build_object('instance_id',inst);
  END IF;
 ELSE RAISE EXCEPTION 'INVALID_ACTION';END IF;
 PERFORM app_private.task_admin_audit('process_version',vid::text,p_action,old,(SELECT to_jsonb(x) FROM public."Process_versions"x WHERE id=vid),p_op);
 RETURN jsonb_build_object('version_id',vid,'template_id',tpl);
END $$;
CREATE FUNCTION public.tasks_processes() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM app_private.task_actor();IF NOT app_private.has_permission('processes.read') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('templates',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM public."Process_templates"t),
 'versions',(SELECT coalesce(jsonb_agg(v ORDER BY id),'[]') FROM public."Process_versions"v),
 'instances',(SELECT coalesce(jsonb_agg(x ORDER BY id DESC),'[]') FROM(SELECT i.*,v.number,v.definition->>'name' AS name,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'stage',t.source_metadata->>'stage','deadline_at',t.deadline_at,'assigned_to_employee_id',t.assigned_to_employee_id,'waiting_confirmation',r.task_id IS NOT NULL AND r.approved_at IS NULL AND (coalesce((t.source_metadata->'step'->>'requires_confirmation')::boolean,false) OR t.source_metadata->'step'->>'result_type'='approval')) ORDER BY t.id),'[]') FROM public."Tasks"t LEFT JOIN public."Task_results"r ON r.task_id=t.id WHERE t.source_type='process' AND t.source_metadata->>'process_instance_id'=i.id::text) AS tasks FROM public."Process_instances"i JOIN public."Process_versions"v ON v.id=i.version_id ORDER BY i.id DESC LIMIT 100)x));END $$;
-- Completion of a reference step anchors relative dates to actual completion, not template edits.
CREATE FUNCTION app_private.process_relative_dates(p_op uuid,p_instance text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public."Tasks";ref public."Tasks";target date;zone text;BEGIN
 SELECT company_timezone INTO zone FROM public."Task_module_settings";
 FOR t IN SELECT * FROM public."Tasks" WHERE source_type='process' AND source_metadata->>'process_instance_id'=p_instance AND status='unplanned' AND planned_date IS NULL AND coalesce(source_metadata->'step'->>'relative_to','')<>'' FOR UPDATE LOOP
  SELECT * INTO ref FROM public."Tasks" WHERE source_namespace=t.source_namespace AND source_external_id=t.source_metadata->'step'->>'relative_to' AND status='completed';
  IF FOUND THEN target:=(ref.completed_at AT TIME ZONE zone)::date+coalesce((t.source_metadata->'step'->>'offset_days')::integer,0);
   UPDATE public."Tasks" SET planned_date=(ref.completed_at AT TIME ZONE zone)::date,not_before_at=ref.completed_at,deadline_at=(target+1)::timestamp AT TIME ZONE zone-interval '1 minute',status='planned',version=version+1 WHERE id=t.id;
   PERFORM app_private.task_event(t.id,'TASK_PLANNED',p_op,to_jsonb(t),jsonb_build_object('reason','process_relative_date','reference_task_id',ref.id));
  END IF;
 END LOOP;END $$;
CREATE FUNCTION app_private.task_file_read(p_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees";f public."Task_files";BEGIN a:=app_private.task_actor();SELECT * INTO f FROM public."Task_files" WHERE id=p_id;
 RETURN FOUND AND (f.uploaded_by=a.id OR (f.version_id IS NOT NULL AND app_private.has_permission('processes.read')) OR EXISTS(SELECT FROM public."Tasks"t WHERE (t.id=f.task_id OR t.source_metadata->'attachments' ? p_id::text) AND (app_private.task_can_read(t) OR t.source_metadata->'step'->>'approver_id'=a.id::text)));END $$;
CREATE FUNCTION public.tasks_file(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF NOT app_private.task_file_read(p_id) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;RETURN(SELECT to_jsonb(f) FROM public."Task_files"f WHERE id=p_id);END $$;
CREATE FUNCTION public.tasks_storage_read(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM app_private.task_actor();RETURN EXISTS(SELECT FROM public."Task_files"f WHERE f.object_key=p_key AND app_private.task_file_read(f.id));END $$;
CREATE FUNCTION public.tasks_process_task(p_task bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees";t public."Tasks";BEGIN a:=app_private.task_actor();SELECT * INTO t FROM public."Tasks" WHERE id=p_task;IF NOT FOUND OR NOT (app_private.task_can_read(t) OR t.source_metadata->'step'->>'approver_id'=a.id::text) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('result',(SELECT to_jsonb(r) FROM public."Task_results"r WHERE task_id=t.id),'step',t.source_metadata->'step','attachments',coalesce(t.source_metadata->'attachments','[]'));END $$;
CREATE FUNCTION app_private.task_result_command(p_action text,p jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees";t public."Tasks";spec jsonb;value jsonb;f public."Task_files";exists_file boolean;object_meta jsonb;BEGIN
 a:=app_private.task_actor();
 IF p_action='file_register' THEN
  IF p->>'task_id' IS NOT NULL THEN
   SELECT * INTO t FROM public."Tasks" WHERE id=(p->>'task_id')::bigint;
   IF NOT FOUND OR t.assigned_to_employee_id<>a.id THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
  ELSE
   IF NOT app_private.has_permission('processes.manage') OR NOT EXISTS(SELECT FROM public."Process_versions" WHERE id=(p->>'version_id')::bigint AND status='draft') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
  END IF;
  IF split_part(p->>'object_key','/',1)<>a.auth_user_id::text THEN RAISE EXCEPTION 'INVALID_ATTACHMENT';END IF;
  IF to_regclass('storage.objects') IS NULL THEN RAISE EXCEPTION 'STORAGE_UNAVAILABLE';END IF;
  EXECUTE 'SELECT EXISTS(SELECT FROM storage.objects WHERE bucket_id=''tasks-private'' AND name=$1)' INTO exists_file USING p->>'object_key';
  IF NOT exists_file THEN RAISE EXCEPTION 'INVALID_ATTACHMENT';END IF;
  EXECUTE 'SELECT metadata FROM storage.objects WHERE bucket_id=''tasks-private'' AND name=$1' INTO object_meta USING p->>'object_key';
  IF object_meta->>'mimetype' IS DISTINCT FROM p->>'mime' OR (object_meta->>'size')::bigint IS DISTINCT FROM (p->>'size_bytes')::bigint THEN RAISE EXCEPTION 'INVALID_ATTACHMENT';END IF;
  SELECT * INTO f FROM public."Task_files" WHERE id=(p->>'id')::uuid;IF FOUND THEN IF f.uploaded_by<>a.id OR f.object_key<>p->>'object_key' THEN RAISE EXCEPTION 'INVALID_ATTACHMENT';END IF;RETURN to_jsonb(f);END IF;
  INSERT INTO public."Task_files"(id,object_key,name,mime,size_bytes,uploaded_by,task_id,version_id) VALUES((p->>'id')::uuid,p->>'object_key',p->>'name',p->>'mime',(p->>'size_bytes')::bigint,a.id,(p->>'task_id')::bigint,(p->>'version_id')::bigint) RETURNING * INTO f;
  RETURN to_jsonb(f);
 END IF;
 SELECT * INTO t FROM public."Tasks" WHERE id=(p->>'task_id')::bigint FOR UPDATE;
 IF NOT FOUND OR t.source_type<>'process' OR t.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT';END IF;
 IF t.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT';END IF;
 spec:=t.source_metadata->'step';
 IF p_action='result_save' THEN
  IF t.assigned_to_employee_id<>a.id THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
  value:=p->'value';IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR value-ARRAY['text','number','url','file_id']<>'{}'::jsonb OR length(value::text)>12000 THEN RAISE EXCEPTION 'INVALID_RESULT';END IF;
  IF value?'url' AND coalesce(value->>'url','')!~'^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'INVALID_RESULT';END IF;
  IF spec->>'result_type'='comment' AND length(trim(coalesce(value->>'text','')))=0 THEN RAISE EXCEPTION 'RESULT_REQUIRED';END IF;
  IF spec->>'result_type'='number' AND jsonb_typeof(value->'number') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'RESULT_REQUIRED';END IF;
  IF spec->>'result_type'='link' AND coalesce(value->>'url','')!~'^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'RESULT_REQUIRED';END IF;
  IF spec->>'result_type' IN ('photo','file') OR coalesce((spec->>'required_file')::boolean,false) THEN
   SELECT * INTO f FROM public."Task_files" WHERE id=(value->>'file_id')::uuid AND task_id=t.id AND uploaded_by=a.id;
   IF NOT FOUND OR (spec->>'result_type'='photo' AND f.mime NOT IN ('image/jpeg','image/png','image/webp')) THEN RAISE EXCEPTION 'RESULT_REQUIRED';END IF;
  END IF;
  INSERT INTO public."Task_results"(task_id,value,submitted_by) VALUES(t.id,value,a.id) ON CONFLICT(task_id) DO UPDATE SET value=excluded.value,submitted_by=a.id,submitted_at=clock_timestamp(),approved_by=NULL,approved_at=NULL;
 ELSIF p_action='result_approve' THEN
  IF (spec->>'approver_id')::bigint IS DISTINCT FROM a.id OR a.id=t.assigned_to_employee_id THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
  UPDATE public."Task_results" SET approved_by=a.id,approved_at=clock_timestamp() WHERE task_id=t.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESULT_REQUIRED';END IF;
 ELSE RAISE EXCEPTION 'INVALID_ACTION';END IF;
 UPDATE public."Tasks" SET version=version+1 WHERE id=t.id;
 PERFORM app_private.task_event(t.id,CASE WHEN p_action='result_save' THEN 'TASK_RESULT_SUBMITTED' ELSE 'TASK_RESULT_APPROVED' END,p_op,to_jsonb(t));
 RETURN jsonb_build_object('task_id',t.id);END $$;
CREATE FUNCTION app_private.task_result_check(p_task bigint) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public."Tasks";r public."Task_results";spec jsonb;BEGIN
 SELECT * INTO t FROM public."Tasks" WHERE id=p_task;IF t.source_type<>'process' THEN RETURN;END IF;
 spec:=t.source_metadata->'step';SELECT * INTO r FROM public."Task_results" WHERE task_id=t.id;
 IF (spec->>'result_type'<>'done' OR coalesce((spec->>'required_file')::boolean,false) OR coalesce((spec->>'requires_confirmation')::boolean,false)) AND r.task_id IS NULL THEN RAISE EXCEPTION 'RESULT_REQUIRED';END IF;
 IF (spec->>'result_type'='approval' OR coalesce((spec->>'requires_confirmation')::boolean,false)) AND r.approved_at IS NULL THEN RAISE EXCEPTION 'RESULT_APPROVAL_REQUIRED';END IF;
END $$;
CREATE FUNCTION public.tasks_result_inbox() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees";BEGIN a:=app_private.task_actor();RETURN(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'version',t.version,'value',r.value)),'[]') FROM public."Tasks"t JOIN public."Task_results"r ON r.task_id=t.id WHERE t.source_type='process' AND t.source_metadata->'step'->>'approver_id'=a.id::text AND r.approved_at IS NULL AND t.status NOT IN ('completed','cancelled'));END $$;
-- Reuse the same command journal, operation UUIDs and global lock; no parallel command architecture.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure);
 d:=replace(d,'keys:=CASE p_action',$x$keys:=CASE p_action
 WHEN 'admin_employee_save' THEN ARRAY['id','name','role','active','location_id','department_id','production_role','manager_id']
 WHEN 'process_create' THEN ARRAY['definition'] WHEN 'process_save' THEN ARRAY['version_id','revision','definition'] WHEN 'process_publish' THEN ARRAY['version_id','revision'] WHEN 'process_version' THEN ARRAY['version_id'] WHEN 'process_duplicate' THEN ARRAY['version_id'] WHEN 'process_launch' THEN ARRAY['version_id','starts_on','default_employee_id','assignments','location_id','department_id']
 WHEN 'file_register' THEN ARRAY['id','object_key','name','mime','size_bytes','task_id','version_id'] WHEN 'result_save' THEN ARRAY['task_id','version','value'] WHEN 'result_approve' THEN ARRAY['task_id','version']
$x$);EXECUTE d;
 d:=pg_get_functiondef('app_private.task_dispatch(text,jsonb,uuid)'::regprocedure);
 d:=overlay(d placing $x$BEGIN
 IF p_action='category_save' AND NOT app_private.has_permission('dictionaries.manage') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 IF p_action='admin_employee_save' THEN RETURN app_private.tasks_employee_save(p_args,p_op);END IF;
 IF p_action LIKE 'process_%' THEN RETURN app_private.process_command(p_action,p_args,p_op);END IF;
 IF p_action IN ('file_register','result_save','result_approve') THEN RETURN app_private.task_result_command(p_action,p_args,p_op);END IF;
 IF p_action IN ('complete','mark_completed') THEN PERFORM app_private.task_result_check((p_args->>'task_id')::bigint);END IF;
$x$ from position('BEGIN' IN d) for 5);
 -- mark_completed returns early; relative-date anchoring runs in a completed-task trigger instead.
 EXECUTE d;
 d:=pg_get_functiondef('app_private.task_settings_command(text,jsonb,uuid)'::regprocedure);
 d:=replace(d,$old$SET name=p_args->>'name',parent_id=(p_args->>'parent_id')::bigint,active=$old$, $new$SET name=p_args->>'name',parent_id=(p_args->>'parent_id')::bigint,sort_order=coalesce((p_args->>'sort_order')::integer,sort_order),active=$new$);
 EXECUTE d;
 -- Active choices and historical names are separate collections.
 d:=pg_get_functiondef('public.tasks_context()'::regprocedure);
 d:=replace(d,$old$'categories',$old$, $new$'category_history',(SELECT coalesce(jsonb_agg(c ORDER BY sort_order,id),'[]') FROM public."Task_categories"c),'categories',$new$);EXECUTE d;
END $$;
CREATE FUNCTION app_private.task_active_category() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF NEW.category_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) AND NOT EXISTS(SELECT FROM public."Task_categories" WHERE id=NEW.category_id AND active) THEN RAISE EXCEPTION 'INACTIVE_CATEGORY';END IF;RETURN NEW;END $$;
CREATE TRIGGER task_active_category BEFORE INSERT OR UPDATE OF category_id ON public."Tasks" FOR EACH ROW EXECUTE FUNCTION app_private.task_active_category();
CREATE FUNCTION app_private.task_dictionary_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF auth.uid() IS NOT NULL THEN PERFORM app_private.task_admin_audit('category',NEW.id::text,CASE WHEN TG_OP='INSERT' THEN 'created' WHEN OLD.active AND NOT NEW.active THEN 'deactivated' WHEN NOT OLD.active AND NEW.active THEN 'reactivated' ELSE 'updated' END,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW),gen_random_uuid());END IF;RETURN NEW;END $$;
CREATE TRIGGER task_dictionary_audit AFTER INSERT OR UPDATE ON public."Task_categories" FOR EACH ROW EXECUTE FUNCTION app_private.task_dictionary_audit();
CREATE FUNCTION app_private.process_completion_dates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.source_type='process' AND NEW.status='completed' AND OLD.status<>'completed' THEN PERFORM app_private.process_relative_dates(gen_random_uuid(),NEW.source_metadata->>'process_instance_id');END IF;RETURN NEW;END $$;
CREATE TRIGGER process_completion_dates AFTER UPDATE OF status ON public."Tasks" FOR EACH ROW EXECUTE FUNCTION app_private.process_completion_dates();
CREATE FUNCTION app_private.employee_production_department() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT FROM public."Departments" WHERE id=NEW.department_id AND code='production') THEN NEW.production_role:=NULL;END IF;RETURN NEW;END $$;
CREATE TRIGGER employee_production_department BEFORE INSERT OR UPDATE OF department_id,production_role ON public."Employees" FOR EACH ROW EXECUTE FUNCTION app_private.employee_production_department();
DO $$ DECLARE n text;f record;BEGIN
 FOREACH n IN ARRAY ARRAY['Task_admin_events','Process_templates','Process_versions','Process_instances','Task_results','Task_files'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',n);END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app_private' AND p.proname IN ('task_admin_audit','process_immutable','process_validate','tasks_employee_save','process_command','process_relative_dates','task_file_read','task_result_command','task_result_check','task_dictionary_audit','task_active_category','process_completion_dates','employee_production_department')) OR (n.nspname='public' AND p.proname IN ('tasks_admin_directory','tasks_processes','tasks_file','tasks_result_inbox','tasks_storage_read','tasks_process_task')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;END LOOP;
END $$;
-- Only the Supabase installation has Storage; local core migration tests need no fake storage service.
DO $$ BEGIN IF to_regclass('storage.buckets') IS NOT NULL THEN
 IF EXISTS(SELECT FROM storage.buckets WHERE id='tasks-private') THEN RAISE EXCEPTION 'SCHEMA_DRIFT tasks_private_storage';END IF;
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('tasks-private','tasks-private',false,20971520,ARRAY['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) ON CONFLICT(id) DO NOTHING;
 EXECUTE $p$CREATE POLICY tasks_file_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='tasks-private' AND (storage.foldername(name))[1]=auth.uid()::text AND app_private.has_permission('tasks.access'))$p$;
 -- app_private function is guarded and exposed only to the storage policy via an explicit grant.
 EXECUTE $p$CREATE POLICY tasks_file_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='tasks-private' AND app_private.has_permission('tasks.access') AND ((storage.foldername(name))[1]=auth.uid()::text OR public.tasks_storage_read(name)))$p$;
END IF;END $$;
CREATE TRIGGER task_admin_append_only BEFORE UPDATE OR DELETE ON public."Task_admin_events" FOR EACH ROW EXECUTE FUNCTION app_private.worktime_append_only();
COMMIT;
