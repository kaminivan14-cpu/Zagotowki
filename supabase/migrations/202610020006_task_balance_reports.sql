BEGIN;
CREATE TABLE public."Task_planning_recommendations"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public."Employees",task_id bigint NOT NULL REFERENCES public."Tasks",recommendation_type text NOT NULL CHECK(recommendation_type IN ('move','add_unplanned')),recommended_date date NOT NULL,reason text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')),metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE UNIQUE INDEX pending_task_recommendation ON public."Task_planning_recommendations"(task_id,recommendation_type) WHERE status='pending';
CREATE TABLE public."Recurring_task_templates"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,title text NOT NULL,description text NOT NULL DEFAULT '',assigned_to_employee_id bigint NOT NULL REFERENCES public."Employees",category_id bigint REFERENCES public."Task_categories",estimated_minutes integer NOT NULL CHECK(estimated_minutes>0),starts_on date NOT NULL,ends_on date,every_days integer NOT NULL CHECK(every_days BETWEEN 1 AND 366),active boolean NOT NULL DEFAULT true,created_by_employee_id bigint NOT NULL REFERENCES public."Employees");
CREATE FUNCTION app_private.task_load_balancer(p_employee bigint,p_date date,p_cause bigint,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; t public."Tasks"; target date; d date; capacity integer; needed integer; horizon integer; b jsonb; chosen boolean; moved integer:=0; BEGIN
 a:=app_private.task_actor(); IF a.id<>p_employee AND NOT app_private.task_scope('tasks.plan.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.task_lock(p_employee); SELECT planning_horizon_days INTO horizon FROM public."Task_module_settings";
 capacity:=app_private.task_capacity(p_employee,p_date); needed:=app_private.task_load(p_employee,p_date)-capacity;
 UPDATE public."Task_planning_recommendations" SET status='superseded' WHERE employee_id=p_employee AND status='pending';
 IF needed>0 THEN
  FOR t IN SELECT * FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date=p_date AND status='planned' AND urgency='normal' AND planned_start_at IS NULL AND estimated_minutes IS NOT NULL AND (p_cause IS NULL OR id<>p_cause)
  ORDER BY CASE priority WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,reschedule_count,estimated_minutes DESC,id FOR UPDATE LOOP
   chosen:=false;
   FOR d IN SELECT p_date+i FROM generate_series(1,horizon)i LOOP
    IF app_private.task_capacity(p_employee,d)-app_private.task_load(p_employee,d)<ceil(greatest(0,t.estimated_minutes-t.actual_minutes)) THEN CONTINUE; END IF;
    -- Keep cross-task dependency schedules conservative: never move either side automatically.
    IF EXISTS(SELECT FROM public."Task_dependencies" WHERE task_id=t.id OR depends_on_task_id=t.id) THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT FROM unnest(app_private.task_windows(p_employee,d,t.id)) w WHERE lower(w)+make_interval(mins=>t.estimated_minutes)<=upper(w) AND (NOT t.deadline_is_hard OR t.deadline_at IS NULL OR lower(w)+make_interval(mins=>t.estimated_minutes)<=t.deadline_at)) THEN CONTINUE; END IF;
    target:=d;chosen:=true;EXIT;
   END LOOP;
   IF NOT chosen THEN CONTINUE; END IF;
   IF t.can_auto_reschedule AND NOT t.requires_reschedule_approval AND t.reschedule_count<5 AND (SELECT load_balancer_enabled FROM public."Task_module_settings") THEN
    b:=to_jsonb(t); UPDATE public."Tasks" SET planned_date=target,reschedule_count=reschedule_count+1,version=version+1,updated_at=clock_timestamp() WHERE id=t.id;
    PERFORM app_private.task_event(t.id,'TASK_AUTO_RESCHEDULED',p_op,b,jsonb_build_object('old_date',p_date,'new_date',target,'reason','capacity_exceeded','caused_by_task_id',p_cause));
    moved:=moved+1; needed:=needed-ceil(greatest(0,t.estimated_minutes-t.actual_minutes))::integer;
   ELSE INSERT INTO public."Task_planning_recommendations"(employee_id,task_id,recommendation_type,recommended_date,reason,metadata) VALUES(p_employee,t.id,'move',target,'Для звільнення часу рекомендовано перенести завдання',jsonb_build_object('task_version',t.version,'old_date',p_date,'caused_by_task_id',p_cause)); END IF;
   EXIT WHEN needed<=0;
  END LOOP;
 ELSIF needed<0 THEN
  FOR t IN SELECT * FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND status='unplanned' AND planned_date IS NULL AND estimated_minutes IS NOT NULL AND estimated_minutes<=-needed ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,id LIMIT 20 LOOP
   IF EXISTS(SELECT FROM public."Task_dependencies" d JOIN public."Tasks" x ON x.id=d.depends_on_task_id WHERE d.task_id=t.id AND x.status<>'completed') THEN CONTINUE; END IF;
   IF NOT EXISTS(SELECT FROM unnest(app_private.task_windows(p_employee,p_date,t.id)) w WHERE lower(w)+make_interval(mins=>t.estimated_minutes)<=upper(w) AND (NOT t.deadline_is_hard OR t.deadline_at IS NULL OR lower(w)+make_interval(mins=>t.estimated_minutes)<=t.deadline_at)) THEN CONTINUE; END IF;
   INSERT INTO public."Task_planning_recommendations"(employee_id,task_id,recommendation_type,recommended_date,reason,metadata) VALUES(p_employee,t.id,'add_unplanned',p_date,'Є вільний час для незапланованого завдання',jsonb_build_object('available_minutes',-needed,'task_version',t.version));
  END LOOP;
 END IF; RETURN jsonb_build_object('moved',moved,'overload_minutes',greatest(0,needed));
END $$;
CREATE FUNCTION app_private.task_balance_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; r public."Task_planning_recommendations"; t public."Tasks"; result jsonb; tpl public."Recurring_task_templates"; d date; last_day date; BEGIN
 a:=app_private.task_actor();
 IF p_action='balance' THEN
  IF (p_args->>'date')::date IS NULL OR (p_args->>'date')::date<app_private.task_today() OR (p_args->>'date')::date>app_private.task_today()+(SELECT planning_horizon_days FROM public."Task_module_settings") THEN RAISE EXCEPTION 'INVALID_PLAN_DATE'; END IF;
  RETURN app_private.task_load_balancer(coalesce((p_args->>'employee_id')::bigint,a.id),(p_args->>'date')::date,NULL,p_op);
 ELSIF p_action='recommendation_resolve' THEN
  SELECT * INTO r FROM public."Task_planning_recommendations" WHERE id=(p_args->>'id')::bigint;
  IF NOT FOUND OR (r.employee_id<>a.id AND NOT app_private.task_scope('tasks.plan.scope',r.employee_id)) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM app_private.task_lock(r.employee_id); SELECT * INTO r FROM public."Task_planning_recommendations" WHERE id=r.id FOR UPDATE;
  SELECT * INTO t FROM public."Tasks" WHERE id=r.task_id;
  IF r.status<>'pending' OR (r.metadata->>'task_version')::integer<>t.version OR coalesce(p_args->>'decision','') NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'RECOMMENDATION_CONFLICT'; END IF;
  IF p_args->>'decision'='approved' THEN result:=app_private.task_planning_command('plan',jsonb_build_object('task_id',t.id,'version',t.version,'planned_date',r.recommended_date,'reason',r.reason),p_op); END IF;
  UPDATE public."Task_planning_recommendations" SET status=p_args->>'decision' WHERE id=r.id; RETURN coalesce(result,'{}');
 ELSIF p_action IN ('recurring_save','recurring_generate') THEN
  IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  IF p_action='recurring_save' THEN INSERT INTO public."Recurring_task_templates"(title,description,assigned_to_employee_id,category_id,estimated_minutes,starts_on,ends_on,every_days,created_by_employee_id) VALUES(p_args->>'title',coalesce(p_args->>'description',''),(p_args->>'assigned_to_employee_id')::bigint,(p_args->>'category_id')::bigint,(p_args->>'estimated_minutes')::integer,(p_args->>'starts_on')::date,(p_args->>'ends_on')::date,(p_args->>'every_days')::integer,a.id) RETURNING * INTO tpl; RETURN to_jsonb(tpl); END IF;
  SELECT * INTO tpl FROM public."Recurring_task_templates" WHERE id=(p_args->>'template_id')::bigint AND active FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TEMPLATE'; END IF;
  last_day:=least(coalesce(tpl.ends_on,'infinity'::date),app_private.task_today()+(SELECT planning_horizon_days FROM public."Task_module_settings"));
  FOR d IN SELECT tpl.starts_on+i*tpl.every_days FROM generate_series(greatest(0,ceil((app_private.task_today()-tpl.starts_on)::numeric/tpl.every_days)::integer),floor((last_day-tpl.starts_on)::numeric/tpl.every_days)::integer)i LOOP
   IF EXISTS(SELECT FROM public."Tasks" WHERE source_namespace='recurring:'||tpl.id AND source_external_id=d::text) THEN CONTINUE; END IF;
   result:=app_private.task_core('create',jsonb_build_object('title',tpl.title,'description',tpl.description,'assigned_to_employee_id',tpl.assigned_to_employee_id,'category_id',tpl.category_id,'estimated_minutes',tpl.estimated_minutes),p_op);
   SELECT * INTO t FROM public."Tasks" WHERE id=(result->>'id')::bigint;
   UPDATE public."Tasks" SET source_type='recurring',source_namespace='recurring:'||tpl.id,source_external_id=d::text,source_metadata=jsonb_build_object('occurrence_date',d),version=version+1 WHERE id=t.id;
   PERFORM app_private.task_event(t.id,'TASK_UPDATED',p_op,to_jsonb(t),jsonb_build_object('template_id',tpl.id,'occurrence_date',d));
  END LOOP; RETURN jsonb_build_object('template_id',tpl.id);
 END IF; RAISE EXCEPTION 'INVALID_ACTION'; END $$;
ALTER FUNCTION app_private.task_dispatch(text,jsonb,uuid) RENAME TO task_dispatch_base;
CREATE FUNCTION app_private.task_dispatch(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE result jsonb; t public."Tasks"; BEGIN
 IF p_action IN ('balance','recommendation_resolve','recurring_save','recurring_generate') THEN RETURN app_private.task_balance_command(p_action,p_args,p_op); END IF;
 result:=app_private.task_dispatch_base(p_action,p_args,p_op);
 IF p_action='plan' THEN SELECT * INTO t FROM public."Tasks" WHERE id=(result->>'id')::bigint; IF t.urgency='critical_today' AND t.planned_date IS NOT NULL THEN PERFORM app_private.task_load_balancer(t.assigned_to_employee_id,t.planned_date,t.id,p_op); END IF; END IF; RETURN result; END $$;
CREATE FUNCTION public.tasks_recommendations(p_employee bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); IF a.id<>p_employee AND NOT app_private.task_scope('tasks.read.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF; RETURN(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT r.*,t.title FROM public."Task_planning_recommendations" r JOIN public."Tasks" t ON t.id=r.task_id WHERE r.employee_id=p_employee AND r.status='pending' ORDER BY r.id LIMIT 100)x); END $$;
CREATE FUNCTION public.tasks_report(p_employee bigint,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; lo timestamptz; hi timestamptz; BEGIN
 a:=app_private.task_actor(); IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.report.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT p_from::timestamp AT TIME ZONE company_timezone,(p_to+1)::timestamp AT TIME ZONE company_timezone INTO lo,hi FROM public."Task_module_settings";
 RETURN jsonb_build_object('tasks',(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT t.*,coalesce((SELECT sum(extract(epoch FROM least(coalesce(s.ended_at,now()),hi)-greatest(s.started_at,lo))/60) FROM public."Task_work_sessions" s WHERE s.task_id=t.id AND s.employee_id=p_employee AND s.started_at<hi AND coalesce(s.ended_at,now())>lo),0) AS period_actual_minutes,
 EXISTS(SELECT FROM public."Task_events" e WHERE e.task_id=t.id AND e.event_type IN ('TASK_POSTPONED','TASK_AUTO_RESCHEDULED','TASK_RESCHEDULE_APPROVED') AND e.created_at>=lo AND e.created_at<hi) AS moved,
 (t.deadline_at<now() AND t.status NOT IN ('completed','cancelled')) AS overdue
 FROM public."Tasks" t WHERE t.assigned_to_employee_id=p_employee AND (t.planned_date BETWEEN p_from AND p_to OR t.completed_at>=lo AND t.completed_at<hi OR EXISTS(SELECT FROM public."Task_events" e WHERE e.task_id=t.id AND e.created_at>=lo AND e.created_at<hi)) ORDER BY t.id DESC LIMIT 200)x),
 'events',(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT e.* FROM public."Task_events" e JOIN public."Tasks" t ON t.id=e.task_id WHERE t.assigned_to_employee_id=p_employee AND e.created_at>=lo AND e.created_at<hi ORDER BY e.id DESC LIMIT 500)x)); END $$;
DO $$ DECLARE t text; f record; BEGIN FOREACH t IN ARRAY ARRAY['Task_planning_recommendations','Recurring_task_templates'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app_private' AND p.proname LIKE 'task_%') OR (n.nspname='public' AND p.proname LIKE 'tasks_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF; END LOOP; END $$;
COMMIT;
