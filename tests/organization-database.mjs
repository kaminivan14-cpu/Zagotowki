import { spawn } from 'node:child_process'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
// Keep queue fixtures around local noon, independently of the wall-clock test run.
const offset=new Date().getUTCHours()-12,testZone=offset===0?'Etc/UTC':`Etc/GMT${offset>0?'+':''}${offset}`
const container=process.env.TASKS_TEST_CONTAINER || 'zagotowki-tasks-test', database=`organization_${Date.now()}`
export const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
function sql(query,db=database){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));p.stdin.end(query)})}
const as=n=>`SET ROLE authenticated; SET request.jwt.claim.sub='${uid(n)}';`
const command=(n,action,args,op=randomUUID())=>sql(`${as(n)} SELECT public.tasks_command('${action}',${literal(args)},'${op}');`).then(JSON.parse)
const rpc=(n,name,args='')=>sql(`${as(n)} SELECT public.${name}(${args});`).then(JSON.parse)
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
const denied=async(p,pattern)=>{await assert.rejects(p,pattern);checks++}
await sql(`CREATE DATABASE ${database}`,'postgres')
try {
 await sql(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role; CREATE PUBLICATION supabase_realtime;`)
 await sql(`CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT ON storage.objects TO authenticated;`)
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
  if(f==='202610080001_organization_structure.sql') {
   const snapshot=await sql(`SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_private' AND p.proname IN ('task_core','task_scope','task_descendant','task_approver','task_can_read','task_approval_command','task_planning_command','process_command')`)
   await mkdir('tmp/org-structure-v2',{recursive:true});await writeFile('tmp/org-structure-v2/expected-functions.json',snapshot)
   continue
  }
  await sql(await readFile(`supabase/migrations/${f}`,'utf8'))
 }
 await sql(`UPDATE public."Task_module_settings" SET company_timezone='${testZone}';
 INSERT INTO public."Locations"(id,name,active) VALUES(1,'Synthetic A',true),(2,'Synthetic B',true);
 INSERT INTO auth.users(id,email) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'tasks-'||n||'@example.invalid' FROM generate_series(1,11)n;
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) SELECT n,'Synthetic '||n,(ARRAY['owner','administrator','director','manager','expert','specialist','crafter','specialist','specialist','specialist','specialist'])[n],CASE WHEN n IN (4,7) THEN 1 ELSE NULL END,n<>9,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,11)n;
 SELECT setval('public."Employees_id_seq"',100);
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE '${testZone}')::date,'active'); INSERT INTO public."Plan_items"(id,plan_id,nazwa,ilosc,jednostka) VALUES(1,1,'Synthetic',1,'g');`)

 const today=await sql('SELECT app_private.task_today()'), tomorrow=await sql('SELECT app_private.task_today()+1')
 const dep=await sql('SELECT id FROM public."Departments" ORDER BY id LIMIT 1')
 await sql(`UPDATE public."Employees" SET department_id=${dep}; INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(6,4,'2020-01-01'),(4,3,'2020-01-01');`)
 const employeesBefore=await sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public."Employees" e')
 const linesBefore=await sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public."Employee_reporting_lines" e')
 await sql(await readFile('supabase/migrations/202610080001_organization_structure.sql','utf8'))
 eq(await sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public."Employees" e'),employeesBefore)
 eq(await sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public."Employee_reporting_lines" e'),linesBefore)
 await denied(sql(`SET ROLE authenticated;SELECT nextval('public.organization_structure_versions_id_seq')`),/permission denied/)
 const org=(action,args,op=randomUUID(),actor=1)=>sql(`${as(actor)} SELECT public.organization_command('${action}',${literal(args)},'${op}')`).then(JSON.parse)
 const snapshot=await rpc(1,'organization_structure');eq(snapshot.assignments.find(a=>a.employee_id===6).manager_employee_id,4)
 await denied(rpc(4,'organization_structure'),/TASKS_DENIED/)
 await denied(org('create',{name:'No access'},randomUUID(),4),/TASKS_DENIED/)
 for(const t of ['organization_structure_versions','organization_structure_assignments','organization_structure_directors'])await denied(sql(`SET ROLE authenticated;SELECT * FROM public.${t}`),/permission denied/)
 const op=randomUUID(),pair=await Promise.all([org('create',{name:'Future'},op),org('create',{name:'Future'},op)]),draft=pair[0];eq(pair[0],pair[1]);eq(await org('create',{name:'Future'},op),draft)
 let rev=draft.revision
 eq(await sql(`SELECT app_private.org_manager(6,'${today}')`),'4')
 await denied(org('assignment',{id:draft.id,revision:rev,employee_id:6,department_id:Number(dep),manager_employee_id:6}),/REPORTING_CYCLE/)
 await org('assignment',{id:draft.id,revision:rev++,employee_id:6,department_id:Number(dep),manager_employee_id:3})
 await denied(org('assignment',{id:draft.id,revision:1,employee_id:6,manager_employee_id:4}),/ORG_VERSION_CONFLICT/)
 await org('director',{id:draft.id,revision:rev++,department_id:Number(dep),employee_id:3})
 eq(await sql(`SELECT app_private.org_manager(6,'${today}')`),'4')
 // Save an approval before cutover. Its approver and structure version must remain frozen.
 const requested=await command(6,'request_creation',{title:'Pre-change approval',reason:'Synthetic'})
 const oldRequest=JSON.parse(await sql(`SELECT row_to_json(r) FROM public."Task_approval_requests" r WHERE task_id=${requested.id}`))
 eq(oldRequest.approver_employee_id,4)
 const rescheduleId=await sql(`INSERT INTO public."Tasks"(title,status,created_by_employee_id,assigned_to_employee_id,planned_date,estimated_minutes) VALUES('Reschedule','planned',1,6,'${today}',15) RETURNING id`)
 const rescheduleRequest=await sql(`INSERT INTO public."Task_approval_requests"(task_id,request_type,requester_employee_id,approver_employee_id,old_value,requested_value,reason) VALUES(${rescheduleId},'reschedule',6,4,jsonb_build_object('planned_date','${today}'),jsonb_build_object('planned_date','${tomorrow}'),'Synthetic') RETURNING id`)

 await denied(org('schedule',{id:draft.id,revision:rev,effective_from:today}),/ORG_INVALID_DATE/)
 await org('schedule',{id:draft.id,revision:rev++,effective_from:tomorrow})
 eq(await sql(`SELECT app_private.org_manager(6,'${today}')`),'4')
 eq(await sql(`SELECT app_private.org_manager(6,'${tomorrow}')`),'3')
 eq(await sql(`SELECT app_private.org_director(${dep},'${tomorrow}')`),'3')
 await denied(org('assignment',{id:draft.id,revision:rev,employee_id:6,manager_employee_id:4}),/ORG_IMMUTABLE/)
 await denied(command(1,'employee_department',{employee_id:6,department_id:null}),/ORG_USE_VERSION/)
 await denied(command(1,'reporting_save',{employee_id:6,manager_employee_id:4,effective_from:today}),/ORG_USE_VERSION/)
 // Offline clock override only, never deployed to UAT or Production.
 await sql(`CREATE OR REPLACE FUNCTION app_private.task_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${tomorrow}'::date $$`)
 eq(await sql('SELECT app_private.task_approver(6,NULL)'),'3')
 const post=await command(6,'request_creation',{title:'After-change approval',reason:'Synthetic'})
 eq(await sql(`SELECT approver_employee_id FROM public."Task_approval_requests" WHERE task_id=${post.id}`),'3')
 eq(await sql(`SELECT organization_structure_version_id FROM public."Task_approval_requests" WHERE task_id=${post.id}`),String(draft.id))
 eq(await sql(`SELECT approver_employee_id FROM public."Task_approval_requests" WHERE id=${oldRequest.id}`),'4')
 eq(await sql(`SET request.jwt.claim.sub='${uid(4)}'; SELECT app_private.task_scope('tasks.approve',6)`),'f')
 await command(4,'resolve_approval',{request_id:oldRequest.id,decision:'approved'})
 await command(4,'resolve_reschedule',{request_id:Number(rescheduleRequest),decision:'rejected'});checks++
 await sql('SELECT app_private.org_activate_due();SELECT app_private.org_activate_due();')
 eq(await sql(`SELECT count(*) FROM app_private.organization_structure_events WHERE action='activate' AND structure_version_id=${draft.id}`),'1')
 eq(await sql(`SELECT status FROM public.organization_structure_versions WHERE id=${draft.id}`),'active')
 const history=await rpc(1,'organization_structure');eq(history.versions.some(v=>v.effective_status==='archived'),true)
 const definition={name:'Hierarchy review',stages:[{key:'one',name:'Review',tasks:[{key:'review',title:'Review task',priority:'medium',estimated_minutes:1,offset_days:0,depends_on:[],parallel:true,checklist:[],result_type:'approval'}]}]}
 const template=await command(1,'process_create',{definition})
 await command(1,'process_publish',{version_id:template.version_id,revision:1})
 const launched=await command(1,'process_launch',{version_id:template.version_id,starts_on:tomorrow,default_employee_id:6,assignments:{},location_id:1})
 eq(await sql(`SELECT source_metadata->'step'->>'approver_id' FROM public."Tasks" WHERE source_metadata->>'process_instance_id'='${launched.instance_id}'`),'3')
 eq(await sql(`SELECT source_metadata->'step'->>'organization_structure_version_id' FROM public."Tasks" WHERE source_metadata->>'process_instance_id'='${launched.instance_id}'`),String(draft.id))
 const another=await org('create',{name:'Cycle draft'});let r=another.revision
 await org('assignment',{id:another.id,revision:r++,employee_id:3,department_id:Number(dep),manager_employee_id:6})
 await denied(org('schedule',{id:another.id,revision:r,effective_from:await sql('SELECT app_private.task_today()+1')}),/REPORTING_CYCLE/)
 await org('cancel',{id:another.id,revision:r})
 const cancelled=await org('create',{name:'Cancel scheduled'})
 await org('schedule',{id:cancelled.id,revision:1,effective_from:await sql('SELECT app_private.task_today()+1')})
 await org('cancel',{id:cancelled.id,revision:2})
 eq(await sql(`SELECT status FROM public.organization_structure_versions WHERE id=${cancelled.id}`),'cancelled')
 console.log(`Organization PostgreSQL PASS (${checks} checks)`)
}finally{await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
