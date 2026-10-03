BEGIN;
-- Stop on relevant schema drift; do not overwrite a differently deployed implementation.
DO $$ BEGIN
 IF md5(pg_get_functiondef('app_private.task_windows(bigint,date,bigint)'::regprocedure))<>'861d43891960c49c4d5b5b5ae515695d'
 OR md5(pg_get_functiondef('app_private.task_capacity(bigint,date)'::regprocedure))<>'d1ce69470ffb665cd6a1ae653bda7460'
 THEN RAISE EXCEPTION 'SCHEMA_DRIFT: task availability differs from audited baseline'; END IF;
END $$;
-- No configured default shift hours exist: an implicit day is a flexible daily
-- capacity budget, not a fabricated 09:00-17:00 shift. Explicit shifts bound time.
CREATE OR REPLACE FUNCTION app_private.task_windows(p_employee bigint,p_date date,p_exclude bigint DEFAULT NULL) RETURNS tstzmultirange LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH day AS(SELECT tstzrange(p_date::timestamp AT TIME ZONE company_timezone,(p_date+1)::timestamp AT TIME ZONE company_timezone,'[)') r FROM public."Task_module_settings"),
 working AS(SELECT coalesce(range_agg(tstzrange(starts_at,ends_at,'[)')*d.r) FILTER(WHERE s.id IS NOT NULL),tstzmultirange(d.r)) r FROM day d LEFT JOIN public."Schedule_events" s ON s.employee_id=p_employee AND s.type='work' AND tstzrange(s.starts_at,s.ends_at,'[)')&&d.r GROUP BY d.r),
 busy AS(SELECT tstzrange(starts_at,ends_at,'[)') r FROM public."Schedule_events" WHERE employee_id=p_employee AND type<>'work'
 UNION ALL SELECT tstzrange(planned_start_at,planned_start_at+make_interval(mins=>estimated_minutes),'[)') FROM public."Tasks" WHERE assigned_to_employee_id=p_employee AND planned_start_at IS NOT NULL AND estimated_minutes IS NOT NULL AND status NOT IN ('cancelled','completed','draft','pending_approval') AND p_exclude IS DISTINCT FROM 0 AND (p_exclude IS NULL OR id<>p_exclude)),
 blocked AS(SELECT coalesce(range_agg(b.r*d.r),'{}'::tstzmultirange) r FROM busy b CROSS JOIN day d WHERE b.r&&d.r)
 SELECT CASE WHEN NOT EXISTS(SELECT FROM public."Schedule_events" s CROSS JOIN day d WHERE s.employee_id=p_employee AND s.type='work' AND tstzrange(s.starts_at,s.ends_at,'[)')&&d.r)
 AND coalesce((SELECT sum(extract(epoch FROM upper(x)-lower(x))/60) FROM unnest((SELECT coalesce(range_agg(tstzrange(s.starts_at,s.ends_at,'[)')*d.r),'{}'::tstzmultirange) FROM public."Schedule_events" s CROSS JOIN day d WHERE s.employee_id=p_employee AND s.type<>'work' AND tstzrange(s.starts_at,s.ends_at,'[)')&&d.r))x),0)
 >=coalesce((SELECT daily_task_capacity_minutes FROM public."Employee_capacity_settings" WHERE employee_id=p_employee AND effective_from<=p_date AND (effective_to IS NULL OR effective_to>p_date) ORDER BY effective_from DESC LIMIT 1),(SELECT default_daily_task_capacity_minutes FROM public."Task_module_settings"))
 THEN '{}'::tstzmultirange ELSE working.r-blocked.r END FROM working,blocked
$$;
CREATE OR REPLACE FUNCTION app_private.task_capacity(p_employee bigint,p_date date) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH day AS(SELECT tstzrange(p_date::timestamp AT TIME ZONE company_timezone,(p_date+1)::timestamp AT TIME ZONE company_timezone,'[)') r,default_daily_task_capacity_minutes budget FROM public."Task_module_settings"),
 limits AS(SELECT coalesce((SELECT daily_task_capacity_minutes FROM public."Employee_capacity_settings" WHERE employee_id=p_employee AND effective_from<=p_date AND (effective_to IS NULL OR effective_to>p_date) ORDER BY effective_from DESC LIMIT 1),budget) budget,r FROM day),
 blocked AS(SELECT coalesce(range_agg(tstzrange(s.starts_at,s.ends_at,'[)')*d.r),'{}'::tstzmultirange) r FROM public."Schedule_events" s CROSS JOIN day d WHERE employee_id=p_employee AND type<>'work' AND tstzrange(s.starts_at,s.ends_at,'[)')&&d.r)
 SELECT greatest(0,least(
  CASE WHEN EXISTS(SELECT FROM public."Schedule_events" s WHERE employee_id=p_employee AND type='work' AND tstzrange(starts_at,ends_at,'[)')&&limits.r) THEN budget
  ELSE budget-coalesce((SELECT floor(sum(extract(epoch FROM upper(x)-lower(x))/60))::integer FROM blocked,unnest(blocked.r)x),0) END,
  coalesce((SELECT floor(sum(extract(epoch FROM upper(x)-lower(x))/60))::integer FROM unnest(app_private.task_windows(p_employee,p_date,0))x),0))) FROM limits
$$;
-- Minimal scoped read for Schedule: same capacity source as planning and queue.
CREATE FUNCTION public.tasks_schedule_capacity(p_employee bigint,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN
 a:=app_private.task_actor();IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.read.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object('date',p_from+i,'capacity_minutes',app_private.task_capacity(p_employee,p_from+i))) FROM generate_series(0,p_to-p_from)i);
END $$;
-- Actual work split at company-local midnight; planned state from historical
-- snapshot at session start, never from the task's current planned_date.
CREATE FUNCTION public.tasks_report_activity(p_employee bigint,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; zone text; result jsonb; BEGIN
 a:=app_private.task_actor();IF p_employee IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;
 IF a.id<>p_employee AND NOT app_private.task_scope('tasks.report.scope',p_employee) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;
 SELECT company_timezone INTO zone FROM public."Task_module_settings";
 WITH days AS(SELECT p_from+i d,(p_from+i)::timestamp AT TIME ZONE zone lo,(p_from+i+1)::timestamp AT TIME ZONE zone hi FROM generate_series(0,p_to-p_from)i),
 slices AS(SELECT d.d,s.task_id,s.started_at,extract(epoch FROM least(coalesce(s.ended_at,now()),d.hi)-greatest(s.started_at,d.lo))/60 minutes,
 coalesce((SELECT nullif(e.metadata->'after','null'::jsonb) FROM public."Task_events" e WHERE e.task_id=s.task_id AND e.created_at<=s.started_at ORDER BY e.created_at DESC,e.id DESC LIMIT 1),
 (SELECT nullif(e.metadata->'before','null'::jsonb) FROM public."Task_events" e WHERE e.task_id=s.task_id AND e.created_at>s.started_at ORDER BY e.created_at,e.id LIMIT 1)) snapshot
 FROM days d JOIN public."Task_work_sessions" s ON s.employee_id=p_employee AND s.started_at<d.hi AND coalesce(s.ended_at,now())>d.lo),
 classified AS(SELECT *,CASE WHEN snapshot IS NULL THEN 'unknown' WHEN snapshot->>'planned_date' IS NULL THEN 'unplanned' ELSE 'planned' END kind FROM slices)
 SELECT coalesce(jsonb_agg(x ORDER BY date,task_id,kind),'[]') INTO result FROM(
 SELECT d AS date,task_id,coalesce(snapshot->>'title','Завдання #'||task_id) title,(snapshot->>'category_id')::bigint category_id,kind,sum(minutes) actual_minutes FROM classified GROUP BY d,task_id,snapshot->>'title',snapshot->>'category_id',kind)x;
 RETURN jsonb_build_object('rows',result,'timezone',zone);
END $$;
REVOKE ALL ON FUNCTION public.tasks_schedule_capacity(bigint,date,date),public.tasks_report_activity(bigint,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_schedule_capacity(bigint,date,date),public.tasks_report_activity(bigint,date,date) TO authenticated;
COMMIT;
