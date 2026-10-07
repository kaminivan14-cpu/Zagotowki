BEGIN;
-- Extend the existing version document and central Tasks launch path only.
ALTER TABLE public."Process_versions" ADD COLUMN updated_at timestamptz;
CREATE FUNCTION app_private.process_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
CREATE TRIGGER process_updated_at BEFORE UPDATE ON public."Process_versions" FOR EACH ROW EXECUTE FUNCTION app_private.process_updated_at();
CREATE FUNCTION app_private.process_effective_definition(doc jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE s jsonb;t jsonb;stages jsonb:='[]';steps jsonb;previous jsonb:='[]';current_keys jsonb;dependencies jsonb;BEGIN
 IF jsonb_typeof(doc->'stages') IS DISTINCT FROM 'array' THEN RETURN doc;END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  steps:='[]';current_keys:='[]';
  IF jsonb_typeof(s->'tasks') IS DISTINCT FROM 'array' THEN RETURN doc;END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   dependencies:=coalesce(t->'depends_on','[]');
   IF coalesce((doc->>'sequential_stages')::boolean,false) THEN dependencies:=dependencies||previous;END IF;
   SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') INTO dependencies FROM (SELECT DISTINCT value x FROM jsonb_array_elements(dependencies))q;
   steps:=steps||jsonb_build_array(t||jsonb_build_object('depends_on',dependencies));current_keys:=current_keys||jsonb_build_array(t->'key');
  END LOOP;
  stages:=stages||jsonb_build_array(s||jsonb_build_object('tasks',steps));previous:=current_keys;
 END LOOP;
 RETURN doc||jsonb_build_object('stages',stages);
END $$;
CREATE FUNCTION app_private.process_workspace_validate(doc jsonb) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t jsonb;s jsonb;r jsonb;person jsonb;k text;BEGIN
 IF doc ? 'start_offset_days' AND (jsonb_typeof(doc->'start_offset_days')<>'number' OR (doc->>'start_offset_days')::numeric NOT BETWEEN 0 AND 3660 OR mod((doc->>'start_offset_days')::numeric,1)<>0) THEN RAISE EXCEPTION 'INVALID_PROCESS_TIMING';END IF;
 IF doc ? 'sequential_stages' AND jsonb_typeof(doc->'sequential_stages')<>'boolean' THEN RAISE EXCEPTION 'INVALID_PROCESS';END IF;
 IF doc->>'category_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public."Task_categories" WHERE id=(doc->>'category_id')::bigint AND active) THEN RAISE EXCEPTION 'INACTIVE_CATEGORY';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(doc->'stages') LOOP
  FOR t IN SELECT value FROM jsonb_array_elements(s->'tasks') LOOP
   IF t ? 'duration_days' AND t->'duration_days'<>'null'::jsonb AND (jsonb_typeof(t->'duration_days')<>'number' OR (t->>'duration_days')::numeric NOT BETWEEN 0.01 AND 3660) THEN RAISE EXCEPTION 'INVALID_PROCESS_TIMING';END IF;
   IF t ? 'raci' THEN
    r:=t->'raci';IF jsonb_typeof(r)<>'object' OR r-ARRAY['accountable','consulted','informed']<>'{}' THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
    FOREACH k IN ARRAY ARRAY['accountable','consulted','informed'] LOOP
     IF r ? k THEN
      IF jsonb_typeof(r->k)<>'array' OR jsonb_array_length(r->k)>100 OR (k='accountable' AND jsonb_array_length(r->k)>1) THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
      FOR person IN SELECT value FROM jsonb_array_elements(r->k) LOOP
       IF jsonb_typeof(person)<>'object' OR person-ARRAY['type','id']<>'{}' OR person->>'id' IS NULL OR person->>'type' NOT IN ('employee','department') THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
       IF person->>'type'='employee' THEN
        IF NOT EXISTS(SELECT FROM public."Employees" WHERE id=(person->>'id')::bigint AND active AND archived_at IS NULL) THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
       ELSIF person->>'type'='department' THEN
        IF NOT EXISTS(SELECT FROM public."Departments" WHERE id=(person->>'id')::bigint AND active) THEN RAISE EXCEPTION 'INVALID_RACI';END IF;
       ELSE RAISE EXCEPTION 'INVALID_RACI';END IF;
      END LOOP;
     END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
END $$;
DO $$ DECLARE d text;needle text;BEGIN
 d:=pg_get_functiondef('app_private.process_validate(jsonb,boolean)'::regprocedure);
 needle:=' FOR s IN SELECT value FROM jsonb_array_elements(p_definition->''stages'') LOOP';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT process_validate';END IF;
 EXECUTE replace(d,needle,' PERFORM app_private.process_workspace_validate(p_definition);p_definition:=app_private.process_effective_definition(p_definition);'||needle);
 d:=pg_get_functiondef('app_private.process_command(text,jsonb,uuid)'::regprocedure);
 needle:='   PERFORM app_private.process_validate(v.definition,true);';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT process_command';END IF;
 d:=replace(d,needle,'   v.definition:=app_private.process_effective_definition(v.definition);'||needle);
 needle:='''stage'',s->>''name'',''step'',t';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT process metadata';END IF;
 EXECUTE replace(d,needle,'''stage'',s->>''name'',''stage_key'',s->>''key'',''step'',t');
 d:=pg_get_functiondef('public.tasks_processes()'::regprocedure);
 needle:='''stage'',t.source_metadata->>''stage'',';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'SCHEMA_DRIFT process read';END IF;
 EXECUTE replace(d,needle,needle||'''step_key'',t.source_external_id,''stage_key'',t.source_metadata->>''stage_key'',''step'',t.source_metadata->''step'',''blocked'',EXISTS(SELECT FROM public."Task_dependencies" dep JOIN public."Tasks" predecessor ON predecessor.id=dep.depends_on_task_id WHERE dep.task_id=t.id AND predecessor.status<>''completed''),''dependencies'',(SELECT coalesce(jsonb_agg(dep.depends_on_task_id),''[]'') FROM public."Task_dependencies" dep WHERE dep.task_id=t.id),');
END $$;
REVOKE ALL ON FUNCTION app_private.process_updated_at(),app_private.process_effective_definition(jsonb),app_private.process_workspace_validate(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
