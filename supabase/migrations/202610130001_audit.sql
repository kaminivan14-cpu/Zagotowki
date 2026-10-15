-- AUDYT: RPC-only writes, immutable snapshots, optimistic revisions and private files.
BEGIN;
INSERT INTO app_private.role_permissions(role,permission)
SELECT DISTINCT role,'audit.access' FROM app_private.role_permissions ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.audit_templates (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 questions jsonb NOT NULL, version integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.audits (
 id uuid PRIMARY KEY, template_id uuid NOT NULL, template_name text NOT NULL, questions jsonb NOT NULL,
 author_id uuid NOT NULL, manager text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 location_id bigint REFERENCES public."Locations"(id), location_name text,
 answers jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','deleted')),
 completed_at timestamptz, CHECK((status='completed')=(completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS audits_history ON public.audits(status,started_at DESC);
CREATE TABLE IF NOT EXISTS public.audit_photos (
 id uuid PRIMARY KEY, audit_id uuid NOT NULL REFERENCES public.audits(id), question integer NOT NULL,
 path text UNIQUE NOT NULL, mime text NOT NULL, bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','deleted')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_photos_parent ON public.audit_photos(audit_id,question);
-- Idempotent mutations also handle lost HTTP responses. Retained after soft deletion.
CREATE TABLE IF NOT EXISTS app_private.audit_operations (
 actor uuid NOT NULL, operation uuid NOT NULL, action text NOT NULL, args jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(actor,operation)
);
ALTER TABLE public.audit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_templates,public.audits,public.audit_photos,app_private.audit_operations FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('audit-photos','audit-photos',false,10485760,ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']) ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION app_private.audit_actor() RETURNS public."Employees"
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; BEGIN
 e:=app_private.actor();
 IF e.archived_at IS NOT NULL OR NOT app_private.has_permission('audit.access') THEN RAISE EXCEPTION 'AUDIT_DENIED' USING ERRCODE='42501'; END IF;
 RETURN e;
END $$;
CREATE OR REPLACE FUNCTION app_private.audit_detail(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(a)||jsonb_build_object('photos',(SELECT coalesce(jsonb_agg(p ORDER BY p.created_at,p.id),'[]') FROM public.audit_photos p WHERE p.audit_id=a.id AND p.state<>'deleted')) FROM public.audits a WHERE id=p_id
$$;
CREATE OR REPLACE FUNCTION public.audit_read(p_kind text,p_id uuid DEFAULT NULL,p_status text DEFAULT 'active') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app_private.audit_actor();
 IF p_kind='templates' THEN RETURN (SELECT coalesce(jsonb_agg(t ORDER BY t.name,t.id),'[]') FROM public.audit_templates t WHERE NOT deleted);
 ELSIF p_kind='locations' THEN RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM public."Locations" WHERE active);
 ELSIF p_kind='history' THEN RETURN (SELECT coalesce(jsonb_agg(a ORDER BY a.started_at DESC,a.id),'[]') FROM public.audits a WHERE status=p_status AND status<>'deleted');
 ELSIF p_kind='detail' AND EXISTS(SELECT FROM public.audits WHERE id=p_id AND status<>'deleted') THEN RETURN app_private.audit_detail(p_id);
 ELSIF p_kind='cleanup' THEN RETURN (SELECT coalesce(jsonb_agg(p.path),'[]') FROM public.audit_photos p JOIN public.audits a ON a.id=p.audit_id WHERE a.author_id=auth.uid() AND p.state='deleted');
 END IF;
 RAISE EXCEPTION 'AUDIT_NOT_FOUND';
END $$;
CREATE OR REPLACE FUNCTION public.audit_command(p_action text,p_args jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public."Employees"; a public.audits; t public.audit_templates; p public.audit_photos;
 op app_private.audit_operations; result jsonb; q jsonb; item jsonb; meta jsonb; loc public."Locations";
 aid uuid; pid uuid; idx integer; mime text; ext text;
BEGIN
 actor:=app_private.audit_actor();
 IF p_operation IS NULL OR p_args IS NULL THEN RAISE EXCEPTION 'AUDIT_INVALID'; END IF;
 -- Serialize retries for this account, including concurrent starts with one operation ID.
 PERFORM pg_advisory_xact_lock(hashtextextended('audit-operation:'||actor.auth_user_id,0));
 SELECT * INTO op FROM app_private.audit_operations WHERE audit_operations.actor=actor.auth_user_id AND operation=p_operation;
 IF FOUND THEN
  IF op.action<>p_action OR op.args<>p_args THEN RAISE EXCEPTION 'AUDIT_OPERATION_CONFLICT'; END IF;
  RETURN op.result;
 END IF;
 IF p_action IN ('template_save','template_delete') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('audit-template:'||(p_args->>'id'),0));
  SELECT * INTO t FROM public.audit_templates WHERE id=(p_args->>'id')::uuid FOR UPDATE;
  IF FOUND THEN
   IF t.deleted OR t.version IS DISTINCT FROM (p_args->>'version')::integer THEN RAISE EXCEPTION 'AUDIT_CONFLICT'; END IF;
  ELSIF p_action='template_delete' OR p_args->>'version' IS NOT NULL THEN RAISE EXCEPTION 'AUDIT_NOT_FOUND';
  END IF;
  IF p_action='template_delete' THEN
   UPDATE public.audit_templates SET deleted=true,version=version+1 WHERE id=t.id RETURNING to_jsonb(audit_templates.*) INTO result;
  ELSE
   q:=p_args->'questions';
   IF coalesce(length(btrim(p_args->>'name')),0) NOT BETWEEN 1 AND 200 OR jsonb_typeof(q) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'AUDIT_TEMPLATE_INVALID'; END IF;
   IF jsonb_array_length(q) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'AUDIT_TEMPLATE_INVALID'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(q) LOOP
    IF jsonb_typeof(item)<>'string' OR length(btrim(item#>>'{}')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'AUDIT_TEMPLATE_INVALID'; END IF;
   END LOOP;
   INSERT INTO public.audit_templates(id,name,questions) VALUES((p_args->>'id')::uuid,btrim(p_args->>'name'),q)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,questions=excluded.questions,version=audit_templates.version+1 RETURNING to_jsonb(audit_templates.*) INTO result;
  END IF;
 ELSIF p_action='start' THEN
  SELECT * INTO t FROM public.audit_templates WHERE id=(p_args->>'template_id')::uuid AND NOT deleted FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_NOT_FOUND'; END IF;
  INSERT INTO public.audits(id,template_id,template_name,questions,author_id,manager,answers)
  VALUES(p_operation,t.id,t.name,t.questions,actor.auth_user_id,actor.name,
   (SELECT jsonb_agg(jsonb_build_object('answer',NULL,'comment','')) FROM jsonb_array_elements(t.questions))) RETURNING * INTO a;
  result:=app_private.audit_detail(a.id);
 ELSE
  aid:=(p_args->>'id')::uuid;
  SELECT * INTO a FROM public.audits WHERE id=aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_NOT_FOUND'; END IF;
  IF a.author_id<>actor.auth_user_id OR a.status<>'active' THEN RAISE EXCEPTION 'AUDIT_READ_ONLY' USING ERRCODE='42501'; END IF;
  IF a.version IS DISTINCT FROM (p_args->>'version')::integer THEN RAISE EXCEPTION 'AUDIT_CONFLICT'; END IF;
  IF p_action='save' THEN
   q:=p_args->'answers';
   IF jsonb_typeof(q) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'AUDIT_INVALID'; END IF;
   IF jsonb_array_length(q)<>jsonb_array_length(a.questions) THEN RAISE EXCEPTION 'AUDIT_INVALID'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(q) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ? 'answer' AND item ? 'comment')
     OR (item->'answer'<>'null'::jsonb AND (jsonb_typeof(item->'answer')<>'string' OR item->>'answer' NOT IN ('yes','no','na')))
     OR jsonb_typeof(item->'comment') IS DISTINCT FROM 'string' OR length(item->>'comment')>200 THEN RAISE EXCEPTION 'AUDIT_INVALID'; END IF;
   END LOOP;
   IF p_args->>'location_id' IS NOT NULL THEN
    SELECT * INTO loc FROM public."Locations" WHERE id=(p_args->>'location_id')::bigint AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_LOCATION_INVALID'; END IF;
   END IF;
   UPDATE public.audits SET answers=q,location_id=loc.id,location_name=loc.name WHERE id=aid;
  ELSIF p_action='complete' THEN
   IF a.location_id IS NULL OR length(btrim(a.manager))=0 OR EXISTS(SELECT FROM jsonb_array_elements(a.answers) x WHERE x->>'answer' IS NULL)
    OR EXISTS(SELECT FROM public.audit_photos WHERE audit_id=aid AND state='pending') THEN RAISE EXCEPTION 'AUDIT_INCOMPLETE'; END IF;
   UPDATE public.audits SET status='completed',completed_at=clock_timestamp() WHERE id=aid;
  ELSIF p_action='delete' THEN
   UPDATE public.audits SET status='deleted' WHERE id=aid;
   UPDATE public.audit_photos SET state='deleted' WHERE audit_id=aid;
  ELSIF p_action='photo_reserve' THEN
   idx:=(p_args->>'question')::integer; mime:=p_args->>'mime'; pid:=(p_args->>'photo_id')::uuid;
   ext:=CASE mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'image/heic' THEN 'heic' WHEN 'image/heif' THEN 'heif' END;
   IF idx IS NULL OR idx<0 OR idx>=jsonb_array_length(a.questions) OR ext IS NULL OR coalesce((p_args->>'bytes')::integer,0) NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'AUDIT_PHOTO_INVALID'; END IF;
   IF (SELECT count(*) FROM public.audit_photos WHERE audit_id=aid AND question=idx AND state<>'deleted')>=10 THEN RAISE EXCEPTION 'AUDIT_PHOTO_LIMIT'; END IF;
   INSERT INTO public.audit_photos(id,audit_id,question,path,mime,bytes) VALUES(pid,aid,idx,aid||'/'||pid||'.'||ext,mime,(p_args->>'bytes')::integer);
  ELSIF p_action IN ('photo_ready','photo_delete') THEN
   SELECT * INTO p FROM public.audit_photos WHERE id=(p_args->>'photo_id')::uuid AND audit_id=aid AND state<>'deleted' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_NOT_FOUND'; END IF;
   IF p_action='photo_ready' THEN
    SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='audit-photos' AND name=p.path;
    IF meta IS NULL OR meta->>'mimetype' IS DISTINCT FROM p.mime OR (meta->>'size')::bigint IS DISTINCT FROM p.bytes::bigint THEN RAISE EXCEPTION 'AUDIT_PHOTO_MISSING'; END IF;
    UPDATE public.audit_photos SET state='ready' WHERE id=p.id;
   ELSE UPDATE public.audit_photos SET state='deleted' WHERE id=p.id;
   END IF;
  ELSE RAISE EXCEPTION 'AUDIT_INVALID';
  END IF;
  UPDATE public.audits SET version=version+1 WHERE id=aid;
  result:=app_private.audit_detail(aid);
 END IF;
 INSERT INTO app_private.audit_operations VALUES(actor.auth_user_id,p_operation,p_action,p_args,result);
 RETURN result;
END $$;
-- Row locking serializes Storage mutations with completion/deletion. No overwrite policy.
CREATE OR REPLACE FUNCTION public.audit_photo_access(p_path text,p_mode text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public."Employees"; a public.audits; p public.audit_photos; BEGIN
 e:=app_private.audit_actor();
 SELECT * INTO p FROM public.audit_photos WHERE path=p_path;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO a FROM public.audits WHERE id=p.audit_id FOR UPDATE;
 SELECT * INTO p FROM public.audit_photos WHERE path=p_path;
 IF p_mode='read' THEN RETURN a.status<>'deleted' AND p.state<>'deleted'; END IF;
 IF a.author_id<>e.auth_user_id THEN RETURN false; END IF;
 IF p_mode='insert' THEN RETURN a.status='active' AND p.state='pending'; END IF;
 IF p_mode='delete' THEN RETURN p.state='deleted'; END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION app_private.audit_actor(),app_private.audit_detail(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.audit_read(text,uuid,text),public.audit_command(text,jsonb,uuid),public.audit_photo_access(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.audit_read(text,uuid,text),public.audit_command(text,jsonb,uuid),public.audit_photo_access(text,text) TO authenticated;
COMMIT;
