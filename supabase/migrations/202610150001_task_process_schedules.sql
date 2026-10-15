BEGIN;
INSERT INTO app_private.role_permissions(role,permission) VALUES('owner','tasks.interrupt'),('administrator','tasks.interrupt'),('director','tasks.interrupt') ON CONFLICT DO NOTHING;
CREATE FUNCTION app_private.recurrence_validate(r jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d jsonb;BEGIN
 IF r IS NULL THEN RETURN;END IF;
 IF jsonb_typeof(r)<>'object' OR r-ARRAY['frequency','interval','days_of_week','day_of_month','end_type','until','count']<>'{}' OR coalesce(r->>'frequency','') NOT IN ('none','daily','weekly','monthly','yearly') THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;
 IF r->>'frequency'='none' THEN RETURN;END IF;
 IF coalesce((r->>'interval')::integer,0) NOT BETWEEN 1 AND 366 OR coalesce(r->>'end_type','') NOT IN ('never','until','count') OR jsonb_typeof(coalesce(r->'days_of_week','[]'))<>'array' THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(coalesce(r->'days_of_week','[]')) LOOP IF (d#>>'{}')::integer NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;END LOOP;
 IF r->>'day_of_month' IS NOT NULL AND (r->>'day_of_month')::integer NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;
 IF r->>'end_type'='until' AND (r->>'until')::date IS NULL OR r->>'end_type'='count' AND coalesce((r->>'count')::integer,0) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;
END $$;
CREATE FUNCTION app_private.recurrence_next(r jsonb,anchor date,after_day date,generated integer) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d date;n integer;months integer;BEGIN
 PERFORM app_private.recurrence_validate(r);
 IF r IS NULL OR r->>'frequency'='none' OR (r->>'end_type'='count' AND generated>=(r->>'count')::integer) THEN RETURN NULL;END IF;
 n:=(r->>'interval')::integer;
 -- Bounded date calculation, no upfront materialization. Impossible month dates are skipped.
 FOR d IN SELECT after_day+i FROM generate_series(1,146400)i LOOP
  IF r->>'end_type'='until' AND d>(r->>'until')::date THEN RETURN NULL;END IF;
  months:=(extract(year FROM d)::integer-extract(year FROM anchor)::integer)*12+extract(month FROM d)::integer-extract(month FROM anchor)::integer;
  IF (r->>'frequency'='daily' AND (d-anchor)%n=0)
   OR (r->>'frequency'='weekly' AND ((d-(anchor-(extract(isodow FROM anchor)::integer-1)))/7)%n=0 AND CASE WHEN jsonb_array_length(coalesce(r->'days_of_week','[]'))=0 THEN extract(isodow FROM d)=extract(isodow FROM anchor) ELSE (r->'days_of_week')@>jsonb_build_array(extract(isodow FROM d)::integer) END)
   OR (r->>'frequency'='monthly' AND months%n=0 AND extract(day FROM d)=coalesce((r->>'day_of_month')::integer,extract(day FROM anchor)::integer))
   OR (r->>'frequency'='yearly' AND (extract(year FROM d)::integer-extract(year FROM anchor)::integer)%n=0 AND to_char(d,'MM-DD')=to_char(anchor,'MM-DD')) THEN RETURN d;END IF;
 END LOOP; RETURN NULL;
END $$;
ALTER TABLE public."Recurring_task_templates" ADD COLUMN recurrence jsonb,ADD COLUMN next_occurrence date,ADD COLUMN generated_count integer NOT NULL DEFAULT 0,ADD COLUMN operation_id uuid UNIQUE,ADD COLUMN scheduler_state text NOT NULL DEFAULT 'legacy' CHECK(scheduler_state IN ('legacy','pending'));
CREATE TABLE public."Process_schedules"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,template_id bigint NOT NULL REFERENCES public."Process_templates",version_id bigint NOT NULL REFERENCES public."Process_versions",created_by_employee_id bigint NOT NULL REFERENCES public."Employees",definition jsonb NOT NULL,launch_args jsonb NOT NULL,anchor_deadline date NOT NULL,start_offset_days integer NOT NULL CHECK(start_offset_days BETWEEN 0 AND 3660),next_occurrence date,generated_count integer NOT NULL DEFAULT 1,operation_id uuid NOT NULL UNIQUE,scheduler_state text NOT NULL DEFAULT 'pending' CHECK(scheduler_state='pending'));
ALTER TABLE public."Process_schedules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Process_schedules" FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public."Process_schedules_id_seq" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."Process_instances" ADD COLUMN schedule_id bigint REFERENCES public."Process_schedules",ADD COLUMN occurrence_deadline date;
CREATE UNIQUE INDEX process_occurrence_unique ON public."Process_instances"(schedule_id,occurrence_deadline) WHERE schedule_id IS NOT NULL;

CREATE FUNCTION app_private.task_interrupt_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.urgency='critical_now' AND (TG_OP='INSERT' OR OLD.urgency IS DISTINCT FROM NEW.urgency) AND NOT app_private.has_permission('tasks.interrupt') THEN RAISE EXCEPTION 'INTERRUPTION_DENIED' USING ERRCODE='42501';END IF;RETURN NEW;END $$;
CREATE TRIGGER task_interrupt_guard BEFORE INSERT OR UPDATE OF urgency ON public."Tasks" FOR EACH ROW EXECUTE FUNCTION app_private.task_interrupt_guard();

DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app_private.process_wizard_validate(jsonb,boolean)'::regprocedure);
 IF position('OR length(trim(coalesce(doc->>''instruction'','''')))=0' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT wizard';END IF;
 EXECUTE replace(d,'OR length(trim(coalesce(doc->>''instruction'','''')))=0','');
END $$;
ALTER FUNCTION app_private.process_wizard_validate(jsonb,boolean) RENAME TO process_wizard_validate_20261011;
CREATE FUNCTION app_private.process_wizard_validate(doc jsonb,publish boolean) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb;t jsonb;sd integer;td integer;BEGIN
 PERFORM app_private.process_wizard_validate_20261011(doc,publish);PERFORM app_private.recurrence_validate(doc->'recurrence');
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  sd:=(s->>'deadline_offset_days')::integer;IF sd IS NOT NULL AND sd NOT BETWEEN 0 AND 3660 THEN RAISE EXCEPTION 'INVALID_DEADLINE';END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP td:=(t->>'deadline_offset_days')::integer;
   IF td IS NOT NULL AND td NOT BETWEEN 0 AND 3660 THEN RAISE EXCEPTION 'INVALID_DEADLINE';END IF;
   IF sd IS NOT NULL AND td>sd THEN RAISE EXCEPTION 'TASK_STAGE_DEADLINE';END IF;
  END LOOP;
 END LOOP;
END $$;
ALTER FUNCTION app_private.process_resolve_definition(jsonb,jsonb) RENAME TO process_resolve_definition_20261011;
CREATE FUNCTION app_private.process_resolve_definition(doc jsonb,p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE stages jsonb:='[]';ts jsonb;s jsonb;t jsonb;zone text;start_day date;sd date;td date;deadline timestamptz;BEGIN
 doc:=app_private.process_resolve_definition_20261011(doc,p);start_day:=(p->>'starts_on')::date;SELECT company_timezone INTO zone FROM public."Task_module_settings";
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  sd:=start_day+(s->>'deadline_offset_days')::integer;ts:='[]';
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   td:=coalesce(start_day+(t->>'deadline_offset_days')::integer,sd);deadline:=CASE WHEN td IS NOT NULL THEN (td+1)::timestamp AT TIME ZONE zone-interval '1 minute' ELSE (t->>'deadline_at')::timestamptz END;
   IF sd IS NOT NULL AND (deadline AT TIME ZONE zone)::date>sd THEN RAISE EXCEPTION 'TASK_STAGE_DEADLINE';END IF;
   ts:=ts||jsonb_build_array(t||jsonb_build_object('deadline_at',deadline,'stage_deadline',sd));
  END LOOP;
  stages:=stages||jsonb_build_array(s||jsonb_build_object('deadline',sd,'tasks',ts));
 END LOOP;RETURN doc||jsonb_build_object('stages',stages);
END $$;

ALTER FUNCTION app_private.task_validate_args(text,jsonb) RENAME TO task_validate_args_20261011;
CREATE FUNCTION app_private.task_validate_args(p_action text,p_args jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF p_action='create' THEN PERFORM app_private.task_validate_args_20261011(p_action,p_args-'recurrence');
 ELSIF p_action='process_launch' THEN PERFORM app_private.task_validate_args_20261011(p_action,p_args-ARRAY['template_id','recurrence','start_offset_days']);
 ELSE PERFORM app_private.task_validate_args_20261011(p_action,p_args);END IF;
END $$;
ALTER FUNCTION app_private.task_dispatch(text,jsonb,uuid) RENAME TO task_dispatch_20261011;
CREATE FUNCTION app_private.task_dispatch(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;a public."Employees";t public."Tasks";r jsonb;rid bigint;zone text;anchor date;BEGIN
 a:=app_private.task_actor();
 IF p_action IN ('create','update','request_creation') AND p_args->>'urgency'='critical_now' AND NOT app_private.has_permission('tasks.interrupt') THEN RAISE EXCEPTION 'INTERRUPTION_DENIED' USING ERRCODE='42501';END IF;
 IF p_action<>'create' THEN RETURN app_private.task_dispatch_20261011(p_action,p_args,p_op);END IF;
 r:=p_args->'recurrence';PERFORM app_private.recurrence_validate(r);
 SELECT company_timezone INTO zone FROM public."Task_module_settings";
 p_args:=(p_args-'recurrence')||jsonb_build_object('estimated_minutes',coalesce((p_args->>'estimated_minutes')::integer,30),'deadline_at',coalesce((p_args->>'deadline_at')::timestamptz,(app_private.task_today()+7+time '17:00') AT TIME ZONE zone),'assigned_to_employee_id',coalesce((p_args->>'assigned_to_employee_id')::bigint,a.id));
 result:=app_private.task_dispatch_20261011(p_action,p_args,p_op);
 IF r IS NOT NULL AND r->>'frequency'<>'none' THEN
  SELECT * INTO t FROM public."Tasks" WHERE id=(result->>'id')::bigint;anchor:=(t.deadline_at AT TIME ZONE zone)::date;
  IF r->>'end_type'='until' AND (r->>'until')::date<anchor THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;
  INSERT INTO public."Recurring_task_templates"(title,description,assigned_to_employee_id,category_id,estimated_minutes,starts_on,ends_on,every_days,active,created_by_employee_id,recurrence,next_occurrence,generated_count,operation_id,scheduler_state)
  VALUES(t.title,t.description,t.assigned_to_employee_id,t.category_id,t.estimated_minutes,anchor,(r->>'until')::date,1,false,a.id,r,app_private.recurrence_next(r,anchor,anchor,1),1,p_op,'pending') RETURNING id INTO rid;
  UPDATE public."Tasks" SET version=version+1,source_metadata=source_metadata||jsonb_build_object('recurrence',r,'recurring_template_id',rid),source_namespace='recurring:'||rid,source_external_id=anchor::text WHERE id=t.id RETURNING to_jsonb("Tasks".*) INTO result;
  PERFORM app_private.task_event(t.id,'TASK_UPDATED',p_op,to_jsonb(t),jsonb_build_object('recurrence',r,'scheduler_state','pending'));
 END IF;RETURN result;
END $$;

ALTER FUNCTION app_private.process_command(text,jsonb,uuid) RENAME TO process_command_20261011;
CREATE FUNCTION app_private.process_command(p_action text,p jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v public."Process_versions";tpl bigint;r jsonb;off integer;result jsonb;sid bigint;inst bigint;a public."Employees";BEGIN
 IF p_action<>'process_launch' THEN RETURN app_private.process_command_20261011(p_action,p,p_op);END IF;
 a:=app_private.task_actor();IF NOT app_private.has_permission('processes.launch') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 tpl:=coalesce((p->>'template_id')::bigint,(SELECT template_id FROM public."Process_versions" WHERE id=(p->>'version_id')::bigint));
 PERFORM id FROM public."Process_templates" WHERE id=tpl FOR UPDATE;
 SELECT * INTO v FROM public."Process_versions" WHERE template_id=tpl AND status='published' ORDER BY number DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'PROCESS_NOT_PUBLISHED';END IF;
 r:=coalesce(p->'recurrence',v.definition->'recurrence');PERFORM app_private.recurrence_validate(r);off:=coalesce((p->>'start_offset_days')::integer,0);
 IF off NOT BETWEEN 0 AND 3660 THEN RAISE EXCEPTION 'INVALID_DEADLINE';END IF;
 IF p?'start_offset_days' THEN IF p->>'deadline' IS NULL THEN RAISE EXCEPTION 'PROCESS_REQUIRED_FIELDS';END IF;p:=p||jsonb_build_object('starts_on',(p->>'deadline')::date-off);END IF;
 p:=(p-ARRAY['template_id','recurrence','start_offset_days'])||jsonb_build_object('version_id',v.id);
 result:=app_private.process_command_20261011(p_action,p,p_op);inst:=(result->>'instance_id')::bigint;
 IF r IS NOT NULL AND r->>'frequency'<>'none' THEN
  IF p->>'deadline' IS NULL OR (r->>'end_type'='until' AND (r->>'until')::date<(p->>'deadline')::date) THEN RAISE EXCEPTION 'INVALID_RECURRENCE';END IF;
  INSERT INTO public."Process_schedules"(template_id,version_id,created_by_employee_id,definition,launch_args,anchor_deadline,start_offset_days,next_occurrence,operation_id)
  VALUES(tpl,v.id,a.id,r,p,(p->>'deadline')::date,off,app_private.recurrence_next(r,(p->>'deadline')::date,(p->>'deadline')::date,1),p_op) RETURNING id INTO sid;
  UPDATE public."Process_instances" SET schedule_id=sid,occurrence_deadline=(p->>'deadline')::date WHERE id=inst;
  PERFORM app_private.task_admin_audit('process_schedule',sid::text,'created',NULL,jsonb_build_object('recurrence',r,'start_offset_days',off,'scheduler_state','pending'),p_op);
 END IF;RETURN result;
END $$;
-- A fixed deadline from the execution snapshot stays fixed even when a predecessor completes late.
-- Preserve the legacy relative-date behavior where no stage/task deadline was configured.
DO $$ DECLARE d text;old text;BEGIN
 d:=pg_get_functiondef('app_private.process_command_20261011(text,jsonb,uuid)'::regprocedure);
 old:=$txt$'deadline_at',CASE WHEN coalesce(t->>'relative_to','')='' THEN$txt$;
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT process launch deadline';END IF;
 EXECUTE replace(d,old,$txt$'deadline_at',CASE WHEN t->>'stage_deadline' IS NOT NULL OR t->>'deadline_offset_days' IS NOT NULL THEN (t->>'deadline_at')::timestamptz WHEN coalesce(t->>'relative_to','')='' THEN$txt$);
 d:=pg_get_functiondef('app_private.process_relative_dates(uuid,text)'::regprocedure);
 old:=$txt$deadline_at=(target+1)::timestamp AT TIME ZONE zone-interval '1 minute'$txt$;
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT relative deadline';END IF;
 EXECUTE replace(d,old,$txt$deadline_at=CASE WHEN t.source_metadata->'step'->>'stage_deadline' IS NOT NULL OR t.source_metadata->'step'->>'deadline_offset_days' IS NOT NULL THEN (t.source_metadata->'step'->>'deadline_at')::timestamptz ELSE (target+1)::timestamp AT TIME ZONE zone-interval '1 minute' END$txt$);
END $$;
-- Keep delayed relative-task unlock within the immutable stage deadline as well.
CREATE FUNCTION app_private.process_task_deadline_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE sd date;zone text;BEGIN
 IF NEW.source_type='process' THEN sd:=(NEW.source_metadata->'step'->>'stage_deadline')::date;IF sd IS NOT NULL THEN SELECT company_timezone INTO zone FROM public."Task_module_settings";IF (NEW.deadline_at AT TIME ZONE zone)::date>sd THEN RAISE EXCEPTION 'TASK_STAGE_DEADLINE';END IF;END IF;END IF;RETURN NEW;END $$;
CREATE TRIGGER process_task_deadline_guard BEFORE INSERT OR UPDATE ON public."Tasks" FOR EACH ROW EXECUTE FUNCTION app_private.process_task_deadline_guard();
DO $$ DECLARE f regprocedure;BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_private' AND (p.proname IN ('recurrence_validate','recurrence_next','task_interrupt_guard','process_task_deadline_guard','task_validate_args','task_dispatch','process_command','process_wizard_validate','process_resolve_definition') OR p.proname LIKE '%20261011') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);END LOOP;
END $$;
COMMIT;
