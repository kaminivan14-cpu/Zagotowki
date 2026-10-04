BEGIN;
-- Complete owner compatibility for the two Orders history RPCs with direct role checks.
DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY['public.orders_shift_summary(bigint)','public.orders_shift_history(bigint)'] LOOP
 EXECUTE replace(pg_get_functiondef(f::regprocedure),$old$a.role<>'administrator'$old$,$new$a.role NOT IN ('owner','administrator')$new$); END LOOP; END $$;
-- Reject a missing decision rather than accidentally taking the negative branch.
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('app_private.task_approval_command(text,jsonb,uuid)'::regprocedure),$old$p_args->>'decision' NOT IN ('approved','rejected')$old$,$new$coalesce(p_args->>'decision','') NOT IN ('approved','rejected')$new$); END $$;
-- A leadership capability applies to the real reporting subtree, not the location.
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('app_private.task_scope(text,bigint)'::regprocedure),$old$RETURN EXISTS(SELECT FROM public."Task_scope_grants"$old$,$new$IF a.role IN ('director','manager') AND p_employee<>a.id AND app_private.task_descendant(a.id,p_employee,app_private.task_today()) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT FROM public."Task_scope_grants"$new$); END $$;
-- Scheduler and graph mutations acquire the graph lock before any employee lock.
-- This also serializes cross-employee dependency edits with destination validation.
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.tasks_command(text,jsonb,uuid)'::regprocedure),$old$result:=app_private.task_dispatch(p_action,p_args,p_operation);$old$,$new$IF p_action IN ('next','complete','pause','end_of_day','critical_start','critical_decline','comment','checklist_toggle') THEN PERFORM pg_advisory_xact_lock_shared(20261002,2); ELSE PERFORM pg_advisory_xact_lock(20261002,2); END IF;
 PERFORM 1 FROM public."Employees" WHERE id=a.id AND active AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.task_actor();
 result:=app_private.task_dispatch(p_action,p_args,p_operation);$new$); END $$;
-- Explicit packing of flexible work into continuous windows on a proposed destination.
CREATE FUNCTION app_private.task_day_fits(p_task public."Tasks",p_date date) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE windows tstzmultirange; item record; w tstzrange; start_at timestamptz; finish_at timestamptz; fits boolean; BEGIN
 windows:=app_private.task_windows(p_task.assigned_to_employee_id,p_date,p_task.id);
 FOR item IN SELECT id,estimated_minutes,actual_minutes,deadline_at,deadline_is_hard FROM public."Tasks" WHERE assigned_to_employee_id=p_task.assigned_to_employee_id AND planned_date=p_date AND planned_start_at IS NULL AND id<>p_task.id AND status NOT IN ('completed','cancelled','draft','pending_approval')
 UNION ALL SELECT p_task.id,p_task.estimated_minutes,p_task.actual_minutes,p_task.deadline_at,p_task.deadline_is_hard ORDER BY estimated_minutes DESC NULLS FIRST,id LOOP
  IF item.estimated_minutes IS NULL THEN RETURN false; END IF; fits:=false;
  FOR w IN SELECT r FROM unnest(windows) r LOOP
   start_at:=greatest(lower(w),CASE WHEN p_date=app_private.task_today() THEN now() ELSE lower(w) END);
   finish_at:=start_at+make_interval(mins=>greatest(1,ceil(item.estimated_minutes-item.actual_minutes)::integer));
   IF finish_at<=upper(w) AND (NOT item.deadline_is_hard OR item.deadline_at IS NULL OR finish_at<=item.deadline_at) THEN
    windows:=windows-tstzmultirange(tstzrange(start_at,finish_at,'[)')); fits:=true; EXIT;
   END IF;
  END LOOP;
  IF NOT fits THEN RETURN false; END IF;
 END LOOP; RETURN true;
END $$;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('app_private.task_load_balancer(bigint,date,bigint,uuid)'::regprocedure),$old$target:=d;chosen:=true;EXIT;$old$,$new$IF NOT app_private.task_day_fits(t,d) THEN CONTINUE; END IF;
    target:=d;chosen:=true;EXIT;$new$);
END $$;
-- Creating a task with a date is one retry-safe transaction; critical-today reserves today.
CREATE OR REPLACE FUNCTION app_private.task_dispatch(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE result jsonb; t public."Tasks"; b jsonb; d date; start_at timestamptz; BEGIN
 IF p_action IN ('balance','recommendation_resolve','recurring_save','recurring_generate') THEN RETURN app_private.task_balance_command(p_action,p_args,p_op); END IF;
 IF p_action='create' THEN
  result:=app_private.task_core(p_action,p_args-ARRAY['planned_date','planned_start_at'],p_op);
  SELECT * INTO t FROM public."Tasks" WHERE id=(result->>'id')::bigint;
  d:=coalesce((p_args->>'planned_date')::date,CASE WHEN t.urgency IN ('critical_today','critical_now') THEN app_private.task_today() END);
  IF d IS NOT NULL THEN
   start_at:=(p_args->>'planned_start_at')::timestamptz;
   IF p_args->>'planned_date' IS NOT NULL THEN PERFORM app_private.task_plan_validate(t,d,start_at); END IF;
   b:=to_jsonb(t); UPDATE public."Tasks" SET planned_date=d,planned_start_at=start_at,status='planned',version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
   PERFORM app_private.task_event(t.id,'TASK_PLANNED',p_op,b);
  END IF;
  result:=to_jsonb(t);
 ELSE result:=app_private.task_dispatch_base(p_action,p_args,p_op); END IF;
 IF p_action IN ('create','plan','update') THEN
  SELECT * INTO t FROM public."Tasks" WHERE id=(result->>'id')::bigint;
  IF t.urgency='critical_today' AND t.planned_date IS NOT NULL AND t.status='planned' AND (t.assigned_to_employee_id=(app_private.task_actor()).id OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) THEN PERFORM app_private.task_load_balancer(t.assigned_to_employee_id,t.planned_date,t.id,p_op); END IF;
 END IF; RETURN result;
END $$;
-- All public API arguments have a closed contract, including actions implemented by helpers.
CREATE FUNCTION app_private.task_validate_args(p_action text,p_args jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE keys text[]; BEGIN
 keys:=CASE p_action
 WHEN 'create' THEN ARRAY['title','description','category_id','priority','urgency','assigned_to_employee_id','estimated_minutes','deadline_at','deadline_is_hard','parent_task_id','planned_date','planned_start_at']
 WHEN 'request_creation' THEN ARRAY['title','description','category_id','priority','urgency','estimated_minutes','reason']
 WHEN 'update' THEN ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']
 WHEN 'assign' THEN ARRAY['task_id','version','assigned_to_employee_id'] WHEN 'cancel' THEN ARRAY['task_id','version'] WHEN 'comment' THEN ARRAY['task_id','version','text'] WHEN 'dependency' THEN ARRAY['task_id','version','depends_on_task_id']
 WHEN 'plan' THEN ARRAY['task_id','version','planned_date','planned_start_at','planned_order','reason'] WHEN 'resolve_reschedule' THEN ARRAY['request_id','decision','comment'] WHEN 'resolve_approval' THEN ARRAY['request_id','decision','comment']
 WHEN 'checklist_add' THEN ARRAY['task_id','version','text','sort_order'] WHEN 'checklist_toggle' THEN ARRAY['task_id','version','item_id','completed']
 WHEN 'next' THEN ARRAY[]::text[] WHEN 'complete' THEN ARRAY['task_id','version'] WHEN 'pause' THEN ARRAY['task_id','version'] WHEN 'end_of_day' THEN ARRAY['task_id','version'] WHEN 'critical_start' THEN ARRAY['task_id','version'] WHEN 'critical_decline' THEN ARRAY['task_id','version','reason']
 WHEN 'schedule_save' THEN ARRAY['employee_id','id','version','type','starts_at','ends_at'] WHEN 'schedule_delete' THEN ARRAY['employee_id','id','version']
 WHEN 'department_save' THEN ARRAY['name'] WHEN 'employee_department' THEN ARRAY['employee_id','department_id'] WHEN 'scope_grant' THEN ARRAY['grantee_employee_id','permission','scope_type','target_employee_id','department_id','location_id'] WHEN 'scope_revoke' THEN ARRAY['id']
 WHEN 'reporting_save' THEN ARRAY['employee_id','manager_employee_id','effective_from','effective_to'] WHEN 'capacity_save' THEN ARRAY['employee_id','effective_from','effective_to','daily_task_capacity_minutes'] WHEN 'category_save' THEN ARRAY['id','name','parent_id','sort_order','active'] WHEN 'settings_save' THEN ARRAY['company_timezone','default_daily_task_capacity_minutes','planning_horizon_days','load_balancer_enabled']
 WHEN 'balance' THEN ARRAY['employee_id','date'] WHEN 'recommendation_resolve' THEN ARRAY['id','decision'] WHEN 'recurring_save' THEN ARRAY['title','description','assigned_to_employee_id','category_id','estimated_minutes','starts_on','ends_on','every_days'] WHEN 'recurring_generate' THEN ARRAY['template_id'] END;
 IF keys IS NULL OR p_args-keys<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
END $$;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.tasks_command(text,jsonb,uuid)'::regprocedure),$old$PERFORM pg_advisory_xact_lock(hashtextextended('task-op:'||p_operation,41));$old$,$new$PERFORM app_private.task_validate_args(p_action,p_args);
 PERFORM pg_advisory_xact_lock(hashtextextended('task-op:'||p_operation,41));$new$); END $$;
REVOKE ALL ON FUNCTION app_private.task_day_fits(public."Tasks",date),app_private.task_validate_args(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
