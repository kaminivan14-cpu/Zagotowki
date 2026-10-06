-- Separate supported Storage policy step, after 202610080004. Do not alter system ownership.
-- Supabase Dashboard > Storage > Policies > employee-avatars. No anon policy or UPDATE.
BEGIN;
CREATE POLICY employee_avatar_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='employee-avatars' AND public.employee_avatar_allowed(name,true));
CREATE POLICY employee_avatar_select ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='employee-avatars' AND public.employee_avatar_allowed(name,false));
CREATE POLICY employee_avatar_delete ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='employee-avatars' AND public.employee_avatar_unreferenced(name));
COMMIT;
