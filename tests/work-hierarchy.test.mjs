import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { auditDatabase, uid } from './helpers/audit-db.mjs'

// Work module update: hierarchy, completion guard, direct-child progress, views, chain filtering,
// safe deletion, attachments, immutable activity and personal notifications (РБ-004 … РБ-014).
async function workDatabase(){
 const db=await auditDatabase()
 await db.exec(`UPDATE public."Employees" SET role='specialist' WHERE id=1;
 INSERT INTO auth.users(id,email) VALUES('${uid(4)}','four@example.invalid'),('${uid(5)}','five@example.invalid');
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(4,'Synthetic director','director',NULL,true,'${uid(4)}'),(5,'Synthetic five','specialist',NULL,true,'${uid(5)}');
 INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(5,2,CURRENT_DATE-1);`)
 const as=async n=>db.exec(`RESET ROLE; SET request.jwt.claim.sub='${uid(n)}'; SET ROLE authenticated;`)
 const cmd=async(action,args,op=randomUUID())=>(await db.query('SELECT public.tasks_command($1,$2::jsonb,$3::uuid) v',[action,JSON.stringify(args),op])).rows[0].v
 const list=async(q={})=>(await db.query('SELECT public.tasks_list($1::jsonb) v',[JSON.stringify({tab:'active',...q})])).rows[0].v
 const details=async id=>(await db.query('SELECT public.tasks_details($1) v',[id])).rows[0].v
 return {db,as,cmd,list,details}
}
const titles=r=>r.items.map(t=>t.title)

test('unlimited nesting, quick create defaults, self/cycle protection and parent reassignment',async t=>{
 const {db,as,cmd,details}=await workDatabase();t.after(()=>db.close());await as(1)
 const a=await cmd('create',{title:'Root'})
 const b=await cmd('create',{title:'Child',parent_task_id:a.id})
 assert.equal(b.parent_task_id,a.id);assert.equal(b.estimated_minutes,30);assert.equal(b.assigned_to_employee_id,1);assert.equal(b.priority,'medium');assert.ok(b.deadline_at)
 const c=await cmd('create',{title:'Grandchild',parent_task_id:b.id});const d=await cmd('create',{title:'Great-grandchild',parent_task_id:c.id})
 assert.equal((await details(d.id)).ancestors.map(x=>x.title).join('>'),'Root>Child>Grandchild')
 await assert.rejects(cmd('set_parent',{task_id:b.id,version:b.version,parent_task_id:b.id}),/SELF_PARENT/)
 await assert.rejects(cmd('set_parent',{task_id:a.id,version:a.version,parent_task_id:c.id}),/PARENT_CYCLE/)
 await assert.rejects(cmd('set_parent',{task_id:a.id,version:a.version,parent_task_id:999999}),/TASKS_DENIED/)
 const moved=await cmd('set_parent',{task_id:c.id,version:c.version,parent_task_id:null})
 assert.equal(moved.parent_task_id,null);assert.equal((await details(d.id)).ancestors.map(x=>x.title).join('>'),'Grandchild')
 const back=await cmd('set_parent',{task_id:c.id,version:moved.version,parent_task_id:a.id})
 assert.equal(back.parent_task_id,a.id)
 const events=(await details(c.id)).events.filter(e=>e.event_type==='TASK_PARENT_CHANGED')
 assert.equal(events.length,2);assert.equal(events[0].metadata.previous_parent_task_id,b.id);assert.equal(events[0].metadata.change.parent_task_id,null);assert.equal(events[0].actor.name,'Synthetic one')
 await as(5);await assert.rejects(cmd('create',{title:'Hidden',parent_task_id:a.id}),/TASKS_DENIED/)
})

test('parent completion is refused until every direct child is finished; progress counts direct children only',async t=>{
 const {db,as,cmd,list,details}=await workDatabase();t.after(()=>db.close());await as(1)
 const p=await cmd('create',{title:'Parent'})
 const kids=[];for(const n of [1,2,3,4])kids.push(await cmd('create',{title:`Child ${n}`,parent_task_id:p.id}))
 const grand=await cmd('create',{title:'Grandchild done',parent_task_id:kids[2].id})
 const done=async task=>cmd('mark_completed',{task_id:task.id,version:(await details(task.id)).task.version,confirmed:true})
 await done(grand);await done(kids[0]);await done(kids[1])
 await assert.rejects(done(p),/SUBTASKS_INCOMPLETE/)
 assert.equal((await details(p.id)).task.status,'unplanned')
 const row=(await list({view:'all'})).items.find(t=>t.id===p.id)
 assert.deepEqual(row.progress,{total:4,done:2,percent:50})
 assert.equal((await list({view:'all'})).items.find(t=>t.id===kids[3].id).progress,null)
 const d=await details(p.id);assert.equal(d.incomplete_children,2);assert.deepEqual(d.progress,{total:4,done:2,percent:50});assert.equal(d.children.length,4)
 await done(kids[2]);await done(kids[3]);assert.equal((await done(p)).status,'completed')
 await assert.rejects(cmd('create',{title:'Late child',parent_task_id:p.id}),/PARENT_FINAL/)
 await assert.rejects(db.query(`UPDATE public."Tasks" SET status='completed',completed_at=now() WHERE id=$1`,[p.id]),/permission denied/)
})

test('completed tasks leave active lists, filters keep the minimal ancestor chain and deletion is safe',async t=>{
 const {db,as,cmd,list,details}=await workDatabase();t.after(()=>db.close());await as(1)
 const p=await cmd('create',{title:'Project'})
 const c1=await cmd('create',{title:'Alpha',parent_task_id:p.id}),c2=await cmd('create',{title:'Beta',parent_task_id:p.id})
 const n=await cmd('create',{title:'Needle task',parent_task_id:c2.id})
 await cmd('mark_completed',{task_id:c1.id,version:c1.version,confirmed:true})
 let r=await list({view:'all'})
 assert.deepEqual(titles(r),['Project','Beta','Needle task']);assert.equal(r.total,1);assert.deepEqual(r.items.map(t=>t.depth),[0,1,2]);assert.deepEqual(r.items.map(t=>t.match),[true,true,true])
 const completed=await list({view:'all',tab:'completed'});assert.deepEqual(titles(completed),['Project','Alpha']);assert.deepEqual(completed.items.map(t=>t.match),[false,true])
 r=await list({view:'all',search:'needle'});assert.deepEqual(titles(r),['Project','Beta','Needle task']);assert.deepEqual(r.items.map(t=>t.match),[false,false,true]);assert.equal(r.matching,1);assert.equal(r.items[0].tree_parent_id,null);assert.equal(r.items[2].tree_parent_id,c2.id)
 r=await list({view:'all',search:'#'+n.id});assert.equal(r.items.at(-1).id,n.id)
 assert.deepEqual((await list({view:'all'})).counts,{all:4,active:3,completed:1,overdue:0})
 await assert.rejects(cmd('delete',{task_id:p.id,version:(await details(p.id)).task.version}),/TASK_HAS_SUBTASKS/)
 const deleted=await cmd('delete',{task_id:n.id,version:n.version})
 assert.ok(deleted.deleted_at);assert.equal(deleted.status,'cancelled')
 assert.deepEqual(titles(await list({view:'all'})),['Project','Beta'])
 assert.equal((await list({view:'all'})).items.find(t=>t.id===c2.id).progress,null)
 assert.equal((await details(n.id)).events.at(-1).event_type,'TASK_DELETED')
 await assert.rejects(cmd('set_parent',{task_id:p.id,version:(await details(p.id)).task.version,parent_task_id:n.id}),/TASKS_DENIED/)
 r=await list({view:'all',sort:'title',dir:'desc',page_size:1});assert.equal(r.page_size,1);assert.equal(r.total,1)
 await assert.rejects(list({view:'nope'}),/INVALID_QUERY/);await assert.rejects(list({bogus:1}),/INVALID_QUERY/)
})

test('My / Team / Relevant / All views follow the organisation and existing access rules',async t=>{
 const {db,as,cmd,list}=await workDatabase();t.after(()=>db.close())
 await as(2);const team=await cmd('create',{title:'For report',assigned_to_employee_id:5});await cmd('create',{title:'Manager own'})
 await as(5);await cmd('create',{title:'Private of five'});await cmd('comment',{task_id:team.id,version:team.version,text:'Working on it'})
 await as(1);const other=await cmd('create',{title:'Someone else'})
 await as(2)
 assert.deepEqual(titles(await list({view:'my'})),['Manager own'])
 assert.deepEqual(titles(await list({view:'team'})).sort(),['For report','Private of five'])
 assert.deepEqual(titles(await list({view:'relevant'})).sort(),['For report','Manager own'])
 const all=await list({view:'all'});assert.deepEqual(titles(all).sort(),['For report','Manager own','Private of five']);assert.equal(all.team_available,true);assert.deepEqual(all.views,{my:1,team:2,relevant:2,all:3})
 await as(5)
 assert.deepEqual(titles(await list({view:'my'})).sort(),['For report','Private of five'])
 assert.deepEqual(titles(await list({view:'team'})),[]);assert.equal((await list({view:'all'})).team_available,false)
 assert.deepEqual(titles(await list({view:'relevant'})).sort(),['For report','Private of five'])
 await as(1);assert.deepEqual(titles(await list({view:'all'})),['Someone else']);assert.equal(other.id>0,true)
})

test('description, deadline and attachments are recorded in the immutable activity log',async t=>{
 const {db,as,cmd,details}=await workDatabase();t.after(()=>db.close());await as(2)
 const task=await cmd('create',{title:'Document',assigned_to_employee_id:5})
 const edited=await cmd('update',{task_id:task.id,version:task.version,description:'Updated description',deadline_at:'2030-01-02T10:00:00Z'})
 assert.equal(edited.description,'Updated description');assert.equal(new Date(edited.deadline_at).toISOString(),'2030-01-02T10:00:00.000Z')
 let d=await details(task.id);const upd=d.events.find(e=>e.event_type==='TASK_UPDATED');assert.equal(upd.metadata.before.description,'');assert.equal(upd.metadata.after.description,'Updated description')
 await assert.rejects(cmd('update',{task_id:task.id,version:edited.version,deadline_at:'2030-01-02T10:00'}),/INVALID_ABSOLUTE_TIME/)
 const fileId=randomUUID(),key=`${uid(2)}/${fileId}`
 await db.exec(`RESET ROLE; INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('tasks-private','${key}','{"mimetype":"image/png","size":12}');`);await as(2)
 const file=await cmd('file_register',{id:fileId,object_key:key,name:'photo.png',mime:'image/png',size_bytes:12,task_id:task.id})
 assert.equal(file.task_id,task.id)
 d=await details(task.id);assert.equal(d.attachments.length,1);assert.equal(d.attachments[0].uploaded_by.name,'Synthetic two');assert.equal(d.attachments[0].can_remove,true);assert.equal(d.events.at(-1).event_type,'TASK_ATTACHMENT_ADDED');assert.equal(d.events.at(-1).metadata.file.name,'photo.png')
 assert.equal((await db.query('SELECT public.tasks_file($1::uuid) v',[fileId])).rows[0].v.name,'photo.png')
 await as(5);await assert.rejects(cmd('attachment_remove',{task_id:task.id,version:d.task.version,file_id:fileId}),/TASKS_DENIED/)
 await as(2);const removed=await cmd('attachment_remove',{task_id:task.id,version:d.task.version,file_id:fileId})
 d=await details(task.id);assert.equal(d.attachments.length,0);assert.equal(d.events.at(-1).event_type,'TASK_ATTACHMENT_REMOVED');assert.equal(removed.version,d.task.version)
 await assert.rejects(db.query('SELECT public.tasks_file($1::uuid) v',[fileId]),/TASKS_DENIED/)
 await assert.rejects(cmd('attachment_remove',{task_id:task.id,version:d.task.version,file_id:fileId}),/INVALID_ATTACHMENT/)
 await assert.rejects(db.query(`UPDATE public."Task_events" SET event_type='x'`),/permission denied/)
})

test('personal notifications are scoped, deduplicated and independent from the activity history',async t=>{
 const {db,as,cmd,details}=await workDatabase();t.after(()=>db.close())
 const unread=async()=>(await db.query('SELECT public.tasks_notifications_unread() v')).rows[0].v
 const inbox=async(filter='all')=>(await db.query('SELECT public.tasks_notifications($1) v',[filter])).rows[0].v
 await as(2);const task=await cmd('create',{title:'Shared task',assigned_to_employee_id:5})
 assert.equal(await unread(),0)
 await as(5);assert.equal(await unread(),1);let box=await inbox();assert.equal(box.items[0].kind,'TASK_CREATED');assert.equal(box.items[0].task.title,'Shared task');assert.equal(box.items[0].actor.name,'Synthetic two')
 await cmd('comment',{task_id:task.id,version:task.version,text:'Question from five'})
 assert.equal(await unread(),1)
 await as(2);assert.equal(await unread(),1);box=await inbox('unread');assert.equal(box.items[0].kind,'COMMENT_ADDED');assert.equal(box.items[0].metadata.text,'Question from five')
 const read=await cmd('notification_read',{id:box.items[0].id});assert.ok(read.read_at);assert.equal(await unread(),0);assert.equal((await inbox('read')).items.length,1)
 assert.deepEqual(await cmd('notification_read',{id:box.items[0].id}),read)
 await as(5);await assert.rejects(cmd('notification_read',{id:box.items[0].id}),/TASKS_DENIED/)
 const child=await cmd('create',{title:'Sub',parent_task_id:task.id})
 await cmd('mark_completed',{task_id:child.id,version:child.version,confirmed:true})
 await as(2);box=await inbox('unread')
 // child created by five and completed by five: the creator of the parent learns about progress, once per event
 assert.deepEqual(box.items.map(n=>n.kind),['PROGRESS_CHANGED','PROGRESS_CHANGED']);assert.deepEqual(box.items.map(n=>n.task.id),[task.id,task.id])
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int c FROM public."Task_notifications" n WHERE n.event_id=(SELECT id FROM public."Task_events" WHERE task_id=$1 AND event_type=$2)',[child.id,'TASK_COMPLETED'])).rows[0].c,1);await as(2)
 const all=await cmd('notifications_read_all',{before_id:box.latest_id});assert.equal(all.updated,2);assert.equal(await unread(),0)
 assert.ok((await details(task.id)).events.some(e=>e.event_type==='COMMENT_ADDED'))
 await as(1);await assert.rejects(db.query('SELECT * FROM public."Task_notifications"'),/permission denied/);assert.equal((await inbox()).items.length,0)
})
