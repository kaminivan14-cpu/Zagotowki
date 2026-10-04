BEGIN;
DO $$ BEGIN
 IF md5(pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure))<>'28158eab5b93f0e287b2c88ee247cd0d'
 OR md5(pg_get_functiondef('app_private.task_dispatch(text,jsonb,uuid)'::regprocedure))<>'9adcb91dfb8487104642eaa17e5b0fe9'
 THEN RAISE EXCEPTION 'SCHEMA_DRIFT manual task actions';END IF;
END $$;
CREATE FUNCTION app_private.task_manual_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; t public."Tasks"; before_state jsonb;
BEGIN
 a:=app_private.task_actor();PERFORM app_private.task_lock(a.id);
 SELECT * INTO t FROM public."Tasks" WHERE id=(p_args->>'task_id')::bigint AND assigned_to_employee_id=a.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 IF (p_args->>'version')::integer IS DISTINCT FROM t.version THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT';END IF;
 IF p_action='start_task' THEN
  IF NOT app_private.task_ready(t) THEN RAISE EXCEPTION 'TASK_NOT_READY';END IF;
  IF t.urgency='critical_now' THEN RETURN app_private.task_work_command('critical_start',p_args,p_op);END IF;
  IF EXISTS(SELECT FROM public."Tasks" WHERE assigned_to_employee_id=a.id AND status='in_progress') THEN RAISE EXCEPTION 'ACTIVE_TASK_EXISTS';END IF;
  RETURN app_private.task_start(t.id,p_op);
 ELSIF p_action='mark_completed' THEN
  IF p_args->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'COMPLETION_CONFIRMATION_REQUIRED';END IF;
  IF t.status NOT IN ('unplanned','planned','paused','in_progress') THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT';END IF;
  IF EXISTS(SELECT FROM public."Task_checklist_items" WHERE task_id=t.id AND NOT completed) THEN RAISE EXCEPTION 'CHECKLIST_INCOMPLETE';END IF;
  IF EXISTS(SELECT FROM public."Task_dependencies" d JOIN public."Tasks" parent ON parent.id=d.depends_on_task_id WHERE d.task_id=t.id AND parent.status<>'completed') THEN RAISE EXCEPTION 'DEPENDENCY_INCOMPLETE';END IF;
  IF t.status='in_progress' THEN RETURN app_private.task_work_command('complete',p_args,p_op);END IF;
  IF EXISTS(SELECT FROM public."Task_work_sessions" WHERE task_id=t.id AND ended_at IS NULL) THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT';END IF;
  before_state:=to_jsonb(t);
  UPDATE public."Tasks" SET status='completed',completed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  -- Keep another running task and its timer intact; remove only this paused return target.
  UPDATE public."Task_work_contexts" SET return_task_ids=array_remove(return_task_ids,t.id),current_task_id=CASE WHEN current_task_id=t.id THEN NULL ELSE current_task_id END WHERE employee_id=a.id;
  PERFORM app_private.task_event(t.id,'TASK_COMPLETED',p_op,before_state,jsonb_build_object('reason','manual_completion','no_time_added',true));
  RETURN to_jsonb(t);
 END IF;
 RAISE EXCEPTION 'INVALID_ACTION';
END $$;
REVOKE ALL ON FUNCTION app_private.task_manual_command(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
-- Extend the existing dispatcher/validator, retaining command idempotency and locks.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_validate_args(text,jsonb)'::regprocedure);
 IF position('keys:=CASE p_action' IN d)=0 OR position('mark_completed' IN d)>0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT validator';END IF;
 d:=replace(d,'keys:=CASE p_action',$new$keys:=CASE p_action WHEN 'start_task' THEN ARRAY['task_id','version'] WHEN 'mark_completed' THEN ARRAY['task_id','version','confirmed']$new$);EXECUTE d;
 d:=pg_get_functiondef('app_private.task_dispatch(text,jsonb,uuid)'::regprocedure);
 IF position('BEGIN' IN d)=0 OR position('task_manual_command' IN d)>0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT dispatcher';END IF;
 d:=overlay(d placing $new$BEGIN
 IF p_action IN ('start_task','mark_completed') THEN RETURN app_private.task_manual_command(p_action,p_args,p_op);END IF;$new$ from position('BEGIN' IN d) for 5);EXECUTE d;
END $$;
COMMIT;
