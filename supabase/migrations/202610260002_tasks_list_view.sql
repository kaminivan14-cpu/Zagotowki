BEGIN;
-- Extend the existing list RPC. Its cursor signature remains unchanged for all
-- existing consumers. The new query signature always uses task_can_read.
CREATE FUNCTION public.tasks_list(p_query jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; page integer:=greatest(1,least(coalesce((p_query->>'page')::integer,1),1000000)); zone text;
BEGIN
 PERFORM app_private.task_actor();SELECT company_timezone INTO zone FROM public."Task_module_settings";
 IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR p_query-ARRAY['page','search','tab','status','priority','assignee','category','deadline_from','deadline_to','sort']<>'{}' THEN RAISE EXCEPTION 'INVALID_QUERY';END IF;
 WITH visible AS MATERIALIZED (
  SELECT t.*,t.status NOT IN ('completed','cancelled') AND t.deadline_at<now() AS overdue
  FROM public."Tasks" t WHERE app_private.task_can_read(t)
 ), filtered AS MATERIALIZED (
  SELECT t.* FROM visible t WHERE
   (coalesce(p_query->>'search','')='' OR strpos(lower(t.title),lower(p_query->>'search'))>0)
   AND (coalesce(p_query->>'status','')='' OR t.status=p_query->>'status')
   AND (coalesce(p_query->>'priority','')='' OR t.priority=p_query->>'priority')
   AND (coalesce(p_query->>'assignee','')='' OR t.assigned_to_employee_id=(p_query->>'assignee')::bigint)
   AND (coalesce(p_query->>'category','')='' OR t.category_id=(p_query->>'category')::bigint)
   AND (coalesce(p_query->>'deadline_from','')='' OR (t.deadline_at AT TIME ZONE zone)::date>=nullif(p_query->>'deadline_from','')::date)
   AND (coalesce(p_query->>'deadline_to','')='' OR (t.deadline_at AT TIME ZONE zone)::date<=nullif(p_query->>'deadline_to','')::date)
 ), selected AS (
  SELECT * FROM filtered WHERE CASE coalesce(p_query->>'tab','all') WHEN 'active' THEN status NOT IN ('completed','cancelled') WHEN 'completed' THEN status='completed' WHEN 'overdue' THEN overdue ELSE true END
 ), ordered AS (
  SELECT t.*,row_number() OVER (ORDER BY
   CASE WHEN coalesce(p_query->>'sort','deadline')='deadline' THEN deadline_at END ASC NULLS LAST,
   CASE WHEN p_query->>'sort'='priority' THEN CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END END DESC,
   CASE WHEN p_query->>'sort'='created' THEN created_at END DESC,
   CASE WHEN p_query->>'sort'='updated' THEN updated_at END DESC,
   CASE WHEN p_query->>'sort'='status' THEN status END ASC,id DESC) AS ordinal FROM selected t
 ), paged AS (SELECT * FROM ordered ORDER BY ordinal LIMIT 10 OFFSET (page-1)*10)
 SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg((to_jsonb(t)-'ordinal')||jsonb_build_object(
   'assignee',CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('id',e.id,'name',e.name,'avatar_path',e.avatar_path) END,
   'category',CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('id',c.id,'name',c.name) END,
   'checklist',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'text',i.text,'completed',i.completed) ORDER BY i.sort_order,i.id) FROM public."Task_checklist_items" i WHERE i.task_id=t.id),'[]'),
   'subtasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'status',v.status,'priority',v.priority,'deadline_at',v.deadline_at) ORDER BY v.id) FROM visible v WHERE v.parent_task_id=t.id),'[]')
  ) ORDER BY t.ordinal) FROM paged t LEFT JOIN public."Employees" e ON e.id=t.assigned_to_employee_id LEFT JOIN public."Task_categories" c ON c.id=t.category_id),'[]'),
  'total',(SELECT count(*) FROM selected),'page',page,'page_size',10,
  'counts',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status NOT IN ('completed','cancelled')),'completed',count(*) FILTER(WHERE status='completed'),'overdue',count(*) FILTER(WHERE overdue)) FROM filtered),
  'assignees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) ORDER BY e.name) FROM public."Employees" e WHERE e.id IN (SELECT assigned_to_employee_id FROM visible)),'[]')
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tasks_list(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tasks_list(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
