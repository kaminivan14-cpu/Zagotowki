BEGIN;
-- Only employees who can enter Tasks may receive new work.
DO $$ DECLARE f text; d text; BEGIN
 FOREACH f IN ARRAY ARRAY['app_private.task_core(text,jsonb,uuid)','public.tasks_assignable_people(text)'] LOOP
  d:=pg_get_functiondef(f::regprocedure);
  IF f LIKE 'app_private%' THEN
   d:=replace(d,'WHERE id=dest AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL','WHERE id=dest AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL AND EXISTS(SELECT FROM app_private.role_permissions p WHERE p.role="Employees".role AND p.permission=''tasks.access'')');
  ELSE d:=replace(d,'WHERE active AND archived_at IS NULL AND auth_user_id IS NOT NULL','WHERE active AND archived_at IS NULL AND auth_user_id IS NOT NULL AND EXISTS(SELECT FROM app_private.role_permissions p WHERE p.role=e.role AND p.permission=''tasks.access'')'); END IF;
  EXECUTE d;
 END LOOP;
END $$;
ALTER TABLE public."Tasks" ADD CONSTRAINT task_version_positive CHECK(version>0);
-- Company timezone cannot silently reinterpret dates once work has been recorded.
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('app_private.task_settings_command(text,jsonb,uuid)'::regprocedure),$old$UPDATE public."Task_module_settings" SET company_timezone=$old$,$new$IF (SELECT company_timezone FROM public."Task_module_settings") IS DISTINCT FROM p_args->>'company_timezone' AND EXISTS(SELECT FROM public."Tasks") THEN RAISE EXCEPTION 'TIMEZONE_IN_USE'; END IF;
   UPDATE public."Task_module_settings" SET company_timezone=$new$); END $$;
CREATE FUNCTION public.tasks_admin_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM app_private.task_actor(); IF NOT app_private.has_permission('tasks.admin') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('scope_grants',(SELECT coalesce(jsonb_agg(g ORDER BY id),'[]') FROM public."Task_scope_grants" g),'reporting_lines',(SELECT coalesce(jsonb_agg(r ORDER BY id),'[]') FROM public."Employee_reporting_lines" r),'capacity',(SELECT coalesce(jsonb_agg(c ORDER BY id),'[]') FROM public."Employee_capacity_settings" c),'recurring',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM public."Recurring_task_templates" t)); END $$;
-- Historical employee reports use event snapshots, never another assignee's later task edits.
CREATE OR REPLACE FUNCTION public.tasks_report(p_employee bigint,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; lo timestamptz; hi timestamptz; rows jsonb; BEGIN
 a:=app_private.task_actor(); IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.report.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT p_from::timestamp AT TIME ZONE company_timezone,(p_to+1)::timestamp AT TIME ZONE company_timezone INTO lo,hi FROM public."Task_module_settings";
 WITH candidates AS(
 SELECT t.id,t.version,to_jsonb(t) snapshot FROM public."Tasks" t WHERE t.assigned_to_employee_id=p_employee AND t.planned_date BETWEEN p_from AND p_to
 UNION ALL SELECT e.task_id,e.task_version,e.metadata->'after' FROM public."Task_events" e WHERE e.created_at>=lo AND e.created_at<hi AND (e.metadata->'after'->>'assigned_to_employee_id')::bigint=p_employee
 UNION ALL SELECT e.task_id,e.task_version-1,e.metadata->'before' FROM public."Task_events" e WHERE e.created_at>=lo AND e.created_at<hi AND (e.metadata->'before'->>'assigned_to_employee_id')::bigint=p_employee),
 latest AS(SELECT DISTINCT ON(id) id,snapshot FROM candidates ORDER BY id,version DESC),
 report AS(SELECT l.id,l.snapshot||jsonb_build_object('period_actual_minutes',coalesce((SELECT sum(extract(epoch FROM least(coalesce(s.ended_at,now()),hi)-greatest(s.started_at,lo))/60) FROM public."Task_work_sessions" s WHERE s.task_id=l.id AND s.employee_id=p_employee AND s.started_at<hi AND coalesce(s.ended_at,now())>lo),0),
 'moved',EXISTS(SELECT FROM public."Task_events" e WHERE e.task_id=l.id AND e.event_type IN ('TASK_POSTPONED','TASK_AUTO_RESCHEDULED','TASK_RESCHEDULE_APPROVED') AND e.created_at>=lo AND e.created_at<hi AND (e.metadata->'after'->>'assigned_to_employee_id')::bigint=p_employee),
 'overdue',coalesce((l.snapshot->>'deadline_at')::timestamptz<now() AND l.snapshot->>'status' NOT IN ('completed','cancelled'),false)) item FROM latest l ORDER BY l.id DESC LIMIT 200)
 SELECT coalesce(jsonb_agg(item ORDER BY id DESC),'[]') INTO rows FROM report;
 RETURN jsonb_build_object('tasks',rows,'events',(SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT e.* FROM public."Task_events" e WHERE e.created_at>=lo AND e.created_at<hi AND (e.metadata->'after'->>'assigned_to_employee_id')::bigint=p_employee ORDER BY e.id DESC LIMIT 500)x));
END $$;
REVOKE ALL ON FUNCTION public.tasks_admin_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_admin_state() TO authenticated;
COMMIT;
