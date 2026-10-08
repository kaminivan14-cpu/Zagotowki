import { spawn } from 'node:child_process'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
// Keep queue fixtures around local noon, independently of the wall-clock test run.
const offset=new Date().getUTCHours()-12,testZone=offset===0?'Etc/UTC':`Etc/GMT${offset>0?'+':''}${offset}`
const container=process.env.TASKS_TEST_CONTAINER || 'zagotowki-tasks-test', database=`access_${Date.now()}`
export const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function sql(query,db=database){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));p.stdin.end(query)})}
const as=n=>`SET ROLE authenticated; SET request.jwt.claim.sub='${uid(n)}';`
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
  if(f==='202610080002_access_directory.sql')continue
  if(f>'202610080002_access_directory.sql')continue
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

 await sql(await readFile('supabase/migrations/202610080001_organization_structure.sql','utf8'))
 await sql(`UPDATE public."Employees" SET auth_user_id=NULL WHERE id=10;UPDATE public."Employees" SET archived_at=now(),active=false WHERE id=11;INSERT INTO app_private.role_permissions(role,permission) VALUES('employee','production.access') ON CONFLICT DO NOTHING;`)
 const migration=await readFile('supabase/migrations/202610080002_access_directory.sql','utf8')
 const predicate=await sql(`SELECT pg_get_functiondef('app_private.has_permission(text)'::regprocedure)`)
 const authPredicate=await sql(`SELECT pg_get_functiondef('public.auth_capabilities()'::regprocedure)`)
 const production=await readFile('supabase/upgrades/production/06_release_policy.sql','utf8')
 const productionFunctions=production.slice(production.indexOf('CREATE OR REPLACE FUNCTION app_private.has_permission'),production.indexOf('-- Defense at module'))
 const snapshot=async()=>{
  const results=[]
  for(let n=1;n<=11;n++)results.push(await sql(`SET request.jwt.claim.sub='${uid(n)}';SELECT jsonb_build_object('effective',(SELECT jsonb_agg(jsonb_build_array(permission,app_private.has_permission(permission)) ORDER BY permission) FROM (SELECT DISTINCT permission FROM app_private.role_permissions)p),'auth',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM public.auth_capabilities()x))`))
  return results
 }
 for(const mode of ['UAT','Production']){
  if(mode==='Production')await sql(`DROP FUNCTION public.tasks_access_directory();${predicate};${authPredicate};DROP FUNCTION app_private.role_has_permission(text,text);${productionFunctions}`)
  const securityQuery=`SELECT jsonb_build_object('policies',(SELECT jsonb_agg(p ORDER BY schemaname,tablename,policyname) FROM pg_policies p),'grants',(SELECT jsonb_agg(g ORDER BY table_schema,table_name,grantee,privilege_type) FROM information_schema.table_privileges g WHERE table_schema IN ('public','app_private')),'permission_acl',(SELECT proacl::text FROM pg_proc WHERE oid='app_private.has_permission(text)'::regprocedure))`
  const securityBefore=await sql(securityQuery)
  const before=await snapshot()
  const employees=await sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public."Employees"e')
  const permissionRows=await sql('SELECT jsonb_agg(to_jsonb(p) ORDER BY role,permission) FROM app_private.role_permissions p')
  await sql(migration)
  eq(await snapshot(),before)
  eq(await sql(securityQuery),securityBefore)
  eq(await sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public."Employees"e'),employees)
  eq(await sql('SELECT jsonb_agg(to_jsonb(p) ORDER BY role,permission) FROM app_private.role_permissions p'),permissionRows)
  const access=await rpc(2,'tasks_access_directory')
  for(const employee of access.employees){
   const expected=JSON.parse(before[employee.id-1]).auth
   eq(employee.capabilities,expected)
  }
  eq(access.roles.find(r=>r.role==='employee').user_count,0)
  for(const role of access.roles){
   const expected=JSON.parse(await sql(`SELECT coalesce(jsonb_agg(permission ORDER BY permission),'[]') FROM app_private.role_permissions WHERE role='${role.role}' AND app_private.role_has_permission(role,permission)`))
   eq(role.capabilities,expected)
  }
  if(mode==='Production'){
   eq(access.roles.find(r=>r.role==='crafter').capabilities.some(c=>c.startsWith('tasks.')),false)
   eq(access.roles.find(r=>r.role==='administrator').capabilities.includes('orders.test.generate'),false)
  }
  await denied(rpc(7,'tasks_access_directory'),/TASKS_DENIED/)
  await denied(sql('SET ROLE anon;SELECT public.tasks_access_directory()'),/permission denied/)
  await denied(sql("SET ROLE authenticated;SELECT app_private.role_has_permission('administrator','tasks.admin')"),/permission denied/)
  eq(await sql(`SELECT has_function_privilege('service_role','public.tasks_access_directory()','EXECUTE')`),'f')
 }
 console.log(`Access PostgreSQL PASS (${checks} checks; UAT and Production policies preserved)`)
}finally{await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
