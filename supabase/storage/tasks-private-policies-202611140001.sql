-- Operator step after migration 202611140001_attachment_storage_read.sql (decision D-47).
-- Run once in Supabase Dashboard > SQL editor on the verified target project (check the project ref first).
-- Changes only the USING expression of the existing tasks_file_select policy; the insert policy, the bucket,
-- objects and metadata are untouched. No data is read, changed or removed.
-- Before: own folder OR public.tasks_storage_read(name)  -> the uploader could still sign a removed attachment.
-- After:  public.tasks_storage_select(name)               -> registered files follow the server read rule.
-- Rollback (restores the previous behaviour, including the removed-file exposure):
--   ALTER POLICY tasks_file_select ON storage.objects USING (bucket_id = 'tasks-private'
--     AND app_private.has_permission('tasks.access')
--     AND ((storage.foldername(name))[1] = auth.uid()::text OR public.tasks_storage_read(name)));
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.tasks_storage_select(text)') IS NULL THEN
  RAISE EXCEPTION 'STOP: apply migration 202611140001_attachment_storage_read.sql first';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                AND policyname = 'tasks_file_select' AND cmd = 'SELECT') THEN
  RAISE EXCEPTION 'STOP: policy tasks_file_select not found; apply tasks-private-policies.sql instead';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                AND policyname = 'tasks_file_select' AND qual LIKE '%tasks_storage_read%') THEN
  RAISE EXCEPTION 'STOP: tasks_file_select differs from the 2026-10 definition; review it manually';
 END IF;
END $$;
ALTER POLICY tasks_file_select ON storage.objects
USING (
  bucket_id = 'tasks-private'
  AND app_private.has_permission('tasks.access')
  AND public.tasks_storage_select(name)
);
COMMIT;
