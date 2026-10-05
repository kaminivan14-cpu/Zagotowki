BEGIN;
DO $$ BEGIN
 IF md5(pg_get_functiondef('app_private.task_next(uuid)'::regprocedure))<>'d8bc656a6a793925f1bef2860ab6d7b8' THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_next';END IF;
 IF md5(pg_get_functiondef('app_private.task_work_command(text,jsonb,uuid)'::regprocedure))<>'7df09a95b38f63a7bf2ac7815513ba7d' THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_work_command';END IF;
 IF md5(pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure))<>'7787515021ce0082cd336099d74a3c50' THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_validate_args';END IF;
 IF md5(pg_get_functiondef('public.worktime_command(text,jsonb,uuid)'::regprocedure))<>'de1267733d83019d6c6d0e7b006705d8' THEN RAISE EXCEPTION 'SCHEMA_DRIFT worktime_command';END IF;
END $$;
CREATE FUNCTION app_private.task_queue_candidate(p_employee bigint) RETURNS SETOF public."Tasks" LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $queue$
SELECT * FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND status IN ('planned','unplanned','paused') AND app_private.task_ready("Tasks")
 AND NOT EXISTS(SELECT FROM app_private.task_critical_ack ack WHERE ack.employee_id=p_employee AND ack.task_id="Tasks".id AND ack.remind_after>now())
 ORDER BY CASE urgency WHEN 'critical_now' THEN 0 WHEN 'critical_today' THEN 1 ELSE 2 END,planned_start_at NULLS LAST,CASE WHEN deadline_is_hard THEN deadline_at END NULLS LAST,CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,planned_order NULLS LAST,planned_date NULLS LAST,estimated_minutes,id LIMIT 1;
$queue$;
REVOKE ALL ON FUNCTION app_private.task_queue_candidate(bigint) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION app_private.task_next(p_op uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ DECLARE a public."Employees"; t public."Tasks"; BEGIN
 a:=app_private.task_actor(); PERFORM app_private.task_lock(a.id);
 SELECT * INTO t FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND status='in_progress'; IF FOUND THEN RETURN to_jsonb(t); END IF;
 INSERT INTO public."Task_work_contexts"(employee_id,started) VALUES(a.id,true) ON CONFLICT(employee_id) DO UPDATE SET started=true;
 SELECT * INTO t FROM public."Tasks" WHERE id=(SELECT id FROM app_private.task_queue_candidate(a.id)) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF; RETURN app_private.task_start(t.id,p_op);
END $function$
;
CREATE OR REPLACE FUNCTION app_private.task_work_command(p_action text, p_args jsonb, p_op uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ DECLARE a public."Employees"; t public."Tasks"; current_task public."Tasks"; b jsonb; stack bigint[]; previous bigint; BEGIN
 a:=app_private.task_actor(); PERFORM app_private.task_lock(a.id);
 IF p_action='next' THEN RETURN app_private.task_next(p_op); END IF;
 SELECT * INTO t FROM public."Tasks" WHERE id=(p_args->>'task_id')::bigint AND assigned_to_employee_id=a.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 IF (p_args->>'version')::integer IS DISTINCT FROM t.version THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT'; END IF; b:=to_jsonb(t);
 IF p_action='critical_decline' THEN
  IF t.urgency<>'critical_now' OR t.status NOT IN ('unplanned','planned','paused') OR length(trim(coalesce(p_args->>'reason',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  INSERT INTO app_private.task_critical_ack VALUES(a.id,t.id,now()+interval '15 minutes',p_args->>'reason') ON CONFLICT(employee_id,task_id) DO UPDATE SET remind_after=excluded.remind_after,reason=excluded.reason;
  UPDATE public."Tasks" SET version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  PERFORM app_private.task_event(t.id,'TASK_CRITICAL_DECLINED',p_op,b,jsonb_build_object('reason',p_args->>'reason','remind_after',now()+interval '15 minutes')); RETURN to_jsonb(t);
 ELSIF p_action='critical_start' THEN
  IF t.urgency<>'critical_now' OR NOT app_private.task_ready(t) THEN RAISE EXCEPTION 'TASK_NOT_READY'; END IF;
  SELECT * INTO current_task FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND status='in_progress' FOR UPDATE;
  IF FOUND THEN
   PERFORM app_private.task_finish_interval(current_task.id,'critical_interrupt');
   UPDATE public."Tasks" SET status='paused',version=version+1,updated_at=clock_timestamp() WHERE id=current_task.id;
   PERFORM app_private.task_event(current_task.id,'TASK_PAUSED',p_op,to_jsonb(current_task),jsonb_build_object('caused_by_task_id',t.id));
   UPDATE public."Task_work_contexts" SET return_task_ids=array_append(return_task_ids,current_task.id) WHERE employee_id=a.id;
  END IF;
  DELETE FROM app_private.task_critical_ack WHERE employee_id=a.id AND task_id=t.id;
  RETURN app_private.task_start(t.id,p_op);
 ELSIF p_action IN ('complete','pause','end_of_day') THEN
  IF t.status<>'in_progress' THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT'; END IF;
  IF p_action='complete' AND EXISTS(SELECT FROM public."Task_checklist_items" WHERE task_id=t.id AND NOT completed) THEN RAISE EXCEPTION 'CHECKLIST_INCOMPLETE'; END IF;
  PERFORM app_private.task_finish_interval(t.id,p_action);
  UPDATE public."Tasks" SET status=CASE WHEN p_action='complete' THEN 'completed' ELSE 'paused' END,completed_at=CASE WHEN p_action='complete' THEN clock_timestamp() END,
   not_before_at=CASE WHEN p_action='end_of_day' THEN coalesce((SELECT greatest(now()+interval '1 minute',max(upper(r))-make_interval(mins=>coalesce(t.estimated_minutes,30))) FROM unnest(app_private.task_windows(a.id,app_private.task_today(),t.id))r),now()+interval '1 hour') ELSE not_before_at END,
   version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  PERFORM app_private.task_event(t.id,CASE p_action WHEN 'complete' THEN 'TASK_COMPLETED' WHEN 'pause' THEN 'TASK_PAUSED' ELSE 'TASK_POSTPONED' END,p_op,b,jsonb_build_object('reason',p_action));
  UPDATE public."Task_work_contexts" SET current_task_id=NULL WHERE employee_id=a.id RETURNING return_task_ids INTO stack;
  IF p_action='pause' THEN RETURN to_jsonb(t); END IF;
  WHILE coalesce(array_length(stack,1),0)>0 LOOP
   previous:=stack[array_length(stack,1)]; stack:=stack[1:array_length(stack,1)-1];
   UPDATE public."Task_work_contexts" SET return_task_ids=coalesce(stack,'{}') WHERE employee_id=a.id;
   SELECT * INTO current_task FROM public."Tasks" WHERE id=previous AND assigned_to_employee_id=a.id;
   IF FOUND AND app_private.task_ready(current_task) THEN RETURN app_private.task_start(previous,p_op); END IF;
  END LOOP;
  IF p_action='complete' AND p_args->'advance'='false'::jsonb THEN RETURN NULL;END IF;
  RETURN app_private.task_next(p_op);
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
END $function$
;
CREATE OR REPLACE FUNCTION app_private.task_validate_args(p_action text, p_args jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ DECLARE keys text[]; k text; BEGIN
 keys:=CASE p_action WHEN 'start_task' THEN ARRAY['task_id','version'] WHEN 'mark_completed' THEN ARRAY['task_id','version','confirmed']
 WHEN 'create' THEN ARRAY['title','description','category_id','priority','urgency','assigned_to_employee_id','estimated_minutes','deadline_at','deadline_is_hard','parent_task_id','planned_date','planned_start_at']
 WHEN 'request_creation' THEN ARRAY['title','description','category_id','priority','urgency','estimated_minutes','reason']
 WHEN 'update' THEN ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']
 WHEN 'assign' THEN ARRAY['task_id','version','assigned_to_employee_id'] WHEN 'cancel' THEN ARRAY['task_id','version'] WHEN 'comment' THEN ARRAY['task_id','version','text'] WHEN 'dependency' THEN ARRAY['task_id','version','depends_on_task_id']
 WHEN 'plan' THEN ARRAY['task_id','version','planned_date','planned_start_at','planned_order','reason'] WHEN 'resolve_reschedule' THEN ARRAY['request_id','decision','comment'] WHEN 'resolve_approval' THEN ARRAY['request_id','decision','comment']
 WHEN 'checklist_add' THEN ARRAY['task_id','version','text','sort_order'] WHEN 'checklist_toggle' THEN ARRAY['task_id','version','item_id','completed']
 WHEN 'next' THEN ARRAY[]::text[] WHEN 'complete' THEN ARRAY['task_id','version','advance'] WHEN 'pause' THEN ARRAY['task_id','version'] WHEN 'end_of_day' THEN ARRAY['task_id','version'] WHEN 'critical_start' THEN ARRAY['task_id','version'] WHEN 'critical_decline' THEN ARRAY['task_id','version','reason']
 WHEN 'schedule_save' THEN ARRAY['employee_id','id','version','type','starts_at','ends_at'] WHEN 'schedule_delete' THEN ARRAY['employee_id','id','version']
 WHEN 'department_save' THEN ARRAY['name'] WHEN 'employee_department' THEN ARRAY['employee_id','department_id'] WHEN 'scope_grant' THEN ARRAY['grantee_employee_id','permission','scope_type','target_employee_id','department_id','location_id'] WHEN 'scope_revoke' THEN ARRAY['id']
 WHEN 'reporting_save' THEN ARRAY['employee_id','manager_employee_id','effective_from','effective_to'] WHEN 'reporting_end' THEN ARRAY['id','effective_to'] WHEN 'capacity_save' THEN ARRAY['employee_id','effective_from','effective_to','daily_task_capacity_minutes'] WHEN 'category_save' THEN ARRAY['id','name','parent_id','sort_order','active'] WHEN 'settings_save' THEN ARRAY['company_timezone','default_daily_task_capacity_minutes','planning_horizon_days','load_balancer_enabled']
 WHEN 'balance' THEN ARRAY['employee_id','date'] WHEN 'recommendation_resolve' THEN ARRAY['id','decision'] WHEN 'recurring_save' THEN ARRAY['title','description','assigned_to_employee_id','category_id','estimated_minutes','starts_on','ends_on','every_days'] WHEN 'recurring_generate' THEN ARRAY['template_id'] END;
 FOREACH k IN ARRAY ARRAY['planned_start_at','deadline_at','starts_at','ends_at'] LOOP
 IF p_args->>k IS NOT NULL AND (p_args->>k) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'INVALID_ABSOLUTE_TIME'; END IF;
 END LOOP;
 IF keys IS NULL OR p_args-keys<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
END $function$
;
ALTER TABLE public."Work_shifts" DROP CONSTRAINT "Work_shifts_started_from_module_check",DROP CONSTRAINT "Work_shifts_ended_from_module_check",
 ADD CONSTRAINT "Work_shifts_started_from_module_check" CHECK(started_from_module IN ('orders','production','tasks')),
 ADD CONSTRAINT "Work_shifts_ended_from_module_check" CHECK(ended_from_module IN ('orders','production','tasks'));
INSERT INTO app_private.role_permissions(role,permission) SELECT role,'worktime.self' FROM app_private.role_permissions WHERE permission='tasks.access' ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.worktime_command(p_action text, p_args jsonb, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  IF src IS NULL OR src NOT IN ('orders','production','tasks') OR NOT app_private.has_permission(CASE src WHEN 'orders' THEN 'orders.access' WHEN 'tasks' THEN 'tasks.access' ELSE 'production.access' END)
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
   IF src IS NULL OR src NOT IN ('orders','production','tasks') OR NOT app_private.has_permission(CASE src WHEN 'orders' THEN 'orders.access' WHEN 'tasks' THEN 'tasks.access' ELSE 'production.access' END) THEN RAISE EXCEPTION 'WORKTIME_DENIED' USING ERRCODE='42501'; END IF;
   IF s.ended_at IS NULL THEN
    IF EXISTS(SELECT FROM public."Task_work_sessions" WHERE employee_id=s.employee_id AND ended_at IS NULL) THEN RAISE EXCEPTION 'UNFINISHED_WORK';END IF;
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
END $function$
;
CREATE FUNCTION public.tasks_execution_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; BEGIN a:=app_private.task_actor();
 RETURN public.tasks_work_state() || jsonb_build_object(
 'next',(SELECT to_jsonb(t) FROM app_private.task_queue_candidate(a.id)t),
 'session_started_at',(SELECT started_at FROM public."Task_work_sessions" WHERE employee_id=a.id AND ended_at IS NULL),
 'completed_today',(SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND status='completed' AND (completed_at AT TIME ZONE (SELECT company_timezone FROM public."Task_module_settings"))::date=app_private.task_today()),
 'locations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM public."Locations" WHERE active AND (a.role IN ('owner','administrator') OR id=a.location_id))
 );END $$;
REVOKE ALL ON FUNCTION public.tasks_execution_state() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tasks_execution_state() TO authenticated;
COMMIT;
