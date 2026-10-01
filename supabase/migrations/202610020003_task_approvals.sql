BEGIN;
CREATE TABLE public."Task_checklist_items"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,task_id bigint NOT NULL REFERENCES public."Tasks",text text NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 2000),sort_order integer NOT NULL DEFAULT 0,completed boolean NOT NULL DEFAULT false,completed_by_employee_id bigint REFERENCES public."Employees",completed_at timestamptz,CHECK(completed=(completed_at IS NOT NULL)),CHECK(completed=(completed_by_employee_id IS NOT NULL)));
CREATE INDEX checklist_task ON public."Task_checklist_items"(task_id,sort_order);
CREATE TABLE public."Task_approval_requests"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,task_id bigint NOT NULL REFERENCES public."Tasks",request_type text NOT NULL CHECK(request_type IN ('task_creation','reschedule')),requester_employee_id bigint NOT NULL REFERENCES public."Employees",approver_employee_id bigint NOT NULL REFERENCES public."Employees",old_value jsonb NOT NULL,requested_value jsonb NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),comment text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),resolved_at timestamptz);
CREATE UNIQUE INDEX one_pending_task_request ON public."Task_approval_requests"(task_id,request_type) WHERE status='pending';
CREATE INDEX task_approval_person ON public."Task_approval_requests"(approver_employee_id,status);
CREATE FUNCTION app_private.task_approver(p_employee bigint,p_creator bigint) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.id FROM public."Employees" e WHERE e.active AND e.archived_at IS NULL AND EXISTS(SELECT FROM app_private.role_permissions p WHERE p.role=e.role AND p.permission='tasks.approve') AND
 (e.id=p_creator OR EXISTS(SELECT FROM public."Employee_reporting_lines" r WHERE r.employee_id=p_employee AND r.manager_employee_id=e.id AND r.effective_from<=(now() AT TIME ZONE 'Europe/Warsaw')::date AND (r.effective_to IS NULL OR r.effective_to>(now() AT TIME ZONE 'Europe/Warsaw')::date))) ORDER BY (e.id=p_creator) DESC,e.id LIMIT 1
$$;
CREATE FUNCTION app_private.task_approval_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; t public."Tasks"; b jsonb; r public."Task_approval_requests"; approver bigint; result jsonb; BEGIN
 a:=app_private.task_actor();
 IF p_action='request_creation' THEN
  IF NOT app_private.has_permission('tasks.create.request') OR p_args-ARRAY['title','description','category_id','priority','urgency','estimated_minutes','reason']<>'{}' THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  approver:=app_private.task_approver(a.id,NULL); IF approver IS NULL THEN RAISE EXCEPTION 'NO_APPROVER'; END IF;
  -- Create one canonical pending task; the proposal is never a second task store.
  result:=app_private.task_core('create',p_args-'reason',p_op); SELECT * INTO t FROM public."Tasks" WHERE id=(result->>'id')::bigint;
  b:=to_jsonb(t); UPDATE public."Tasks" SET assigned_to_employee_id=approver,source_type='approval_request',status='pending_approval',version=version+1,can_auto_reschedule=false,requires_reschedule_approval=true WHERE id=t.id RETURNING * INTO t;
  INSERT INTO public."Task_approval_requests"(task_id,request_type,requester_employee_id,approver_employee_id,old_value,requested_value,reason) VALUES(t.id,'task_creation',a.id,approver,'{}',jsonb_build_object('assigned_to_employee_id',approver),coalesce(nullif(trim(p_args->>'reason'),''),'Запит керівнику'));
  PERFORM app_private.task_event(t.id,'TASK_APPROVAL_REQUESTED',p_op,b); RETURN to_jsonb(t);
 END IF;
 IF p_action='resolve_approval' THEN
  SELECT * INTO r FROM public."Task_approval_requests" WHERE id=(p_args->>'request_id')::bigint;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM public."Tasks" WHERE id=r.task_id;
 ELSE SELECT * INTO t FROM public."Tasks" WHERE id=(p_args->>'task_id')::bigint; END IF;
 IF t.id IS NULL OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.task_lock(t.assigned_to_employee_id); SELECT * INTO t FROM public."Tasks" WHERE id=t.id FOR UPDATE; b:=to_jsonb(t);
 IF t.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'TASK_FINAL'; END IF;
 IF p_action='resolve_approval' THEN
  SELECT * INTO r FROM public."Task_approval_requests" WHERE id=r.id FOR UPDATE;
  IF NOT app_private.has_permission('tasks.approve') OR NOT (app_private.has_permission('tasks.admin') OR (a.id=r.approver_employee_id AND (r.request_type='task_creation' OR app_private.task_scope('tasks.approve',t.assigned_to_employee_id)))) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  IF r.status<>'pending' OR p_args->>'decision' NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'APPROVAL_CONFLICT'; END IF;
  IF r.request_type='reschedule' THEN RAISE EXCEPTION 'PLANNING_NOT_INSTALLED'; END IF;
  UPDATE public."Task_approval_requests" SET status=p_args->>'decision',resolved_at=clock_timestamp(),comment=coalesce(p_args->>'comment','') WHERE id=r.id;
  UPDATE public."Tasks" SET status=CASE WHEN p_args->>'decision'='approved' THEN 'unplanned' ELSE 'cancelled' END WHERE id=t.id;
 ELSIF p_action='checklist_add' THEN
  IF t.created_by_employee_id<>a.id AND NOT app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  IF (p_args->>'version')::integer IS DISTINCT FROM t.version THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT'; END IF;
  INSERT INTO public."Task_checklist_items"(task_id,text,sort_order) VALUES(t.id,p_args->>'text',coalesce((p_args->>'sort_order')::integer,0));
 ELSIF p_action='checklist_toggle' THEN
  IF t.assigned_to_employee_id<>a.id AND NOT app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  IF (p_args->>'version')::integer IS DISTINCT FROM t.version OR jsonb_typeof(p_args->'completed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT'; END IF;
  UPDATE public."Task_checklist_items" SET completed=(p_args->>'completed')::boolean,completed_by_employee_id=CASE WHEN (p_args->>'completed')::boolean THEN a.id END,completed_at=CASE WHEN (p_args->>'completed')::boolean THEN clock_timestamp() END WHERE id=(p_args->>'item_id')::bigint AND task_id=t.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CHECKLIST'; END IF;
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 UPDATE public."Tasks" SET version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
 PERFORM app_private.task_event(t.id,CASE WHEN p_action='resolve_approval' THEN 'TASK_APPROVAL_'||upper(p_args->>'decision') ELSE 'TASK_UPDATED' END,p_op,b,jsonb_build_object('change',p_args)); RETURN to_jsonb(t);
END $$;
CREATE FUNCTION app_private.task_dispatch(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_action IN ('request_creation','resolve_approval','checklist_add','checklist_toggle') THEN RETURN app_private.task_approval_command(p_action,p_args,p_op); END IF;
 RETURN app_private.task_core(p_action,p_args,p_op);
END $$;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.tasks_command(text,jsonb,uuid)'::regprocedure),'app_private.task_core(p_action,p_args,p_operation)','app_private.task_dispatch(p_action,p_args,p_operation)'); END $$;
CREATE FUNCTION public.tasks_details(p_task bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE t public."Tasks"; BEGIN PERFORM app_private.task_actor(); SELECT * INTO t FROM public."Tasks" WHERE id=p_task; IF NOT FOUND OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('task',to_jsonb(t),'checklist',(SELECT coalesce(jsonb_agg(c ORDER BY sort_order,id),'[]') FROM public."Task_checklist_items" c WHERE task_id=t.id),'events',(SELECT coalesce(jsonb_agg(e ORDER BY id),'[]') FROM (SELECT * FROM public."Task_events" WHERE task_id=t.id ORDER BY id DESC LIMIT 100) e)); END $$;
CREATE FUNCTION public.tasks_approvals() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT r.*,t.title FROM public."Task_approval_requests" r JOIN public."Tasks" t ON t.id=r.task_id WHERE r.status='pending' AND (r.requester_employee_id=a.id OR r.approver_employee_id=a.id OR app_private.has_permission('tasks.admin')) ORDER BY r.id LIMIT 100) x); END $$;
DO $$ DECLARE t text; f record; BEGIN FOREACH t IN ARRAY ARRAY['Task_checklist_items','Task_approval_requests'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app_private' AND p.proname LIKE 'task_%') OR (n.nspname='public' AND p.proname LIKE 'tasks_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF; END LOOP; END $$;
COMMIT;
