BEGIN;
ALTER TABLE public."Work_shifts" ADD COLUMN current_shift_function text CHECK(current_shift_function IN ('prep','sushi','cutter'));
-- Existing audited snapshots already store complete shift rows. Add one event kind.
ALTER TABLE public."Work_shift_events" DROP CONSTRAINT "Work_shift_events_event_type_check";
ALTER TABLE public."Work_shift_events" ADD CONSTRAINT "Work_shift_events_event_type_check" CHECK(event_type IN ('WORK_SHIFT_CREATED','WORK_SHIFT_ENDED','WORK_SHIFT_CORRECTED','WORK_SHIFT_FUNCTION_CHANGED'));
CREATE FUNCTION app_private.shift_function_allowed(a public."Employees", f text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT a.role IN ('su-chef','sushi-master','crafter') AND f IN ('prep','sushi','cutter')
$$;
REVOKE ALL ON FUNCTION app_private.shift_function_allowed(public."Employees",text) FROM PUBLIC,anon,authenticated;
-- Patch existing RPCs in place; retain all current scopes, idempotency and delete guards.
DO $patch$ DECLARE d text; old text; BEGIN
 d:=pg_get_functiondef('app_private.worktime_audit()'::regprocedure);
 old:='IF why IS NULL AND TG_OP=''UPDATE'' AND ROW(NEW.started_at,NEW.ended_at) IS NOT DISTINCT FROM ROW(OLD.started_at,OLD.ended_at) THEN RETURN NEW; END IF;';
 IF position(old in d)=0 THEN RAISE EXCEPTION 'SHIFT_AUDIT_DRIFT';END IF;
 d:=replace(d,old,'IF TG_OP=''UPDATE'' AND NEW.current_shift_function IS DISTINCT FROM OLD.current_shift_function THEN
 a:=app_private.actor(); NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp();
 INSERT INTO public."Work_shift_events"(work_shift_id,event_type,actor_employee_id,old_values,new_values)
 VALUES(NEW.id,''WORK_SHIFT_FUNCTION_CHANGED'',a.id,to_jsonb(OLD),to_jsonb(NEW)); RETURN NEW;
 END IF; '||old);EXECUTE d;
 d:=pg_get_functiondef('public.worktime_command(text,jsonb,uuid)'::regprocedure);
 d:=replace(d,'''start'',''end'',''correct''','''start'',''end'',''correct'',''function''');
 d:=replace(d,'p_args-ARRAY[''location_id'',''module'']','p_args-ARRAY[''location_id'',''module'',''function'']');
 old:='loc:=(p_args->>''location_id'')::bigint;src:=p_args->>''module'';';
 IF position(old in d)=0 THEN RAISE EXCEPTION 'SHIFT_START_DRIFT';END IF;
 d:=replace(d,old,old||' IF p_args ? ''function'' AND NOT coalesce(app_private.shift_function_allowed(a,p_args->>''function''),false) THEN RAISE EXCEPTION ''SHIFT_FUNCTION_DENIED'' USING ERRCODE=''42501''; END IF;');
 d:=replace(d,'(employee_id,employee_name_snapshot,location_id,started_from_module) VALUES(a.id,a.name,loc,src)','(employee_id,employee_name_snapshot,location_id,started_from_module,current_shift_function) VALUES(a.id,a.name,loc,src,p_args->>''function'')');
 old:='IF p_action=''start'' THEN';
 d:=replace(d,old,'IF p_action=''function'' THEN
 IF p_args-ARRAY[''shift_id'',''function'']<>''{}''::jsonb OR NOT p_args ?& ARRAY[''shift_id'',''function''] OR NOT coalesce(app_private.shift_function_allowed(a,p_args->>''function''),false) THEN RAISE EXCEPTION ''SHIFT_FUNCTION_DENIED'' USING ERRCODE=''42501'';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(''orders-employee:''||a.id,19));
 SELECT * INTO s FROM public."Work_shifts" WHERE id=(p_args->>''shift_id'')::bigint AND employee_id=a.id AND ended_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''NO_ACTIVE_SHIFT'';END IF;
 UPDATE public."Work_shifts" SET current_shift_function=p_args->>''function'' WHERE id=s.id RETURNING * INTO s;
 ELS'||old);EXECUTE d;
 d:=pg_get_functiondef('public.orders_command(text,jsonb,uuid)'::regprocedure);
 old:='IF NOT FOUND THEN RAISE EXCEPTION ''NO_ACTIVE_SHIFT''; END IF;';
 IF position(old in d)=0 THEN RAISE EXCEPTION 'ORDERS_SHIFT_DRIFT';END IF;
 d:=replace(d,old,old||' IF a.role IN (''su-chef'',''sushi-master'',''crafter'') AND s.current_shift_function IS NOT NULL AND (
 s.current_shift_function=''prep'' OR
 (s.current_shift_function=''cutter'' AND p_action IN (''claim'',''claim_all'',''claim_set'',''ready''))) THEN RAISE EXCEPTION ''SHIFT_FUNCTION_DENIED'' USING ERRCODE=''42501''; END IF;');
 EXECUTE d;
END $patch$;
COMMIT;
