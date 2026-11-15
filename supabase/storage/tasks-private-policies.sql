-- Phase B only: Supabase Dashboard > Storage > Policies, after application migrations
-- (the select policy needs public.tasks_storage_select from 202611140001_attachment_storage_read.sql).
-- NOT part of automatic migrations. Never change storage.objects owner or bypass RLS.
-- Existing policy name/conflicting definition: STOP and review; do not drop/replace blindly.
-- A project that already has the 2026-10 definition is upgraded with tasks-private-policies-202611140001.sql.
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
-- Registered files: server read rule only (removed attachments are refused, also for their uploader).
-- Not yet registered uploads: the uploader's own folder only.
CREATE POLICY tasks_file_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'tasks-private'
  AND app_private.has_permission('tasks.access')
  AND public.tasks_storage_select(name)
);
COMMIT;
