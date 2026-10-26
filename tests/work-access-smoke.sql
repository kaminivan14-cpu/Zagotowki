-- Synthetic identities only; callers must roll back this entire fixture.
BEGIN;
INSERT INTO public."Locations"(id,name,active) VALUES(-261001,'WORK-ACCESS-SMOKE',true);
INSERT INTO auth.users(id,email) VALUES('26100000-0000-4000-8000-000000000001','work-access-smoke@example.invalid');
INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(-261001,'WORK ACCESS SMOKE','administrator',-261001,true,'26100000-0000-4000-8000-000000000001');
DO $test$
DECLARE role_name text; caps text[]; people jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','26100000-0000-4000-8000-000000000001',true);
 FOR role_name IN SELECT unnest(ARRAY['administrator','manager','owner','director','expert','specialist']) LOOP
  UPDATE public."Employees" SET role=role_name WHERE id=-261001;
  SET LOCAL ROLE authenticated;
  SELECT array_agg(x) INTO caps FROM public.auth_capabilities() x;
  IF NOT coalesce('tasks.access'=ANY(caps),false) THEN RAISE EXCEPTION 'MODULE DENIED: %',role_name; END IF;
  PERFORM public.tasks_context();PERFORM public.tasks_execution_state();
  people:=public.tasks_assignable_people();
  IF role_name IN ('owner','director','expert','specialist') THEN
   IF caps && ARRAY['tasks.admin','tasks.assign','tasks.plan.scope','tasks.report.scope','processes.read'] THEN RAISE EXCEPTION 'EXCESS CAPABILITIES: %',role_name; END IF;
   IF EXISTS(SELECT FROM jsonb_array_elements(people) e WHERE (e->>'id')::bigint<>-261001) THEN RAISE EXCEPTION 'SCOPE LEAK: %',role_name;END IF;
   BEGIN PERFORM public.tasks_admin_directory();RAISE EXCEPTION 'ADMIN ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   BEGIN PERFORM public.tasks_processes();RAISE EXCEPTION 'PROCESSES ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  END IF;
  RESET ROLE;
 END LOOP;
 UPDATE public."Employees" SET active=false WHERE id=-261001;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.tasks_context();RAISE EXCEPTION 'INACTIVE ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
END $test$;
SELECT 'SIX_ROLES_WORK_ACCESS_SCOPE_PASS' result;
ROLLBACK;
