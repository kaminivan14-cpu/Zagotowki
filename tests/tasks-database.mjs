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

 // Approvals, checklist and planning run against actual PostgreSQL permissions.
 const request=await command(6,'request_creation',{title:'Запит керівнику',reason:'Потрібна допомога'})
 eq(request.status,'pending_approval')
 const requests=await rpc(4,'tasks_approvals')
 eq(requests.length,1)
 const approved=await command(4,'resolve_approval',{request_id:requests[0].id,decision:'approved'})
 eq(approved.status,'unplanned')
 const checklist=await command(6,'checklist_add',{task_id:task.id,version:2,text:'Перевірено'})
 eq(checklist.version,3)
 const detail=await rpc(6,'tasks_details',task.id)
 eq(detail.checklist.length,1)
 await command(6,'checklist_toggle',{task_id:task.id,version:3,item_id:detail.checklist[0].id,completed:true})
 const today=(await rpc(6,'tasks_context')).today
 const dayAdd=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
 for(const n of [4,6,8]) await command(1,'schedule_save',{employee_id:n,type:'work',starts_at:dayAdd(today,-1)+'T00:00:00Z',ends_at:dayAdd(today,5)+'T23:59:00Z'})
 await command(1,'capacity_save',{employee_id:6,effective_from:today,daily_task_capacity_minutes:360})
 let planned=await command(6,'plan',{task_id:task.id,version:4,planned_date:today})
 eq(planned.status,'planned')
 const calendar=await rpc(6,'tasks_planning',`6,'${today}','${dayAdd(today,6)}'`)
 eq(calendar.days.length,7)
 eq(calendar.days[0].capacity_minutes,360)
 eq(calendar.days[0].planned_minutes,30)
 await denied(rpc(8,'tasks_planning',`6,'${today}','${today}'`),/TASKS_DENIED/)
 await command(1,'schedule_save',{employee_id:6,type:'vacation',starts_at:dayAdd(today,2)+'T00:00:00Z',ends_at:dayAdd(today,4)+'T00:00:00Z'})
 const vacation=await rpc(6,'tasks_planning',`6,'${dayAdd(today,3)}','${dayAdd(today,3)}'`)
 eq(vacation.days[0].capacity_minutes,0)
 await denied(command(6,'plan',{task_id:task.id,version:planned.version,planned_date:dayAdd(today,3)}),/NO_AVAILABILITY/)
 // Parallel browser requests return one running task and one open interval.
 const next=await Promise.all([command(6,'next',{}),command(6,'next',{})])
 eq(next[0].id,next[1].id)
 eq(await sql('SELECT count(*) FROM public."Task_work_sessions" WHERE employee_id=6 AND ended_at IS NULL'),'1')
 eq((await rpc(6,'tasks_work_state')).current.id,task.id)
 const critical=await command(6,'create',{title:'Негайно',urgency:'critical_now',estimated_minutes:2})
 const interrupt=await command(6,'critical_start',{task_id:critical.id,version:1})
 eq(interrupt.status,'in_progress')
 eq((await rpc(6,'tasks_details',task.id)).task.status,'paused')
 const nested=await command(6,'create',{title:'Ще критичніше',urgency:'critical_now',estimated_minutes:1})
 await command(6,'critical_start',{task_id:nested.id,version:1})
 let back=await command(6,'complete',{task_id:nested.id,version:2})
 eq(back.id,critical.id)
 back=await command(6,'complete',{task_id:critical.id,version:back.version})
 eq(back.id,task.id)
 const declined=await command(6,'create',{title:'Зачекає',urgency:'critical_now',estimated_minutes:2})
 await denied(command(6,'critical_decline',{task_id:declined.id,version:1,reason:''}),/REASON_REQUIRED/)
 await command(6,'critical_decline',{task_id:declined.id,version:1,reason:'Зустріч'})
 eq((await rpc(6,'tasks_work_state')).critical.find(t=>t.id===declined.id).acknowledged,true)
 const beforeCompletion=await rpc(6,'tasks_details',task.id)
 await command(6,'complete',{task_id:task.id,version:beforeCompletion.task.version})
 eq((await rpc(6,'tasks_details',task.id)).task.status,'completed')

 // Balancer chooses the lowest priority, honors permissions/deadlines and logs dates.
 await command(1,'settings_save',{company_timezone:'Europe/Warsaw',default_daily_task_capacity_minutes:360,planning_horizon_days:60,load_balancer_enabled:true})
 const low=await command(8,'create',{title:'Низький',priority:'low',estimated_minutes:200})
 const high=await command(8,'create',{title:'Високий',priority:'high',estimated_minutes:200})
 await command(8,'plan',{task_id:low.id,version:1,planned_date:today})
 await command(8,'plan',{task_id:high.id,version:1,planned_date:today})
 const balance=await Promise.all([command(8,'balance',{date:today}),command(8,'balance',{date:today})])
 eq(balance.reduce((n,r)=>n+r.moved,0),1)
 eq((await rpc(8,'tasks_details',low.id)).task.planned_date,dayAdd(today,1))
 eq((await rpc(8,'tasks_details',high.id)).task.planned_date,today)
 const movedEvent=(await rpc(8,'tasks_details',low.id)).events.find(e=>e.event_type==='TASK_AUTO_RESCHEDULED')
 eq(movedEvent.metadata.old_date,today);eq(movedEvent.metadata.new_date,dayAdd(today,1))
 const report=await rpc(6,'tasks_report',`6,'${today}','${today}'`)
 eq(report.tasks.find(t=>t.id===task.id).status,'completed')
 assert.ok(Number(report.tasks.find(t=>t.id===task.id).period_actual_minutes)>=0);checks++
 await denied(rpc(4,'tasks_report',`8,'${today}','${today}'`),/TASKS_DENIED/)
 const template=await command(1,'recurring_save',{title:'Щотижня',assigned_to_employee_id:8,estimated_minutes:20,starts_on:today,every_days:7})
 await command(1,'recurring_generate',{template_id:template.id})
 const generated=await sql(`SELECT count(*) FROM public."Tasks" WHERE source_namespace='recurring:${template.id}'`)
 await command(1,'recurring_generate',{template_id:template.id})
 eq(await sql(`SELECT count(*) FROM public."Tasks" WHERE source_namespace='recurring:${template.id}'`),generated)
 eq(await sql('SELECT count(*) FROM public."Tasks" t WHERE version<>(SELECT max(task_version) FROM public."Task_events" WHERE task_id=t.id)'),'0')
 console.log(`Tasks PostgreSQL PASS (${checks} checks)`)
} finally {await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
