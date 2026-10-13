-- Apply using the supported Storage policy mechanism after 202610130001_audit.sql.
BEGIN;
CREATE POLICY audit_photo_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='audit-photos' AND public.audit_photo_access(name,'read'));
CREATE POLICY audit_photo_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='audit-photos' AND public.audit_photo_access(name,'insert'));
CREATE POLICY audit_photo_delete ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='audit-photos' AND public.audit_photo_access(name,'delete'));
-- Storage DELETE also needs SELECT on tombstones; these are already removed from the app.
CREATE POLICY audit_photo_cleanup_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='audit-photos' AND public.audit_photo_access(name,'delete'));
COMMIT;
