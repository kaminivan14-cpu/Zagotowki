-- Roll back fixtures, identities, Tasks, versions, events and snapshots together.
BEGIN;
INSERT INTO public."Locations"(id,name,active) VALUES(-261400,'PR14 SMOKE',true);
INSERT INTO auth.users(id,email) VALUES('26140000-0000-4000-8000-000000000001','pr14-admin@example.invalid'),('26140000-0000-4000-8000-000000000002','pr14-worker@example.invalid');
INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id,position) VALUES(-261401,'PR14 SMOKE ADMIN','administrator',-261400,true,'26140000-0000-4000-8000-000000000001','Smoke Chef'),(-261402,'PR14 SMOKE WORKER','specialist',-261400,true,'26140000-0000-4000-8000-000000000002','  smoke   chef  ');
DO $smoke$
DECLARE doc jsonb;v jsonb;instance jsonb;result jsonb;today date;step_key uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('request.jwt.claim.sub','26140000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 PERFORM public.tasks_command('admin_employee_save',jsonb_build_object('id',-261402,'name','PR14 SMOKE WORKER','role','specialist','active',true,'location_id',-261400,'position','  Smoke   Chef '),gen_random_uuid());
 result:=public.tasks_admin_directory();
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(result->'employees') e WHERE e->>'id'='-261402' AND e->>'position'='Smoke Chef' AND e->>'role'='specialist') THEN RAISE EXCEPTION 'EMPLOYEE_POSITION_SAVE_FAILED';END IF;
 today:=(public.tasks_context()->>'today')::date;
 doc:=jsonb_build_object('schema_version',3,'name','PR14 SMOKE PROCESS','goal','Smoke','instruction','Smoke','expected_result','Smoke','responsible_position','Smoke Chef','involved_positions',jsonb_build_array('Smoke Chef'),'launch_type','manual','stages',jsonb_build_array(jsonb_build_object('key',gen_random_uuid(),'name','Smoke stage','tasks',jsonb_build_array(jsonb_build_object('key',step_key,'title','PR14 SMOKE TASK','responsible_position','Smoke Chef','priority','medium','estimated_minutes',30,'result_type','done','checklist',jsonb_build_array('Smoke item'),'depends_on','[]'::jsonb,'raci',jsonb_build_object('accountable','[]'::jsonb,'consulted','[]'::jsonb,'informed','[]'::jsonb))))));
 v:=public.tasks_command('process_create',jsonb_build_object('definition',doc),gen_random_uuid());
 PERFORM public.tasks_command('process_publish',jsonb_build_object('version_id',v->'version_id','revision',1),gen_random_uuid());
 instance:=public.tasks_command('process_launch',jsonb_build_object('version_id',v->'version_id','name','PR14 SMOKE LAUNCH','starts_on',today,'deadline',today,'position_assignments',jsonb_build_object('Smoke Chef',-261402)),gen_random_uuid());
 RESET ROLE;
 IF NOT EXISTS(SELECT FROM public."Process_instances" WHERE id=(instance->>'instance_id')::bigint AND execution_snapshot->>'schema_version'='3' AND execution_snapshot->>'responsible_position'='Smoke Chef') THEN RAISE EXCEPTION 'POSITION_SNAPSHOT_FAILED';END IF;
 PERFORM set_config('request.jwt.claim.sub','26140000-0000-4000-8000-000000000002',true);
 SET LOCAL ROLE authenticated;
 result:=public.tasks_list('{}'::jsonb);
 IF (result->>'total')::integer<>1 OR result->'items'->0->>'title'<>'PR14 SMOKE TASK' OR jsonb_array_length(result->'items'->0->'checklist')<>1 THEN RAISE EXCEPTION 'TASK_LIST_SCOPE_FAILED';END IF;
 IF jsonb_array_length(public.tasks_list())<>1 THEN RAISE EXCEPTION 'LEGACY_TASK_LIST_FAILED';END IF;
 RESET ROLE;
END $smoke$;
SELECT 'PR14_POSITION_LAUNCH_AND_TASK_SCOPE_PASS' result;
ROLLBACK;
