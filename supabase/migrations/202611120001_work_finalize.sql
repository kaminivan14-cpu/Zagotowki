-- Work module finalisation (2026-11-12). Additive: no table, row or file is removed.
-- 1. RB-014 «Word, Excel»: the private task bucket also accepts legacy .doc and .xls.
-- 2. file_register validates type and size on the server as well (defence in depth; Storage enforces them on upload).
-- Rollback: remove the two MIME types from storage.buckets.allowed_mime_types and re-run 202611110001's
--           definition of app_private.task_result_command (the inserted block is delimited below).
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  UPDATE storage.buckets b
     SET allowed_mime_types = b.allowed_mime_types || ARRAY(
       SELECT m FROM unnest(ARRAY['application/msword','application/vnd.ms-excel']) m
       WHERE NOT m = ANY(b.allowed_mime_types))
   WHERE b.id = 'tasks-private' AND b.allowed_mime_types IS NOT NULL;
 END IF;
END $$;

DO $$ DECLARE d text; anchor text := $a$IF NOT exists_file THEN RAISE EXCEPTION 'INVALID_ATTACHMENT';END IF;$a$; BEGIN
 d := pg_get_functiondef('app_private.task_result_command(text,jsonb,uuid)'::regprocedure);
 IF position(anchor IN d) = 0 OR position('ATTACHMENT_TYPE' IN d) > 0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_result_command'; END IF;
 d := replace(d, anchor, anchor || $w$
  -- 202611120001: server-side type / size validation against the bucket configuration
  IF to_regclass('storage.buckets') IS NOT NULL THEN
   EXECUTE 'SELECT jsonb_build_object(''types'',to_jsonb(allowed_mime_types),''limit'',file_size_limit) FROM storage.buckets WHERE id=''tasks-private''' INTO object_meta;
   IF jsonb_typeof(object_meta->'types')='array' AND NOT (object_meta->'types') ? coalesce(p->>'mime','') THEN RAISE EXCEPTION 'ATTACHMENT_TYPE';END IF;
   IF coalesce((p->>'size_bytes')::bigint,0)<1 OR (p->>'size_bytes')::bigint>coalesce((object_meta->>'limit')::bigint,20971520) THEN RAISE EXCEPTION 'ATTACHMENT_TOO_LARGE';END IF;
  END IF;
  -- end 202611120001$w$);
 EXECUTE d;
END $$;

-- 3. Reassignment notifications (D-14, agreed 2026-11-12): an assignment that leaves the assignee unchanged
--    (e.g. an explicit null, which the core keeps as the current assignee) is not a reassignment and notifies nobody.
--    Recipients otherwise stay as before: new assignee, author, participants, process owner / step approver;
--    never the actor; the previous assignee only through another relationship; one row per event and recipient.
DO $$ DECLARE d text; anchor text := $a$DECLARE parent public."Tasks"; BEGIN$a$; BEGIN
 d := pg_get_functiondef('app_private.task_notify(bigint,public."Tasks",bigint,text,jsonb)'::regprocedure);
 IF position(anchor IN d) = 0 OR position('202611120001' IN d) > 0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_notify'; END IF;
 d := replace(d, anchor, anchor || $w$
 -- 202611120001: unchanged assignee => no assignment notification
 IF p_type='TASK_ASSIGNED' AND EXISTS(SELECT FROM public."Task_events" e WHERE e.id=p_event
     AND (e.metadata->'before'->>'assigned_to_employee_id')::bigint IS NOT DISTINCT FROM p_task.assigned_to_employee_id) THEN RETURN; END IF;$w$);
 EXECUTE d;
END $$;
