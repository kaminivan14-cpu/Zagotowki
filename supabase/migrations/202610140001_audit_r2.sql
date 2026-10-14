-- Unreleased AUDYT now uses private R2; legacy Supabase objects are not migrated.
-- Deploy only to an environment without existing audit photos.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.audit_photos) THEN
  RAISE EXCEPTION 'AUDIT_R2_REQUIRES_EMPTY_PHOTOS: migrate existing attachments explicitly first';
 END IF;
END $$;
ALTER TABLE public.audit_photos ADD COLUMN sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE public.audit_photos ADD COLUMN width integer NOT NULL CHECK(width BETWEEN 1 AND 1920);
ALTER TABLE public.audit_photos ADD COLUMN height integer NOT NULL CHECK(height BETWEEN 1 AND 1920);
ALTER TABLE public.audit_photos ADD COLUMN upload_until timestamptz;
ALTER TABLE public.audit_photos ADD COLUMN cleaned_at timestamptz;
ALTER TABLE public.audit_photos ADD CONSTRAINT audit_r2_jpeg CHECK(mime='image/jpeg' AND bytes<=4194304);

-- Keep all existing audit/template authorization, versions and retry semantics intact.
DO $$ DECLARE d text;old text;replacement text;BEGIN
 d:=pg_get_functiondef('public.audit_command(text,jsonb,uuid)'::regprocedure);
 old:=$s$INSERT INTO public.audit_photos(id,audit_id,question,path,mime,bytes) VALUES(pid,aid,idx,aid||'/'||pid||'.'||ext,mime,(p_args->>'bytes')::integer);$s$;
 replacement:=$s$IF mime<>'image/jpeg' OR (p_args->>'bytes')::integer>4194304
   OR coalesce(p_args->>'sha256','') !~ '^[a-f0-9]{64}$'
   OR coalesce((p_args->>'width')::integer,0) NOT BETWEEN 1 AND 1920
   OR coalesce((p_args->>'height')::integer,0) NOT BETWEEN 1 AND 1920 THEN RAISE EXCEPTION 'AUDIT_PHOTO_INVALID'; END IF;
   INSERT INTO public.audit_photos(id,audit_id,question,path,mime,bytes,sha256,width,height)
   VALUES(pid,aid,idx,'audits/'||aid||'/'||pid||'.jpg',mime,(p_args->>'bytes')::integer,
    p_args->>'sha256',(p_args->>'width')::integer,(p_args->>'height')::integer);$s$;
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT audit reserve';END IF;
 d:=replace(d,old,replacement);
 old:=$s$SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='audit-photos' AND name=p.path;
    IF meta IS NULL OR meta->>'mimetype' IS DISTINCT FROM p.mime OR (meta->>'size')::bigint IS DISTINCT FROM p.bytes::bigint THEN RAISE EXCEPTION 'AUDIT_PHOTO_MISSING'; END IF;
    UPDATE public.audit_photos SET state='ready' WHERE id=p.id;$s$;
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT audit ready';END IF;
 d:=replace(d,old,$s$RAISE EXCEPTION 'AUDIT_USE_PHOTO_SERVICE' USING ERRCODE='42501';$s$);
 EXECUTE d;
END $$;
-- Old Storage policies cannot provide an alternative write path.
CREATE OR REPLACE FUNCTION public.audit_photo_access(p_path text,p_mode text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION public.audit_photo_access(text,text) FROM PUBLIC,anon,authenticated,service_role;

-- Only the Edge Function, after validating the JWT with Auth, can attest R2 bytes.
CREATE FUNCTION public.audit_photo_service(p_action text,p_actor uuid,p_photo uuid DEFAULT NULL,
 p_version integer DEFAULT NULL,p_verified jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.audits;p public.audit_photos;BEGIN
 IF NOT EXISTS(SELECT FROM public."Employees" WHERE auth_user_id=p_actor AND active AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'AUDIT_DENIED' USING ERRCODE='42501';
 END IF;
 IF p_action='cleanup_list' THEN
  RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (
   SELECT ph.* FROM public.audit_photos ph JOIN public.audits au ON au.id=ph.audit_id
   WHERE au.author_id=p_actor AND ph.state='deleted'
   ORDER BY ph.cleaned_at NULLS FIRST,ph.id LIMIT 100
  ) x);
 END IF;
 SELECT * INTO p FROM public.audit_photos WHERE id=p_photo;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_NOT_FOUND';END IF;
 SELECT * INTO a FROM public.audits WHERE id=p.audit_id FOR UPDATE;
 SELECT * INTO p FROM public.audit_photos WHERE id=p_photo FOR UPDATE;
 IF p_action='download' THEN
  IF a.status='deleted' OR p.state<>'ready' THEN RAISE EXCEPTION 'AUDIT_NOT_FOUND';END IF;
  RETURN to_jsonb(p);
 END IF;
 IF a.author_id<>p_actor THEN RAISE EXCEPTION 'AUDIT_READ_ONLY' USING ERRCODE='42501';END IF;
 IF p_action IN ('cleanup_check','cleanup_done') THEN
  IF p.state<>'deleted' THEN RAISE EXCEPTION 'AUDIT_READ_ONLY' USING ERRCODE='42501';END IF;
  IF p_action='cleanup_done' THEN UPDATE public.audit_photos SET cleaned_at=clock_timestamp() WHERE id=p.id;END IF;
  RETURN to_jsonb(p);
 END IF;
 -- Retried completion returns the current record and never mutates a finished audit.
 IF p_action IN ('upload','check','ready') AND p.state='ready' AND a.status<>'deleted' THEN
  RETURN jsonb_build_object('photo',to_jsonb(p),'audit',app_private.audit_detail(a.id));
 END IF;
 IF a.status<>'active' OR p.state<>'pending' THEN RAISE EXCEPTION 'AUDIT_READ_ONLY' USING ERRCODE='42501';END IF;
 IF a.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'AUDIT_CONFLICT';END IF;
 IF p_action='upload' THEN
  UPDATE public.audit_photos SET upload_until=clock_timestamp()+interval '5 minutes' WHERE id=p.id RETURNING * INTO p;
 ELSIF p_action='ready' THEN
  IF p_verified->>'sha256' IS DISTINCT FROM p.sha256 OR p_verified->>'mime' IS DISTINCT FROM p.mime
   OR (p_verified->>'bytes')::integer IS DISTINCT FROM p.bytes
   OR (p_verified->>'width')::integer IS DISTINCT FROM p.width
   OR (p_verified->>'height')::integer IS DISTINCT FROM p.height THEN RAISE EXCEPTION 'AUDIT_PHOTO_INVALID';END IF;
  UPDATE public.audit_photos SET state='ready' WHERE id=p.id;
  UPDATE public.audits SET version=version+1 WHERE id=a.id;
  RETURN jsonb_build_object('audit',app_private.audit_detail(a.id));
 ELSIF p_action<>'check' THEN RAISE EXCEPTION 'AUDIT_INVALID';
 END IF;
 RETURN jsonb_build_object('photo',to_jsonb(p));
END $$;
REVOKE ALL ON FUNCTION public.audit_photo_service(text,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.audit_photo_service(text,uuid,uuid,integer,jsonb) TO service_role;
COMMIT;
