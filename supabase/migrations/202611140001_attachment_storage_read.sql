BEGIN;
-- Removed attachments stay unreadable for everybody, including their uploader (2026-11-14, decision D-47).
-- Before: the Storage select policy on 'tasks-private' allowed any object in the caller's own folder
-- ((storage.foldername(name))[1] = auth.uid()) OR public.tasks_storage_read(name). tasks_file and
-- tasks_storage_read already refuse removed files (202611110001), but the own-folder branch still let the
-- uploader sign a URL for a file removed from its task.
-- After: one server check decides. A registered object follows app_private.task_file_read (active file +
-- task / process read rights; removed files never). An object that is not registered yet (between the upload and
-- file_register) is readable only inside the uploader's own folder, as before.
-- Additive: a new function only. The Storage policy itself is changed by the separate operator script
-- supabase/storage/tasks-private-policies-202611140001.sql (Storage policies are never part of migrations).
-- Rollback: run the previous definition of tasks_file_select from tasks-private-policies.sql history, then
--           DROP FUNCTION public.tasks_storage_select(text).
DO $$ BEGIN
 IF to_regprocedure('public.tasks_storage_select(text)') IS NOT NULL THEN RAISE EXCEPTION 'SCHEMA_DRIFT tasks_storage_select'; END IF;
 IF to_regprocedure('app_private.task_file_read(uuid)') IS NULL
  OR position('f.removed_at IS NULL' IN pg_get_functiondef('app_private.task_file_read(uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'SCHEMA_DRIFT task_file_read (apply 202611110001 first)'; END IF;
END $$;
CREATE FUNCTION public.tasks_storage_select(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public."Employees"; f public."Task_files"; BEGIN
 a:=app_private.task_actor();
 SELECT * INTO f FROM public."Task_files" WHERE object_key=p_key;
 IF FOUND THEN RETURN app_private.task_file_read(f.id); END IF;
 RETURN a.auth_user_id IS NOT NULL AND split_part(coalesce(p_key,''),'/',1)=a.auth_user_id::text;
END $$;
REVOKE ALL ON FUNCTION public.tasks_storage_select(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tasks_storage_select(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
