import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { auditDatabase, uid } from './helpers/audit-db.mjs'

// Work module finalisation: agreed deletion policy (D-1), reassignment notification recipients (D-14)
// and attachment rules for documents (RB-014). Employees: 2 = manager; 5 and 6 report to 2; 1 = unrelated.
async function workDatabase(){
 const db=await auditDatabase()
 await db.exec(`UPDATE public."Employees" SET role='specialist' WHERE id=1;
 INSERT INTO auth.users(id,email) VALUES('${uid(5)}','five@example.invalid'),('${uid(6)}','six@example.invalid');
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(5,'Synthetic five','specialist',NULL,true,'${uid(5)}'),(6,'Synthetic six','specialist',NULL,true,'${uid(6)}');
 INSERT INTO public."Employee_reporting_lines"(employee_id,manager_employee_id,effective_from) VALUES(5,2,CURRENT_DATE-1),(6,2,CURRENT_DATE-1);`)
 const as=async n=>db.exec(`RESET ROLE; SET request.jwt.claim.sub='${uid(n)}'; SET ROLE authenticated;`)
 const cmd=async(action,args,op=randomUUID())=>(await db.query('SELECT public.tasks_command($1,$2::jsonb,$3::uuid) v',[action,JSON.stringify(args),op])).rows[0].v
 const details=async id=>(await db.query('SELECT public.tasks_details($1) v',[id])).rows[0].v
 const sql=async(q,p=[])=>{await db.exec('RESET ROLE');try{return (await db.query(q,p)).rows}finally{await db.exec('RESET ROLE')}}
 return {db,as,cmd,details,sql}
}

test('deletion policy: a parent with subtasks is refused and nothing in its hierarchy is deleted',async t=>{
 const {db,as,cmd,details,sql}=await workDatabase();t.after(()=>db.close());await as(2)
 const parent=await cmd('create',{title:'Parent'}),child=await cmd('create',{title:'Child',parent_task_id:parent.id}),grand=await cmd('create',{title:'Grandchild',parent_task_id:child.id})
 const snapshot=async()=>sql('SELECT id,status,deleted_at,parent_task_id,version FROM public."Tasks" WHERE id = ANY($1) ORDER BY id',[[parent.id,child.id,grand.id]])
 const before=await snapshot()
 await as(2);await assert.rejects(cmd('delete',{task_id:parent.id,version:parent.version}),/TASK_HAS_SUBTASKS/)
 await assert.rejects(cmd('delete',{task_id:child.id,version:child.version}),/TASK_HAS_SUBTASKS/)
 assert.deepEqual(await snapshot(),before,'a refused delete changes no row in the hierarchy')
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_events" WHERE event_type=$1',['TASK_DELETED']))[0].c,0)
 await as(1);await assert.rejects(cmd('delete',{task_id:grand.id,version:grand.version}),/TASKS_DENIED/)
 // leaf first: deleting the grandchild is a soft delete of that row only
 await as(2);await cmd('delete',{task_id:grand.id,version:grand.version})
 let rows=await snapshot();assert.ok(rows.find(r=>r.id===grand.id).deleted_at);assert.equal(rows.find(r=>r.id===child.id).deleted_at,null);assert.equal(rows.find(r=>r.id===parent.id).deleted_at,null)
 await as(2);await assert.rejects(cmd('delete',{task_id:parent.id,version:parent.version}),/TASK_HAS_SUBTASKS/,'the child still blocks the parent')
 await cmd('delete',{task_id:child.id,version:(await details(child.id)).task.version})
 await cmd('delete',{task_id:parent.id,version:(await details(parent.id)).task.version})
 rows=await snapshot();assert.equal(rows.length,3,'soft delete keeps every row');assert.ok(rows.every(r=>r.deleted_at))
})

test('reassignment notifies the new assignee and relevant people, never the actor or a merely previous assignee',async t=>{
 const {db,as,cmd,details,sql}=await workDatabase();t.after(()=>db.close())
 const recipients=async(taskId,type)=>(await sql(`SELECT n.recipient_employee_id r,n.kind FROM public."Task_notifications" n JOIN public."Task_events" e ON e.id=n.event_id WHERE e.task_id=$1 AND e.event_type=$2 ORDER BY 1`,[taskId,type])).map(x=>x.r)
 // initial assignment: the manager creates a task for five
 await as(2);const task=await cmd('create',{title:'Assigned work',assigned_to_employee_id:5})
 assert.deepEqual(await recipients(task.id,'TASK_CREATED'),[5])
 // reassignment five -> six by the manager: six only (actor 2 excluded, previous assignee 5 not notified)
 const op=randomUUID();let cur=await cmd('assign',{task_id:task.id,version:task.version,assigned_to_employee_id:6},op)
 assert.deepEqual(await recipients(task.id,'TASK_ASSIGNED'),[6])
 // replaying the same operation creates neither a second event nor duplicate notifications
 await as(2);await cmd('assign',{task_id:task.id,version:task.version,assigned_to_employee_id:6},op)
 assert.deepEqual(await recipients(task.id,'TASK_ASSIGNED'),[6])
 // a previous assignee who is still a participant (commented) keeps receiving updates
 await as(6);await cmd('comment',{task_id:task.id,version:cur.version,text:'On it'})
 await as(2);cur=(await details(task.id)).task;await cmd('assign',{task_id:task.id,version:cur.version,assigned_to_employee_id:5})
 const second=(await sql(`SELECT n.recipient_employee_id r FROM public."Task_notifications" n WHERE n.event_id=(SELECT max(id) FROM public."Task_events" WHERE task_id=$1 AND event_type='TASK_ASSIGNED') ORDER BY 1`,[task.id])).map(x=>x.r)
 assert.deepEqual(second,[5,6],'new assignee 5 and participant 6 (previous assignee who commented)')
 // self-assignment: the actor is never notified; the author (six created it) is.
 // Assigning to oneself needs an assign scope covering oneself (existing rule), granted here explicitly.
 await sql(`INSERT INTO public."Task_scope_grants"(grantee_employee_id,permission,scope_type,employee_id) VALUES(2,'tasks.assign','employee',2)`)
 await as(6);const own=await cmd('create',{title:'Six own task'})
 await as(2);await cmd('assign',{task_id:own.id,version:own.version,assigned_to_employee_id:2})
 assert.deepEqual(await recipients(own.id,'TASK_ASSIGNED'),[6])
 // self-assignment by the author: nobody else is involved, so no notification at all
 await as(2);const mine=await cmd('create',{title:'Manager task',assigned_to_employee_id:5})
 await cmd('assign',{task_id:mine.id,version:mine.version,assigned_to_employee_id:2})
 assert.deepEqual(await recipients(mine.id,'TASK_ASSIGNED'),[],'previous assignee 5 is not notified solely for having been assigned')
 // removing the assignee is not possible: a task always has an owner (NOT NULL). An explicit null keeps the
 // current assignee (existing core rule); because nothing changed, nobody is notified about an assignment.
 await as(2);cur=(await details(task.id)).task;assert.equal(cur.assigned_to_employee_id,5)
 const countBefore=(await sql('SELECT count(*)::int c FROM public."Task_notifications"'))[0].c
 await as(2);const back=await cmd('assign',{task_id:task.id,version:cur.version,assigned_to_employee_id:null});assert.equal(back.assigned_to_employee_id,5)
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_notifications"'))[0].c,countBefore)
 await assert.rejects(sql('UPDATE public."Tasks" SET assigned_to_employee_id=NULL WHERE id=$1',[task.id]),/null value/)
 // every assignment notification is unique per event and recipient
 assert.equal((await sql('SELECT count(*)::int c FROM (SELECT event_id,recipient_employee_id FROM public."Task_notifications" GROUP BY 1,2 HAVING count(*)>1) x'))[0].c,0)
})

test('attachments: Word, Excel and PDF documents, type and size validation, access and removal rights',async t=>{
 const {db,as,cmd,details,sql}=await workDatabase();t.after(()=>db.close())
 await as(2);const task=await cmd('create',{title:'Documents',assigned_to_employee_id:5})
 const put=async(n,mime,size=2048,metaMime=mime)=>{const id=randomUUID(),key=`${uid(n)}/${id}`;await sql(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('tasks-private',$1,$2::jsonb)`,[key,JSON.stringify({mimetype:metaMime,size})]);await as(n);return {id,object_key:key,mime,size_bytes:size,task_id:task.id}}
 const docs=[['contract.pdf','application/pdf'],['legacy.doc','application/msword'],['report.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['legacy.xls','application/vnd.ms-excel'],['budget.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]
 const ids={}
 for(const [name,mime] of docs){const f=await put(2,mime);const saved=await cmd('file_register',{...f,name});assert.equal(saved.name,name);assert.equal(saved.mime,mime);ids[name]=f.id}
 // unsupported type and oversized files are refused by the server even when the object exists
 await assert.rejects(cmd('file_register',{...(await put(2,'application/x-msdownload')),name:'tool.exe'}),/ATTACHMENT_TYPE/)
 await assert.rejects(cmd('file_register',{...(await put(2,'text/html')),name:'page.html'}),/ATTACHMENT_TYPE/)
 await assert.rejects(cmd('file_register',{...(await put(2,'application/pdf',20971521)),name:'huge.pdf'}),/ATTACHMENT_TOO_LARGE/)
 await assert.rejects(cmd('file_register',{...(await put(2,'application/pdf',100,'image/png')),name:'spoof.pdf'}),/INVALID_ATTACHMENT/)
 const limit=await put(2,'application/pdf',20971520);assert.ok(await cmd('file_register',{...limit,name:'exactly-20MiB.pdf'}))
 // the name must match the declared type (D-39): a renamed file is refused; CSV from Windows (vnd.ms-excel) is fine
 await assert.rejects(cmd('file_register',{...(await put(2,'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),name:'invoice.pdf'}),/ATTACHMENT_TYPE/)
 await assert.rejects(cmd('file_register',{...(await put(2,'application/pdf')),name:'setup.exe'}),/ATTACHMENT_TYPE/)
 const csv=await put(2,'application/vnd.ms-excel');assert.ok(await cmd('file_register',{...csv,name:'export.CSV'}))
 // a file under somebody else's folder cannot be registered
 const foreign=await put(5,'application/pdf');await as(2);await assert.rejects(cmd('file_register',{...foreign,name:'foreign.pdf'}),/INVALID_ATTACHMENT/)
 // details show name, author and upload time for every document
 const d=await details(task.id);assert.equal(d.attachments.length,7)
 for(const a of d.attachments){assert.equal(a.uploaded_by.name,'Synthetic two');assert.ok(!Number.isNaN(Date.parse(a.created_at)))}
 assert.deepEqual(d.attachments.map(a=>a.name).sort(),['budget.xlsx','contract.pdf','exactly-20MiB.pdf','export.CSV','legacy.doc','legacy.xls','report.docx'])
 // read / download access goes through tasks_file: assignee yes, unrelated employee no
 await as(5);assert.equal((await db.query('SELECT public.tasks_file($1::uuid) v',[ids['report.docx']])).rows[0].v.name,'report.docx')
 await as(1);await assert.rejects(db.query('SELECT public.tasks_file($1::uuid) v',[ids['report.docx']]),/TASKS_DENIED/)
 // removal: the assignee cannot remove the manager's file; the uploader can; removed files are unreadable
 await as(5);await assert.rejects(cmd('attachment_remove',{task_id:task.id,version:d.task.version,file_id:ids['legacy.xls']}),/TASKS_DENIED/)
 await as(1);await assert.rejects(cmd('attachment_remove',{task_id:task.id,version:d.task.version,file_id:ids['legacy.xls']}),/TASKS_DENIED/)
 await as(2);await cmd('attachment_remove',{task_id:task.id,version:d.task.version,file_id:ids['legacy.xls']})
 await as(5);await assert.rejects(db.query('SELECT public.tasks_file($1::uuid) v',[ids['legacy.xls']]),/TASKS_DENIED/)
 assert.equal((await details(task.id)).attachments.length,6)
 // the stored object itself is never deleted by the metadata removal
 assert.equal((await sql(`SELECT count(*)::int c FROM storage.objects WHERE name=(SELECT object_key FROM public."Task_files" WHERE id=$1)`,[ids['legacy.xls']]))[0].c,1)
 const bucket=(await sql(`SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='tasks-private'`))[0]
 assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),20971520);for(const [,mime] of docs)assert.ok(bucket.allowed_mime_types.includes(mime),mime)
})

test('status changes are written to the activity log with old and new values; reading notifications keeps the log',async t=>{
 const {db,as,cmd,details,sql}=await workDatabase();t.after(()=>db.close())
 await as(2);const task=await cmd('create',{title:'Status journal',assigned_to_employee_id:5}),other=await cmd('create',{title:'To cancel',assigned_to_employee_id:5})
 await as(5);await cmd('mark_completed',{task_id:task.id,version:task.version,confirmed:true})
 let d=await details(task.id);const done=d.events.at(-1)
 assert.equal(done.event_type,'TASK_COMPLETED');assert.equal(done.actor.name,'Synthetic five');assert.equal(done.metadata.before.status,'unplanned');assert.equal(d.task.status,'completed')
 await as(2);await cmd('cancel',{task_id:other.id,version:other.version})
 const c=(await details(other.id)).events.at(-1);assert.equal(c.event_type,'TASK_CANCELLED');assert.equal(c.metadata.before.status,'unplanned')
 const before=(await sql('SELECT count(*)::int c FROM public."Task_events" WHERE task_id=$1',[task.id]))[0].c
 await as(2);const inbox=(await db.query('SELECT public.tasks_notifications($1) v',['unread'])).rows[0].v
 assert.ok(inbox.items.some(n=>n.kind==='TASK_COMPLETED'&&n.task.id===task.id))
 await cmd('notifications_read_all',{before_id:inbox.latest_id})
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_events" WHERE task_id=$1',[task.id]))[0].c,before,'marking notifications read never touches the activity log')
 await as(2);assert.equal((await details(task.id)).events.at(-1).event_type,'TASK_COMPLETED')
})

test('five-level hierarchy: parent links, quick-create defaults, list tree, chain filter, progress and reparenting',async t=>{
 const {db,as,cmd,details,sql}=await workDatabase();t.after(()=>db.close());await as(2)
 const list=async(q={})=>(await db.query('SELECT public.tasks_list($1::jsonb) v',[JSON.stringify({tab:'active',view:'all',...q})])).rows[0].v
 const A=await cmd('create',{title:'Level A'}),B=await cmd('create',{title:'Level B',parent_task_id:A.id}),C=await cmd('create',{title:'Level C',parent_task_id:B.id}),D=await cmd('create',{title:'Level D',parent_task_id:C.id}),E=await cmd('create',{title:'Level E needle',parent_task_id:D.id})
 const rows=await sql('SELECT id,parent_task_id,priority,urgency,estimated_minutes,assigned_to_employee_id,created_by_employee_id,status,deadline_at FROM public."Tasks" WHERE id = ANY($1) ORDER BY id',[[A.id,B.id,C.id,D.id,E.id]])
 assert.deepEqual(rows.map(r=>r.parent_task_id),[null,A.id,B.id,C.id,D.id],'every subtask is a task row linked to its parent')
 // quick-created children (title only) receive exactly the ordinary task defaults
 const pick=r=>({priority:r.priority,urgency:r.urgency,estimated_minutes:r.estimated_minutes,assigned_to_employee_id:r.assigned_to_employee_id,created_by_employee_id:r.created_by_employee_id,status:r.status,deadline:r.deadline_at===null})
 for(const r of rows.slice(1))assert.deepEqual(pick(r),pick(rows[0]))
 // the list returns the whole subtree of a top-level task in pre-order with depths 0..4 and no duplicates
 let l=await list();const tree=l.items.filter(x=>[A.id,B.id,C.id,D.id,E.id].includes(x.id))
 assert.deepEqual(tree.map(x=>[x.id,x.tree_parent_id,x.depth]),[[A.id,null,0],[B.id,A.id,1],[C.id,B.id,2],[D.id,C.id,3],[E.id,D.id,4]])
 assert.equal(new Set(l.items.map(x=>x.id)).size,l.items.length);assert.equal(l.total,1,'pagination counts top-level tasks')
 // a search hitting only the deepest task returns it plus the minimal ancestor chain as context rows
 l=await list({search:'needle'});assert.deepEqual(l.items.map(x=>[x.id,x.match]),[[A.id,false],[B.id,false],[C.id,false],[D.id,false],[E.id,true]])
 // progress of each parent counts only its immediate child
 l=await list();for(const id of [A.id,B.id,C.id,D.id])assert.deepEqual(l.items.find(x=>x.id===id).progress,{total:1,done:0,percent:0});assert.equal(l.items.find(x=>x.id===E.id).progress,null)
 // cycles are refused at every depth; moving C under A keeps C's own subtree
 await assert.rejects(cmd('set_parent',{task_id:A.id,version:(await details(A.id)).task.version,parent_task_id:E.id}),/PARENT_CYCLE/)
 await assert.rejects(cmd('set_parent',{task_id:C.id,version:(await details(C.id)).task.version,parent_task_id:C.id}),/SELF_PARENT/)
 await cmd('set_parent',{task_id:C.id,version:(await details(C.id)).task.version,parent_task_id:A.id})
 const moved=await sql('SELECT id,parent_task_id FROM public."Tasks" WHERE id = ANY($1) ORDER BY id',[[B.id,C.id,D.id,E.id]])
 assert.deepEqual(moved.map(r=>r.parent_task_id),[A.id,A.id,C.id,D.id])
 await as(2);assert.equal((await details(C.id)).events.at(-1).event_type,'TASK_PARENT_CHANGED')
 l=await list();assert.deepEqual(l.items.find(x=>x.id===A.id).progress,{total:2,done:0,percent:0})
})

test('attachment storage: a removed file is unreadable through Storage too, also for its uploader (D-47)',async t=>{
 const {readFile}=await import('node:fs/promises')
 const {db,as,cmd,details,sql}=await workDatabase();t.after(()=>db.close())
 const run=async q=>{await db.exec('RESET ROLE');try{await db.exec(q)}finally{await db.exec('RESET ROLE')}}
 // Supabase's storage.foldername and the 2026-10 policies as deployed before D-47
 await run(`CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
 GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
 CREATE POLICY tasks_file_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='tasks-private' AND (storage.foldername(name))[1]=auth.uid()::text AND app_private.has_permission('tasks.access'));
 CREATE POLICY tasks_file_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id='tasks-private' AND app_private.has_permission('tasks.access') AND ((storage.foldername(name))[1]=auth.uid()::text OR public.tasks_storage_read(name)));`)
 await as(2);const task=await cmd('create',{title:'Evidence',assigned_to_employee_id:5})
 // upload through the insert policy (with RETURNING, as an API layer may do), then register on the task
 const upload=async(n,name,mime)=>{const id=randomUUID(),key=`${uid(n)}/${id}`;await as(n)
  const rows=(await db.query(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('tasks-private',$1,$2::jsonb) RETURNING name`,[key,JSON.stringify({mimetype:mime,size:64})])).rows
  assert.equal(rows.length,1,'the uploader may insert and read back an unregistered upload');return {id,object_key:key,name,mime,size_bytes:64,task_id:task.id}}
 const visible=async(n,key)=>{await as(n);return (await db.query('SELECT count(*)::int c FROM storage.objects WHERE name=$1',[key])).rows[0].c}
 const removedFile=await upload(2,'removed.png','image/png');await cmd('file_register',removedFile)
 const activeFile=await upload(2,'active.pdf','application/pdf');await cmd('file_register',activeFile)
 await as(2);await cmd('attachment_remove',{task_id:task.id,version:(await details(task.id)).task.version,file_id:removedFile.id})
 // the exposure being fixed: application reads refuse the removed file, the old Storage policy did not
 await as(2);await assert.rejects(db.query('SELECT public.tasks_file($1::uuid) v',[removedFile.id]),/TASKS_DENIED/)
 assert.equal(await visible(2,removedFile.object_key),1,'2026-10 policy: own-folder branch exposes the removed file')
 const check=async label=>{
  assert.equal(await visible(2,activeFile.object_key),1,`${label}: uploader opens an active attachment`)
  assert.equal(await visible(5,activeFile.object_key),1,`${label}: assignee opens an active attachment`)
  assert.equal(await visible(1,activeFile.object_key),0,`${label}: unrelated employee is denied`)
  assert.equal(await visible(2,removedFile.object_key),0,`${label}: uploader is denied a removed attachment`)
  assert.equal(await visible(5,removedFile.object_key),0,`${label}: assignee is denied a removed attachment`)
  const pending=await upload(5,'pending.png','image/png')
  assert.equal(await visible(5,pending.object_key),1,`${label}: own unregistered upload stays readable`)
  assert.equal(await visible(2,pending.object_key),0,`${label}: somebody else's unregistered upload is not`)
 }
 // operator upgrade script on a project with the 2026-10 policy
 await run(await readFile('supabase/storage/tasks-private-policies-202611140001.sql','utf8'))
 await check('upgrade')
 const upgrade=await readFile('supabase/storage/tasks-private-policies-202611140001.sql','utf8'),guard=upgrade.slice(upgrade.indexOf('DO $$'),upgrade.indexOf('END $$;')+7)
 await assert.rejects(run(guard),/differs from the 2026-10 definition/,'a second run stops instead of guessing')
 // fresh installation from the canonical policy file
 await run('DROP POLICY tasks_file_select ON storage.objects; DROP POLICY tasks_file_insert ON storage.objects;')
 await run(await readFile('supabase/storage/tasks-private-policies.sql','utf8'))
 await check('fresh install')
 // metadata and history: the removed file is gone from the task, its removal stays in the activity log,
 // and neither the object nor its metadata row is deleted
 await as(2);const d=await details(task.id)
 assert.deepEqual(d.attachments.map(a=>a.id),[activeFile.id])
 assert.equal(d.events.filter(e=>e.event_type==='TASK_ATTACHMENT_REMOVED'&&e.metadata.file.id===removedFile.id).length,1)
 assert.equal((await sql('SELECT count(*)::int c FROM public."Task_files" WHERE id=$1 AND removed_at IS NOT NULL',[removedFile.id]))[0].c,1)
 assert.equal((await sql('SELECT count(*)::int c FROM storage.objects WHERE name=$1',[removedFile.object_key]))[0].c,1)
})
