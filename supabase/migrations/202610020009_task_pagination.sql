BEGIN;
DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.auth_save_employee(bigint,text,text,bigint,boolean)'::regprocedure),$old$p_role<>'administrator'$old$,$new$p_role NOT IN ('owner','administrator')$new$); END $$;
CREATE OR REPLACE FUNCTION public.tasks_planning(p_employee bigint,p_from date,p_to date,p_cursor bigint DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; page jsonb; next_id bigint; BEGIN
 a:=app_private.task_actor(); IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.read.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY id),'[]'),CASE WHEN count(*)=100 THEN max(id) END INTO page,next_id FROM (SELECT * FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND id>p_cursor AND (planned_date BETWEEN p_from AND p_to OR planned_date IS NULL AND status='unplanned') ORDER BY id LIMIT 100)x;
 RETURN jsonb_build_object('days',(SELECT jsonb_agg(jsonb_build_object('date',d,'capacity_minutes',app_private.task_capacity(p_employee,d),'planned_minutes',app_private.task_load(p_employee,d),'task_count',(SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date=d AND status<>'cancelled'),'unknown_count',(SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_date=d AND estimated_minutes IS NULL AND status NOT IN ('completed','cancelled')))) FROM (SELECT p_from+i AS d FROM generate_series(0,p_to-p_from)i) dates),
 'tasks',(SELECT coalesce(jsonb_agg(v ORDER BY v->>'planned_date',v->>'planned_order'),'[]') FROM jsonb_array_elements(page)v WHERE v->>'planned_date' IS NOT NULL),
 'unplanned',(SELECT coalesce(jsonb_agg(v),'[]') FROM jsonb_array_elements(page)v WHERE v->>'planned_date' IS NULL),'next_cursor',next_id);
END $$;
CREATE FUNCTION public.tasks_events(p_task bigint,p_before bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE t public."Tasks"; result jsonb; BEGIN
 PERFORM app_private.task_actor(); SELECT * INTO t FROM public."Tasks" WHERE id=p_task; IF NOT FOUND OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('events',coalesce(jsonb_agg(e ORDER BY id),'[]'),'next_cursor',CASE WHEN count(*)=100 THEN min(id) END) INTO result FROM(SELECT * FROM public."Task_events" WHERE task_id=p_task AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 100)e; RETURN result;
END $$;
-- Reports return exact counts and mark bounded detail output explicitly.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.tasks_report(bigint,date,date)'::regprocedure);
 d:=replace(d,'rows jsonb;','rows jsonb; totals jsonb;');
 d:=replace(d,'ORDER BY l.id DESC LIMIT 200)','ORDER BY l.id DESC)');
 d:=replace(d,$old$SELECT coalesce(jsonb_agg(item ORDER BY id DESC),'[]') INTO rows FROM report;$old$,$new$SELECT coalesce(jsonb_agg(item ORDER BY id DESC),'[]'),jsonb_build_object('completed',count(*) FILTER(WHERE item->>'status'='completed'),'unfinished',count(*) FILTER(WHERE item->>'status' NOT IN ('completed','cancelled')),'moved',count(*) FILTER(WHERE (item->>'moved')::boolean),'count',count(*)) INTO rows,totals FROM report;$new$);
 d:=replace(d,$old$'tasks',rows,'events'$old$,$new$'tasks',(SELECT coalesce(jsonb_agg(v),'[]') FROM (SELECT v FROM jsonb_array_elements(rows)v LIMIT 200) limited),'totals',totals,'details_truncated',jsonb_array_length(rows)>200,'events'$new$);
 EXECUTE d;
END $$;
CREATE INDEX task_event_assignee_time ON public."Task_events"(((metadata->'after'->>'assigned_to_employee_id')::bigint),created_at);
CREATE INDEX task_event_previous_assignee_time ON public."Task_events"(((metadata->'before'->>'assigned_to_employee_id')::bigint),created_at);
REVOKE ALL ON FUNCTION public.tasks_events(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_events(bigint,bigint) TO authenticated;
COMMIT;
