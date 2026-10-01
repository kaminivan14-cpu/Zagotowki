BEGIN;
CREATE TABLE public."Task_categories"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,parent_id bigint REFERENCES public."Task_categories",name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),sort_order integer NOT NULL DEFAULT 0,active boolean NOT NULL DEFAULT true,CHECK(id<>parent_id));
INSERT INTO public."Task_categories"(name,sort_order) VALUES('Операційні',1),('Проєктні',2),('Стратегічні',3);
INSERT INTO public."Task_categories"(parent_id,name) SELECT id,v.child FROM public."Task_categories" c JOIN (VALUES('Операційні','Аудити'),('Операційні','Утримання команди'),('Операційні','Закриття місяця'),('Проєктні','Оновлення меню'),('Стратегічні','Ребрендинг')) v(parent,child) ON c.name=v.parent;
CREATE TABLE public."Tasks"(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 300),description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),category_id bigint REFERENCES public."Task_categories",
 priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),urgency text NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','critical_today','critical_now')),status text NOT NULL DEFAULT 'unplanned' CHECK(status IN ('draft','pending_approval','unplanned','planned','in_progress','paused','completed','cancelled','blocked')),
 created_by_employee_id bigint NOT NULL REFERENCES public."Employees",assigned_to_employee_id bigint NOT NULL REFERENCES public."Employees",department_id bigint REFERENCES public."Departments",location_id bigint REFERENCES public."Locations",
 source_type text NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','manager','cross_department','approval_request','recurring','process','project','external','api','ai_future')),source_metadata jsonb NOT NULL DEFAULT '{}',source_namespace text,source_external_id text,parent_task_id bigint REFERENCES public."Tasks",
 planned_date date,planned_start_at timestamptz,deadline_at timestamptz,deadline_is_hard boolean NOT NULL DEFAULT false,planned_order integer,not_before_at timestamptz,
 estimated_minutes integer CHECK(estimated_minutes BETWEEN 1 AND 525600),actual_minutes numeric NOT NULL DEFAULT 0 CHECK(actual_minutes>=0),can_auto_reschedule boolean NOT NULL DEFAULT false,requires_reschedule_approval boolean NOT NULL DEFAULT true,reschedule_count integer NOT NULL DEFAULT 0 CHECK(reschedule_count>=0),version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
 CHECK(id<>parent_task_id),CHECK((source_namespace IS NULL)=(source_external_id IS NULL)),CHECK(planned_start_at IS NULL OR planned_date IS NOT NULL),CHECK((status='completed')=(completed_at IS NOT NULL)),UNIQUE(source_namespace,source_external_id));
CREATE INDEX tasks_queue ON public."Tasks"(assigned_to_employee_id,planned_date,status) WHERE status NOT IN ('completed','cancelled');
CREATE INDEX tasks_parent ON public."Tasks"(parent_task_id);
CREATE INDEX tasks_deadline ON public."Tasks"(assigned_to_employee_id,deadline_at);
CREATE UNIQUE INDEX tasks_one_running ON public."Tasks"(assigned_to_employee_id) WHERE status='in_progress';
CREATE TABLE public."Task_dependencies"(task_id bigint NOT NULL REFERENCES public."Tasks",depends_on_task_id bigint NOT NULL REFERENCES public."Tasks",PRIMARY KEY(task_id,depends_on_task_id),CHECK(task_id<>depends_on_task_id));
CREATE INDEX task_dependency_reverse ON public."Task_dependencies"(depends_on_task_id);
CREATE TABLE public."Task_events"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,task_id bigint NOT NULL REFERENCES public."Tasks",event_type text NOT NULL,actor_employee_id bigint NOT NULL REFERENCES public."Employees",task_version integer NOT NULL,operation_id uuid NOT NULL,metadata jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(task_id,task_version));
CREATE INDEX task_event_time ON public."Task_events"(created_at,task_id);
CREATE TABLE app_private.task_operations(operation_id uuid PRIMARY KEY,actor_employee_id bigint NOT NULL REFERENCES public."Employees",action text NOT NULL,args jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION app_private.task_lock(p_employee bigint) RETURNS void LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT pg_advisory_xact_lock(hashtextextended('task-employee:'||p_employee,42)) $$;
CREATE FUNCTION app_private.task_can_read(p_task public."Tasks") RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN p_task.assigned_to_employee_id=a.id OR p_task.created_by_employee_id=a.id OR app_private.task_scope('tasks.read.scope',p_task.assigned_to_employee_id); END $$;
CREATE FUNCTION app_private.task_event(p_task bigint,p_type text,p_op uuid,p_before jsonb DEFAULT NULL,p_extra jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE t public."Tasks"; a public."Employees"; BEGIN a:=app_private.task_actor(); SELECT * INTO STRICT t FROM public."Tasks" WHERE id=p_task; INSERT INTO public."Task_events"(task_id,event_type,actor_employee_id,task_version,operation_id,metadata) VALUES(t.id,p_type,a.id,t.version,p_op,jsonb_build_object('schema_version',1,'before',p_before,'after',to_jsonb(t))||p_extra); END $$;
CREATE FUNCTION app_private.task_graph_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(20261002,2);
 IF EXISTS(WITH RECURSIVE path(id) AS(SELECT NEW.depends_on_task_id UNION SELECT d.depends_on_task_id FROM public."Task_dependencies" d JOIN path p ON d.task_id=p.id) SELECT FROM path WHERE id=NEW.task_id) THEN RAISE EXCEPTION 'DEPENDENCY_CYCLE'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER task_graph_guard BEFORE INSERT OR UPDATE ON public."Task_dependencies" FOR EACH ROW EXECUTE FUNCTION app_private.task_graph_guard();
CREATE FUNCTION app_private.task_tree_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE cycle_found boolean; BEGIN
 PERFORM pg_advisory_xact_lock(20261002,2);
 IF TG_TABLE_NAME='Task_categories' THEN
 WITH RECURSIVE p(id,parent_id) AS(SELECT id,parent_id FROM public."Task_categories" WHERE id=NEW.parent_id UNION SELECT c.id,c.parent_id FROM public."Task_categories" c JOIN p ON c.id=p.parent_id) SELECT EXISTS(SELECT FROM p WHERE id=NEW.id) INTO cycle_found;
 ELSE
 WITH RECURSIVE p(id,parent_task_id) AS(SELECT id,parent_task_id FROM public."Tasks" WHERE id=NEW.parent_task_id UNION SELECT c.id,c.parent_task_id FROM public."Tasks" c JOIN p ON c.id=p.parent_task_id) SELECT EXISTS(SELECT FROM p WHERE id=NEW.id) INTO cycle_found;
 END IF;
 IF cycle_found THEN RAISE EXCEPTION 'PARENT_CYCLE'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER task_parent_guard BEFORE INSERT OR UPDATE OF parent_task_id ON public."Tasks" FOR EACH ROW EXECUTE FUNCTION app_private.task_tree_guard();
CREATE TRIGGER category_parent_guard BEFORE INSERT OR UPDATE ON public."Task_categories" FOR EACH ROW EXECUTE FUNCTION app_private.task_tree_guard();
CREATE FUNCTION app_private.task_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'APPEND_ONLY'; END $$;
CREATE TRIGGER task_event_immutable BEFORE UPDATE OR DELETE ON public."Task_events" FOR EACH ROW EXECUTE FUNCTION app_private.task_append_only();
CREATE FUNCTION app_private.task_core(p_action text,p_args jsonb,p_op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; t public."Tasks"; b jsonb; dest bigint; kind text; d public."Tasks"; BEGIN
 a:=app_private.task_actor();
 IF p_action='create' THEN
  IF p_args-ARRAY['title','description','category_id','priority','urgency','assigned_to_employee_id','estimated_minutes','deadline_at','deadline_is_hard','parent_task_id']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
  dest:=coalesce((p_args->>'assigned_to_employee_id')::bigint,a.id);
  IF (dest=a.id AND NOT app_private.has_permission('tasks.create.self')) OR (dest<>a.id AND NOT app_private.task_scope('tasks.assign',dest)) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM app_private.task_lock(dest);
  IF NOT EXISTS(SELECT FROM public."Employees" WHERE id=dest AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_ASSIGNEE'; END IF;
  IF p_args->>'parent_task_id' IS NOT NULL THEN SELECT * INTO d FROM public."Tasks" WHERE id=(p_args->>'parent_task_id')::bigint; IF NOT FOUND OR NOT app_private.task_can_read(d) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF; END IF;
  INSERT INTO public."Tasks"(title,description,category_id,priority,urgency,created_by_employee_id,assigned_to_employee_id,department_id,source_type,estimated_minutes,deadline_at,deadline_is_hard,parent_task_id,can_auto_reschedule,requires_reschedule_approval)
  VALUES(p_args->>'title',coalesce(p_args->>'description',''),(p_args->>'category_id')::bigint,coalesce(p_args->>'priority','medium'),coalesce(p_args->>'urgency','normal'),a.id,dest,(SELECT department_id FROM public."Employees" WHERE id=dest),CASE WHEN dest=a.id THEN 'manual' WHEN a.role IN ('owner','administrator','director','manager') THEN 'manager' ELSE 'cross_department' END,(p_args->>'estimated_minutes')::integer,(p_args->>'deadline_at')::timestamptz,coalesce((p_args->>'deadline_is_hard')::boolean,false),(p_args->>'parent_task_id')::bigint,dest=a.id,dest<>a.id) RETURNING * INTO t;
  PERFORM app_private.task_event(t.id,'TASK_CREATED',p_op); RETURN to_jsonb(t);
 END IF;
 SELECT * INTO t FROM public."Tasks" WHERE id=(p_args->>'task_id')::bigint;
 IF NOT FOUND OR NOT app_private.task_can_read(t) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 dest:=coalesce((p_args->>'assigned_to_employee_id')::bigint,t.assigned_to_employee_id);
 PERFORM app_private.task_lock(least(dest,t.assigned_to_employee_id)); PERFORM app_private.task_lock(greatest(dest,t.assigned_to_employee_id));
 SELECT * INTO t FROM public."Tasks" WHERE id=t.id FOR UPDATE;
 IF (p_args->>'version')::integer IS DISTINCT FROM t.version THEN RAISE EXCEPTION 'TASK_VERSION_CONFLICT'; END IF;
 IF NOT (t.created_by_employee_id=a.id OR app_private.task_scope('tasks.plan.scope',t.assigned_to_employee_id)) AND p_action NOT IN ('comment','checklist_toggle') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
 b:=to_jsonb(t);
 IF t.status IN ('completed','cancelled') AND p_action<>'comment' THEN RAISE EXCEPTION 'TASK_FINAL'; END IF;
 IF p_action='update' THEN
  IF p_args-ARRAY['task_id','version','title','description','category_id','priority','urgency','estimated_minutes']<>'{}' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
  UPDATE public."Tasks" SET title=coalesce(p_args->>'title',title),description=coalesce(p_args->>'description',description),category_id=CASE WHEN p_args?'category_id' THEN (p_args->>'category_id')::bigint ELSE category_id END,priority=coalesce(p_args->>'priority',priority),urgency=coalesce(p_args->>'urgency',urgency),estimated_minutes=CASE WHEN p_args?'estimated_minutes' THEN (p_args->>'estimated_minutes')::integer ELSE estimated_minutes END WHERE id=t.id;
  kind:='TASK_UPDATED';
 ELSIF p_action='assign' THEN
  IF t.status IN ('in_progress','paused','pending_approval') THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT'; END IF;
  IF NOT app_private.task_scope('tasks.assign',dest) OR NOT EXISTS(SELECT FROM public."Employees" WHERE id=dest AND active AND archived_at IS NULL AND auth_user_id IS NOT NULL) THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  UPDATE public."Tasks" SET assigned_to_employee_id=dest,department_id=(SELECT department_id FROM public."Employees" WHERE id=dest),planned_date=NULL,planned_start_at=NULL,status='unplanned',can_auto_reschedule=false,requires_reschedule_approval=true WHERE id=t.id; kind:='TASK_ASSIGNED';
 ELSIF p_action='cancel' THEN
  IF t.status IN ('in_progress','paused') THEN RAISE EXCEPTION 'TASK_STATE_CONFLICT'; END IF;
  UPDATE public."Tasks" SET status='cancelled' WHERE id=t.id; kind:='TASK_CANCELLED';
 ELSIF p_action='comment' THEN
  IF length(trim(coalesce(p_args->>'text',''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_COMMENT'; END IF; kind:='COMMENT_ADDED';
 ELSIF p_action='dependency' THEN
  PERFORM pg_advisory_xact_lock(20261002,2);
  SELECT * INTO d FROM public."Tasks" WHERE id=(p_args->>'depends_on_task_id')::bigint;
  IF NOT FOUND OR NOT app_private.task_can_read(d) OR t.status IN ('in_progress','paused') THEN RAISE EXCEPTION 'TASKS_DENIED' USING ERRCODE='42501'; END IF;
  INSERT INTO public."Task_dependencies" VALUES(t.id,d.id) ON CONFLICT DO NOTHING; kind:='TASK_UPDATED';
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 UPDATE public."Tasks" SET version=version+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
 PERFORM app_private.task_event(t.id,kind,p_op,b,CASE WHEN p_action='comment' THEN jsonb_build_object('text',p_args->>'text') ELSE jsonb_build_object('change',p_args) END); RETURN to_jsonb(t);
END $$;
CREATE FUNCTION public.tasks_command(p_action text,p_args jsonb,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; old app_private.task_operations; result jsonb; BEGIN
 a:=app_private.task_actor();
 IF p_operation IS NULL OR p_action IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('task-op:'||p_operation,41));
 SELECT * INTO old FROM app_private.task_operations WHERE operation_id=p_operation;
 IF FOUND THEN IF old.actor_employee_id<>a.id OR old.action<>p_action OR old.args<>p_args THEN RAISE EXCEPTION 'OPERATION_CONFLICT'; END IF; RETURN old.result; END IF;
 result:=app_private.task_core(p_action,p_args,p_operation);
 INSERT INTO app_private.task_operations VALUES(p_operation,a.id,p_action,p_args,result,clock_timestamp()); RETURN result;
 EXCEPTION WHEN OTHERS THEN RAISE LOG 'task_engine %',jsonb_build_object('correlation_id',p_operation,'employee_id',a.id,'task_id',p_args->>'task_id','operation_id',p_operation,'service',p_action,'error_code',SQLSTATE,'metadata','{}'::jsonb,'timestamp',clock_timestamp()); RAISE;
END $$;
CREATE FUNCTION public.tasks_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN jsonb_build_object('employee_id',a.id,'capabilities',(SELECT jsonb_agg(p) FROM public.auth_capabilities() p),'categories',(SELECT coalesce(jsonb_agg(c ORDER BY c.sort_order,c.id),'[]') FROM public."Task_categories" c WHERE active)); END $$;
CREATE FUNCTION public.tasks_assignable_people(p_permission text DEFAULT 'tasks.assign') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); IF p_permission NOT IN ('tasks.assign','tasks.read.scope','tasks.plan.scope','tasks.report.scope','tasks.schedule.manage') THEN RAISE EXCEPTION 'INVALID_PERMISSION'; END IF; RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) ORDER BY e.name),'[]') FROM public."Employees" e WHERE active AND archived_at IS NULL AND auth_user_id IS NOT NULL AND (e.id=a.id OR app_private.task_scope(p_permission,e.id))); END $$;
CREATE FUNCTION public.tasks_list(p_employee bigint DEFAULT NULL,p_cursor bigint DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a public."Employees"; BEGIN a:=app_private.task_actor(); RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x.id),'[]') FROM (SELECT t.* FROM public."Tasks" t WHERE t.id>p_cursor AND (p_employee IS NULL OR t.assigned_to_employee_id=p_employee) AND app_private.task_can_read(t) ORDER BY id LIMIT 100) x); END $$;
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['Tasks','Task_categories','Task_dependencies','Task_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP;
 REVOKE ALL ON app_private.task_operations FROM PUBLIC,anon,authenticated;
 FOR f IN SELECT p.oid::regprocedure sig,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app_private' AND p.proname LIKE 'task_%') OR (n.nspname='public' AND p.proname LIKE 'tasks_%') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF; END LOOP;
END $$;
COMMIT;
