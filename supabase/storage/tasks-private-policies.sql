-- Phase B only: Supabase Dashboard > Storage > Policies, after application migrations.
-- NOT part of automatic migrations. Never change storage.objects owner or bypass RLS.
-- Existing policy name/conflicting definition: STOP and review; do not drop/replace blindly.
-- Bucket tasks-private remains private (20 MiB + MIME allowlist in application migration).
-- No UPDATE/DELETE policy: application uploads use upsert:false; removal detaches metadata.
-- No anon/service_role policy. Browser uses authenticated user JWT, never service key.
BEGIN;
CREATE POLICY tasks_file_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tasks-private'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND app_private.has_permission('tasks.access')
);
CREATE POLICY tasks_file_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'tasks-private'
  AND app_private.has_permission('tasks.access')
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.tasks_storage_read(name)
  )
);
COMMIT;
