BEGIN;
-- Extend the existing version document and central Tasks workflow. No new queue/entities.
ALTER TABLE public."Process_instances"
 ADD COLUMN finished_at timestamptz,
 ADD COLUMN name text,
 ADD COLUMN deadline date,
 ADD COLUMN note text,
 ADD COLUMN execution_snapshot jsonb,
 ADD COLUMN rating numeric(2,1) CHECK (rating BETWEEN 1 AND 5 AND mod(rating,0.5)=0),
 ADD COLUMN rating_comment text,
 ADD COLUMN rated_by bigint REFERENCES public."Employees",
 ADD COLUMN rated_at timestamptz;

CREATE FUNCTION app_private.process_role_exists(r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM app_private.role_permissions WHERE role=r)
$$;
CREATE FUNCTION app_private.process_wizard_validate(doc jsonb,publish boolean) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb;t jsonb;r jsonb;k text;stage_keys text[]:='{}';BEGIN
 IF doc->>'schema_version' IS DISTINCT FROM '2' THEN RETURN;END IF;
 IF doc->>'owner_employee_id' IS NOT NULL THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_ROLES_ONLY';END IF;
 IF publish AND (length(trim(coalesce(doc->>'goal','')))=0 OR length(trim(coalesce(doc->>'expected_result','')))=0 OR length(trim(coalesce(doc->>'instruction','')))=0 OR NOT coalesce(app_private.process_role_exists(doc->>'responsible_role'),false) OR jsonb_array_length(coalesce(doc->'involved_roles','[]'))=0) THEN RAISE EXCEPTION 'PROCESS_REQUIRED_FIELDS';END IF;
 IF coalesce(doc->>'launch_type','manual') NOT IN ('manual','automatic') THEN RAISE EXCEPTION 'INVALID_PROCESS';END IF;
 -- Automatic triggers may be drafted, but no scheduler exists: do not publish a false promise.
 IF publish AND doc->>'launch_type'='automatic' THEN RAISE EXCEPTION 'PROCESS_AUTOMATION_UNAVAILABLE';END IF;
 IF doc->>'responsible_role' IS NOT NULL AND doc->>'responsible_role'<>'' AND NOT app_private.process_role_exists(doc->>'responsible_role') THEN RAISE EXCEPTION 'PROCESS_INVALID_ROLE';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(doc->'involved_roles','[]')) LOOP
  IF NOT app_private.process_role_exists(r#>>'{}') THEN RAISE EXCEPTION 'PROCESS_INVALID_ROLE';END IF;
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  IF coalesce(s->>'key','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR s->>'key'=ANY(stage_keys) THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
  stage_keys:=array_append(stage_keys,s->>'key');
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   IF coalesce(t->>'key','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'INVALID_PROCESS_STEP';END IF;
   IF t->>'assigned_to_employee_id' IS NOT NULL OR t->>'approver_id' IS NOT NULL THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_ROLES_ONLY';END IF;
   IF publish AND (NOT coalesce(app_private.process_role_exists(t->>'responsible_role'),false) OR coalesce((t->>'estimated_minutes')::integer,0)<=0) THEN RAISE EXCEPTION 'PROCESS_REQUIRED_FIELDS';END IF;
   IF t->>'responsible_role' IS NOT NULL AND t->>'responsible_role'<>'' AND NOT app_private.process_role_exists(t->>'responsible_role') THEN RAISE EXCEPTION 'PROCESS_INVALID_ROLE';END IF;
   FOREACH k IN ARRAY ARRAY['accountable','consulted','informed'] LOOP
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(t->'raci'->k,'[]')) LOOP
     IF r->>'type'<>'role' OR NOT app_private.process_role_exists(r->>'id') THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_ROLES_ONLY';END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION app_private.process_resolve_employee(r text,p jsonb) RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE eid bigint;BEGIN
 eid:=(p->'role_assignments'->>r)::bigint;
 IF eid IS NULL OR NOT EXISTS(SELECT FROM public."Employees" e WHERE e.id=eid AND e.active AND e.archived_at IS NULL AND e.auth_user_id IS NOT NULL AND (e.role=r OR e.production_role=r)) OR NOT app_private.task_scope('tasks.assign',eid) THEN RAISE EXCEPTION 'PROCESS_ROLE_ASSIGNMENT_REQUIRED';END IF;
 RETURN eid;
END $$;
CREATE FUNCTION app_private.process_resolve_definition(doc jsonb,p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE stages jsonb:='[]';tasks jsonb;s jsonb;t jsonb;r jsonb;resolved jsonb;k text;refs jsonb;eid bigint;BEGIN
 IF doc->>'schema_version' IS DISTINCT FROM '2' THEN RETURN doc;END IF;
 doc:=doc||jsonb_build_object('owner_employee_id',app_private.process_resolve_employee(doc->>'responsible_role',p));
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(doc->'involved_roles','[]')) LOOP PERFORM app_private.process_resolve_employee(r#>>'{}',p);END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  tasks:='[]';
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   eid:=app_private.process_resolve_employee(t->>'responsible_role',p);resolved:='{}';
   FOREACH k IN ARRAY ARRAY['accountable','consulted','informed'] LOOP
    refs:='[]';
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(t->'raci'->k,'[]')) LOOP refs:=refs||jsonb_build_array(jsonb_build_object('type','employee','id',app_private.process_resolve_employee(r->>'id',p)));END LOOP;
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
END $$;

-- Derive completion from central Tasks and journal it once, within the same transaction.
CREATE FUNCTION app_private.process_finish_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public."Tasks";i public."Process_instances";BEGIN
 SELECT * INTO t FROM public."Tasks" WHERE id=NEW.task_id;
 IF t.source_type<>'process' OR t.status NOT IN ('completed','cancelled') THEN RETURN NEW;END IF;
 SELECT * INTO i FROM public."Process_instances" WHERE id=(t.source_metadata->>'process_instance_id')::bigint FOR UPDATE;
 IF NOT FOUND OR i.finished_at IS NOT NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT FROM public."Tasks" WHERE source_namespace='process:'||i.id AND status NOT IN ('completed','cancelled')) THEN
  UPDATE public."Process_instances" SET finished_at=clock_timestamp() WHERE id=i.id;
  PERFORM app_private.task_admin_audit('process_instance',i.id::text,CASE WHEN EXISTS(SELECT FROM public."Tasks" WHERE source_namespace='process:'||i.id AND status='cancelled') THEN 'cancelled' ELSE 'completed' END,NULL,jsonb_build_object('version_id',i.version_id),NEW.operation_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER process_finish_event AFTER INSERT ON public."Task_events" FOR EACH ROW EXECUTE FUNCTION app_private.process_finish_event();
CREATE FUNCTION app_private.process_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.execution_snapshot IS NOT NULL AND (OLD.execution_snapshot IS DISTINCT FROM NEW.execution_snapshot OR OLD.version_id IS DISTINCT FROM NEW.version_id) THEN RAISE EXCEPTION 'PROCESS_VERSION_IMMUTABLE';END IF;RETURN NEW;
END $$;
CREATE TRIGGER process_snapshot_guard BEFORE UPDATE ON public."Process_instances" FOR EACH ROW EXECUTE FUNCTION app_private.process_snapshot_guard();
REVOKE ALL ON FUNCTION app_private.process_finish_event(),app_private.process_snapshot_guard() FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE d text;needle text;BEGIN
 d:=pg_get_functiondef('app_private.process_workspace_validate(jsonb)'::regprocedure);
 d:=replace(d,$txt$person->>'type' NOT IN ('employee','department')$txt$,$txt$person->>'type' NOT IN ('employee','department','role')$txt$);
 needle:=$txt$       ELSE RAISE EXCEPTION 'INVALID_RACI';END IF;$txt$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT RACI';END IF;
 EXECUTE replace(d,needle,$txt$       ELSIF person->>'type'='role' THEN IF NOT app_private.process_role_exists(person->>'id') THEN RAISE EXCEPTION 'INVALID_RACI';END IF;$txt$||needle);
 d:=pg_get_functiondef('app_private.process_validate(jsonb,boolean)'::regprocedure);
 needle:=' PERFORM app_private.process_workspace_validate(p_definition);';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT validation';END IF;
 EXECUTE replace(d,needle,' PERFORM app_private.process_wizard_validate(p_definition,p_publish);'||needle);
 d:=pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure);
 needle:=$txt$WHEN 'process_launch' THEN ARRAY['version_id','starts_on','default_employee_id','assignments','location_id','department_id']$txt$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT command args';END IF;
 EXECUTE replace(d,needle,$txt$WHEN 'process_archive' THEN ARRAY['template_id'] WHEN 'process_rate' THEN ARRAY['instance_id','rating','rating_comment'] $txt$||$txt$WHEN 'process_launch' THEN ARRAY['version_id','starts_on','default_employee_id','assignments','location_id','department_id','name','deadline','note','role_assignments']$txt$);
 d:=pg_get_functiondef('app_private.process_command(text,jsonb,uuid)'::regprocedure);
 needle:=$txt$ IF p_action='process_create' THEN$txt$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT commands';END IF;
 d:=replace(d,needle,$code$
 IF p_action='process_archive' THEN
  SELECT id INTO tpl FROM public."Process_templates" WHERE id=(p->>'template_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND';END IF;
  UPDATE public."Process_templates" SET active=false WHERE id=tpl;
  PERFORM app_private.task_admin_audit('process_template',tpl::text,'archived',NULL,p,p_op);RETURN jsonb_build_object('template_id',tpl);
 ELSIF p_action='process_rate' THEN
  SELECT id INTO inst FROM public."Process_instances" WHERE id=(p->>'instance_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND';END IF;
  IF NOT EXISTS(SELECT FROM public."Tasks" WHERE source_namespace='process:'||inst) OR EXISTS(SELECT FROM public."Tasks" WHERE source_namespace='process:'||inst AND status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'PROCESS_NOT_FINISHED';END IF;
  UPDATE public."Process_instances" SET rating=(p->>'rating')::numeric,rating_comment=p->>'rating_comment',rated_by=a.id,rated_at=clock_timestamp() WHERE id=inst;
  PERFORM app_private.task_admin_audit('process_instance',inst::text,'rating_added',NULL,p,p_op);RETURN jsonb_build_object('instance_id',inst);
 ELSIF p_action='process_create' THEN$code$);
 needle:=$txt$   IF v.status<>'published' THEN$txt$;
 d:=replace(d,needle,$txt$   IF NOT (SELECT active FROM public."Process_templates" WHERE id=tpl) THEN RAISE EXCEPTION 'PROCESS_ARCHIVED';END IF;$txt$||needle);
 needle:='   PERFORM app_private.process_validate(v.definition,true);';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT launch';END IF;
 d:=replace(d,needle,needle||$code$
   IF v.definition->>'schema_version'='2' THEN
    IF length(trim(coalesce(p->>'name','')))=0 OR p->>'deadline' IS NULL OR (p->>'deadline')::date<(p->>'starts_on')::date THEN RAISE EXCEPTION 'PROCESS_REQUIRED_FIELDS';END IF;
    IF coalesce(p->'assignments','{}')<>'{}'::jsonb THEN RAISE EXCEPTION 'PROCESS_TEMPLATE_ROLES_ONLY';END IF;
    v.definition:=app_private.process_resolve_definition(v.definition,p);
   END IF;$code$);
 needle:=' RETURNING id INTO inst;';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT instance';END IF;
 d:=replace(d,needle,needle||$code$
   UPDATE public."Process_instances" SET name=coalesce(nullif(trim(p->>'name'),''),v.definition->>'name'),deadline=(p->>'deadline')::date,note=p->>'note',execution_snapshot=v.definition WHERE id=inst;$code$);
 EXECUTE d;
 d:=pg_get_functiondef('public.tasks_processes()'::regprocedure);
 d:=replace(d,$txt$v.definition->>'name' AS name$txt$,$txt$coalesce(i.name,v.definition->>'name') AS name$txt$);
 d:=replace(d,$txt$'deadline_at',t.deadline_at,$txt$,$txt$'priority',t.priority,'completed_at',t.completed_at,'deadline_at',t.deadline_at,$txt$);
 d:=replace(d,$txt$'templates',$txt$,$txt$'roles',(SELECT coalesce(jsonb_agg(role ORDER BY role),'[]') FROM (SELECT DISTINCT role FROM app_private.role_permissions)r),'templates',$txt$);
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION app_private.process_role_exists(text),app_private.process_wizard_validate(jsonb,boolean),app_private.process_resolve_employee(text,jsonb),app_private.process_resolve_definition(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
