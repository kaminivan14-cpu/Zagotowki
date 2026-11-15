import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { auditDatabase, uid } from './helpers/audit-db.mjs'

// Notification lifecycle (РБ-013, D-52): which real actions notify whom. Employees: 2 = manager ("A"),
// 5 = report ("B"), 6 = second report, 1 = unrelated. Notifications are created only by app_private.task_notify,
// called from app_private.task_event in the same transaction; the actor is never a recipient.
async function db2(){
 const db=await auditDatabase()
 await db.exec(`UPDATE public."Employees" SET role='specialist' WHERE id=1;
 INSERT INTO auth.users(id,email) VALUES('${uid(5)}','five@example.invalid'),('${uid(6)}','six@example.invalid');
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(5,'Synthetic five','specialist',NULL,true,'${uid(5)}'),(6,'Synthetic six','specialist',NULL,true,'${uid(6)}');
 INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(5,2,CURRENT_DATE-1),(6,2,CURRENT_DATE-1);`)
 const as=async n=>db.exec(`RESET ROLE; SET request.jwt.claim.sub='${uid(n)}'; SET ROLE authenticated;`)
 const cmd=async(action,args)=>(await db.query('SELECT public.tasks_command($1,$2::jsonb,$3::uuid) v',[action,JSON.stringify(args),randomUUID()])).rows[0].v
 const ver=async id=>{await db.exec('RESET ROLE');try{return (await db.query('SELECT version FROM public."Tasks" WHERE id=$1',[id])).rows[0].version}finally{}}
 const sql=async(q,p=[])=>{await db.exec('RESET ROLE');return (await db.query(q,p)).rows}
 // recipients of the newest event of a type on a task
 const to=async(taskId,type)=>(await sql(`SELECT n.recipient_employee_id r FROM public."Task_notifications" n WHERE n.event_id=(SELECT max(id) FROM public."Task_events" WHERE task_id=$1 AND event_type=$2) ORDER BY 1`,[taskId,type])).map(x=>Number(x.r))
 const inbox=async(n,filter='all')=>{await as(n);return (await db.query('SELECT public.tasks_notifications($1) v',[filter])).rows[0].v}
 const unread=async n=>{await as(n);return (await db.query('SELECT public.tasks_notifications_unread() v')).rows[0].v}
 return {db,as,cmd,ver,sql,to,inbox,unread}
}

test('actions that involve only the actor create activity but no notification (a single test account never sees any)',async t=>{
 const {db,as,cmd,ver,sql}=await db2();t.after(()=>db.close())
 await as(2);const own=await cmd('create',{title:'Only mine'})
 await cmd('update',{task_id:own.id,version:own.version,title:'Only mine, renamed',priority:'high'})
 await cmd('comment',{task_id:own.id,version:await ver(own.id),text:'Note to self'})
 await as(2);const child=await cmd('create',{title:'My subtask',parent_task_id:own.id})
 await cmd('delete',{task_id:child.id,version:child.version})
 const events=(await sql('SELECT count(*)::int c FROM public."Task_events" WHERE task_id IN ($1,$2)',[own.id,child.id]))[0].c
 assert.ok(events>=5,'activity history is written for every action')
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_notifications"'))[0].c,0,'no other person is related, so nobody is notified')
})

test('two accounts: create, update, comment, completion, parent change, delete and attachments notify the related person only',async t=>{
 const {db,as,cmd,ver,sql,to,inbox,unread}=await db2();t.after(()=>db.close())
 // A creates a task for B -> B: TASK_CREATED ("призначив(ла) вам завдання")
 await as(2);const task=await cmd('create',{title:'Task for B',assigned_to_employee_id:5})
 assert.deepEqual(await to(task.id,'TASK_CREATED'),[5])
 assert.equal(await unread(5),1);assert.equal(await unread(2),0);assert.equal(await unread(1),0)
 // A edits title / priority / deadline -> B: TASK_UPDATED
 await as(2);await cmd('update',{task_id:task.id,version:await ver(task.id),priority:'high'})
 assert.deepEqual(await to(task.id,'TASK_UPDATED'),[5])
 // B comments -> A (author): COMMENT_ADDED; B gets nothing for own comment
 await as(5);await cmd('comment',{task_id:task.id,version:await ver(task.id),text:'Question from B'})
 assert.deepEqual(await to(task.id,'COMMENT_ADDED'),[2])
 // A answers -> B (assignee and earlier commenter): COMMENT_ADDED
 await as(2);await cmd('comment',{task_id:task.id,version:await ver(task.id),text:'Answer from A'})
 assert.deepEqual(await to(task.id,'COMMENT_ADDED'),[5])
 // A creates a subtask under B's task, assigned to B -> B qualifies twice for this one event (child assignee and
 // parent assignee); the unique (event, recipient) key keeps exactly one notification: TASK_CREATED on the child
 await as(2);const child=await cmd('create',{title:'Subtask for B',parent_task_id:task.id,assigned_to_employee_id:5})
 assert.deepEqual((await sql(`SELECT recipient_employee_id r,task_id,kind FROM public."Task_notifications" WHERE event_id=(SELECT max(id) FROM public."Task_events" WHERE task_id=$1 AND event_type='TASK_CREATED')`,[child.id])).map(x=>[Number(x.r),Number(x.task_id),x.kind]),[[5,child.id,'TASK_CREATED']])
 // a subtask A keeps for himself under B's task -> B learns about the parent's progress: PROGRESS_CHANGED on the parent
 await as(2);const own=await cmd('create',{title:'A part under B task',parent_task_id:task.id})
 assert.deepEqual((await sql(`SELECT recipient_employee_id r,task_id,kind FROM public."Task_notifications" WHERE event_id=(SELECT max(id) FROM public."Task_events" WHERE task_id=$1 AND event_type='TASK_CREATED')`,[own.id])).map(x=>[Number(x.r),Number(x.task_id),x.kind]),[[5,task.id,'PROGRESS_CHANGED']])
 // B completes the subtask -> A (author of the child): TASK_COMPLETED; parent progress -> A (author of the parent)
 await as(5);await cmd('mark_completed',{task_id:child.id,version:await ver(child.id),confirmed:true})
 assert.deepEqual(await to(child.id,'TASK_COMPLETED'),[2])
 // A moves a task under B's task -> B (assignee of the moved task): TASK_PARENT_CHANGED
 await as(2);const loose=await cmd('create',{title:'Loose task',assigned_to_employee_id:5})
 await cmd('set_parent',{task_id:loose.id,version:loose.version,parent_task_id:task.id})
 assert.deepEqual(await to(loose.id,'TASK_PARENT_CHANGED'),[5])
 // A deletes a leaf task of B -> B: TASK_DELETED; the notification keeps pointing at the (deleted) task
 await as(2);await cmd('delete',{task_id:loose.id,version:await ver(loose.id)})
 assert.deepEqual(await to(loose.id,'TASK_DELETED'),[5])
 const deleted=(await inbox(5)).items.find(n=>n.kind==='TASK_DELETED');assert.equal(deleted.task.deleted,true)
 // B attaches a file to own task -> A (author): TASK_ATTACHMENT_ADDED; A removes it -> B: TASK_ATTACHMENT_REMOVED
 const id=randomUUID(),key=`${uid(5)}/${id}`
 await sql(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('tasks-private',$1,'{"mimetype":"application/pdf","size":64}')`,[key])
 await as(5);await cmd('file_register',{id,object_key:key,name:'report.pdf',mime:'application/pdf',size_bytes:64,task_id:task.id})
 assert.deepEqual(await to(task.id,'TASK_ATTACHMENT_ADDED'),[2])
 await as(2);await cmd('attachment_remove',{task_id:task.id,version:await ver(task.id),file_id:id})
 assert.deepEqual(await to(task.id,'TASK_ATTACHMENT_REMOVED'),[5])
 // an employee with no relation to the task never receives anything
 assert.equal(await unread(1),0);assert.equal((await inbox(1)).items.length,0)
 // one row per event and recipient, never one for the actor
 assert.equal((await sql('SELECT count(*)::int c FROM (SELECT event_id,recipient_employee_id FROM public."Task_notifications" GROUP BY 1,2 HAVING count(*)>1) x'))[0].c,0)
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_notifications" n JOIN public."Task_events" e ON e.id=n.event_id WHERE n.recipient_employee_id=e.actor_employee_id'))[0].c,0)
})

test('isolation and read state: own inbox only, mark one / all, newer items stay unread, direct table access denied',async t=>{
 const {db,as,cmd,sql,inbox,unread}=await db2();t.after(()=>db.close())
 await as(2);await cmd('create',{title:'First for B',assigned_to_employee_id:5});await cmd('create',{title:'Second for B',assigned_to_employee_id:5})
 await cmd('create',{title:'For six',assigned_to_employee_id:6})
 assert.equal(await unread(5),2);assert.equal(await unread(6),1)
 const boxB=await inbox(5);assert.deepEqual(boxB.items.map(n=>n.task.title).sort(),['First for B','Second for B'])
 assert.ok((await inbox(6)).items.every(n=>n.task.title==='For six'),'six sees only own notifications')
 // six cannot mark B's notification; B marks one as read (idempotent)
 await as(6);await assert.rejects(cmd('notification_read',{id:boxB.items[0].id}),/TASKS_DENIED/)
 await as(5);const once=await cmd('notification_read',{id:boxB.items[0].id});assert.deepEqual(await cmd('notification_read',{id:boxB.items[0].id}),once)
 assert.equal(await unread(5),1);assert.equal((await inbox(5,'read')).items.length,1);assert.equal((await inbox(5,'unread')).items.length,1)
 // mark all as read up to the newest id the panel has seen; a later notification stays unread
 const seen=(await inbox(5)).latest_id
 await as(2);await cmd('create',{title:'Arrived later',assigned_to_employee_id:5})
 await as(5);const all=await cmd('notifications_read_all',{before_id:seen});assert.equal(all.updated,1)
 assert.equal(await unread(5),1);assert.equal((await inbox(5,'unread')).items[0].task.title,'Arrived later')
 assert.equal(await unread(6),1,'marking all as read never touches another person')
 // the table itself is closed: reads go only through the RPCs
 await as(5);await assert.rejects(db.query('SELECT * FROM public."Task_notifications"'),/permission denied/)
 await assert.rejects(db.query('UPDATE public."Task_notifications" SET read_at=NULL'),/permission denied/)
 // an inactive employee receives nothing
 await sql('UPDATE public."Employees" SET active=false WHERE id=6')
 await as(2);const before=(await sql('SELECT count(*)::int c FROM public."Task_notifications" WHERE recipient_employee_id=6'))[0].c
 await as(2);await cmd('create',{title:'Too late for six',assigned_to_employee_id:5})
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_notifications" WHERE recipient_employee_id=6'))[0].c,before)
})
