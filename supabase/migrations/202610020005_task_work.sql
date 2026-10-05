BEGIN;
CREATE TABLE public."Task_work_sessions"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,task_id bigint NOT NULL REFERENCES public."Tasks",employee_id bigint NOT NULL REFERENCES public."Employees",started_at timestamptz NOT NULL DEFAULT clock_timestamp(),ended_at timestamptz,reason text,CHECK(ended_at IS NULL OR ended_at>=started_at));
CREATE UNIQUE INDEX one_task_session ON public."Task_work_sessions"(employee_id) WHERE ended_at IS NULL;
CREATE INDEX task_sessions_history ON public."Task_work_sessions"(task_id,started_at);
CREATE TABLE public."Task_work_contexts"(employee_id bigint PRIMARY KEY REFERENCES public."Employees",current_task_id bigint REFERENCES public."Tasks",return_task_ids bigint[] NOT NULL DEFAULT '{}',started boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE app_private.task_critical_ack(employee_id bigint NOT NULL REFERENCES public."Employees",task_id bigint NOT NULL REFERENCES public."Tasks",remind_after timestamptz NOT NULL,reason text NOT NULL,PRIMARY KEY(employee_id,task_id));
CREATE FUNCTION app_private.task_ready(p_task public."Tasks",p_now timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_task.status IN ('unplanned','planned','paused') AND (p_task.not_before_at IS NULL OR p_task.not_before_at<=p_now) AND (p_task.planned_date<=app_private.task_today() OR (p_task.planned_date IS NULL AND p_task.urgency IN ('critical_now','critical_today'))) AND (p_task.planned_start_at IS NULL OR p_task.planned_start_at<=p_now)
 AND NOT EXISTS(SELECT FROM public."Task_dependencies" d JOIN public."Tasks" t ON t.id=d.depends_on_task_id WHERE d.task_id=p_task.id AND t.status<>'completed')
 AND EXISTS(SELECT FROM unnest(app_private.task_windows(p_task.assigned_to_employee_id,app_private.task_today(),p_task.id)) r WHERE r @> p_now AND p_task.estimated_minutes IS NOT NULL AND upper(r)>=p_now+make_interval(mins=>greatest(1,ceil(p_task.estimated_minutes-p_task.actual_minutes)::integer)))
$$;
CREATE FUNCTION app_private.task_finish_interval(p_task bigint,p_reason text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 UPDATE public."Task_work_sessions" SET ended_at=clock_timestamp(),reason=p_reason WHERE task_id=p_task AND ended_at IS NULL;
 UPDATE public."Tasks" SET actual_minutes=(SELECT coalesce(sum(extract(epoch FROM ended_at-started_at)/60),0) FROM public."Task_work_sessions" WHERE task_id=p_task AND ended_at IS NOT NULL) WHERE id=p_task;
END $$;
CREATE FUNCTION app_private.task_start(p_task bigint,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE t public."Tasks"; b jsonb; BEGIN
 SELECT * INTO t FROM public."Tasks" WHERE id=p_task FOR UPDATE; b:=to_jsonb(t);
 UPDATE public."Tasks" SET status='in_progress',version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public."Task_work_sessions"(task_id,employee_id) VALUES(t.id,t.assigned_to_employee_id);
 INSERT INTO public."Task_work_contexts"(employee_id,current_task_id,started) VALUES(t.assigned_to_employee_id,t.id,true) ON CONFLICT(employee_id) DO UPDATE SET current_task_id=excluded.current_task_id,started=true,updated_at=clock_timestamp();
 PERFORM app_private.task_event(t.id,CASE WHEN b->>'status'='paused' THEN 'TASK_RESUMED' ELSE 'TASK_STARTED' END,p_op,b); RETURN to_jsonb(t);
END $$;
CREATE FUNCTION app_private.task_next(p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; t public."Tasks"; BEGIN
 a:=app_private.task_actor(); PERFORM app_private.task_lock(a.id);
 SELECT * INTO t FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND status='in_progress'; IF FOUND THEN RETURN to_jsonb(t); END IF;
 INSERT INTO public."Task_work_contexts"(employee_id,started) VALUES(a.id,true) ON CONFLICT(employee_id) DO UPDATE SET started=true;
 SELECT * INTO t FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND status IN ('planned','unplanned','paused') AND app_private.task_ready("Tasks")
 AND NOT EXISTS(SELECT FROM app_private.task_critical_ack ack WHERE ack.employee_id=a.id AND ack.task_id="Tasks".id AND ack.remind_after>now())
 ORDER BY CASE urgency WHEN 'critical_now' THEN 0 WHEN 'critical_today' THEN 1 ELSE 2 END,planned_start_at NULLS LAST,CASE WHEN deadline_is_hard THEN deadline_at END NULLS LAST,CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,planned_order NULLS LAST,planned_date NULLS LAST,estimated_minutes,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF; RETURN app_private.task_start(t.id,p_op);
END $$;
CREATE FUNCTION app_private.task_work_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; t public."Tasks"; current_task public."Tasks"; b jsonb; stack bigint[]; previous bigint; BEGIN
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
  RETURN app_private.task_next(p_op);
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
END $$;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.tasks_command(text,jsonb,uuid)'::regprocedure),'INSERT INTO app_private.task_operations VALUES', $body$result:=coalesce(result,'null'::jsonb); INSERT INTO app_private.task_operations VALUES$body$); END $$;
CREATE FUNCTION public.tasks_next(p_operation uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.tasks_command('next','{}',p_operation) $$;
CREATE FUNCTION public.tasks_work_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN jsonb_build_object(
 'current',(SELECT to_jsonb(t) FROM public."Tasks" t WHERE assigned_to_employee_id=a.id AND status='in_progress'),
 'started',coalesce((SELECT started FROM public."Task_work_contexts" WHERE employee_id=a.id),false),
 'critical',(SELECT coalesce(jsonb_agg(x ORDER BY id),'[]') FROM (SELECT t.*,coalesce(ack.remind_after>now(),false) AS acknowledged,app_private.task_ready(t) AS ready FROM public."Tasks" t LEFT JOIN app_private.task_critical_ack ack ON ack.task_id=t.id AND ack.employee_id=a.id WHERE t.assigned_to_employee_id=a.id AND urgency='critical_now' AND status IN ('unplanned','planned','paused') ORDER BY t.id LIMIT 30)x),
 'today',app_private.task_today(),'capacity_minutes',app_private.task_capacity(a.id,app_private.task_today()),'planned_minutes',app_private.task_load(a.id,app_private.task_today()),'task_count',(SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND planned_date<=app_private.task_today() AND status NOT IN ('completed','cancelled'))); END $$;
CREATE OR REPLACE FUNCTION app_private.task_dispatch(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_action IN ('next','complete','pause','end_of_day','critical_start','critical_decline') THEN RETURN app_private.task_work_command(p_action,p_args,p_op);
 ELSIF p_action IN ('plan','resolve_reschedule') THEN RETURN app_private.task_planning_command(p_action,p_args,p_op);
 ELSIF p_action IN ('schedule_save','schedule_delete','department_save','employee_department','scope_grant','scope_revoke','reporting_save','capacity_save','category_save','settings_save') THEN RETURN app_private.task_settings_command(p_action,p_args,p_op);
 ELSIF p_action IN ('request_creation','resolve_approval','checklist_add','checklist_toggle') THEN RETURN app_private.task_approval_command(p_action,p_args,p_op); END IF;
 RETURN app_private.task_core(p_action,p_args,p_op); END $$;
DO $$ DECLARE t text; f record; BEGIN FOREACH t IN ARRAY ARRAY['Task_work_sessions','Task_work_contexts'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP;
 REVOKE ALL ON app_private.task_critical_ack FROM PUBLIC,anon,authenticated;
 FOR f IN SELECT p.oid::regprocedure sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app_private' AND p.proname LIKE 'task_%') OR (n.nspname='public' AND p.proname LIKE 'tasks_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF; END LOOP; END $$;
COMMIT;
