import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {auditDatabase,uid} from './helpers/audit-db.mjs'
test('positions save/read without role changes; v3 launch scope and immutable snapshots; legacy v2 works',async t=>{
 const db=await auditDatabase();t.after(()=>db.close())
 await db.exec(`UPDATE public."Employees" SET role='administrator',position='Chef' WHERE id=1;UPDATE public."Employees" SET position=' chef ' WHERE id=2;UPDATE public."Employees" SET position='Chef' WHERE id=3;SELECT setval('public."Employees_id_seq"',100);SET request.jwt.claim.sub='${uid(1)}';SET ROLE authenticated;`)
 const cmd=async(a,p)=>(await db.query('SELECT public.tasks_command($1,$2::jsonb,$3::uuid) v',[a,JSON.stringify(p),randomUUID()])).rows[0].v
 const e=await cmd('admin_employee_save',{name:'New employee',role:'specialist',position:'  Senior   CHEF ',active:true,location_id:1});let directory=(await db.query('SELECT public.tasks_admin_directory() v')).rows[0].v
 assert.equal(directory.employees.find(x=>x.id===e.id).position,'Senior CHEF');assert.equal(directory.employees.find(x=>x.id===e.id).role,'specialist')
 await cmd('admin_employee_save',{id:e.id,name:'New employee',role:'specialist',position:'Chef',active:true,location_id:1});directory=(await db.query('SELECT public.tasks_admin_directory() v')).rows[0].v;assert.equal(directory.employees.find(x=>x.id===e.id).position,'Chef')
 assert.deepEqual((await db.query('SELECT public.tasks_processes() v')).rows[0].v.positions,['Chef'])
 const people=(await db.query('SELECT public.tasks_assignable_people() v')).rows[0].v;assert.equal(people.find(x=>x.id===1).position,'Chef');assert.ok(!people.some(x=>x.id===3||x.id===e.id))
 const step={key:randomUUID(),title:'Position step',responsible_position:'Chef',estimated_minutes:30,priority:'medium',depends_on:[],raci:{accountable:[],consulted:[],informed:[]},result_type:'done',checklist:[],attachments:[],offset_days:0}
 const doc={schema_version:3,name:'Position process',goal:'Goal',instruction:'Instruction',expected_result:'Result',responsible_position:'Chef',involved_positions:['Chef'],launch_type:'manual',attachments:[],stages:[{key:randomUUID(),name:'Stage',tasks:[step]}]}
 const p=await cmd('process_create',{definition:doc});await cmd('process_publish',{version_id:p.version_id,revision:1});const today=(await db.query('SELECT public.tasks_context() v')).rows[0].v.today
 const args={version_id:p.version_id,name:'Launch',starts_on:today,deadline:today,position_assignments:{Chef:1}}
 for(const id of [3,e.id])await assert.rejects(cmd('process_launch',{...args,position_assignments:{Chef:id}}),/PROCESS_POSITION_ASSIGNMENT_REQUIRED/)
 await assert.rejects(cmd('process_launch',{...args,position_assignments:{},role_assignments:{administrator:1}}),/PROCESS_POSITION_ASSIGNMENT_REQUIRED/)
 const launched=await cmd('process_launch',args);await db.exec('RESET ROLE');const snap=(await db.query('SELECT execution_snapshot FROM public."Process_instances" WHERE id=$1',[launched.instance_id])).rows[0].execution_snapshot
 assert.equal(snap.schema_version,3);assert.equal(snap.responsible_position,'Chef');assert.equal(snap.stages[0].tasks[0].assigned_to_employee_id,1);assert.equal(snap.responsible_role,undefined)
 await db.exec(`UPDATE public."Employees" SET position='Different' WHERE id=2;SET ROLE authenticated`)
 await assert.rejects(cmd('process_launch',{...args,position_assignments:{Chef:2}}),/PROCESS_POSITION_ASSIGNMENT_REQUIRED/)
 const legacy=structuredClone(doc);legacy.schema_version=2;legacy.responsible_role='administrator';legacy.involved_roles=['administrator'];legacy.stages[0].tasks[0].responsible_role='administrator';delete legacy.responsible_position;delete legacy.involved_positions;delete legacy.stages[0].tasks[0].responsible_position
 const lp=await cmd('process_create',{definition:legacy});await cmd('process_publish',{version_id:lp.version_id,revision:1});assert.ok((await cmd('process_launch',{...args,version_id:lp.version_id,position_assignments:{},role_assignments:{administrator:1}})).instance_id)
 await db.exec(`RESET ROLE;UPDATE public."Employees" SET role='specialist' WHERE id=2;INSERT INTO app_private.role_permissions(role,permission) VALUES('specialist','processes.launch'),('specialist','processes.read') ON CONFLICT DO NOTHING;UPDATE public."Employees" SET position='Chef' WHERE id=2;SET request.jwt.claim.sub='${uid(2)}';SET ROLE authenticated;`)
 await assert.rejects(cmd('process_launch',args),/PROCESS_POSITION_ASSIGNMENT_REQUIRED/)
})
test('task list query retains row scope, truthful counts, combined filters, pagination and checklist data',async t=>{
 const db=await auditDatabase();t.after(()=>db.close());await db.exec(`UPDATE public."Employees" SET role='administrator' WHERE id=1;UPDATE public."Employees" SET role='specialist' WHERE id=2;SET request.jwt.claim.sub='${uid(1)}';SET ROLE authenticated`)
 const cmd=async(a,p)=>(await db.query('SELECT public.tasks_command($1,$2::jsonb,$3::uuid) v',[a,JSON.stringify(p),randomUUID()])).rows[0].v
 const rows=[];for(let n=0;n<13;n++)rows.push(await cmd('create',{title:`Visible ${String(n).padStart(2,'0')}`,priority:n%2?'high':'low',assigned_to_employee_id:2}))
 const hidden=await cmd('create',{title:'Private admin task',assigned_to_employee_id:1});await cmd('checklist_add',{task_id:rows[0].id,version:rows[0].version,text:'Real item'})
 await db.exec(`RESET ROLE;UPDATE public."Tasks" SET deadline_at=now()-interval '1 day' WHERE id=${rows[0].id};UPDATE public."Tasks" SET status='completed',completed_at=now() WHERE id=${rows[1].id};SET request.jwt.claim.sub='${uid(2)}';SET ROLE authenticated`)
 const list=async q=>(await db.query('SELECT public.tasks_list($1::jsonb) v',[JSON.stringify(q)])).rows[0].v
 const all=await list({});assert.equal(all.total,13);assert.equal(all.items.length,10);assert.deepEqual(all.counts,{all:13,active:12,completed:1,overdue:1});assert.ok(!all.items.some(x=>x.id===hidden.id));assert.equal(all.items.find(x=>x.id===rows[0].id).checklist[0].text,'Real item');assert.equal(all.items[0].assignee.name,'Synthetic two')
 assert.equal((await list({page:2})).items.length,3);assert.equal((await list({search:'Visible',priority:'high',tab:'active'})).total,5);assert.equal((await list({tab:'completed'})).total,1);assert.equal((await list({tab:'overdue'})).total,1);assert.equal((await list({assignee:'1'})).total,0);assert.equal((await list({search:'Private'})).total,0);assert.equal((await list({sort:'priority'})).items[0].priority,'high')
 const old=(await db.query('SELECT public.tasks_list() v')).rows[0].v;assert.equal(old.length,13)
 await db.exec(`RESET ROLE;SET ROLE anon`);await assert.rejects(list({}),/permission denied/)
})

test('Production smoke fixture rolls back cleanly',async t=>{
 const {readFile}=await import('node:fs/promises');const db=await auditDatabase();t.after(()=>db.close());await db.exec(await readFile('tests/pr14-production-smoke.sql','utf8'));assert.equal((await db.query('SELECT count(*)::int n FROM public."Employees" WHERE id<0')).rows[0].n,0)
})
