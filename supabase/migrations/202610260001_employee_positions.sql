BEGIN;
-- Additive business positions; system roles, policies and grants stay unchanged.
ALTER TABLE public."Employees" ADD COLUMN position text CHECK (length(position)<=160);
CREATE FUNCTION app_private.position_key(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT nullif(lower(trim(regexp_replace(value,'\s+',' ','g'))),'') $$;
CREATE FUNCTION app_private.process_position_exists(value text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT FROM public."Employees" WHERE app_private.position_key(position)=app_private.position_key(value)) $$;

CREATE OR REPLACE FUNCTION app_private.tasks_employee_save(p jsonb, p_op uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE a public."Employees";before_e jsonb;after_e jsonb;eid bigint;dep bigint;manager bigint;prod text;BEGIN
 a:=app_private.task_actor();IF NOT app_private.has_permission('tasks.admin') OR NOT app_private.has_permission('employees.manage') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 dep:=(p->>'department_id')::bigint;manager:=(p->>'manager_id')::bigint;
 IF dep IS NOT NULL AND NOT EXISTS(SELECT FROM public."Departments" WHERE id=dep AND active) THEN RAISE EXCEPTION 'INVALID_DEPARTMENT';END IF;
 prod:=CASE WHEN EXISTS(SELECT FROM public."Departments" WHERE id=dep AND code='production') THEN p->>'production_role' END;
 IF manager=(p->>'id')::bigint THEN RAISE EXCEPTION 'REPORTING_CYCLE';END IF;
 IF manager IS NOT NULL AND NOT EXISTS(SELECT FROM public."Employees" WHERE id=manager AND active AND archived_at IS NULL) THEN RAISE EXCEPTION 'INVALID_MANAGER';END IF;
 SELECT jsonb_build_object('position',position,'name',name,'role',role,'active',active,'location_id',location_id,'department_id',department_id,'production_role',production_role) INTO before_e FROM public."Employees" WHERE id=(p->>'id')::bigint;
 IF before_e IS NOT NULL THEN before_e:=before_e||jsonb_build_object('manager_id',(SELECT manager_employee_id FROM public."Employee_reporting_lines" WHERE employee_id=(p->>'id')::bigint AND effective_from<=app_private.task_today() AND (effective_to IS NULL OR effective_to>app_private.task_today()) ORDER BY effective_from DESC LIMIT 1));END IF;
 eid:=public.auth_save_employee((p->>'id')::bigint,p->>'name',p->>'role',(p->>'location_id')::bigint,(p->>'active')::boolean);
 UPDATE public."Employees" SET position=CASE WHEN p ? 'position' THEN nullif(trim(regexp_replace(p->>'position','\s+',' ','g')),'') ELSE position END,department_id=dep,production_role=prod WHERE id=eid;
 IF manager=eid THEN RAISE EXCEPTION 'REPORTING_CYCLE';END IF;
 IF manager IS DISTINCT FROM (SELECT manager_employee_id FROM public."Employee_reporting_lines" WHERE employee_id=eid AND effective_from<=app_private.task_today() AND (effective_to IS NULL OR effective_to>app_private.task_today()) ORDER BY effective_from DESC LIMIT 1) THEN
  -- Preserve effective history; today's entry can be replaced without an invalid zero-length range.
  DELETE FROM public."Employee_reporting_lines" WHERE employee_id=eid AND effective_from=app_private.task_today();
  UPDATE public."Employee_reporting_lines" SET effective_to=app_private.task_today() WHERE employee_id=eid AND effective_from<app_private.task_today() AND (effective_to IS NULL OR effective_to>app_private.task_today());
  IF manager IS NOT NULL THEN INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(eid,manager,app_private.task_today());END IF;
 END IF;
 SELECT jsonb_build_object('position',position,'name',name,'role',role,'active',active,'location_id',location_id,'department_id',department_id,'production_role',production_role,'manager_id',manager) INTO after_e FROM public."Employees" WHERE id=eid;
 PERFORM app_private.task_admin_audit('employee',eid::text,CASE WHEN before_e IS NULL THEN 'created' ELSE 'updated' END,before_e,after_e,p_op);
 RETURN jsonb_build_object('id',eid);END $function$
;

CREATE OR REPLACE FUNCTION app_private.task_validate_args(p_action text, p_args jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN
 IF p_action='admin_employee_save' THEN PERFORM app_private.task_validate_args_20261011(p_action,p_args-'position');
 ELSIF p_action='create' THEN PERFORM app_private.task_validate_args_20261011(p_action,p_args-'recurrence');
 ELSIF p_action='process_launch' THEN PERFORM app_private.task_validate_args_20261011(p_action,p_args-ARRAY['template_id','recurrence','start_offset_days','position_assignments']);
 ELSE PERFORM app_private.task_validate_args_20261011(p_action,p_args);END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.tasks_admin_directory()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN
 PERFORM app_private.task_actor();IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 RETURN public.tasks_admin_state()||jsonb_build_object(
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('position',e.position,'id',e.id,'avatar_path',e.avatar_path,'name',e.name,'role',e.role,'active',e.active,'archived',e.archived_at IS NOT NULL,'department_id',e.department_id,'production_role',e.production_role,'location_id',e.location_id,'linked',e.auth_user_id IS NOT NULL,'capabilities',(SELECT coalesce(jsonb_agg(permission ORDER BY permission),'[]') FROM app_private.role_permissions WHERE role=e.role)) ORDER BY e.name,e.id),'[]') FROM public."Employees"e),
 'departments',(SELECT coalesce(jsonb_agg(d ORDER BY name),'[]') FROM public."Departments"d),
 'categories',(SELECT coalesce(jsonb_agg(c ORDER BY sort_order,id),'[]') FROM public."Task_categories"c),
 'locations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM public."Locations" WHERE active),
 'audit',(SELECT coalesce(jsonb_agg(x ORDER BY id DESC),'[]') FROM(SELECT id,entity,entity_id,action,actor_employee_id,created_at FROM public."Task_admin_events" ORDER BY id DESC LIMIT 100)x));END $function$
;

CREATE OR REPLACE FUNCTION public.tasks_assignable_people(p_permission text DEFAULT 'tasks.assign'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); IF p_permission NOT IN ('tasks.assign','tasks.read.scope','tasks.plan.scope','tasks.report.scope','tasks.schedule.manage') THEN RAISE EXCEPTION 'INVALID_PERMISSION'; END IF; RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('position',e.position,'id',e.id,'name',e.name) ORDER BY e.name),'[]') FROM public."Employees" e WHERE active AND archived_at IS NULL AND auth_user_id IS NOT NULL AND EXISTS(SELECT FROM app_private.role_permissions p WHERE p.role=e.role AND p.permission='tasks.access') AND (e.id=a.id OR app_private.task_scope(p_permission,e.id))); END $function$
;

CREATE OR REPLACE FUNCTION public.tasks_processes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN
 PERFORM app_private.task_actor();IF NOT app_private.has_permission('processes.read') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('positions',(SELECT coalesce(jsonb_agg(label ORDER BY label),'[]') FROM (SELECT min(trim(regexp_replace(position,'\s+',' ','g'))) label FROM public."Employees" WHERE app_private.position_key(position) IS NOT NULL GROUP BY app_private.position_key(position)) p),'roles',(SELECT coalesce(jsonb_agg(role ORDER BY role),'[]') FROM (SELECT DISTINCT role FROM app_private.role_permissions)r),'templates',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM public."Process_templates"t),
 'versions',(SELECT coalesce(jsonb_agg(v ORDER BY id),'[]') FROM public."Process_versions"v),
 'instances',(SELECT coalesce(jsonb_agg(x ORDER BY id DESC),'[]') FROM(SELECT i.*,v.number,coalesce(i.name,v.definition->>'name') AS name,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'stage',t.source_metadata->>'stage','step_key',t.source_external_id,'stage_key',t.source_metadata->>'stage_key','step',t.source_metadata->'step','blocked',EXISTS(SELECT FROM public."Task_dependencies" dep JOIN public."Tasks" predecessor ON predecessor.id=dep.depends_on_task_id WHERE dep.task_id=t.id AND predecessor.status<>'completed'),'dependencies',(SELECT coalesce(jsonb_agg(dep.depends_on_task_id),'[]') FROM public."Task_dependencies" dep WHERE dep.task_id=t.id),'priority',t.priority,'completed_at',t.completed_at,'deadline_at',t.deadline_at,'assigned_to_employee_id',t.assigned_to_employee_id,'waiting_confirmation',r.task_id IS NOT NULL AND r.approved_at IS NULL AND (coalesce((t.source_metadata->'step'->>'requires_confirmation')::boolean,false) OR t.source_metadata->'step'->>'result_type'='approval')) ORDER BY t.id),'[]') FROM public."Tasks"t LEFT JOIN public."Task_results"r ON r.task_id=t.id WHERE t.source_type='process' AND t.source_metadata->>'process_instance_id'=i.id::text) AS tasks FROM public."Process_instances"i JOIN public."Process_versions"v ON v.id=i.version_id ORDER BY i.id DESC LIMIT 100)x));END $function$
;

CREATE OR REPLACE FUNCTION app_private.process_position_validate(doc jsonb, publish boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE s jsonb;t jsonb;r jsonb;k text;stage_keys text[]:='{}';BEGIN
 IF doc->>'schema_version' IS DISTINCT FROM '3' THEN RETURN;END IF;
 IF doc->>'owner_employee_id' IS NOT NULL THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_POSITIONS_ONLY';END IF;
 IF publish AND (length(trim(coalesce(doc->>'goal','')))=0 OR length(trim(coalesce(doc->>'expected_result','')))=0  OR NOT coalesce(app_private.process_position_exists(doc->>'responsible_position'),false) OR jsonb_array_length(coalesce(doc->'involved_positions','[]'))=0) THEN RAISE EXCEPTION 'PROCESS_REQUIRED_FIELDS';END IF;
 IF coalesce(doc->>'launch_type','manual') NOT IN ('manual','automatic') THEN RAISE EXCEPTION 'INVALID_PROCESS';END IF;
 -- Automatic triggers may be drafted, but no scheduler exists: do not publish a false promise.
 IF publish AND doc->>'launch_type'='automatic' THEN RAISE EXCEPTION 'PROCESS_AUTOMATION_UNAVAILABLE';END IF;
 IF doc->>'responsible_position' IS NOT NULL AND doc->>'responsible_position'<>'' AND NOT app_private.process_position_exists(doc->>'responsible_position') THEN RAISE EXCEPTION 'PROCESS_INVALID_POSITION';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(doc->'involved_positions','[]')) LOOP
  IF NOT app_private.process_position_exists(r#>>'{}') THEN RAISE EXCEPTION 'PROCESS_INVALID_POSITION';END IF;
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  IF coalesce(s->>'key','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR s->>'key'=ANY(stage_keys) THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
  stage_keys:=array_append(stage_keys,s->>'key');
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   IF coalesce(t->>'key','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
   IF t->>'assigned_to_employee_id' IS NOT NULL OR t->>'approver_id' IS NOT NULL THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_POSITIONS_ONLY';END IF;
   IF publish AND (NOT coalesce(app_private.process_position_exists(t->>'responsible_position'),false) OR coalesce((t->>'estimated_minutes')::integer,0)<=0) THEN RAISE EXCEPTION 'PROCESS_REQUIRED_FIELDS';END IF;
   IF t->>'responsible_position' IS NOT NULL AND t->>'responsible_position'<>'' AND NOT app_private.process_position_exists(t->>'responsible_position') THEN RAISE EXCEPTION 'PROCESS_INVALID_POSITION';END IF;
   FOREACH k IN ARRAY ARRAY['accountable','consulted','informed'] LOOP
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(t->'raci'->k,'[]')) LOOP
     IF r->>'type'<>'position' OR NOT app_private.process_position_exists(r->>'id') THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_POSITIONS_ONLY';END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION app_private.process_wizard_validate(doc jsonb, publish boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE s jsonb;t jsonb;sd integer;td integer;BEGIN
 IF doc->>'schema_version'='3' THEN PERFORM app_private.process_position_validate(doc,publish);ELSE PERFORM app_private.process_wizard_validate_20261011(doc,publish);END IF;PERFORM app_private.recurrence_validate(doc->'recurrence');
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  sd:=(s->>'deadline_offset_days')::integer;IF sd IS NOT NULL AND sd NOT BETWEEN 0 AND 3660 THEN RAISE EXCEPTION 'INVALID_DEADLINE';END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP td:=(t->>'deadline_offset_days')::integer;
   IF td IS NOT NULL AND td NOT BETWEEN 0 AND 3660 THEN RAISE EXCEPTION 'INVALID_DEADLINE';END IF;
   IF sd IS NOT NULL AND td>sd THEN RAISE EXCEPTION 'TASK_STAGE_DEADLINE';END IF;
  END LOOP;
 END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION app_private.process_resolve_position(r text, p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE eid bigint;BEGIN
 eid:=(p->'position_assignments'->>r)::bigint;
 IF eid IS NULL OR NOT EXISTS(SELECT FROM public."Employees" e WHERE e.id=eid AND e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL AND app_private.position_key(e.position)=app_private.position_key(r)) OR NOT app_private.task_scope('tasks.assign',eid) THEN RAISE EXCEPTION 'PROCESS_POSITION_ASSIGNMENT_REQUIRED';END IF;
 RETURN eid;
END $function$
;

CREATE OR REPLACE FUNCTION app_private.process_resolve_positions(doc jsonb, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE stages jsonb:='[]';tasks jsonb;s jsonb;t jsonb;r jsonb;resolved jsonb;k text;refs jsonb;eid bigint;BEGIN
 IF doc->>'schema_version' IS DISTINCT FROM '3' THEN RETURN doc;END IF;
 doc:=doc||jsonb_build_object('owner_employee_id',app_private.process_resolve_position(doc->>'responsible_position',p));
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(doc->'involved_positions','[]')) LOOP PERFORM app_private.process_resolve_position(r#>>'{}',p);END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  tasks:='[]';
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   eid:=app_private.process_resolve_position(t->>'responsible_position',p);resolved:='{}';
   FOREACH k IN ARRAY ARRAY['accountable','consulted','informed'] LOOP
    refs:='[]';
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(t->'raci'->k,'[]')) LOOP refs:=refs||jsonb_build_array(jsonb_build_object('type','employee','id',app_private.process_resolve_position(r->>'id',p)));END LOOP;
    resolved:=resolved||jsonb_build_object(k,refs);
   END LOOP;
   t:=t||jsonb_build_object('assigned_to_employee_id',eid,'raci',resolved);
   IF coalesce((t->>'requires_confirmation')::boolean,false) OR t->>'result_type'='approval' THEN
    IF jsonb_array_length(resolved->'accountable')<>1 THEN RAISE EXCEPTION 'PROCESS_APPROVER_REQUIRED';END IF;
    t:=t||jsonb_build_object('approver_id',resolved->'accountable'->0->'id');
   END IF;
   tasks:=tasks||jsonb_build_array(t);
  END LOOP;
  stages:=stages||jsonb_build_array(s||jsonb_build_object('tasks',tasks));
 END LOOP;
 RETURN doc||jsonb_build_object('stages',stages);
END $function$
;

CREATE OR REPLACE FUNCTION app_private.process_resolve_definition(doc jsonb, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE stages jsonb:='[]';ts jsonb;s jsonb;t jsonb;zone text;start_day date;sd date;td date;deadline timestamptz;BEGIN
 IF doc->>'schema_version'='3' THEN doc:=app_private.process_resolve_positions(doc,p);ELSE doc:=app_private.process_resolve_definition_20261011(doc,p);END IF;start_day:=(p->>'starts_on')::date;SELECT company_timezone INTO zone FROM public."Task_module_settings";
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  sd:=start_day+(s->>'deadline_offset_days')::integer;ts:='[]';
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   td:=coalesce(start_day+(t->>'deadline_offset_days')::integer,sd);deadline:=CASE WHEN td IS NOT NULL THEN (td+1)::timestamp AT TIME ZONE zone-interval '1 minute' ELSE (t->>'deadline_at')::timestamptz END;
   IF sd IS NOT NULL AND (deadline AT TIME ZONE zone)::date>sd THEN RAISE EXCEPTION 'TASK_STAGE_DEADLINE';END IF;
   ts:=ts||jsonb_build_array(t||jsonb_build_object('deadline_at',deadline,'stage_deadline',sd));
  END LOOP;
  stages:=stages||jsonb_build_array(s||jsonb_build_object('deadline',sd,'tasks',ts));
 END LOOP;RETURN doc||jsonb_build_object('stages',stages);
END $function$
;

CREATE OR REPLACE FUNCTION app_private.process_workspace_validate(doc jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE t jsonb;s jsonb;r jsonb;person jsonb;k text;BEGIN
 IF doc ? 'start_offset_days' AND (jsonb_typeof(doc->'start_offset_days')<>'number' OR (doc->>'start_offset_days')::numeric NOT BETWEEN 0 AND 3660 OR mod((doc->>'start_offset_days')::numeric,1)<>0) THEN RAISE EXCEPTION 'INVALID_PROCESS_TIMING';END IF;
 IF doc ? 'sequential_stages' AND jsonb_typeof(doc->'sequential_stages')<>'boolean' THEN RAISE EXCEPTION 'INVALID_PROCESS';END IF;
 IF doc->>'category_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Task_categories" WHERE id=(doc->>'category_id')::bigint AND active) THEN RAISE EXCEPTION 'INACTIVE_CATEGORY';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   IF t ? 'duration_days' AND t->'duration_days'<>'null'::jsonb AND (jsonb_typeof(t->'duration_days')<>'number' OR (t->>'duration_days')::numeric NOT BETWEEN 0.01 AND 3660) THEN RAISE EXCEPTION 'INVALID_PROCESS_TIMING';END IF;
   IF t ? 'raci' THEN
    r:=t->'raci';IF jsonb_typeof(r)<>'object' OR r-ARRAY['accountable','consulted','informed']<>'{}' THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
    FOREACH k IN ARRAY ARRAY['accountable','consulted','informed'] LOOP
     IF r ? k THEN
      IF jsonb_typeof(r->k)<>'array' OR jsonb_array_length(r->k)>100 OR (k='accountable' AND jsonb_array_length(r->k)>1) THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
      FOR person IN SELECT value FROM jsonb_array_elements(r->k) LOOP
       IF jsonb_typeof(person)<>'object' OR person-ARRAY['type','id']<>'{}' OR person->>'id' IS NULL OR person->>'type' NOT IN ('employee','department','role','position') THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
       IF person->>'type'='employee' THEN
        IF NOT EXISTS(SELECT FROM public."Employees" WHERE id=(person->>'id')::bigint AND active AND archived_at IS NULL) THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
       ELSIF person->>'type'='department' THEN
        IF NOT EXISTS(SELECT FROM public."Departments" WHERE id=(person->>'id')::bigint AND active) THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
       ELSIF person->>'type'='position' THEN IF NOT app_private.process_position_exists(person->>'id') THEN RAISE EXCEPTION 'INVALID_RACI';END IF; ELSIF person->>'type'='role' THEN IF NOT app_private.process_role_exists(person->>'id') THEN RAISE EXCEPTION 'INVALID_RACI';END IF;       ELSE RAISE EXCEPTION 'INVALID_RACI';END IF;
      END LOOP;
     END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
END $function$
;

DO $$ DECLARE definition text;BEGIN
 definition:=pg_get_functiondef('app_private.process_command_20261011(text,jsonb,uuid)'::regprocedure);
 IF position('v.definition->>''schema_version''=''2''' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected launch definition';END IF;
 EXECUTE replace(definition,'v.definition->>''schema_version''=''2''','v.definition->>''schema_version'' IN (''2'',''3'')');
END $$;

REVOKE ALL ON FUNCTION app_private.position_key(text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.process_position_exists(text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.process_position_validate(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.process_resolve_position(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.process_resolve_positions(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
