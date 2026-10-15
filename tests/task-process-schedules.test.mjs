import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {auditDatabase,uid} from './helpers/audit-db.mjs'
import {addStageTask,editDependency,validateDeadlines,dependencyEdges} from '../src/tasks/processes/model.js'
import {getLocale,setLocale,tr} from '../src/i18n/runtime.js'
import {dateLabel,localToInstant,addDays} from '../src/tasks/dateTime.js'
const recurrence={frequency:'weekly',interval:1,days_of_week:[1,3],day_of_month:null,end_type:'count',count:3,until:null}
test('editor defaults, shared edges, deadline conflicts and DAG',()=>{
 let doc={stages:[{key:'s',tasks:[]}]};for(const key of ['a','b','c'])doc=addStageTask(doc,'s',{key,title:key});assert.equal(doc.stages[0].tasks[0].estimated_minutes,30);assert.deepEqual(dependencyEdges(doc).map(e=>[e.from,e.to]),[['a','b'],['b','c']]);doc=editDependency(doc,{from:'b',to:'c'},'a','c');assert.deepEqual(doc.stages[0].tasks[2].depends_on,['a']);assert.throws(()=>editDependency(doc,null,'c','a','add'),/DEPENDENCY_CYCLE/);assert.throws(()=>editDependency(doc,null,'a','a','add'),/DEPENDENCY_CYCLE/);doc.stages[0].deadline_offset_days=2;doc.stages[0].tasks[0].deadline_offset_days=3;assert.throws(()=>validateDeadlines(doc),/TASK_STAGE_DEADLINE/)
})
test('locale changes labels but not dates or data; fallback is nonempty; DST uses calendar days',()=>{setLocale('pl');assert.equal(getLocale(),'pl');assert.equal(tr('Створити завдання'),'Utwórz zadanie');assert.equal(tr('unknown-key'),'unknown-key');assert.equal(dateLabel('2026-10-25'),'25.10.2026');assert.equal(localToInstant(addDays('2026-10-20',7)+'T17:00','Europe/Warsaw'),'2026-10-27T16:00:00.000Z');setLocale('uk');assert.equal(tr('Створити завдання'),'Створити завдання')})
test('DB: task defaults, interruption scope, recurrence, latest launch, deadlines, snapshots and retry',async t=>{
 const db=await auditDatabase();t.after(()=>db.close());await db.exec(`UPDATE public."Employees" SET role='administrator' WHERE id=1;SET request.jwt.claim.sub='${uid(1)}';SET ROLE authenticated;`)
 const cmd=async(action,args,op=randomUUID())=>(await db.query('SELECT public.tasks_command($1,$2::jsonb,$3::uuid) v',[action,JSON.stringify(args),op])).rows[0].v
 const created=await cmd('create',{title:'Defaults'});assert.equal(created.estimated_minutes,30);assert.equal(created.assigned_to_employee_id,1);assert.equal(created.priority,'medium');assert.equal(created.category_id,null);assert.ok(created.deadline_at)
 await assert.rejects(cmd('create',{title:''}),/check constraint/)
 await db.exec(`SET request.jwt.claim.sub='${uid(2)}'`);await assert.rejects(cmd('create',{title:'Forbidden',urgency:'critical_now'}),/INTERRUPTION_DENIED/)
 await db.exec(`SET request.jwt.claim.sub='${uid(1)}'`);assert.equal((await cmd('create',{title:'Allowed',urgency:'critical_now'})).urgency,'critical_now')
 const op=randomUUID(),r=await cmd('create',{title:'Recurring',recurrence},op);assert.deepEqual(await cmd('create',{title:'Recurring',recurrence},op),r);assert.deepEqual(r.source_metadata.recurrence,recurrence)
 const task={key:randomUUID(),title:'Step',description:'',responsible_role:'administrator',estimated_minutes:30,priority:'medium',parallel:true,depends_on:[],raci:{accountable:[],consulted:[],informed:[]},result_type:'done',checklist:[],attachments:[],offset_days:0,deadline_offset_days:3}
 const doc={recurrence,schema_version:2,name:'Process',goal:'Goal',expected_result:'Result',responsible_role:'administrator',involved_roles:['administrator'],launch_type:'manual',sequential_stages:false,attachments:[],stages:[{key:randomUUID(),name:'Stage',deadline_offset_days:2,tasks:[task]}]}
 await assert.rejects(cmd('process_create',{definition:doc}),/TASK_STAGE_DEADLINE/);task.deadline_offset_days=1
 const p=await cmd('process_create',{definition:doc});assert.deepEqual((await db.query('SELECT public.tasks_processes() v')).rows[0].v.versions.find(v=>v.id===p.version_id).definition.recurrence,recurrence);await cmd('process_publish',{version_id:p.version_id,revision:1})
 const starts='2026-11-01',deadline='2026-11-08',launchArgs={version_id:p.version_id,starts_on:starts,deadline,name:'Launch',role_assignments:{administrator:1},start_offset_days:7,recurrence}
 const launchOp=randomUUID(),launch=await cmd('process_launch',launchArgs,launchOp);assert.deepEqual(await cmd('process_launch',launchArgs,launchOp),launch)
 await db.exec('RESET ROLE');const instance=(await db.query('SELECT * FROM public."Process_instances" WHERE id=$1',[launch.instance_id])).rows[0];assert.equal(instance.starts_on.toISOString().slice(0,10),starts);assert.ok(instance.schedule_id);assert.equal(instance.execution_snapshot.stages[0].deadline,'2026-11-03')
 const snapshot=JSON.stringify(instance.execution_snapshot),next=(await db.query("SELECT app_private.recurrence_next($1::jsonb,'2026-11-02','2026-11-02',1) d",[JSON.stringify(recurrence)])).rows[0].d;assert.equal(next.toISOString().slice(0,10),'2026-11-04')
 await db.exec('SET ROLE authenticated');const v=await cmd('process_version',{version_id:p.version_id});doc.goal='Edited';await cmd('process_save',{version_id:v.version_id,revision:1,definition:doc});await cmd('process_publish',{version_id:v.version_id,revision:2});const latest=await cmd('process_launch',{...launchArgs,name:'Latest',recurrence:{frequency:'none'}})
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT version_id FROM public."Process_instances" WHERE id=$1',[latest.instance_id])).rows[0].version_id,v.version_id);assert.equal(JSON.stringify((await db.query('SELECT execution_snapshot FROM public."Process_instances" WHERE id=$1',[instance.id])).rows[0].execution_snapshot),snapshot)
 // Relative unlock preserves the fixed execution deadline even after a late predecessor.
 await db.exec('SET ROLE authenticated');const relativeDoc=structuredClone(doc),first=relativeDoc.stages[0].tasks[0];first.deadline_offset_days=1;
 relativeDoc.stages[0].tasks.push({...first,key:randomUUID(),title:'Relative successor',relative_to:first.key,deadline_offset_days:2,depends_on:[first.key]});
 const rp=await cmd('process_create',{definition:relativeDoc});await cmd('process_publish',{version_id:rp.version_id,revision:1});const ri=await cmd('process_launch',{...launchArgs,version_id:rp.version_id,recurrence:{frequency:'none'}});
 await db.exec('RESET ROLE');const rt=(await db.query('SELECT * FROM public."Tasks" WHERE source_namespace=$1 ORDER BY id',['process:'+ri.instance_id])).rows;
 const fixed=rt[1].deadline_at;await db.query(`UPDATE public."Tasks" SET status='completed',completed_at='2026-12-01T12:00:00Z' WHERE id=$1`,[rt[0].id]);
 await db.query('SELECT app_private.process_relative_dates($1::uuid,$2)',[randomUUID(),String(ri.instance_id)]);const unlocked=(await db.query('SELECT * FROM public."Tasks" WHERE id=$1',[rt[1].id])).rows[0];assert.equal(unlocked.status,'planned');assert.deepEqual(unlocked.deadline_at,fixed)
 await assert.rejects(db.query(`UPDATE public."Tasks" SET deadline_at='2026-12-30T12:00:00Z' WHERE id=$1`,[rt[1].id]),/TASK_STAGE_DEADLINE/)
 await assert.rejects(db.query('UPDATE public."Process_instances" SET schedule_id=$1,occurrence_deadline=$2 WHERE id=$3',[instance.schedule_id,instance.occurrence_deadline,latest.instance_id]),/unique/)
 await assert.rejects(db.query('UPDATE public."Tasks" SET source_namespace=$1,source_external_id=$2 WHERE id=$3',[r.source_namespace,r.source_external_id,created.id]),/unique/)
 for(const [definition,anchor,expected] of [
  [{frequency:'daily',interval:2,end_type:'never'},'2026-10-24','2026-10-26'],
  [{frequency:'monthly',interval:1,day_of_month:31,end_type:'never'},'2026-01-31','2026-03-31'],
  [{frequency:'yearly',interval:1,end_type:'never'},'2024-02-29','2028-02-29'],
  [{frequency:'daily',interval:1,end_type:'count',count:1},'2026-10-01',null],
  [{frequency:'daily',interval:1,end_type:'until',until:'2026-10-01'},'2026-10-01',null],
 ]){const result=(await db.query('SELECT app_private.recurrence_next($1::jsonb,$2::date,$2::date,1) d',[JSON.stringify(definition),anchor])).rows[0].d;assert.equal(result?.toISOString().slice(0,10)||null,expected)}
 assert.equal((await db.query('SELECT count(*)::int n FROM public."Recurring_task_templates" WHERE recurrence IS NOT NULL')).rows[0].n,1)
 assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.\"Process_schedules\"','SELECT') v")).rows[0].v,false)
})
