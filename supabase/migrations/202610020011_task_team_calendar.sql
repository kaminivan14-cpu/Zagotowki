BEGIN;
CREATE FUNCTION public.tasks_team_schedule(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; zone text; BEGIN
 a:=app_private.task_actor();
 IF NOT app_private.has_permission('tasks.read.scope') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 SELECT company_timezone INTO zone FROM public."Task_module_settings";
 RETURN (SELECT coalesce(jsonb_agg(x ORDER BY starts_at,employee_id),'[]') FROM(
 SELECT s.*,e.name AS employee_name FROM public."Schedule_events" s JOIN public."Employees" e ON e.id=s.employee_id
 WHERE e.active AND e.archived_at IS NULL AND (e.id=a.id OR app_private.task_scope('tasks.read.scope',e.id))
 AND s.ends_at>p_from::timestamp AT TIME ZONE zone AND s.starts_at<(p_to+1)::timestamp AT TIME ZONE zone)x);
END $$;
REVOKE ALL ON FUNCTION public.tasks_team_schedule(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_team_schedule(date,date) TO authenticated;
COMMIT;
