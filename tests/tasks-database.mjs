import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const container=process.env.TASKS_TEST_CONTAINER || 'zagotowki-tasks-test', database=`tasks_${Date.now()}`
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
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await sql(await readFile(`supabase/migrations/${f}`,'utf8'))
 await sql(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'Synthetic A',true),(2,'Synthetic B',true);
 INSERT INTO auth.users(id,email) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'tasks-'||n||'@example.invalid' FROM generate_series(1,9)n;
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) SELECT n,'Synthetic '||n,(ARRAY['owner','administrator','director','manager','expert','specialist','crafter','specialist','specialist'])[n],CASE WHEN n IN (4,7) THEN 1 ELSE NULL END,n<>9,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,9)n;
 SELECT setval('public."Employees_id_seq"',100);
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active'); INSERT INTO public."Plan_items"(id,plan_id,nazwa,ilosc,jednostka) VALUES(1,1,'Synthetic',1,'g');`)
 for(const n of [1,2,3,4,5,6]) eq((await rpc(n,'tasks_context')).employee_id,n)
 for(const n of [7,9]) await denied(rpc(n,'tasks_context'),/TASKS_DENIED|Brak aktywnego/)
 for(const n of [3,5,6]){
  eq((await sql(`${as(n)} SELECT public.auth_capabilities();`)).includes('production.access'),false)
  await denied(sql(`${as(n)} SELECT public.start_plan_item(${n},1);`),/PRODUCTION_DENIED/)
  eq(await sql(`${as(n)} SELECT count(*) FROM public."Products"`),'0')
  await denied(rpc(n,'orders_catalog'),/ORDERS_DENIED/)
 }
 eq((await sql(`${as(1)} SELECT public.auth_capabilities();`)).includes('orders.access'),true)
 eq((await sql(`${as(4)} SELECT public.auth_capabilities();`)).includes('production.access'),true)
 await sql(`${as(1)} SELECT public.auth_save_employee(NULL,'Synthetic director','director',NULL,true);`)
 const op=randomUUID(),args={title:'Перевірити звіт',estimated_minutes:30}
 const task=await command(6,'create',args,op)
 eq(await command(6,'create',args,op),task)
 await denied(command(6,'create',{title:'Інша'},op),/OPERATION_CONFLICT/)
 eq((await rpc(8,'tasks_list')).length,0)
 await denied(command(6,'create',{title:'Чуже',assigned_to_employee_id:8}),/TASKS_DENIED/)
 await denied(sql(`${as(6)} UPDATE public."Task_events" SET event_type='x';`),/permission denied/)
 await denied(sql(`${as(6)} DELETE FROM public."Task_events";`),/permission denied/)
 await denied(sql(`${as(7)} SELECT * FROM public."Tasks";`),/permission denied/)
 const updated=await command(6,'update',{task_id:task.id,version:task.version,title:'Оновлено'})
 eq(updated.version,2)
 await denied(command(6,'update',{task_id:task.id,version:1,title:'Застаріле'}),/TASK_VERSION_CONFLICT/)
 const second=await command(6,'create',{title:'Залежна'})
 const dep=await command(6,'dependency',{task_id:second.id,version:1,depends_on_task_id:task.id})
 await denied(command(6,'dependency',{task_id:task.id,version:2,depends_on_task_id:second.id}),/DEPENDENCY_CYCLE/)
 eq(dep.version,2)
 await sql(`INSERT INTO public."Task_scope_grants"(grantee_employee_id,permission,scope_type,employee_id) VALUES(5,'tasks.assign','employee',8);`)
 const delegated=await command(5,'create',{title:'Делеговано',assigned_to_employee_id:8})
 eq(delegated.assigned_to_employee_id,8)
 const privateTask=await command(8,'create',{title:'Приватне'})
 eq((await rpc(5,'tasks_list')).some(t=>t.id===privateTask.id),false)
 await sql(`INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(6,4,CURRENT_DATE);`)
 await denied(sql(`INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(4,6,CURRENT_DATE);`),/REPORTING_CYCLE/)
 eq(await sql('SELECT count(*) FROM public."Task_events" e JOIN public."Tasks" t ON t.id=e.task_id WHERE e.task_version>t.version'),'0')
 console.log(`Tasks PostgreSQL PASS (${checks} checks)`)
} finally {await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
