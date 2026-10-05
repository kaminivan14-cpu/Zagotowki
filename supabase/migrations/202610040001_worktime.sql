BEGIN;
ALTER TABLE public."Work_shifts"
 ADD COLUMN started_from_module text CHECK(started_from_module IN ('orders','production')),
 ADD COLUMN ended_from_module text CHECK(ended_from_module IN ('orders','production')),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN version bigint NOT NULL DEFAULT 1;
-- Existing rows originate exclusively from Orders. No historical times are invented.
UPDATE public."Work_shifts" SET started_from_module='orders',ended_from_module=CASE WHEN ended_at IS NOT NULL THEN 'orders' END;
CREATE INDEX worktime_employee_time ON public."Work_shifts"(employee_id,started_at);
CREATE INDEX worktime_started ON public."Work_shifts"(started_at,id);
CREATE TABLE public."Work_shift_events"(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 work_shift_id bigint NOT NULL REFERENCES public."Work_shifts" ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('WORK_SHIFT_CREATED','WORK_SHIFT_ENDED','WORK_SHIFT_CORRECTED')),
 actor_employee_id bigint NOT NULL REFERENCES public."Employees",
 old_values jsonb,new_values jsonb NOT NULL,reason text,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX worktime_event_shift ON public."Work_shift_events"(work_shift_id,id);
ALTER TABLE public."Work_shift_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Work_shift_events" FROM PUBLIC,anon,authenticated;
INSERT INTO app_private.role_permissions SELECT r,p FROM unnest(ARRAY['administrator','manager'])r
 CROSS JOIN unnest(ARRAY['worktime.access','worktime.read.scope','worktime.export','worktime.correct'])p;
INSERT INTO app_private.role_permissions VALUES('administrator','worktime.read.all');
INSERT INTO app_private.role_permissions SELECT DISTINCT role,'worktime.self' FROM app_private.role_permissions WHERE permission IN ('orders.access','production.access');

CREATE FUNCTION app_private.worktime_actor(p_permission text) RETURNS public."Employees"
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; BEGIN
 a:=app_private.actor();
 IF a.archived_at IS NOT NULL OR NOT app_private.has_permission(p_permission) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
CREATE FUNCTION app_private.worktime_scope(p_employee bigint,p_location bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app_private.has_permission('worktime.read.scope') AND
 (app_private.has_permission('worktime.read.all') OR EXISTS(
 SELECT FROM public."Employees" a JOIN public."Employees" e ON e.id=p_employee
 WHERE a.auth_user_id=auth.uid() AND a.active AND a.archived_at IS NULL AND a.location_id=p_location AND e.location_id=a.location_id))
$$;
CREATE FUNCTION app_private.worktime_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE kind text; a public."Employees"; why text:=nullif(current_setting('app.worktime_reason',true),''); BEGIN
 IF why IS NULL AND TG_OP='UPDATE' AND ROW(NEW.started_at,NEW.ended_at) IS NOT DISTINCT FROM ROW(OLD.started_at,OLD.ended_at) THEN RETURN NEW; END IF;
 a:=app_private.actor();
 IF TG_OP='INSERT' THEN
  NEW.started_from_module:=coalesce(NEW.started_from_module,'orders');kind:='WORK_SHIFT_CREATED';
 ELSE
  NEW.version:=OLD.version+1;
  IF why IS NOT NULL THEN kind:='WORK_SHIFT_CORRECTED';
  ELSIF NEW.started_at IS DISTINCT FROM OLD.started_at OR OLD.ended_at IS NOT NULL THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED';
  ELSE kind:='WORK_SHIFT_ENDED';NEW.ended_from_module:=coalesce(NEW.ended_from_module,'orders'); END IF;
 END IF;
 NEW.updated_at:=clock_timestamp();
 INSERT INTO public."Work_shift_events"(work_shift_id,event_type,actor_employee_id,old_values,new_values,reason)
 VALUES(NEW.id,kind,a.id,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW),why);
 RETURN NEW;
END $$;
-- Deferred FK permits audit insertion in the BEFORE INSERT trigger.
ALTER TABLE public."Work_shift_events" DROP CONSTRAINT "Work_shift_events_work_shift_id_fkey";
ALTER TABLE public."Work_shift_events" ADD FOREIGN KEY(work_shift_id) REFERENCES public."Work_shifts"(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER worktime_audit BEFORE INSERT OR UPDATE ON public."Work_shifts" FOR EACH ROW EXECUTE FUNCTION app_private.worktime_audit();
CREATE FUNCTION app_private.worktime_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY'; END $$;
CREATE TRIGGER worktime_immutable BEFORE UPDATE OR DELETE ON public."Work_shift_events" FOR EACH ROW EXECUTE FUNCTION app_private.worktime_append_only();
CREATE TRIGGER worktime_no_truncate BEFORE TRUNCATE ON public."Work_shift_events" FOR EACH STATEMENT EXECUTE FUNCTION app_private.worktime_append_only();

CREATE FUNCTION public.worktime_current() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; BEGIN a:=app_private.worktime_actor('worktime.self');
 RETURN (SELECT to_jsonb(s) FROM public."Work_shifts" s WHERE employee_id=a.id AND ended_at IS NULL);
END $$;
CREATE FUNCTION public.worktime_command(p_action text,p_args jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; s public."Work_shifts"; previous app_private.order_operations; result jsonb; loc bigint; src text; st timestamptz; en timestamptz; why text; BEGIN
 a:=app_private.worktime_actor(CASE WHEN p_action='correct' THEN 'worktime.correct' ELSE 'worktime.self' END);
 IF p_action NOT IN ('start','end','correct') OR p_action IS NULL OR p_operation IS NULL OR jsonb_typeof(p_args) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('orders-op:'||p_operation::text,18));
 SELECT * INTO previous FROM app_private.order_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF previous.actor_employee_id<>a.id OR previous.operation_type<>'worktime.'||p_action OR previous.arguments<>p_args THEN RAISE EXCEPTION 'OPERATION_CONFLICT'; END IF;
  IF p_action='correct' THEN
   SELECT * INTO s FROM public."Work_shifts" WHERE id=(p_args->>'shift_id')::bigint;
   IF NOT app_private.worktime_scope(s.employee_id,s.location_id) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN previous.result;
 END IF;
 IF p_action='start' THEN
  IF p_args-ARRAY['location_id','module']<>'{}'::jsonb OR NOT p_args ?& ARRAY['location_id','module'] THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
  loc:=(p_args->>'location_id')::bigint;src:=p_args->>'module';
  IF src IS NULL OR src NOT IN ('orders','production') OR NOT app_private.has_permission(CASE WHEN src='orders' THEN 'orders.access' ELSE 'production.access' END)
   OR NOT EXISTS(SELECT FROM public."Locations" WHERE id=loc AND active)
   OR (a.role NOT IN ('owner','administrator') AND a.location_id IS DISTINCT FROM loc) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('orders-employee:'||a.id,19));
  PERFORM 1 FROM public."Employees" WHERE id=a.id AND active AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM public."Work_shifts" WHERE employee_id=a.id AND ended_at IS NULL FOR UPDATE;
  IF FOUND THEN IF s.location_id<>loc THEN RAISE EXCEPTION 'END_CURRENT_SHIFT'; END IF;
  ELSE INSERT INTO public."Work_shifts"(employee_id,employee_name_snapshot,location_id,started_from_module) VALUES(a.id,a.name,loc,src) RETURNING * INTO s; END IF;
 ELSE
  SELECT * INTO s FROM public."Work_shifts" WHERE id=(p_args->>'shift_id')::bigint;
  IF NOT FOUND OR (p_action='end' AND s.employee_id<>a.id) OR (p_action='correct' AND NOT app_private.worktime_scope(s.employee_id,s.location_id)) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('orders-employee:'||s.employee_id,19));
  SELECT * INTO s FROM public."Work_shifts" WHERE id=s.id FOR UPDATE;
  PERFORM app_private.worktime_actor(CASE WHEN p_action='correct' THEN 'worktime.correct' ELSE 'worktime.self' END);
  IF p_action='end' THEN
   IF p_args-ARRAY['shift_id','module']<>'{}'::jsonb OR NOT p_args ?& ARRAY['shift_id','module'] THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
   src:=p_args->>'module';
   IF src IS NULL OR src NOT IN ('orders','production') OR NOT app_private.has_permission(CASE WHEN src='orders' THEN 'orders.access' ELSE 'production.access' END) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
   IF s.ended_at IS NULL THEN
    IF EXISTS(SELECT FROM public."Order_item_assignments" WHERE work_shift_id=s.id AND released_at IS NULL AND ready_for_cutting_at IS NULL)
     OR EXISTS(SELECT FROM public."Order_cutting_assignments" WHERE work_shift_id=s.id AND issued_at IS NULL) THEN RAISE EXCEPTION 'UNFINISHED_WORK'; END IF;
    UPDATE public."Work_shifts" SET ended_at=clock_timestamp(),ended_from_module=src WHERE id=s.id RETURNING * INTO s;
   END IF;
  ELSE
   IF p_args-ARRAY['shift_id','version','started_at','ended_at','reason']<>'{}'::jsonb OR NOT p_args ?& ARRAY['shift_id','version','started_at','ended_at','reason'] THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
   IF NOT app_private.worktime_scope(s.employee_id,s.location_id) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
   IF (p_args->>'version')::bigint IS DISTINCT FROM s.version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   why:=trim(p_args->>'reason');st:=(p_args->>'started_at')::timestamptz;en:=(p_args->>'ended_at')::timestamptz;
   IF coalesce(length(why),0) NOT BETWEEN 3 AND 1000 OR st IS NULL OR NOT isfinite(st) OR st>clock_timestamp() OR (en IS NOT NULL AND (NOT isfinite(en) OR en<st OR en>clock_timestamp())) THEN RAISE EXCEPTION 'INVALID_CORRECTION'; END IF;
   IF EXISTS(SELECT FROM public."Work_shifts" x WHERE x.employee_id=s.employee_id AND x.id<>s.id AND tstzrange(x.started_at,x.ended_at,'[)') && tstzrange(st,en,'[)')) THEN RAISE EXCEPTION 'SHIFT_OVERLAP'; END IF;
   IF s.ended_at IS NULL AND en IS NOT NULL AND
    (EXISTS(SELECT FROM public."Order_item_assignments" WHERE work_shift_id=s.id AND released_at IS NULL AND ready_for_cutting_at IS NULL)
    OR EXISTS(SELECT FROM public."Order_cutting_assignments" WHERE work_shift_id=s.id AND issued_at IS NULL)) THEN RAISE EXCEPTION 'UNFINISHED_WORK'; END IF;
   PERFORM set_config('app.worktime_reason',why,true);
   UPDATE public."Work_shifts" SET started_at=st,ended_at=en,ended_from_module=CASE WHEN en IS NULL THEN NULL ELSE ended_from_module END WHERE id=s.id RETURNING * INTO s;
   PERFORM set_config('app.worktime_reason','',true);
  END IF;
 END IF;
 result:=jsonb_build_object('shift_id',s.id,'version',s.version);
 INSERT INTO app_private.order_operations(operation_id,actor_employee_id,operation_type,arguments,result) VALUES(p_operation,a.id,'worktime.'||p_action,p_args,result);
 RETURN result;
END $$;

CREATE FUNCTION app_private.worktime_rows(p_from date,p_to date,p_employee bigint,p_location bigint,p_status text)
RETURNS TABLE(id bigint,employee_id bigint,employee_name text,location_id bigint,location_name text,started_at timestamptz,ended_at timestamptz,started_from_module text,ended_from_module text,version bigint,status text,work_date date,worked_minutes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app_private.worktime_actor('worktime.read.scope');
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>365 OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR (p_status IS NOT NULL AND p_status NOT IN ('active','completed','needs_attention')) THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 RETURN QUERY SELECT x.* FROM (
 SELECT s.id,s.employee_id,s.employee_name_snapshot,s.location_id,l.name,s.started_at,s.ended_at,s.started_from_module,s.ended_from_module,s.version,
 CASE WHEN s.started_at>now() OR s.ended_at>now() OR coalesce(s.ended_at,now())-s.started_at>interval '16 hours'
 OR EXISTS(SELECT FROM public."Work_shifts" z WHERE z.employee_id=s.employee_id AND z.id<>s.id AND tstzrange(z.started_at,z.ended_at,'[)') && tstzrange(s.started_at,s.ended_at,'[)')) THEN 'needs_attention'
 WHEN s.ended_at IS NULL THEN 'active' ELSE 'completed' END AS shift_status,
 (s.started_at AT TIME ZONE 'Europe/Warsaw')::date,
 CASE WHEN s.ended_at IS NOT NULL THEN floor(extract(epoch FROM s.ended_at-s.started_at)/60)::bigint END
 FROM public."Work_shifts" s JOIN public."Locations" l ON l.id=s.location_id
 WHERE s.started_at >= p_from::timestamp AT TIME ZONE 'Europe/Warsaw' AND s.started_at < (p_to+1)::timestamp AT TIME ZONE 'Europe/Warsaw'
 AND (p_employee IS NULL OR s.employee_id=p_employee) AND (p_location IS NULL OR s.location_id=p_location)
 AND app_private.worktime_scope(s.employee_id,s.location_id))x
 WHERE p_status IS NULL OR x.shift_status=p_status;
END $$;
CREATE FUNCTION public.worktime_list(p_from date,p_to date,p_employee bigint DEFAULT NULL,p_location bigint DEFAULT NULL,p_status text DEFAULT NULL,p_cursor bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; BEGIN
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') INTO result FROM
 (SELECT * FROM app_private.worktime_rows(p_from,p_to,p_employee,p_location,p_status) WHERE id>p_cursor ORDER BY id LIMIT 100)r;
 RETURN jsonb_build_object('rows',result,'next_cursor',CASE WHEN jsonb_array_length(result)=100 THEN (result->99->>'id')::bigint END);
END $$;
CREATE FUNCTION public.worktime_summary(p_from date,p_to date,p_employee bigint DEFAULT NULL,p_location bigint DEFAULT NULL,p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(x ORDER BY employee_name),'[]') FROM
 (SELECT employee_id,max(employee_name) employee_name,count(DISTINCT work_date) FILTER(WHERE ended_at IS NOT NULL) work_days,
 coalesce(floor(sum(extract(epoch FROM ended_at-started_at)) FILTER(WHERE ended_at IS NOT NULL)/60),0)::bigint worked_minutes,count(*) FILTER(WHERE ended_at IS NULL) active_sessions
 FROM app_private.worktime_rows(p_from,p_to,p_employee,p_location,p_status) GROUP BY employee_id)x
$$;
CREATE FUNCTION public.worktime_calendar(p_from date,p_to date,p_employee bigint DEFAULT NULL,p_location bigint DEFAULT NULL,p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(x ORDER BY work_date),'[]') FROM
 (SELECT work_date,count(*) sessions,coalesce(floor(sum(extract(epoch FROM ended_at-started_at))/60),0)::bigint worked_minutes
 FROM app_private.worktime_rows(p_from,p_to,p_employee,p_location,p_status) GROUP BY work_date)x
$$;
CREATE FUNCTION public.worktime_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app_private.worktime_actor('worktime.access');
 RETURN jsonb_build_object('timezone','Europe/Warsaw','attention_hours',16,
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) ORDER BY e.name),'[]') FROM public."Employees" e WHERE app_private.worktime_scope(e.id,e.location_id)),
 'locations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) ORDER BY l.name),'[]') FROM public."Locations" l WHERE app_private.has_permission('worktime.read.all') OR EXISTS(SELECT FROM public."Employees" e WHERE e.auth_user_id=auth.uid() AND e.location_id=l.id)));
END $$;
CREATE FUNCTION public.worktime_events(p_shift bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public."Work_shifts"; BEGIN
 PERFORM app_private.worktime_actor('worktime.read.scope');
 SELECT * INTO s FROM public."Work_shifts" WHERE id=p_shift;
 IF NOT FOUND OR NOT app_private.worktime_scope(s.employee_id,s.location_id) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM public."Work_shift_events" e WHERE work_shift_id=p_shift);
END $$;
CREATE FUNCTION public.worktime_export_xml(p_from date,p_to date,p_employee bigint DEFAULT NULL,p_location bigint DEFAULT NULL,p_status text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result xml; BEGIN
 PERFORM app_private.worktime_actor('worktime.export');
 IF (SELECT count(*) FROM app_private.worktime_rows(p_from,p_to,p_employee,p_location,p_status))>10000 THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE'; END IF;
 SELECT xmlelement(name "workTimeReport",xmlattributes(p_from AS "from",p_to AS "to",'Europe/Warsaw' AS "timezone"),
 xmlagg(x.body ORDER BY x.employee_id)) INTO result FROM
 (SELECT employee_id,xmlelement(name "employee",xmlattributes(employee_id AS "id"),xmlelement(name "name",max(employee_name)),
 xmlagg(xmlelement(name "session",xmlattributes(id AS "id",status AS "status",location_id AS "locationId"),
 xmlelement(name "startDate",to_char(started_at AT TIME ZONE 'Europe/Warsaw','YYYY-MM-DD')),
 xmlelement(name "startTime",to_char(started_at AT TIME ZONE 'Europe/Warsaw','HH24:MI')),
 xmlelement(name "endDate",to_char(ended_at AT TIME ZONE 'Europe/Warsaw','YYYY-MM-DD')),
 xmlelement(name "endTime",to_char(ended_at AT TIME ZONE 'Europe/Warsaw','HH24:MI')),
 xmlelement(name "workedMinutes",worked_minutes)) ORDER BY started_at,id)) body
 FROM app_private.worktime_rows(p_from,p_to,p_employee,p_location,p_status) GROUP BY employee_id)x;
 RETURN result::text;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'worktime_%' AND n.nspname IN ('public','app_private') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
COMMIT;
