import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
// Keep queue fixtures around local noon, independently of the wall-clock test run.
const offset=new Date().getUTCHours()-12,testZone=offset===0?'Etc/UTC':`Etc/GMT${offset>0?'+':''}${offset}`
const container=process.env.TASKS_TEST_CONTAINER || 'zagotowki-tasks-test', database=`processes_${Date.now()}`
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
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await sql(await readFile(`supabase/migrations/${f}`,'utf8'))
 await sql(`UPDATE public."Task_module_settings" SET company_timezone='${testZone}';
 INSERT INTO public."Locations"(id,name,active) VALUES(1,'Synthetic A',true),(2,'Synthetic B',true);
 INSERT INTO auth.users(id,email) SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'tasks-'||n||'@example.invalid' FROM generate_series(1,11)n;
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) SELECT n,'Synthetic '||n,(ARRAY['owner','administrator','director','manager','expert','specialist','crafter','specialist','specialist','specialist','specialist'])[n],CASE WHEN n IN (4,7) THEN 1 ELSE NULL END,n<>9,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,11)n;
 SELECT setval('public."Employees_id_seq"',100);
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE '${testZone}')::date,'active'); INSERT INTO public."Plan_items"(id,plan_id,nazwa,ilosc,jednostka) VALUES(1,1,'Synthetic',1,'g');`)
 // Phase A fails closed; phase B is installed separately by the Storage policy owner.
 eq(await sql("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'"),'0')
 await denied(sql(`${as(6)} INSERT INTO storage.objects(bucket_id,name) VALUES('tasks-private','${uid(6)}/before-policy')`),/row-level security/)
 await sql(await readFile('supabase/storage/tasks-private-policies.sql','utf8'))
 eq(await sql("SELECT string_agg(cmd,',' ORDER BY cmd) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'"),'INSERT,SELECT')
 const asAdmin=(action,args,op=randomUUID())=>command(1,action,args,op)
 const all=(await rpc(1,'tasks_admin_directory'))
 eq(all.departments.filter(d=>d.code).length,7)
 const production=all.departments.find(d=>d.code==='production').id,marketing=all.departments.find(d=>d.code==='marketing').id
 await denied(rpc(6,'tasks_admin_directory'),/TASKS_DENIED/)
 for(const table of ['Process_templates','Process_versions','Process_instances','Task_results','Task_files','Task_admin_events'])await denied(sql(`SET ROLE authenticated;SELECT * FROM public."${table}"`),/permission denied/)
 let created=await asAdmin('admin_employee_save',{name:'New specialist',role:'specialist',active:true,department_id:production,production_role:'su-chef',location_id:1,manager_id:4})
 let dir=await rpc(1,'tasks_admin_directory'),e=dir.employees.find(e=>e.id===created.id)
 eq(e.role,'specialist');eq(e.production_role,'su-chef');eq(e.capabilities.includes('orders.access'),false)
 await asAdmin('admin_employee_save',{id:e.id,name:e.name,role:e.role,active:false,department_id:marketing,production_role:'su-chef',location_id:1,manager_id:4})
 e=(await rpc(1,'tasks_admin_directory')).employees.find(x=>x.id===e.id);eq(e.production_role,null);eq(e.active,false)
 await denied(asAdmin('admin_employee_save',{id:e.id,name:e.name,role:e.role,active:true,manager_id:e.id}),/REPORTING_CYCLE/)
 await denied(asAdmin('admin_employee_save',{id:1,name:'Self',role:'owner',active:false}),/uprawnień/)
 await asAdmin('admin_employee_save',{id:4,name:'Manager',role:'manager',active:true,location_id:1,department_id:marketing,manager_id:6})
 await denied(asAdmin('admin_employee_save',{id:6,name:'Specialist',role:'specialist',active:true,location_id:1,department_id:marketing,manager_id:4}),/REPORTING_CYCLE/)
 await denied(asAdmin('admin_employee_save',{id:6,name:'Specialist',role:'specialist',active:true,manager_id:e.id}),/INVALID_MANAGER/)
 const cat=await asAdmin('category_save',{name:'Process category',sort_order:3}),catId=cat.id
 const catTask=await asAdmin('create',{title:'History retains category',category_id:catId})
 await asAdmin('category_save',{id:catId,name:'Historical category',active:false,sort_order:9})
 const ctx=await rpc(1,'tasks_context');eq(ctx.categories.some(c=>c.id===catId),false);eq(ctx.category_history.find(c=>c.id===catId).sort_order,9)
 eq((await rpc(1,'tasks_details',catTask.id)).task.category_id,catId)
 await denied(asAdmin('create',{title:'Inactive category',category_id:catId}),/CATEGORY|category/i)
 await asAdmin('category_save',{id:catId,name:'Historical category',active:true,sort_order:4})
 eq((await rpc(1,'tasks_context')).categories.find(c=>c.id===catId).sort_order,4)
 await denied(asAdmin('category_save',{id:catId,name:'Cycle',parent_id:catId}),/PARENT_CYCLE|check constraint/)
 const step=(key,title,extra={})=>({key,title,priority:'medium',result_type:'done',estimated_minutes:1,offset_days:0,depends_on:[],checklist:[],parallel:true,...extra})
 const today=await sql(`SELECT (now() AT TIME ZONE '${testZone}')::date`)
 const def={name:'Test process',instruction:'Shared instruction',stages:[{key:'a',name:'Preparation',tasks:[step('one','First',{checklist:['Check']})]},{key:'b',name:'Launch',tasks:[step('two','Second',{depends_on:['one'],result_type:'comment'})]}]}
 await denied(command(6,'process_create',{definition:def}),/TASKS_DENIED/)
 const template=await asAdmin('process_create',{definition:def}),firstVersion=template.version_id
 await denied(asAdmin('process_save',{version_id:firstVersion,revision:9,definition:def}),/PROCESS_VERSION_CONFLICT/)
 const cyclic=structuredClone(def);cyclic.stages[0].tasks[0].depends_on=['two']
 await denied(asAdmin('process_save',{version_id:firstVersion,revision:1,definition:cyclic}),/DEPENDENCY_CYCLE/)
 await denied(asAdmin('process_save',{version_id:firstVersion,revision:1,definition:{...def,stages:[{name:'Empty',tasks:[]} ]}}).then(()=>asAdmin('process_publish',{version_id:firstVersion,revision:2})),/EMPTY_STAGE/)
 await asAdmin('process_save',{version_id:firstVersion,revision:2,definition:def})
 await asAdmin('process_publish',{version_id:firstVersion,revision:3})
 await denied(asAdmin('process_save',{version_id:firstVersion,revision:4,definition:def}),/PROCESS_VERSION_IMMUTABLE/)
 const launchArgs={version_id:firstVersion,starts_on:today,default_employee_id:6,assignments:{},location_id:1},op=randomUUID()
 const instance=await asAdmin('process_launch',launchArgs,op);eq(await asAdmin('process_launch',launchArgs,op),instance)
 let generated=JSON.parse(await sql(`SELECT jsonb_agg(t ORDER BY id) FROM public."Tasks"t WHERE source_namespace='process:${instance.instance_id}'`));eq(generated.length,2);eq(generated[0].source_type,'process')
 eq((await rpc(6,'tasks_details',generated[0].id)).checklist.length,1)
 eq(await sql(`SELECT count(*) FROM public."Task_dependencies" WHERE task_id=${generated[1].id} AND depends_on_task_id=${generated[0].id}`),'1')
 const detail=await rpc(6,'tasks_details',generated[0].id)
 const check=await command(6,'checklist_toggle',{task_id:detail.task.id,version:detail.task.version,item_id:detail.checklist[0].id,completed:true})
 await command(6,'mark_completed',{task_id:detail.task.id,version:check.version,confirmed:true})
 await denied(command(6,'mark_completed',{task_id:generated[1].id,version:generated[1].version,confirmed:true}),/RESULT_REQUIRED/)
 await command(6,'result_save',{task_id:generated[1].id,version:generated[1].version,value:{text:'Completed result'}})
 let td=(await rpc(6,'tasks_details',generated[1].id)).task
 await command(6,'mark_completed',{task_id:td.id,version:td.version,confirmed:true})
 eq((await rpc(1,'tasks_processes')).instances.find(i=>i.id===instance.instance_id).tasks.every(t=>t.status==='completed'),true)
 const v2=await asAdmin('process_version',{version_id:firstVersion}),newDef=structuredClone(def);newDef.name='Changed v2';newDef.stages[0].tasks[0].title='Changed title';
 await asAdmin('process_save',{version_id:v2.version_id,revision:1,definition:newDef});eq((await rpc(6,'tasks_details',generated[0].id)).task.title,'First')
 const copy=await asAdmin('process_duplicate',{version_id:firstVersion});assert.notEqual(copy.template_id,template.template_id);checks++
 const approveDef={name:'Approval process',stages:[{name:'Review',tasks:[step('approved','Approval',{result_type:'approval',approver_id:4}),step('follow','Follow',{relative_to:'approved',offset_days:14,depends_on:['approved']})]}]}
 const approveTpl=await asAdmin('process_create',{definition:approveDef});await asAdmin('process_publish',{version_id:approveTpl.version_id,revision:1})
 const approval=await asAdmin('process_launch',{version_id:approveTpl.version_id,starts_on:today,default_employee_id:6})
 const rows=JSON.parse(await sql(`SELECT jsonb_agg(t ORDER BY id) FROM public."Tasks"t WHERE source_namespace='process:${approval.instance_id}'`))
 await command(6,'result_save',{task_id:rows[0].id,version:rows[0].version,value:{}})
 td=(await rpc(6,'tasks_details',rows[0].id)).task
 await denied(command(6,'mark_completed',{task_id:td.id,version:td.version,confirmed:true}),/RESULT_APPROVAL_REQUIRED/)
 await denied(command(6,'result_approve',{task_id:td.id,version:td.version}),/TASKS_DENIED/)
 eq((await rpc(4,'tasks_result_inbox')).length,1)
 await command(4,'result_approve',{task_id:td.id,version:td.version});td=(await rpc(6,'tasks_details',td.id)).task
 await command(6,'mark_completed',{task_id:td.id,version:td.version,confirmed:true})
 eq((await rpc(6,'tasks_details',rows[1].id)).task.planned_date,today)
 eq(await sql(`SELECT (deadline_at AT TIME ZONE '${testZone}')::date FROM public."Tasks" WHERE id=${rows[1].id}`),new Date(Date.parse(today+'T12:00Z')+14*86400000).toISOString().slice(0,10))
 // Required evidence cannot be replaced by an arbitrary URL or someone else's upload.
 const evidenceDef={name:'Evidence',stages:[{name:'Evidence',tasks:[step('photo','Photo evidence',{result_type:'photo',required_file:true})]}]}
 const evidenceTpl=await asAdmin('process_create',{definition:evidenceDef});await asAdmin('process_publish',{version_id:evidenceTpl.version_id,revision:1})
 const evidenceRun=await asAdmin('process_launch',{version_id:evidenceTpl.version_id,starts_on:today,default_employee_id:6})
 const evidenceTask=JSON.parse(await sql(`SELECT to_jsonb(t) FROM public."Tasks"t WHERE source_namespace='process:${evidenceRun.instance_id}'`))
 await denied(command(6,'result_save',{task_id:evidenceTask.id,version:evidenceTask.version,value:{url:'https://example.invalid/photo'}}),/RESULT_REQUIRED/)
 const fileId=randomUUID(),key=`${uid(6)}/${fileId}`
 await sql(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('tasks-private','${key}','{"mimetype":"image/png","size":12}')`)
 const fileArgs={id:fileId,object_key:key,name:'Evidence.png',mime:'image/png',size_bytes:12,task_id:evidenceTask.id}
 await denied(command(8,'file_register',fileArgs),/TASKS_DENIED/)
 await command(6,'file_register',fileArgs);eq((await command(6,'file_register',fileArgs)).id,fileId)
 eq((await rpc(6,'tasks_file',`'${fileId}'`)).name,'Evidence.png')
 await denied(rpc(8,'tasks_file',`'${fileId}'`),/TASKS_DENIED/)
 await command(6,'result_save',{task_id:evidenceTask.id,version:evidenceTask.version,value:{file_id:fileId}})
 const evidenceReady=(await rpc(6,'tasks_details',evidenceTask.id)).task
 await command(6,'mark_completed',{task_id:evidenceReady.id,version:evidenceReady.version,confirmed:true})
 eq((await rpc(6,'tasks_details',evidenceTask.id)).task.status,'completed')
 eq(await sql(`${as(6)} SELECT count(*) FROM storage.objects WHERE name='${key}'`),'1')
 eq(await sql(`${as(8)} SELECT count(*) FROM storage.objects WHERE name='${key}'`),'0')
 await denied(sql(`${as(8)} INSERT INTO storage.objects(bucket_id,name) VALUES('tasks-private','${uid(6)}/forged')`),/row-level security/)
 await sql(`${as(6)} INSERT INTO storage.objects(bucket_id,name) VALUES('tasks-private','${uid(6)}/own-upload')`);checks++
 await denied(sql(`${as(6)} INSERT INTO storage.objects(bucket_id,name) VALUES('other-bucket','${uid(6)}/wrong-bucket')`),/row-level security/)
 await denied(sql(`${as(9)} INSERT INTO storage.objects(bucket_id,name) VALUES('tasks-private','${uid(9)}/inactive')`),/row-level security/)

 // Failed launches are atomic; concurrent retry of one operation creates one instance.
 const beforeInstances=await sql('SELECT count(*) FROM public."Process_instances"')
 await denied(asAdmin('process_launch',{version_id:firstVersion,starts_on:today,default_employee_id:9}),/INVALID_ASSIGNEE/)
 eq(await sql('SELECT count(*) FROM public."Process_instances"'),beforeInstances)
 const raceOp=randomUUID(),race=await Promise.all([asAdmin('process_launch',launchArgs,raceOp),asAdmin('process_launch',launchArgs,raceOp)])
 eq(race[0],race[1])
 const seeded=(await rpc(1,'tasks_processes')).versions.find(v=>v.definition.name==='Введення нового меню')
 eq(seeded.definition,JSON.parse(await readFile('tests/fixtures/new-menu-process.json','utf8')))
 eq(seeded.definition.stages.length,7);eq(seeded.definition.stages.flatMap(s=>s.tasks).length,32)
 await asAdmin('process_publish',{version_id:seeded.id,revision:seeded.revision})
 const newMenu=await asAdmin('process_launch',{version_id:seeded.id,starts_on:today,default_employee_id:6})
 eq((await rpc(1,'tasks_processes')).instances.find(i=>i.id===newMenu.instance_id).tasks.length,32)
 eq(await sql(`SELECT count(*) FROM public."Task_admin_events" WHERE entity='category' AND action IN ('created','deactivated','reactivated')`),'3')
 await denied(sql('SET ROLE anon;SELECT public.tasks_processes()'),/permission denied/)
 console.log(`Tasks processes PostgreSQL PASS (${checks} checks)`)
} finally {await sql(`DROP DATABASE ${database} WITH (FORCE)`,'postgres')}
