BEGIN;
-- Work module update (РБ-004 … РБ-014, У-001 … У-007).
-- Additive only: no table, column, row or function is dropped. Existing command contracts are kept;
-- new actions extend the closed argument list through the same dispatcher/validator chain.

-- 1. Soft delete and attachment removal metadata ------------------------------------------------
ALTER TABLE public."Tasks" ADD COLUMN deleted_at timestamptz,ADD COLUMN deleted_by_employee_id bigint REFERENCES public."Employees";
CREATE INDEX tasks_children_live ON public."Tasks"(parent_task_id) WHERE deleted_at IS NULL;
ALTER TABLE public."Task_files" ADD COLUMN removed_at timestamptz,ADD COLUMN removed_by_employee_id bigint REFERENCES public."Employees";
CREATE INDEX task_files_live ON public."Task_files"(task_id) WHERE removed_at IS NULL;

-- 2. Personal notifications: separate from the immutable activity log ---------------------------
CREATE TABLE public."Task_notifications"(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 recipient_employee_id bigint NOT NULL REFERENCES public."Employees",
 task_id bigint NOT NULL REFERENCES public."Tasks",
 event_id bigint NOT NULL REFERENCES public."Task_events",
 kind text NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(event_id,recipient_employee_id));
CREATE INDEX task_notifications_inbox ON public."Task_notifications"(recipient_employee_id,read_at,id DESC);

-- 3. Parent completion guard (У-003): enforced for every status path, including internal helpers.
CREATE FUNCTION app_private.task_completion_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' AND EXISTS(SELECT FROM public."Tasks" c WHERE c.parent_task_id=NEW.id AND c.deleted_at IS NULL AND c.status NOT IN ('completed','cancelled')) THEN
  RAISE EXCEPTION 'SUBTASKS_INCOMPLETE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_completion_guard BEFORE UPDATE OF status ON public."Tasks" FOR EACH ROW EXECUTE FUNCTION app_private.task_completion_guard();

-- 4. Direct-child progress (У-005): grandchildren never count; hidden completed children do. ------
CREATE FUNCTION app_private.task_progress(p_task bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN count(*)=0 THEN NULL ELSE jsonb_build_object('total',count(*),'done',count(*) FILTER(WHERE status='completed'),'percent',round(100.0*(count(*) FILTER(WHERE status='completed'))/count(*))) END
 FROM public."Tasks" WHERE parent_task_id=p_task AND deleted_at IS NULL AND status<>'cancelled'
$$;
CREATE FUNCTION app_private.task_descendants(p_task bigint) RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE d(id) AS(SELECT id FROM public."Tasks" WHERE parent_task_id=p_task UNION SELECT t.id FROM public."Tasks" t JOIN d ON t.parent_task_id=d.id) SELECT id FROM d
$$;

-- 5. Notifications are derived on the server from the activity event, once per event and recipient.
CREATE FUNCTION app_private.task_notify(p_event bigint,p_task public."Tasks",p_actor bigint,p_type text,p_extra jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parent public."Tasks"; BEGIN
 IF p_type='TASK_UPDATED' AND (p_extra ? 'recurrence' OR p_extra->>'reason'='process_launch') THEN RETURN; END IF;
 IF p_type NOT IN ('TASK_CREATED','COMMENT_ADDED','TASK_UPDATED','TASK_ASSIGNED','TASK_PLANNED','TASK_STARTED','TASK_RESUMED','TASK_PAUSED','TASK_COMPLETED','TASK_POSTPONED','TASK_CANCELLED','TASK_DELETED','TASK_REOPENED','TASK_PARENT_CHANGED','TASK_ATTACHMENT_ADDED','TASK_ATTACHMENT_REMOVED','TASK_AUTO_RESCHEDULED','TASK_RESCHEDULE_REQUESTED','TASK_RESCHEDULE_APPROVED','TASK_RESCHEDULE_REJECTED','TASK_APPROVAL_REQUESTED','TASK_APPROVAL_APPROVED','TASK_APPROVAL_REJECTED','TASK_RESULT_SUBMITTED','TASK_RESULT_APPROVED','TASK_CRITICAL_DECLINED') THEN RETURN; END IF;
 INSERT INTO public."Task_notifications"(recipient_employee_id,task_id,event_id,kind)
 SELECT DISTINCT r.id,p_task.id,p_event,p_type FROM (
  SELECT p_task.assigned_to_employee_id AS id UNION SELECT p_task.created_by_employee_id
  UNION SELECT e.actor_employee_id FROM public."Task_events" e WHERE e.task_id=p_task.id AND e.event_type='COMMENT_ADDED'
  UNION SELECT r.approver_employee_id FROM public."Task_approval_requests" r WHERE r.task_id=p_task.id AND r.status='pending'
  UNION SELECT i.owner_employee_id FROM public."Process_instances" i WHERE p_task.source_type='process' AND i.id=(p_task.source_metadata->>'process_instance_id')::bigint
  UNION SELECT (p_task.source_metadata->'step'->>'approver_id')::bigint
 ) r JOIN public."Employees" e ON e.id=r.id AND e.active AND e.archived_at IS NULL WHERE r.id IS NOT NULL AND r.id<>p_actor
 ON CONFLICT DO NOTHING;
 IF p_type IN ('TASK_COMPLETED','TASK_CANCELLED','TASK_DELETED','TASK_CREATED','TASK_PARENT_CHANGED','TASK_REOPENED') THEN
  FOR parent IN SELECT * FROM public."Tasks" WHERE deleted_at IS NULL AND (id=p_task.parent_task_id OR (p_type='TASK_PARENT_CHANGED' AND id=(p_extra->>'previous_parent_task_id')::bigint)) LOOP
   INSERT INTO public."Task_notifications"(recipient_employee_id,task_id,event_id,kind)
   SELECT DISTINCT r.id,parent.id,p_event,'PROGRESS_CHANGED' FROM (SELECT parent.assigned_to_employee_id AS id UNION SELECT parent.created_by_employee_id) r JOIN public."Employees" e ON e.id=r.id AND e.active AND e.archived_at IS NULL WHERE r.id<>p_actor
   ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
END $$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app_private.task_event(bigint,text,uuid,jsonb,jsonb)'::regprocedure);
 IF position('DECLARE t public."Tasks"; a public."Employees"; BEGIN' IN d)=0 OR position('||p_extra);' IN d)=0 OR position('task_notify' IN d)>0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_event'; END IF;
 d:=replace(d,'DECLARE t public."Tasks"; a public."Employees"; BEGIN','DECLARE t public."Tasks"; a public."Employees"; eid bigint; BEGIN');
 d:=replace(d,'||p_extra);','||p_extra) RETURNING id INTO eid; PERFORM app_private.task_notify(eid,t,a.id,p_type,p_extra);');
 EXECUTE d;
END $$;

-- 6. Hierarchy, deletion, attachment and notification commands ------------------------------------
CREATE FUNCTION app_private.task_hierarchy_command(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; t public."Tasks"; d public."Tasks"; b jsonb; f public."Task_files"; n public."Task_notifications"; parent bigint; affected integer; BEGIN
 a:=app_private.task_actor();
 IF p_action='notification_read' THEN
  UPDATE public."Task_notifications" SET read_at=coalesce(read_at,clock_timestamp()) WHERE id=(p_args->>'id')::bigint AND recipient_employee_id=a.id RETURNING * INTO n;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',n.id,'read_at',n.read_at);
 ELSIF p_action='notifications_read_all' THEN
  -- Notifications created after the client's latest known id stay unread.
  UPDATE public."Task_notifications" SET read_at=clock_timestamp() WHERE recipient_employee_id=a.id AND read_at IS NULL AND (p_args->>'before_id' IS NULL OR id<=(p_args->>'before_id')::bigint);
  GET DIAGNOSTICS affected=ROW_COUNT; RETURN jsonb_build_object('updated',affected);
 END IF;
 SELECT * INTO t FROM public."Tasks" WHERE id=(p_args->>'task_id')::bigint;
 IF NOT FOUND OR t.deleted_at IS NOT NULL OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM app_private.task_lock(t.assigned_to_employee_id);
 SELECT * INTO t FROM public."Tasks" WHERE id=t.id FOR UPDATE;
 IF (p_args->>'version')::integer IS DISTINCT FROM t.version THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT'; END IF;
 b:=to_jsonb(t);
 IF p_action='attachment_remove' THEN
  SELECT * INTO f FROM public."Task_files" WHERE id=(p_args->>'file_id')::uuid AND task_id=t.id AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ATTACHMENT'; END IF;
  IF NOT (f.uploaded_by=a.id OR t.created_by_employee_id=a.id OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public."Task_files" SET removed_at=clock_timestamp(),removed_by_employee_id=a.id WHERE id=f.id;
  UPDATE public."Tasks" SET version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  PERFORM app_private.task_event(t.id,'TASK_ATTACHMENT_REMOVED',p_op,b,jsonb_build_object('file',jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size_bytes',f.size_bytes)));
  RETURN to_jsonb(t);
 END IF;
 IF NOT (t.created_by_employee_id=a.id OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_action='set_parent' THEN
  IF t.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'TASK_FINAL'; END IF;
  parent:=nullif(p_args->>'parent_task_id','')::bigint;
  IF parent IS NOT NULL THEN
   IF parent=t.id THEN RAISE EXCEPTION 'SELF_PARENT'; END IF;
   SELECT * INTO d FROM public."Tasks" WHERE id=parent;
   IF NOT FOUND OR d.deleted_at IS NOT NULL OR NOT app_private.task_can_read(d) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
   IF d.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'PARENT_FINAL'; END IF;
   IF parent IN (SELECT app_private.task_descendants(t.id)) THEN RAISE EXCEPTION 'PARENT_CYCLE'; END IF;
  END IF;
  IF parent IS NOT DISTINCT FROM t.parent_task_id THEN RETURN to_jsonb(t); END IF;
  UPDATE public."Tasks" SET parent_task_id=parent,version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  PERFORM app_private.task_event(t.id,'TASK_PARENT_CHANGED',p_op,b,jsonb_build_object('change',jsonb_build_object('parent_task_id',parent),'previous_parent_task_id',b->'parent_task_id'));
  RETURN to_jsonb(t);
 ELSIF p_action='delete' THEN
  -- Approved safe policy (docs/work-module-decisions.md D-1): soft delete, never a subtree.
  IF t.status IN ('in_progress','paused','pending_approval') THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT'; END IF;
  IF EXISTS(SELECT FROM public."Tasks" c WHERE c.parent_task_id=t.id AND c.deleted_at IS NULL) THEN RAISE EXCEPTION 'TASK_HAS_SUBTASKS'; END IF;
  UPDATE public."Tasks" SET deleted_at=clock_timestamp(),deleted_by_employee_id=a.id,status=CASE WHEN status='completed' THEN status ELSE 'cancelled' END,version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  UPDATE public."Task_work_contexts" SET return_task_ids=array_remove(return_task_ids,t.id) WHERE t.id=ANY(return_task_ids);
  PERFORM app_private.task_event(t.id,'TASK_DELETED',p_op,b);
  RETURN to_jsonb(t);
 END IF;
 RAISE EXCEPTION 'INVALID_ACTION';
END $$;

-- 7. Extend existing commands in place ------------------------------------------------------------
DO $$ DECLARE d text; BEGIN
 -- update: editable deadline (РБ-012/РБ-013 deadline history)
 d:=pg_get_functiondef('app_private.task_core(text,jsonb,uuid)'::regprocedure);
 IF position($n$IF p_args-ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;$n$ IN d)=0
  OR position($n$estimated_minutes=CASE WHEN p_args?'estimated_minutes' THEN (p_args->>'estimated_minutes')::integer ELSE estimated_minutes END WHERE id=t.id;$n$ IN d)=0
  OR position($n$IF NOT FOUND OR NOT app_private.task_can_read(d) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF; END IF;$n$ IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_core'; END IF;
 d:=replace(d,$o$IF p_args-ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;$o$,$w$IF p_args-ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes','deadline_at','deadline_is_hard']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;$w$);
 d:=replace(d,$o$estimated_minutes=CASE WHEN p_args?'estimated_minutes' THEN (p_args->>'estimated_minutes')::integer ELSE estimated_minutes END WHERE id=t.id;$o$,$w$estimated_minutes=CASE WHEN p_args?'estimated_minutes' THEN (p_args->>'estimated_minutes')::integer ELSE estimated_minutes END,deadline_at=CASE WHEN p_args?'deadline_at' THEN (p_args->>'deadline_at')::timestamptz ELSE deadline_at END,deadline_is_hard=coalesce((p_args->>'deadline_is_hard')::boolean,deadline_is_hard) WHERE id=t.id;$w$);
 -- create: a child cannot be attached to a deleted or finished parent (У-003 stays consistent)
 d:=replace(d,$o$IF NOT FOUND OR NOT app_private.task_can_read(d) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF; END IF;$o$,$w$IF NOT FOUND OR d.deleted_at IS NOT NULL OR NOT app_private.task_can_read(d) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF; IF d.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'PARENT_FINAL'; END IF; END IF;$w$);
 EXECUTE d;
 -- validator: closed argument list for new actions
 d:=pg_get_functiondef('app_private.task_validate_args_20261011(text,jsonb)'::regprocedure);
 IF position('keys:=CASE p_action' IN d)=0 OR position($n$WHEN 'update' THEN ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']$n$ IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_validate_args'; END IF;
 d:=replace(d,'keys:=CASE p_action',$w$keys:=CASE p_action
 WHEN 'set_parent' THEN ARRAY['task_id','version','parent_task_id'] WHEN 'delete' THEN ARRAY['task_id','version'] WHEN 'attachment_remove' THEN ARRAY['task_id','version','file_id'] WHEN 'notification_read' THEN ARRAY['id'] WHEN 'notifications_read_all' THEN ARRAY['before_id']$w$);
 d:=replace(d,$o$WHEN 'update' THEN ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']$o$,$w$WHEN 'update' THEN ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes','deadline_at','deadline_is_hard']$w$);
 EXECUTE d;
 -- dispatcher: route new actions before the existing chain
 d:=pg_get_functiondef('app_private.task_dispatch_20261011(text,jsonb,uuid)'::regprocedure);
 IF position('BEGIN' IN d)=0 OR position('task_hierarchy_command' IN d)>0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_dispatch'; END IF;
 d:=overlay(d placing $w$BEGIN
 IF p_action IN ('set_parent','delete','attachment_remove','notification_read','notifications_read_all') THEN RETURN app_private.task_hierarchy_command(p_action,p_args,p_op); END IF;$w$ from position('BEGIN' IN d) for 5);
 EXECUTE d;
 -- command lock class: read-state updates do not need the exclusive graph lock
 d:=pg_get_functiondef('public.tasks_command(text,jsonb,uuid)'::regprocedure);
 IF position($n$IF p_action IN ('next','complete','pause','end_of_day','critical_start','critical_decline','comment','checklist_toggle') THEN PERFORM pg_advisory_xact_lock_shared(20261002,2);$n$ IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT tasks_command'; END IF;
 d:=replace(d,$o$IF p_action IN ('next','complete','pause','end_of_day','critical_start','critical_decline','comment','checklist_toggle') THEN PERFORM pg_advisory_xact_lock_shared(20261002,2);$o$,$w$IF p_action IN ('next','complete','pause','end_of_day','critical_start','critical_decline','comment','checklist_toggle','notification_read','notifications_read_all') THEN PERFORM pg_advisory_xact_lock_shared(20261002,2);$w$);
 EXECUTE d;
 -- attachments: creator / planning scope may attach; registration is an activity event (РБ-014)
 d:=pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure);
 IF position($n$IF NOT FOUND OR t.assigned_to_employee_id<>a.id THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;$n$ IN d)=0 OR position($n$(p->>'version_id')::bigint) RETURNING * INTO f;$n$ IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_result_command'; END IF;
 d:=replace(d,$o$IF NOT FOUND OR t.assigned_to_employee_id<>a.id THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;$o$,$w$IF NOT FOUND OR t.deleted_at IS NOT NULL OR NOT (t.assigned_to_employee_id=a.id OR t.created_by_employee_id=a.id OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501';END IF;$w$);
 d:=replace(d,$o$(p->>'version_id')::bigint) RETURNING * INTO f;$o$,$w$(p->>'version_id')::bigint) RETURNING * INTO f;
  IF f.task_id IS NOT NULL THEN UPDATE public."Tasks" SET version=version+1,updated_at=clock_timestamp() WHERE id=f.task_id; PERFORM app_private.task_event(f.task_id,'TASK_ATTACHMENT_ADDED',p_op,to_jsonb(t),jsonb_build_object('file',jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size_bytes',f.size_bytes))); END IF;$w$);
 EXECUTE d;
 -- removed attachments are no longer readable or downloadable
 d:=pg_get_functiondef('app_private.task_file_read(uuid)'::regprocedure);
 IF position('RETURN FOUND AND (f.uploaded_by=a.id' IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_file_read'; END IF;
 EXECUTE replace(d,'RETURN FOUND AND (f.uploaded_by=a.id','RETURN FOUND AND f.removed_at IS NULL AND (f.uploaded_by=a.id');
END $$;

-- 8. Hierarchy-aware list (РБ-007, РБ-009, РБ-010, У-001, У-002, У-004) ----------------------------
-- Same signature as the 2026-10-26 version; all previous query keys remain accepted.
CREATE OR REPLACE FUNCTION public.tasks_list(p_query jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; result jsonb; zone text; today date;
 page integer:=greatest(1,least(coalesce((p_query->>'page')::integer,1),1000000));
 size integer:=greatest(1,least(coalesce((p_query->>'page_size')::integer,10),50));
 view text:=coalesce(nullif(p_query->>'view',''),'all'); tab text:=coalesce(nullif(p_query->>'tab',''),'all'); -- defaults keep the 2026-10-26 contract; the UI requests 'active'
 sort text:=coalesce(nullif(p_query->>'sort',''),'deadline'); dir text;
BEGIN
 a:=app_private.task_actor(); SELECT company_timezone INTO zone FROM public."Task_module_settings"; today:=app_private.task_today();
 IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR p_query-ARRAY['page','page_size','search','tab','view','status','priority','assignee','category','deadline_from','deadline_to','sort','dir']<>'{}' THEN RAISE EXCEPTION 'INVALID_QUERY'; END IF;
 IF view NOT IN ('my','team','relevant','all') OR tab NOT IN ('active','completed','overdue','all') OR sort NOT IN ('deadline','priority','created','updated','status','title') OR coalesce(p_query->>'dir','') NOT IN ('','asc','desc') THEN RAISE EXCEPTION 'INVALID_QUERY'; END IF;
 dir:=coalesce(nullif(p_query->>'dir',''),CASE WHEN sort IN ('priority','created','updated') THEN 'desc' ELSE 'asc' END);
 WITH RECURSIVE reports AS MATERIALIZED (SELECT employee_id FROM app_private.org_assignments(today) WHERE manager_employee_id=a.id),
 visible AS MATERIALIZED (
  SELECT t.*,t.status NOT IN ('completed','cancelled') AND t.deadline_at<now() AS overdue,
   t.assigned_to_employee_id IN (SELECT employee_id FROM reports) AS team,
   t.assigned_to_employee_id=a.id OR t.created_by_employee_id=a.id
    OR EXISTS(SELECT FROM public."Task_events" e WHERE e.task_id=t.id AND e.event_type='COMMENT_ADDED' AND e.actor_employee_id=a.id)
    OR EXISTS(SELECT FROM public."Task_approval_requests" r WHERE r.task_id=t.id AND r.status='pending' AND r.approver_employee_id=a.id)
    OR (t.source_type='process' AND (t.source_metadata->'step'->>'approver_id'=a.id::text OR EXISTS(SELECT FROM public."Process_instances" i WHERE i.id=(t.source_metadata->>'process_instance_id')::bigint AND i.owner_employee_id=a.id))) AS relevant
  FROM public."Tasks" t WHERE t.deleted_at IS NULL AND app_private.task_can_read(t)
 ), scoped AS MATERIALIZED (
  SELECT v.* FROM visible v WHERE CASE view WHEN 'my' THEN v.assigned_to_employee_id=a.id WHEN 'team' THEN v.team WHEN 'relevant' THEN v.relevant ELSE true END
 ), filtered AS MATERIALIZED (
  SELECT t.* FROM scoped t WHERE
   (coalesce(p_query->>'search','')='' OR strpos(lower(t.title),lower(p_query->>'search'))>0 OR t.id::text=trim(leading '#' from p_query->>'search'))
   AND (coalesce(p_query->>'status','')='' OR t.status=p_query->>'status')
   AND (coalesce(p_query->>'priority','')='' OR t.priority=p_query->>'priority')
   AND (coalesce(p_query->>'assignee','')='' OR t.assigned_to_employee_id=(p_query->>'assignee')::bigint)
   AND (coalesce(p_query->>'category','')='' OR t.category_id=(p_query->>'category')::bigint)
   AND (coalesce(p_query->>'deadline_from','')='' OR (t.deadline_at AT TIME ZONE zone)::date>=nullif(p_query->>'deadline_from','')::date)
   AND (coalesce(p_query->>'deadline_to','')='' OR (t.deadline_at AT TIME ZONE zone)::date<=nullif(p_query->>'deadline_to','')::date)
 ), matching AS MATERIALIZED (
  SELECT * FROM filtered WHERE CASE tab WHEN 'active' THEN status NOT IN ('completed','cancelled') WHEN 'completed' THEN status IN ('completed','cancelled') WHEN 'overdue' THEN overdue ELSE true END
 ), chain AS (
  -- Matching tasks plus the minimum authorized ancestor chain (У-004).
  SELECT m.id,m.parent_task_id FROM matching m
  UNION SELECT v.id,v.parent_task_id FROM chain c JOIN visible v ON v.id=c.parent_task_id
 ), nodes AS MATERIALIZED (
  SELECT v.*,EXISTS(SELECT FROM matching m WHERE m.id=v.id) AS match,
   CASE WHEN EXISTS(SELECT FROM chain c WHERE c.id=v.parent_task_id) THEN v.parent_task_id END AS tree_parent,
   CASE sort WHEN 'deadline' THEN extract(epoch FROM v.deadline_at) WHEN 'created' THEN extract(epoch FROM v.created_at) WHEN 'updated' THEN extract(epoch FROM v.updated_at) WHEN 'priority' THEN CASE v.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END END AS key_num,
   CASE sort WHEN 'status' THEN v.status WHEN 'title' THEN lower(v.title) END AS key_text
  FROM visible v WHERE EXISTS(SELECT FROM chain c WHERE c.id=v.id)
 ), ranked AS MATERIALIZED (
  SELECT n.*,row_number() OVER (PARTITION BY n.tree_parent ORDER BY
   CASE WHEN dir='asc' THEN n.key_num END ASC NULLS LAST,CASE WHEN dir='desc' THEN n.key_num END DESC NULLS LAST,
   CASE WHEN dir='asc' THEN n.key_text END ASC NULLS LAST,CASE WHEN dir='desc' THEN n.key_text END DESC NULLS LAST,n.id DESC) AS sibling_rank FROM nodes n
 ), tree AS (
  SELECT r.id,0 AS depth,ARRAY[r.sibling_rank] AS path FROM ranked r WHERE r.tree_parent IS NULL
  UNION ALL SELECT r.id,w.depth+1,w.path||r.sibling_rank FROM tree w JOIN ranked r ON r.tree_parent=w.id WHERE w.depth<200
 ), page_rows AS (
  SELECT r.*,w.depth,w.path FROM ranked r JOIN tree w ON w.id=r.id WHERE w.path[1]>(page-1)*size AND w.path[1]<=page*size
 )
 SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg((to_jsonb(t)-ARRAY['key_num','key_text','sibling_rank','path','team','relevant','tree_parent'])||jsonb_build_object(
   'tree_parent_id',t.tree_parent,'depth',t.depth,'match',t.match,
   'assignee',CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('id',e.id,'name',e.name,'avatar_path',e.avatar_path) END,
   'category',CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('id',c.id,'name',c.name) END,
   'progress',app_private.task_progress(t.id),
   'checklist',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'text',i.text,'completed',i.completed) ORDER BY i.sort_order,i.id) FROM public."Task_checklist_items" i WHERE i.task_id=t.id),'[]')
  ) ORDER BY t.path) FROM page_rows t LEFT JOIN public."Employees" e ON e.id=t.assigned_to_employee_id LEFT JOIN public."Task_categories" c ON c.id=t.category_id),'[]'),
  'total',(SELECT count(*) FROM tree WHERE depth=0),'matching',(SELECT count(*) FROM matching),'page',page,'page_size',size,
  'counts',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status NOT IN ('completed','cancelled')),'completed',count(*) FILTER(WHERE status IN ('completed','cancelled')),'overdue',count(*) FILTER(WHERE overdue)) FROM filtered),
  'views',(SELECT jsonb_build_object('my',count(*) FILTER(WHERE assigned_to_employee_id=a.id),'team',count(*) FILTER(WHERE team),'relevant',count(*) FILTER(WHERE relevant),'all',count(*)) FROM visible WHERE status NOT IN ('completed','cancelled')),
  'team_available',EXISTS(SELECT FROM reports),
  'assignees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) ORDER BY e.name) FROM public."Employees" e WHERE e.id IN (SELECT assigned_to_employee_id FROM visible)),'[]')
 ) INTO result;
 RETURN result;
END $$;

-- 9. Task workspace details (РБ-012, РБ-013, РБ-014) ---------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_details(p_task bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; t public."Tasks"; can_edit boolean; BEGIN
 a:=app_private.task_actor(); SELECT * INTO t FROM public."Tasks" WHERE id=p_task;
 IF NOT FOUND OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 can_edit:=t.deleted_at IS NULL AND (t.created_by_employee_id=a.id OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id));
 RETURN jsonb_build_object('task',to_jsonb(t),
  'assignee',(SELECT jsonb_build_object('id',e.id,'name',e.name,'avatar_path',e.avatar_path) FROM public."Employees" e WHERE e.id=t.assigned_to_employee_id),
  'creator',(SELECT jsonb_build_object('id',e.id,'name',e.name,'avatar_path',e.avatar_path) FROM public."Employees" e WHERE e.id=t.created_by_employee_id),
  'parent',(SELECT jsonb_build_object('id',p.id,'title',p.title,'status',p.status) FROM public."Tasks" p WHERE p.id=t.parent_task_id AND p.deleted_at IS NULL AND app_private.task_can_read(p)),
  'ancestors',(WITH RECURSIVE up AS (SELECT p.id,p.parent_task_id,p.title,p.status,1 AS level FROM public."Tasks" p WHERE p.id=t.parent_task_id AND p.deleted_at IS NULL AND app_private.task_can_read(p)
   UNION ALL SELECT p.id,p.parent_task_id,p.title,p.status,up.level+1 FROM up JOIN public."Tasks" p ON p.id=up.parent_task_id WHERE p.deleted_at IS NULL AND app_private.task_can_read(p) AND up.level<100)
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'status',status) ORDER BY level DESC),'[]') FROM up),
  'children',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'status',c.status,'priority',c.priority,'deadline_at',c.deadline_at,'version',c.version,'parent_task_id',c.parent_task_id,'assigned_to_employee_id',c.assigned_to_employee_id,'created_by_employee_id',c.created_by_employee_id,
    'assignee',(SELECT jsonb_build_object('id',e.id,'name',e.name,'avatar_path',e.avatar_path) FROM public."Employees" e WHERE e.id=c.assigned_to_employee_id),'progress',app_private.task_progress(c.id)) ORDER BY c.id),'[]')
   FROM public."Tasks" c WHERE c.parent_task_id=t.id AND c.deleted_at IS NULL AND app_private.task_can_read(c)),
  'children_hidden',(SELECT count(*) FROM public."Tasks" c WHERE c.parent_task_id=t.id AND c.deleted_at IS NULL AND NOT app_private.task_can_read(c)),
  'incomplete_children',(SELECT count(*) FROM public."Tasks" c WHERE c.parent_task_id=t.id AND c.deleted_at IS NULL AND c.status NOT IN ('completed','cancelled')),
  'progress',app_private.task_progress(t.id),
  'checklist',(SELECT coalesce(jsonb_agg(c ORDER BY sort_order,id),'[]') FROM public."Task_checklist_items" c WHERE task_id=t.id),
  'attachments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size_bytes',f.size_bytes,'created_at',f.created_at,'uploaded_by',jsonb_build_object('id',e.id,'name',e.name),'can_remove',t.deleted_at IS NULL AND (f.uploaded_by=a.id OR can_edit)) ORDER BY f.created_at DESC),'[]') FROM public."Task_files" f JOIN public."Employees" e ON e.id=f.uploaded_by WHERE f.task_id=t.id AND f.removed_at IS NULL),
  'dependencies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'status',d.status) ORDER BY d.id),'[]') FROM public."Task_dependencies" dep JOIN public."Tasks" d ON d.id=dep.depends_on_task_id WHERE dep.task_id=t.id AND app_private.task_can_read(d)),
  'permissions',jsonb_build_object('edit',can_edit,'assign',can_edit AND app_private.has_permission('tasks.assign'),'delete',can_edit,'attach',t.deleted_at IS NULL AND (can_edit OR t.assigned_to_employee_id=a.id),'work',t.deleted_at IS NULL AND t.assigned_to_employee_id=a.id),
  'events',(SELECT coalesce(jsonb_agg(x ORDER BY x.id),'[]') FROM (SELECT e.*,(SELECT jsonb_build_object('id',p.id,'name',p.name,'avatar_path',p.avatar_path) FROM public."Employees" p WHERE p.id=e.actor_employee_id) AS actor FROM public."Task_events" e WHERE e.task_id=t.id ORDER BY e.id DESC LIMIT 100) x));
END $$;
CREATE OR REPLACE FUNCTION public.tasks_events(p_task bigint,p_before bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE t public."Tasks"; result jsonb; BEGIN
 PERFORM app_private.task_actor(); SELECT * INTO t FROM public."Tasks" WHERE id=p_task; IF NOT FOUND OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('events',coalesce(jsonb_agg(e ORDER BY id),'[]'),'next_cursor',CASE WHEN count(*)=100 THEN min(id) END) INTO result FROM(SELECT x.*,(SELECT jsonb_build_object('id',p.id,'name',p.name,'avatar_path',p.avatar_path) FROM public."Employees" p WHERE p.id=x.actor_employee_id) AS actor FROM public."Task_events" x WHERE x.task_id=p_task AND (p_before IS NULL OR x.id<p_before) ORDER BY x.id DESC LIMIT 100)e; RETURN result;
END $$;
-- Parent / dependency picker: readable, live, unfinished tasks excluding the task and its descendants.
CREATE FUNCTION public.tasks_parent_candidates(p_task bigint DEFAULT NULL,p_search text DEFAULT '',p_limit integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM app_private.task_actor();
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'status',x.status,'parent_task_id',x.parent_task_id,'assignee',(SELECT e.name FROM public."Employees" e WHERE e.id=x.assigned_to_employee_id)) ORDER BY x.updated_at DESC),'[]') FROM (
  SELECT t.* FROM public."Tasks" t WHERE t.deleted_at IS NULL AND t.status NOT IN ('completed','cancelled') AND (p_task IS NULL OR (t.id<>p_task AND t.id NOT IN (SELECT app_private.task_descendants(p_task))))
   AND (coalesce(p_search,'')='' OR strpos(lower(t.title),lower(p_search))>0 OR t.id::text=trim(leading '#' from p_search)) AND app_private.task_can_read(t)
  ORDER BY t.updated_at DESC LIMIT greatest(1,least(coalesce(p_limit,20),50))) x);
END $$;

-- 10. Notification centre read paths (РБ-013) -----------------------------------------------------
CREATE FUNCTION public.tasks_notifications(p_filter text DEFAULT 'all',p_before bigint DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN
 a:=app_private.task_actor();
 IF coalesce(p_filter,'all') NOT IN ('all','unread','read') THEN RAISE EXCEPTION 'INVALID_QUERY'; END IF;
 RETURN jsonb_build_object(
  'items',(SELECT coalesce(jsonb_agg(x ORDER BY x.id DESC),'[]') FROM (
   SELECT n.id,n.kind,n.read_at,n.created_at,n.task_id,e.event_type,
    CASE WHEN r.readable THEN e.metadata-ARRAY['before','after'] ELSE '{}'::jsonb END AS metadata,
    (SELECT jsonb_build_object('id',p.id,'name',p.name,'avatar_path',p.avatar_path) FROM public."Employees" p WHERE p.id=e.actor_employee_id) AS actor,
    CASE WHEN r.readable THEN jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'deleted',t.deleted_at IS NOT NULL) END AS task
   FROM public."Task_notifications" n JOIN public."Task_events" e ON e.id=n.event_id JOIN public."Tasks" t ON t.id=n.task_id
   CROSS JOIN LATERAL (SELECT app_private.task_can_read(t) AS readable) r
   WHERE n.recipient_employee_id=a.id AND (p_before IS NULL OR n.id<p_before) AND CASE coalesce(p_filter,'all') WHEN 'unread' THEN n.read_at IS NULL WHEN 'read' THEN n.read_at IS NOT NULL ELSE true END
   ORDER BY n.id DESC LIMIT greatest(1,least(coalesce(p_limit,30),100))) x),
  'unread',(SELECT count(*) FROM public."Task_notifications" WHERE recipient_employee_id=a.id AND read_at IS NULL),
  'latest_id',(SELECT max(id) FROM public."Task_notifications" WHERE recipient_employee_id=a.id));
END $$;
CREATE FUNCTION public.tasks_notifications_unread() RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN (SELECT count(*) FROM public."Task_notifications" WHERE recipient_employee_id=a.id AND read_at IS NULL); END $$;

-- 11. Grants ------------------------------------------------------------------------------------------
ALTER TABLE public."Task_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Task_notifications" FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION app_private.task_completion_guard(),app_private.task_progress(bigint),app_private.task_descendants(bigint),app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb),app_private.task_hierarchy_command(text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tasks_list(jsonb),public.tasks_details(bigint),public.tasks_events(bigint,bigint),public.tasks_parent_candidates(bigint,text,integer),public.tasks_notifications(text,bigint,integer),public.tasks_notifications_unread() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tasks_list(jsonb),public.tasks_details(bigint),public.tasks_events(bigint,bigint),public.tasks_parent_candidates(bigint,text,integer),public.tasks_notifications(text,bigint,integer),public.tasks_notifications_unread() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
