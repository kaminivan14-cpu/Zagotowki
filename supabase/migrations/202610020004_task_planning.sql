BEGIN;
CREATE TABLE public."Task_module_settings"(id boolean PRIMARY KEY DEFAULT true CHECK(id),company_timezone text NOT NULL DEFAULT 'Europe/Warsaw',default_daily_task_capacity_minutes integer NOT NULL DEFAULT 360 CHECK(default_daily_task_capacity_minutes BETWEEN 1 AND 1440),planning_horizon_days integer NOT NULL DEFAULT 60 CHECK(planning_horizon_days BETWEEN 7 AND 366),load_balancer_enabled boolean NOT NULL DEFAULT false);
INSERT INTO public."Task_module_settings" DEFAULT VALUES;
CREATE TABLE public."Employee_capacity_settings"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public."Employees",effective_from date NOT NULL,effective_to date,daily_task_capacity_minutes integer NOT NULL CHECK(daily_task_capacity_minutes BETWEEN 1 AND 1440),CHECK(effective_to IS NULL OR effective_to>effective_from),UNIQUE(employee_id,effective_from));
CREATE TABLE public."Schedule_events"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public."Employees",type text NOT NULL CHECK(type IN ('work','day_off','vacation','meeting','absence')),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',created_by_employee_id bigint NOT NULL REFERENCES public."Employees",version integer NOT NULL DEFAULT 1,CHECK(ends_at>starts_at));
CREATE INDEX schedule_employee_time ON public."Schedule_events"(employee_id,starts_at,ends_at);
CREATE FUNCTION app_private.task_today() RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT (now() AT TIME ZONE company_timezone)::date FROM public."Task_module_settings" $$;
CREATE FUNCTION app_private.task_windows(p_employee bigint,p_date date,p_exclude bigint DEFAULT NULL) RETURNS tstzmultirange LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH day AS(SELECT tstzrange(p_date::timestamp AT TIME ZONE company_timezone,(p_date+1)::timestamp AT TIME ZONE company_timezone,'[)') r FROM public."Task_module_settings"),
 working AS(SELECT coalesce(range_agg(tstzrange(starts_at,ends_at,'[)')*d.r),'{}'::tstzmultirange) r FROM public."Schedule_events" s CROSS JOIN day d WHERE employee_id=p_employee AND type='work' AND tstzrange(starts_at,ends_at,'[)')&&d.r),
 busy AS(SELECT tstzrange(starts_at,ends_at,'[)') r FROM public."Schedule_events" WHERE employee_id=p_employee AND type<>'work'
 UNION ALL SELECT tstzrange(planned_start_at,planned_start_at+make_interval(mins=>estimated_minutes),'[)') FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_start_at IS NOT NULL AND estimated_minutes IS NOT NULL AND status NOT IN ('cancelled','completed','draft','pending_approval') AND p_exclude IS DISTINCT FROM 0 AND (p_exclude IS NULL OR id<>p_exclude)),
 blocked AS(SELECT coalesce(range_agg(b.r*d.r),'{}'::tstzmultirange) r FROM busy b CROSS JOIN day d WHERE b.r&&d.r) SELECT working.r-blocked.r FROM working,blocked
$$;
CREATE FUNCTION app_private.task_capacity(p_employee bigint,p_date date) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT least(coalesce((SELECT daily_task_capacity_minutes FROM public."Employee_capacity_settings" WHERE employee_id=p_employee AND effective_from<=p_date AND (effective_to IS NULL OR effective_to>p_date) ORDER BY effective_from DESC LIMIT 1),(SELECT default_daily_task_capacity_minutes FROM public."Task_module_settings")),
 coalesce((SELECT floor(sum(extract(epoch FROM upper(r)-lower(r))/60))::integer FROM unnest(app_private.task_windows(p_employee,p_date,0)) r),0))
$$;
CREATE FUNCTION app_private.task_load(p_employee bigint,p_date date) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT coalesce(sum(greatest(0,estimated_minutes-actual_minutes)),0)::integer FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date=p_date AND status NOT IN ('completed','cancelled','draft','pending_approval') $$;
CREATE FUNCTION app_private.task_plan_validate(p_task public."Tasks",p_date date,p_start timestamptz DEFAULT NULL) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE windows tstzmultirange; zone text; BEGIN
 SELECT company_timezone INTO zone FROM public."Task_module_settings";
 IF p_date IS NULL OR p_date<app_private.task_today() OR p_date>app_private.task_today()+(SELECT planning_horizon_days FROM public."Task_module_settings") THEN RAISE EXCEPTION 'INVALID_PLAN_DATE'; END IF;
 windows:=app_private.task_windows(p_task.assigned_to_employee_id,p_date,p_task.id);
 IF isempty(windows) THEN RAISE EXCEPTION 'NO_AVAILABILITY'; END IF;
 IF p_start IS NOT NULL AND ((p_start AT TIME ZONE zone)::date<>p_date OR p_task.estimated_minutes IS NULL OR NOT windows @> tstzrange(p_start,p_start+make_interval(mins=>p_task.estimated_minutes),'[)')) THEN RAISE EXCEPTION 'SCHEDULE_CONFLICT'; END IF;
 IF p_task.deadline_is_hard AND p_task.deadline_at IS NOT NULL AND NOT EXISTS(SELECT FROM unnest(windows) r WHERE greatest(lower(r),coalesce(p_start,lower(r)))+make_interval(mins=>coalesce(p_task.estimated_minutes,1))<=least(upper(r),p_task.deadline_at)) THEN RAISE EXCEPTION 'DEADLINE_CONFLICT'; END IF;
 IF EXISTS(SELECT FROM public."Task_dependencies" d JOIN public."Tasks" t ON t.id=d.depends_on_task_id WHERE d.task_id=p_task.id AND t.status<>'completed' AND (t.planned_date IS NULL OR t.planned_date>p_date)) OR EXISTS(SELECT FROM public."Task_dependencies" d JOIN public."Tasks" t ON t.id=d.task_id WHERE d.depends_on_task_id=p_task.id AND t.status NOT IN ('completed','cancelled') AND t.planned_date<p_date) THEN RAISE EXCEPTION 'DEPENDENCY_PLAN_CONFLICT'; END IF;
END $$;
CREATE FUNCTION app_private.task_planning_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; t public."Tasks"; b jsonb; r public."Task_approval_requests"; target_date date; target_start timestamptz; approver bigint; kind text; BEGIN
 a:=app_private.task_actor();
 IF p_action='resolve_reschedule' THEN SELECT * INTO r FROM public."Task_approval_requests" WHERE id=(p_args->>'request_id')::bigint AND request_type='reschedule'; SELECT * INTO t FROM public."Tasks" WHERE id=r.task_id;
 ELSE SELECT * INTO t FROM public."Tasks" WHERE id=(p_args->>'task_id')::bigint; END IF;
 IF t.id IS NULL OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.task_lock(t.assigned_to_employee_id); SELECT * INTO t FROM public."Tasks" WHERE id=t.id FOR UPDATE; b:=to_jsonb(t);
 IF t.status NOT IN ('unplanned','planned','paused','blocked') THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT'; END IF;
 IF p_action='resolve_reschedule' THEN
  SELECT * INTO r FROM public."Task_approval_requests" WHERE id=r.id FOR UPDATE;
  IF NOT app_private.has_permission('tasks.approve') OR NOT(app_private.has_permission('tasks.admin') OR (a.id=r.approver_employee_id AND app_private.task_scope('tasks.approve',t.assigned_to_employee_id))) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  IF r.status<>'pending' OR p_args->>'decision' NOT IN ('approved','rejected') OR p_args->>'decision' IS NULL OR (r.old_value->>'planned_date')::date IS DISTINCT FROM t.planned_date THEN RAISE EXCEPTION 'APPROVAL_CONFLICT'; END IF;
  target_date:=(r.requested_value->>'planned_date')::date; target_start:=(r.requested_value->>'planned_start_at')::timestamptz;
  IF p_args->>'decision'='approved' THEN PERFORM app_private.task_plan_validate(t,target_date,target_start); UPDATE public."Tasks" SET planned_date=target_date,planned_start_at=target_start,status='planned',reschedule_count=reschedule_count+1 WHERE id=t.id; END IF;
  UPDATE public."Task_approval_requests" SET status=p_args->>'decision',comment=coalesce(p_args->>'comment',''),resolved_at=clock_timestamp() WHERE id=r.id;
  kind:='TASK_RESCHEDULE_'||upper(p_args->>'decision');
 ELSE
  IF NOT ((a.id=t.assigned_to_employee_id AND app_private.has_permission('tasks.plan.self')) OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  IF (p_args->>'version')::integer IS DISTINCT FROM t.version THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT'; END IF;
  target_date:=(p_args->>'planned_date')::date; target_start:=(p_args->>'planned_start_at')::timestamptz;
  PERFORM app_private.task_plan_validate(t,target_date,target_start);
  IF t.requires_reschedule_approval AND t.created_by_employee_id<>a.id AND NOT app_private.task_scope('tasks.approve',t.assigned_to_employee_id) THEN
   approver:=app_private.task_approver(t.assigned_to_employee_id,t.created_by_employee_id); IF approver IS NULL THEN RAISE EXCEPTION 'NO_APPROVER'; END IF;
   INSERT INTO public."Task_approval_requests"(task_id,request_type,requester_employee_id,approver_employee_id,old_value,requested_value,reason) VALUES(t.id,'reschedule',a.id,approver,jsonb_build_object('planned_date',t.planned_date),jsonb_build_object('planned_date',target_date,'planned_start_at',target_start),p_args->>'reason'); kind:='TASK_RESCHEDULE_REQUESTED';
  ELSE UPDATE public."Tasks" SET planned_date=target_date,planned_start_at=target_start,planned_order=(p_args->>'planned_order')::integer,status='planned',reschedule_count=reschedule_count+CASE WHEN planned_date IS DISTINCT FROM target_date AND planned_date IS NOT NULL THEN 1 ELSE 0 END WHERE id=t.id; kind:=CASE WHEN t.planned_date IS NULL THEN 'TASK_PLANNED' ELSE 'TASK_POSTPONED' END;
  END IF;
 END IF;
 UPDATE public."Tasks" SET version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
 PERFORM app_private.task_event(t.id,kind,p_op,b,jsonb_build_object('old_date',b->'planned_date','new_date',target_date,'reason',p_args->>'reason')); RETURN to_jsonb(t);
END $$;
CREATE FUNCTION app_private.task_settings_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; emp bigint; result bigint; s public."Schedule_events"; BEGIN
 a:=app_private.task_actor(); emp:=coalesce((p_args->>'employee_id')::bigint,a.id);
 IF p_action IN ('schedule_save','schedule_delete') THEN
  IF NOT app_private.task_scope('tasks.schedule.manage',emp) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM app_private.task_lock(emp);
  IF p_args->>'id' IS NOT NULL THEN SELECT * INTO s FROM public."Schedule_events" WHERE id=(p_args->>'id')::bigint AND employee_id=emp FOR UPDATE; IF NOT FOUND OR (p_args->>'version')::integer IS DISTINCT FROM s.version THEN RAISE EXCEPTION 'SCHEDULE_VERSION_CONFLICT'; END IF; END IF;
  IF p_action='schedule_delete' THEN DELETE FROM public."Schedule_events" WHERE id=s.id; RETURN jsonb_build_object('id',s.id); END IF;
  IF s.id IS NULL THEN INSERT INTO public."Schedule_events"(employee_id,type,starts_at,ends_at,created_by_employee_id) VALUES(emp,p_args->>'type',(p_args->>'starts_at')::timestamptz,(p_args->>'ends_at')::timestamptz,a.id) RETURNING id INTO result;
  ELSE UPDATE public."Schedule_events" SET type=p_args->>'type',starts_at=(p_args->>'starts_at')::timestamptz,ends_at=(p_args->>'ends_at')::timestamptz,version=version+1 WHERE id=s.id RETURNING id INTO result; END IF;
 ELSE
  IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(20261002,1);
  IF p_action='department_save' THEN INSERT INTO public."Departments"(name) VALUES(p_args->>'name') RETURNING id INTO result;
  ELSIF p_action='employee_department' THEN UPDATE public."Employees" SET department_id=(p_args->>'department_id')::bigint WHERE id=emp RETURNING id INTO result;
  ELSIF p_action='scope_grant' THEN INSERT INTO public."Task_scope_grants"(grantee_employee_id,permission,scope_type,employee_id,department_id,location_id) VALUES((p_args->>'grantee_employee_id')::bigint,p_args->>'permission',p_args->>'scope_type',(p_args->>'target_employee_id')::bigint,(p_args->>'department_id')::bigint,(p_args->>'location_id')::bigint) RETURNING id INTO result;
  ELSIF p_action='scope_revoke' THEN DELETE FROM public."Task_scope_grants" WHERE id=(p_args->>'id')::bigint RETURNING id INTO result;
  ELSIF p_action='reporting_save' THEN INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from,effective_to) VALUES(emp,(p_args->>'manager_employee_id')::bigint,(p_args->>'effective_from')::date,(p_args->>'effective_to')::date) RETURNING id INTO result;
  ELSIF p_action='capacity_save' THEN
   PERFORM app_private.task_lock(emp);
   INSERT INTO public."Employee_capacity_settings"(employee_id,effective_from,effective_to,daily_task_capacity_minutes) VALUES(emp,(p_args->>'effective_from')::date,(p_args->>'effective_to')::date,(p_args->>'daily_task_capacity_minutes')::integer) ON CONFLICT(employee_id,effective_from) DO UPDATE SET effective_to=excluded.effective_to,daily_task_capacity_minutes=excluded.daily_task_capacity_minutes RETURNING id INTO result;
  ELSIF p_action='category_save' THEN
   IF p_args->>'id' IS NULL THEN INSERT INTO public."Task_categories"(name,parent_id,sort_order) VALUES(p_args->>'name',(p_args->>'parent_id')::bigint,coalesce((p_args->>'sort_order')::integer,0)) RETURNING id INTO result;
   ELSE UPDATE public."Task_categories" SET name=p_args->>'name',parent_id=(p_args->>'parent_id')::bigint,active=coalesce((p_args->>'active')::boolean,true) WHERE id=(p_args->>'id')::bigint RETURNING id INTO result; END IF;
  ELSIF p_action='settings_save' THEN
   IF NOT EXISTS(SELECT FROM pg_timezone_names WHERE name=p_args->>'company_timezone') THEN RAISE EXCEPTION 'INVALID_TIMEZONE'; END IF;
   UPDATE public."Task_module_settings" SET company_timezone=p_args->>'company_timezone',default_daily_task_capacity_minutes=(p_args->>'default_daily_task_capacity_minutes')::integer,planning_horizon_days=(p_args->>'planning_horizon_days')::integer,load_balancer_enabled=(p_args->>'load_balancer_enabled')::boolean;
   result:=1;
  ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 END IF;
 RETURN jsonb_build_object('id',result);
END $$;
CREATE OR REPLACE FUNCTION app_private.task_dispatch(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_action IN ('plan','resolve_reschedule') THEN RETURN app_private.task_planning_command(p_action,p_args,p_op);
 ELSIF p_action IN ('schedule_save','schedule_delete','department_save','employee_department','scope_grant','scope_revoke','reporting_save','capacity_save','category_save','settings_save') THEN RETURN app_private.task_settings_command(p_action,p_args,p_op);
 ELSIF p_action IN ('request_creation','resolve_approval','checklist_add','checklist_toggle') THEN RETURN app_private.task_approval_command(p_action,p_args,p_op); END IF;
 RETURN app_private.task_core(p_action,p_args,p_op); END $$;
CREATE FUNCTION public.tasks_planning(p_employee bigint,p_from date,p_to date,p_cursor bigint DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN
 a:=app_private.task_actor(); IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.read.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('days',(SELECT jsonb_agg(jsonb_build_object('date',d,'capacity_minutes',app_private.task_capacity(p_employee,d),'planned_minutes',app_private.task_load(p_employee,d),'unknown_count',(SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date=d AND estimated_minutes IS NULL AND status NOT IN ('completed','cancelled')))) FROM (SELECT p_from+i AS d FROM generate_series(0,p_to-p_from)i) dates),
 'tasks',(SELECT coalesce(jsonb_agg(t ORDER BY planned_date,planned_order,id),'[]') FROM (SELECT * FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date BETWEEN p_from AND p_to AND id>p_cursor ORDER BY id LIMIT 200) t),
 'unplanned',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM (SELECT * FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date IS NULL AND status='unplanned' AND id>p_cursor ORDER BY id LIMIT 100) t)); END $$;
CREATE FUNCTION public.tasks_schedule(p_employee bigint,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; zone text; BEGIN a:=app_private.task_actor(); IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.read.scope',p_employee) AND NOT app_private.task_scope('tasks.schedule.manage',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT company_timezone INTO zone FROM public."Task_module_settings";
 RETURN (SELECT coalesce(jsonb_agg(s ORDER BY starts_at),'[]') FROM public."Schedule_events" s WHERE employee_id=p_employee AND ends_at>p_from::timestamp AT TIME ZONE zone AND starts_at<(p_to+1)::timestamp AT TIME ZONE zone); END $$;
CREATE OR REPLACE FUNCTION public.tasks_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN jsonb_build_object('employee_id',a.id,'today',app_private.task_today(),'capabilities',(SELECT jsonb_agg(p) FROM public.auth_capabilities() p),'settings',(SELECT to_jsonb(s) FROM public."Task_module_settings" s),'categories',(SELECT coalesce(jsonb_agg(c ORDER BY c.sort_order,c.id),'[]') FROM public."Task_categories" c WHERE active),'departments',(SELECT coalesce(jsonb_agg(d ORDER BY name),'[]') FROM public."Departments" d WHERE active),'manager_id',app_private.task_approver(a.id,NULL)); END $$;
-- Task hierarchy follows the company business date, independently of browser timezone.
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('app_private.task_scope(text,bigint)'::regprocedure),'(now() AT TIME ZONE ''Europe/Warsaw'')::date','app_private.task_today()'); EXECUTE replace(pg_get_functiondef('app_private.task_approver(bigint,bigint)'::regprocedure),'(now() AT TIME ZONE ''Europe/Warsaw'')::date','app_private.task_today()'); END $$;
DO $$ DECLARE t text; f record; BEGIN FOREACH t IN ARRAY ARRAY['Task_module_settings','Employee_capacity_settings','Schedule_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app_private' AND p.proname LIKE 'task_%') OR (n.nspname='public' AND p.proname LIKE 'tasks_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF; END LOOP; END $$;
COMMIT;
