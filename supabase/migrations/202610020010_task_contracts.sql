BEGIN;
-- The caller may submit absolute times only; company-local input is resolved explicitly by UI.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure);
 d:=replace(d,'keys text[];','keys text[]; k text;');
 d:=replace(d,$literal$IF keys IS NULL OR p_args-keys<>'{}'$literal$,$new$FOREACH k IN ARRAY ARRAY['planned_start_at','deadline_at','starts_at','ends_at'] LOOP
 IF p_args->>k IS NOT NULL AND (p_args->>k) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'INVALID_ABSOLUTE_TIME'; END IF;
 END LOOP;
 IF keys IS NULL OR p_args-keys<>'{}'$new$); EXECUTE d;
 d:=pg_get_functiondef('app_private.task_dispatch(text,jsonb,uuid)'::regprocedure);
 d:=replace(d,$literal$IF p_args->>'planned_date' IS NOT NULL THEN$literal$, $literal$IF p_args->>'planned_date' IS NOT NULL OR start_at IS NOT NULL THEN$literal$);
 d:=replace(d,$literal$OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) THEN$literal$, $literal$OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id) OR (t.created_by_employee_id=(app_private.task_actor()).id AND app_private.task_scope('tasks.assign',t.assigned_to_employee_id))) THEN$literal$); EXECUTE d;
 d:=pg_get_functiondef('app_private.task_load_balancer(bigint,date,bigint,uuid)'::regprocedure);
 d:=replace(d,$literal$IF a.id<>p_employee AND NOT app_private.task_scope('tasks.plan.scope',p_employee) THEN$literal$,$new$IF a.id<>p_employee AND NOT app_private.task_scope('tasks.plan.scope',p_employee) AND NOT EXISTS(SELECT FROM public."Tasks" cause WHERE cause.id=p_cause AND cause.created_by_employee_id=a.id AND cause.assigned_to_employee_id=p_employee AND cause.urgency='critical_today' AND app_private.task_scope('tasks.assign',p_employee)) THEN$new$); EXECUTE d;
END $$;
-- Explicit reporting-line maintenance and department/location scope management stay admin-only.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_settings_command(text,jsonb,uuid)'::regprocedure);
 d:=replace(d,$literal$ELSIF p_action='capacity_save' THEN$literal$,$new$ELSIF p_action='reporting_end' THEN
   UPDATE public."Employee_reporting_lines" SET effective_to=(p_args->>'effective_to')::date WHERE id=(p_args->>'id')::bigint RETURNING id INTO result;
  ELSIF p_action='capacity_save' THEN$new$); EXECUTE d;
 d:=pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure);
 d:=replace(d,$literal$WHEN 'capacity_save' THEN$literal$, $literal$WHEN 'reporting_end' THEN ARRAY['id','effective_to'] WHEN 'capacity_save' THEN$literal$); EXECUTE d;
 d:=pg_get_functiondef('app_private.task_dispatch_base(text,jsonb,uuid)'::regprocedure);
 d:=replace(d,$literal$'reporting_save','capacity_save'$literal$, $literal$'reporting_save','reporting_end','capacity_save'$literal$); EXECUTE d;
END $$;
COMMIT;
