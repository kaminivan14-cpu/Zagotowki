import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
// Keep queue fixtures around local noon, independently of the wall-clock test run.
const offset=new Date().getUTCHours()-12,testZone=offset===0?'Etc/UTC':`Etc/GMT${offset>0?'+':''}${offset}`
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
 await sql(`UPDATE public."Task_module_settings" SET company_timezone='${testZone}';
 INSERT INTO public."Locations"(id,name,active) VALUES(1,'Synthetic A',true),(2,'Synthetic B',true);
 INSERT INTO auth.users(id,email) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'tasks-'||n||'@example.invalid' FROM generate_series(1,11)n;
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) SELECT n,'Synthetic '||n,(ARRAY['owner','administrator','director','manager','expert','specialist','crafter','specialist','specialist','specialist','specialist'])[n],CASE WHEN n IN (4,7) THEN 1 ELSE NULL END,n<>9,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,11)n;
 SELECT setval('public."Employees_id_seq"',100);
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE '${testZone}')::date,'active'); INSERT INTO public."Plan_items"(id,plan_id,nazwa,ilosc,jednostka) VALUES(1,1,'Synthetic',1,'g');`)
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
 for(const n of [4,6,8,10,11]) await command(1,'schedule_save',{employee_id:n,type:'work',starts_at:dayAdd(today,-1)+'T00:00:00Z',ends_at:dayAdd(today,5)+'T23:59:00Z'})
 await command(1,'capacity_save',{employee_id:6,effective_from:today,daily_task_capacity_minutes:360})
 let planned=await command(6,'plan',{task_id:task.id,version:4,planned_date:today})
 eq(planned.status,'planned')
 const calendar=await rpc(6,'tasks_planning',`6,'${today}','${dayAdd(today,6)}'`)
 eq(calendar.days.length,7)
 eq(calendar.days[0].capacity_minutes,360)
 eq(calendar.days[0].planned_minutes,30)
 await denied(rpc(8,'tasks_planning',`6,'${today}','${today}'`),/TASKS_DENIED/)
 await command(1,'schedule_save',{employee_id:6,type:'vacation',starts_at:dayAdd(today,2)+'T00:00:00Z',ends_at:dayAdd(today,5)+'T00:00:00Z'})
 const vacation=await rpc(6,'tasks_planning',`6,'${dayAdd(today,3)}','${dayAdd(today,3)}'`)
 eq(vacation.days[0].capacity_minutes,0)
 await denied(command(6,'plan',{task_id:task.id,version:planned.version,planned_date:dayAdd(today,3)}),/NO_AVAILABILITY/)
 // Parallel browser requests return one running task and one open interval.
 const next=await Promise.all([command(6,'next',{}),command(6,'next',{})])
 eq(next[0].id,next[1].id)
 eq(await sql('SELECT count(*) FROM public."Task_work_sessions" WHERE employee_id=6 AND ended_at IS NULL'),'1')
 eq((await rpc(6,'tasks_work_state')).current.id,task.id)
 const critical=await command(6,'create',{title:'Негайно',urgency:'critical_now',estimated_minutes:2})
 const interrupt=await command(6,'critical_start',{task_id:critical.id,version:critical.version})
 eq(interrupt.status,'in_progress')
 eq((await rpc(6,'tasks_details',task.id)).task.status,'paused')
 const nested=await command(6,'create',{title:'Ще критичніше',urgency:'critical_now',estimated_minutes:1})
 await command(6,'critical_start',{task_id:nested.id,version:nested.version})
 let back=await command(6,'complete',{task_id:nested.id,version:nested.version+1})
 eq(back.id,critical.id)
 back=await command(6,'complete',{task_id:critical.id,version:back.version})
 eq(back.id,task.id)
 const declined=await command(6,'create',{title:'Зачекає',urgency:'critical_now',estimated_minutes:2})
 await denied(command(6,'critical_decline',{task_id:declined.id,version:declined.version,reason:''}),/REASON_REQUIRED/)
 await command(6,'critical_decline',{task_id:declined.id,version:declined.version,reason:'Зустріч'})
 eq((await rpc(6,'tasks_work_state')).critical.find(t=>t.id===declined.id).acknowledged,true)
 const beforeCompletion=await rpc(6,'tasks_details',task.id)
 await command(6,'complete',{task_id:task.id,version:beforeCompletion.task.version})
 eq((await rpc(6,'tasks_details',task.id)).task.status,'completed')

 // Balancer chooses the lowest priority, honors permissions/deadlines and logs dates.
 await command(1,'settings_save',{company_timezone:testZone,default_daily_task_capacity_minutes:360,planning_horizon_days:60,load_balancer_enabled:true})
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

 // Separate assignment, reading, and approval scopes; unknown duration is explicit.
 await denied(command(7,'create',{title:'Недоступно'}),/TASKS_DENIED/)
 await denied(command(9,'create',{title:'Неактивний'}),/Brak aktywnego/)
 await denied(command(1,'create',{title:'Без модуля',assigned_to_employee_id:7}),/INVALID_ASSIGNEE/)
 await denied(command(6,'create',{title:'Підміна',created_by_employee_id:1}),/INVALID_ARGUMENTS/)
 await denied(command(6,'create',{title:'Підміна джерела',source_type:'manager'}),/INVALID_ARGUMENTS/)
 const unknown=await command(10,'create',{title:'Без оцінки',planned_date:today})
 const unknownPlan=await rpc(10,'tasks_planning',`10,'${today}','${today}'`)
 eq(unknownPlan.days[0].unknown_count,1)
 eq(unknownPlan.tasks[0].estimated_minutes,null)
 eq(await command(10,'next',{}),null)
 const assignable=await rpc(6,'tasks_assignable_people')
 eq(assignable.length,1)
 const managed=await command(4,'create',{title:'Від керівника',assigned_to_employee_id:6,estimated_minutes:20,planned_date:today})
 eq(managed.requires_reschedule_approval,true)
 const requestMove=await command(6,'plan',{task_id:managed.id,version:managed.version,planned_date:dayAdd(today,1),reason:'Інші пріоритети'})
 eq(requestMove.planned_date,today)
 const moveApproval=(await rpc(4,'tasks_approvals')).find(r=>r.task_id===managed.id)
 await denied(command(5,'resolve_reschedule',{request_id:moveApproval.id,decision:'approved'}),/TASKS_DENIED/)
 const approvedMove=await command(4,'resolve_reschedule',{request_id:moveApproval.id,decision:'approved'})
 eq(approvedMove.planned_date,dayAdd(today,1))
 // Unknown duration and blocked dependencies never enter the queue.
 const precursor=await command(10,'create',{title:'Передумова',estimated_minutes:10})
 const dependent=await command(10,'create',{title:'Залежить',urgency:'critical_now',estimated_minutes:2})
 await command(10,'dependency',{task_id:dependent.id,version:dependent.version,depends_on_task_id:precursor.id})
 const ordinary=await command(10,'create',{title:'Звичайне',estimated_minutes:20,planned_date:today})
 const urgent=await command(10,'create',{title:'Сьогодні',urgency:'critical_today',estimated_minutes:10})
 eq((await command(10,'next',{})).id,urgent.id)
 let nowTask=(await rpc(10,'tasks_work_state')).current
 const afterUrgent=await command(10,'complete',{task_id:nowTask.id,version:nowTask.version})
 eq(afterUrgent.id,ordinary.id)
 const endDay=await command(10,'end_of_day',{task_id:afterUrgent.id,version:afterUrgent.version})
 eq(endDay,null)
 assert.ok((await rpc(10,'tasks_details',ordinary.id)).task.not_before_at);checks++
 // A meeting creates a short current window: long work is not started.
 const nowMs=Date.now(),meetingStart=new Date(nowMs+15*60000).toISOString(),meetingEnd=new Date(nowMs+120*60000).toISOString()
 await command(1,'schedule_save',{employee_id:11,type:'meeting',starts_at:meetingStart,ends_at:meetingEnd})
 const long=await command(11,'create',{title:'Довге',estimated_minutes:120,priority:'high',planned_date:today})
 const short=await command(11,'create',{title:'Коротке',estimated_minutes:5,priority:'low',planned_date:today})
 eq((await command(11,'next',{})).id,short.id)
 eq((await rpc(11,'tasks_details',long.id)).task.status,'planned')
 const running=(await rpc(11,'tasks_work_state')).current
 await command(11,'complete',{task_id:running.id,version:running.version})
 // Hard deadline outranks business priority when both fit the current window.
 const deadline=await command(11,'create',{title:'Дедлайн',estimated_minutes:2,deadline_is_hard:true,deadline_at:new Date(nowMs+10*60000).toISOString(),planned_date:today})
 const priority=await command(11,'create',{title:'Пріоритет',estimated_minutes:2,priority:'critical',planned_date:today})
 eq((await command(11,'next',{})).id,deadline.id)
 const rd=(await rpc(11,'tasks_work_state')).current
 await command(11,'complete',{task_id:rd.id,version:rd.version})
 const rp=(await rpc(11,'tasks_work_state')).current
 eq(rp.id,priority.id)
 await command(11,'complete',{task_id:rp.id,version:rp.version})
 // Dependency graph and category hierarchy reject cycles in the real database.
 const cat=await command(1,'category_save',{name:'Тестова категорія'})
 const child=await command(1,'category_save',{name:'Підкатегорія',parent_id:cat.id})
 await denied(command(1,'category_save',{id:cat.id,name:'Тестова категорія',parent_id:child.id}),/PARENT_CYCLE/)
 await denied(sql(`UPDATE public."Task_events" SET event_type='changed' WHERE task_id=${unknown.id}`),/APPEND_ONLY/)
 // Disallowed auto-moves become recommendations, not silent changes.
 const restricted=await command(4,'create',{title:'Не переносити мовчки',assigned_to_employee_id:6,estimated_minutes:400,planned_date:today})
 await command(6,'balance',{date:today})
 eq((await rpc(6,'tasks_details',restricted.id)).task.planned_date,today)
 // No task can be scheduled after a hard deadline even by the owner.
 const hard=await command(8,'create',{title:'Жорстко',estimated_minutes:10,deadline_is_hard:true,deadline_at:today+'T23:00:00Z'})
 await denied(command(8,'plan',{task_id:hard.id,version:hard.version,planned_date:dayAdd(today,2)}),/DEADLINE_CONFLICT/)
 const cancel=await command(8,'cancel',{task_id:hard.id,version:hard.version});eq(cancel.status,'cancelled')
 // Concurrent complete uses optimistic versioning, with exactly one winner.
 const work=(await rpc(10,'tasks_details',ordinary.id)).task
 await command(10,'update',{task_id:work.id,version:work.version,title:'Змінено'})
 const race=await Promise.allSettled([command(8,'update',{task_id:high.id,version:2,title:'Перша'}),command(8,'update',{task_id:high.id,version:2,title:'Друга'})])
 eq(race.filter(r=>r.status==='fulfilled').length,1)
 eq(race.filter(r=>r.status==='rejected').length,1)
 eq(await sql('SELECT count(*) FROM public."Tasks" t WHERE version<>(SELECT max(task_version) FROM public."Task_events" WHERE task_id=t.id)'),'0')

 const smallRestricted=await command(4,'create',{title:'Потребує погодження',assigned_to_employee_id:6,estimated_minutes:60,planned_date:today})
 await command(6,'balance',{date:today})
 const recommendation=(await rpc(6,'tasks_recommendations',6)).find(r=>r.task_id===smallRestricted.id)
 assert.ok(recommendation);checks++
 eq((await rpc(6,'tasks_details',smallRestricted.id)).task.planned_date,today)
 await command(6,'recommendation_resolve',{id:recommendation.id,decision:'approved'})
 const fromRecommendation=(await rpc(4,'tasks_approvals')).find(r=>r.task_id===smallRestricted.id)
 assert.ok(fromRecommendation);checks++
 await command(4,'resolve_reschedule',{request_id:fromRecommendation.id,decision:'rejected'})
 eq((await rpc(6,'tasks_details',smallRestricted.id)).task.planned_date,today)
 // Filling an underloaded day proposes work but does not silently plan it.
 await command(10,'balance',{date:dayAdd(today,1)})
 eq((await rpc(10,'tasks_details',precursor.id)).task.planned_date,null)
 assert.ok((await rpc(10,'tasks_recommendations',10)).some(r=>r.recommendation_type==='add_unplanned'));checks++
 // A period page never drops older unplanned records between planned records.
 const countBefore=Number(await sql('SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=8'))
 await sql(`INSERT INTO public."Tasks"(title,assigned_to_employee_id,created_by_employee_id) SELECT 'Synthetic pagination '||n,8,8 FROM generate_series(1,105)n;`)
 const page1=await rpc(8,'tasks_planning',`8,'${today}','${dayAdd(today,10)}'`)
 assert.ok(page1.next_cursor);checks++
 const page2=await rpc(8,'tasks_planning',`8,'${today}','${dayAdd(today,10)}',${page1.next_cursor}`)
 eq(new Set([...page1.tasks,...page1.unplanned,...page2.tasks,...page2.unplanned].map(t=>t.id)).size,[...page1.tasks,...page1.unplanned,...page2.tasks,...page2.unplanned].length)
 assert.ok([...page1.unplanned,...page2.unplanned].length>=105);checks++
 eq(Number(await sql('SELECT count(*) FROM public."Tasks" WHERE assigned_to_employee_id=8')),countBefore+105)

 const teamSchedule=await rpc(4,'tasks_team_schedule',`'${today}','${dayAdd(today,4)}'`)
 assert.ok(teamSchedule.length>0);checks++
 eq(teamSchedule.every(e=>[4,6].includes(e.employee_id)),true)
 await denied(rpc(6,'tasks_team_schedule',`'${today}','${today}'`),/TASKS_DENIED/)
 // Explicit manual actions share existing scope, locking, events and idempotency.
 const manual=await command(8,'create',{title:'Manual future completion',estimated_minutes:15,planned_date:dayAdd(today,10)})
 await denied(command(8,'start_task',{task_id:manual.id,version:manual.version}),/TASK_NOT_READY/)
 await denied(command(6,'mark_completed',{task_id:manual.id,version:manual.version,confirmed:true}),/TASKS_DENIED/)
 await denied(command(8,'mark_completed',{task_id:manual.id,version:manual.version,confirmed:false}),/COMPLETION_CONFIRMATION_REQUIRED/)
 const manualItem=await command(8,'checklist_add',{task_id:manual.id,version:manual.version,text:'Done first'})
 await denied(command(8,'mark_completed',{task_id:manual.id,version:manualItem.version,confirmed:true}),/CHECKLIST_INCOMPLETE/)
 const manualDetail=await rpc(8,'tasks_details',manual.id)
 const checked=await command(8,'checklist_toggle',{task_id:manual.id,version:manualItem.version,item_id:manualDetail.checklist[0].id,completed:true})
 const manualOp=randomUUID(),manualArgs={task_id:manual.id,version:checked.version,confirmed:true}
 const manualDone=await command(8,'mark_completed',manualArgs,manualOp)
 eq(manualDone.status,'completed');eq(Number(manualDone.actual_minutes),0)
 eq(await command(8,'mark_completed',manualArgs,manualOp),manualDone)
 eq(await sql(`SELECT count(*) FROM public."Task_work_sessions" WHERE task_id=${manual.id}`),'0')
 const pre=await command(8,'create',{title:'Prerequisite'}),blocked=await command(8,'create',{title:'Needs prerequisite'})
 const bound=await command(8,'dependency',{task_id:blocked.id,version:blocked.version,depends_on_task_id:pre.id})
 await denied(command(8,'mark_completed',{task_id:blocked.id,version:bound.version,confirmed:true}),/DEPENDENCY_INCOMPLETE/)
 const chosen=await command(8,'create',{title:'Chosen start',estimated_minutes:1,planned_date:today})
 const startedChosen=await command(8,'start_task',{task_id:chosen.id,version:chosen.version})
 eq(startedChosen.status,'in_progress')
 eq(await sql(`SELECT count(*) FROM public."Task_work_sessions" WHERE task_id=${chosen.id} AND ended_at IS NULL`),'1')
 const other=await command(8,'create',{title:'Other own task',estimated_minutes:1,planned_date:today})
 await denied(command(8,'start_task',{task_id:other.id,version:other.version}),/ACTIVE_TASK_EXISTS/)
 await command(8,'mark_completed',{task_id:other.id,version:other.version,confirmed:true})
 eq((await rpc(8,'tasks_work_state')).current.id,chosen.id)
 const pausedChosen=await command(8,'pause',{task_id:chosen.id,version:startedChosen.version})
 const completedPaused=await command(8,'mark_completed',{task_id:chosen.id,version:pausedChosen.version,confirmed:true})
 eq(completedPaused.actual_minutes,pausedChosen.actual_minutes)
 const raceTask=await command(8,'create',{title:'Completion concurrency'})
 const raceResults=await Promise.allSettled([command(8,'mark_completed',{task_id:raceTask.id,version:1,confirmed:true}),command(8,'mark_completed',{task_id:raceTask.id,version:1,confirmed:true})])
 eq(raceResults.filter(r=>r.status==='fulfilled').length,1)
 eq(await sql(`SELECT count(*) FROM public."Task_events" WHERE task_id=${raceTask.id} AND event_type='TASK_COMPLETED'`),'1')
 // Shared implicit availability: fixtures on an otherwise empty employee/day.
 const freeDay=dayAdd(today,20),cap=()=>rpc(8,'tasks_schedule_capacity',`8,'${freeDay}','${freeDay}'`)
 const beforeDefault=await sql('SELECT count(*) FROM public."Schedule_events"')
 eq((await cap())[0].capacity_minutes,360)
 eq(await sql('SELECT count(*) FROM public."Schedule_events"'),beforeDefault)
 eq((await rpc(8,'tasks_planning',`8,'${freeDay}','${freeDay}'`)).days[0].capacity_minutes,360)
 const event=async(type,start,end)=>{await sql(`DELETE FROM public."Schedule_events" WHERE employee_id=8 AND starts_at>= '${freeDay}'::date-1; INSERT INTO public."Schedule_events"(employee_id,type,starts_at,ends_at,created_by_employee_id) VALUES(8,'${type}','${freeDay} ${start}'::timestamp AT TIME ZONE '${testZone}','${freeDay} ${end}'::timestamp AT TIME ZONE '${testZone}',1);`)}
 await event('day_off','00:00','24:00');eq((await cap())[0].capacity_minutes,0)
 await event('vacation','00:00','24:00');eq((await cap())[0].capacity_minutes,0)
 await event('absence','10:00','12:00');eq((await cap())[0].capacity_minutes,240)
 await event('absence','00:00','24:00');eq((await cap())[0].capacity_minutes,0)
 await event('absence','08:00','16:00');eq((await cap())[0].capacity_minutes,0)
 eq(await sql(`SELECT isempty(app_private.task_windows(8,'${freeDay}',0))`),'t')
 await event('meeting','10:00','11:00');eq((await cap())[0].capacity_minutes,300)
 await sql(`INSERT INTO public."Schedule_events"(employee_id,type,starts_at,ends_at,created_by_employee_id) VALUES(8,'absence','${freeDay} 10:30'::timestamp AT TIME ZONE '${testZone}','${freeDay} 11:30'::timestamp AT TIME ZONE '${testZone}',1)`)
 eq((await cap())[0].capacity_minutes,270) // overlapping busy intervals counted once
 await event('work','10:00','14:00');eq((await cap())[0].capacity_minutes,240)
 await sql(`INSERT INTO public."Schedule_events"(employee_id,type,starts_at,ends_at,created_by_employee_id) VALUES(8,'meeting','${freeDay} 11:00'::timestamp AT TIME ZONE '${testZone}','${freeDay} 12:00'::timestamp AT TIME ZONE '${testZone}',1)`)
 eq((await cap())[0].capacity_minutes,180)
 await denied(rpc(6,'tasks_schedule_capacity',`8,'${freeDay}','${freeDay}'`),/TASKS_DENIED/)
 await denied(rpc(6,'tasks_report_activity',`8,'${freeDay}','${freeDay}'`),/TASKS_DENIED/)
 // A no-event day can be planned and offered by the existing queue.
 await sql(`DELETE FROM public."Schedule_events" WHERE employee_id=11; UPDATE public."Tasks" SET status='cancelled',completed_at=NULL WHERE assigned_to_employee_id=11; UPDATE public."Task_work_sessions" SET ended_at=clock_timestamp() WHERE employee_id=11 AND ended_at IS NULL; DELETE FROM public."Task_work_contexts" WHERE employee_id=11;`)
 const implicitTask=await command(11,'create',{title:'Default day queue',estimated_minutes:1,planned_date:today})
 eq((await rpc(11,'tasks_work_state')).capacity_minutes,360)
 eq((await command(11,'next',{})).id,implicitTask.id)
 // Real sessions cross midnight; planning after the session must not relabel it.
 const history=await command(6,'create',{title:'Історичний звіт',estimated_minutes:999})
 await sql(`INSERT INTO public."Task_work_sessions"(task_id,employee_id,started_at,ended_at) VALUES(${history.id},6,'2026-01-12 23:30'::timestamp AT TIME ZONE '${testZone}','2026-01-13 01:15'::timestamp AT TIME ZONE '${testZone}');
 INSERT INTO public."Task_events"(task_id,event_type,actor_employee_id,task_version,operation_id,metadata,created_at) VALUES(${history.id},'TASK_CREATED',6,0,gen_random_uuid(),jsonb_build_object('after',jsonb_build_object('title','Історичний звіт','planned_date',null,'assigned_to_employee_id',6)),'2026-01-12 12:00'::timestamp AT TIME ZONE '${testZone}');
 UPDATE public."Tasks" SET planned_date='2026-01-14' WHERE id=${history.id};`)
 const activity=await rpc(6,'tasks_report_activity',"6,'2026-01-12','2026-01-13'")
 eq(activity.rows.map(r=>[r.date,r.kind,Number(r.actual_minutes)]),[['2026-01-12','unplanned',30],['2026-01-13','unplanned',75]])
 eq((await rpc(6,'tasks_report_activity',"6,'2025-01-01','2025-01-07'")).rows,[])
 await denied(sql(`SET ROLE anon; SELECT public.tasks_report_activity(6,'2026-01-01','2026-01-07')`),/permission denied/)
 await sql(`UPDATE public."Task_module_settings" SET company_timezone='Europe/Warsaw';
 INSERT INTO public."Task_work_sessions"(task_id,employee_id,started_at,ended_at) VALUES(${history.id},6,'2026-03-29 00:00 Europe/Warsaw','2026-03-30 00:00 Europe/Warsaw');`)
 const dst=await rpc(6,'tasks_report_activity',"6,'2026-03-29','2026-03-29'")
 eq(Number(dst.rows[0].actual_minutes),1380)
 const missing=await command(6,'create',{title:'No historical snapshot'})
 await sql(`INSERT INTO public."Task_work_sessions"(task_id,employee_id,started_at,ended_at) VALUES(${missing.id},6,'2026-02-02 10:00 Europe/Warsaw','2026-02-02 11:00 Europe/Warsaw')`)
 eq((await rpc(6,'tasks_report_activity',"6,'2026-02-02','2026-02-02'")).rows[0].kind,'unknown')
 await sql(`INSERT INTO public."Task_events"(task_id,event_type,actor_employee_id,task_version,operation_id,metadata,created_at) VALUES(${history.id},'TASK_PLANNED',6,2,gen_random_uuid(),jsonb_build_object('after',jsonb_build_object('title','Planned historically','planned_date','2026-04-02','assigned_to_employee_id',6)),'2026-04-01 10:00 Europe/Warsaw');
 INSERT INTO public."Task_work_sessions"(task_id,employee_id,started_at,ended_at) VALUES(${history.id},6,'2026-04-02 10:00 Europe/Warsaw','2026-04-02 11:00 Europe/Warsaw'); UPDATE public."Tasks" SET planned_date=NULL WHERE id=${history.id};`)
 eq((await rpc(6,'tasks_report_activity',"6,'2026-04-02','2026-04-02'")).rows[0].kind,'planned')
 console.log(`Tasks PostgreSQL PASS (${checks} checks)`)
} finally {await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
