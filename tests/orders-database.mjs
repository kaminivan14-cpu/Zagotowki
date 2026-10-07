import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const container=process.env.TEST_PG_CONTAINER || 'zagotowki-orders-test',db=`orders_${Date.now()}`
function sql(query,database=db){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',c=>c?reject(new Error(err)):resolve(out.trim()));p.stdin.end(query)})}
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const as=n=>`SET ROLE authenticated; SET request.jwt.claim.sub='${uid(n)}'; SET request.jwt.claims='{"iss":"https://meuzkduxttjcuiynsnaa.supabase.co/auth/v1"}';`
const lit=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`
const command=(n,action,args,op=randomUUID())=>sql(`${as(n)} SELECT public.orders_command('${action}',${lit(args)},'${op}');`).then(JSON.parse)
const read=(n,name,args='')=>sql(`${as(n)} SELECT public.${name}(${args});`).then(JSON.parse)
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};const denied=async(p,pattern)=>{await assert.rejects(p,pattern);checks++}
await sql(`CREATE DATABASE ${db}`,'postgres')
try{
 await sql(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; END IF; END $$;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;CREATE PUBLICATION supabase_realtime;`)
 for(const f of ['202609220001_base','202609230001_auth','202609230002_auth_production','202609290001_employee_pin','202609300001_employee_archive'])await sql(await readFile(`supabase/migrations/${f}.sql`,'utf8'))
 await sql(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'Test A',true),(2,'Test B',true);
 INSERT INTO auth.users(id,email) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test-'||n||'@example.invalid' FROM generate_series(1,8)n;
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) SELECT n,'Synthetic '||n,CASE n WHEN 1 THEN 'administrator' WHEN 2 THEN 'manager' WHEN 3 THEN 'su-chef' ELSE 'employee' END,CASE WHEN n=1 THEN NULL WHEN n=8 THEN 2 ELSE 1 END,true,('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,8)n;
 UPDATE public."Employees" SET pin_hash=extensions.crypt(lpad(id::text,4,'0'),extensions.gen_salt('bf',10)) WHERE id>1;
 INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(1,1,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active');
 INSERT INTO public."Plan_items"(id,plan_id,nazwa,ilosc,jednostka,employee_id) VALUES(1,1,'Synthetic',1,'g',6);
 CREATE TABLE test_before AS SELECT to_jsonb(e) AS original FROM public."Employees" e;`)
 await sql(await readFile('supabase/migrations/202610010001_roles_modules.sql','utf8'))
 await sql(await readFile('supabase/migrations/202610010002_crafter.sql','utf8'))
 eq(await sql(`SELECT count(*) FROM public."Employees" e JOIN test_before b ON e.id=(b.original->>'id')::bigint WHERE (to_jsonb(e)-'role')<>(b.original-'role')`),'0')
 eq(await sql(`SELECT count(*) FROM public."Employees" e JOIN test_before b ON e.id=(b.original->>'id')::bigint WHERE e.pin_hash IS DISTINCT FROM b.original->>'pin_hash'`),'0')
 eq(await sql('SELECT employee_id FROM public."Plan_items" WHERE id=1'),'6')
 await sql(`UPDATE public."Employees" SET role='sushi-master' WHERE id IN(4,5,8);UPDATE public."Employees" SET role='shift-manager' WHERE id=7;`)

 // Exercise the unchanged bcrypt verifier with each new role and real private mapping.
 await sql(`INSERT INTO app_private.pin_accounts(employee_id,email,auth_user_id) SELECT id,auth_user_id::text||'@pin.uat.invalid',auth_user_id FROM public."Employees" WHERE id>1;`)
 for(const n of [2,3,4,6,7]){
  const attempt=randomUUID(),source=String(n).padStart(64,'0')
  eq(await sql(`SET ROLE service_role;SELECT public.pin_reserve('${source}','${attempt}')`),'t')
  eq(await sql(`SET ROLE service_role;SELECT employee_id FROM public.pin_verify('${attempt}','${source}','${String(n).padStart(4,'0')}')`),String(n))
  eq(await sql(`SET ROLE service_role;SELECT public.pin_confirm(${n},'${uid(n)}')`),'t')
  await sql(`SELECT app_private.pin_admin('${uid(1)}',${n})`);checks++
 }
 eq(await sql(`SET ROLE service_role;SELECT public.pin_confirm(1,'${uid(1)}')`),'f')
 await sql(`INSERT INTO public."Plans"(id,location_id,plan_date,status) VALUES(2,1,(now() AT TIME ZONE 'Europe/Warsaw')::date-1,'active'),(3,2,(now() AT TIME ZONE 'Europe/Warsaw')::date,'active');`)
 for(const n of [4,6]){eq(await sql(`${as(n)} SELECT string_agg(id::text,',' ORDER BY id) FROM public."Plans"`),'1');eq(await sql(`${as(n)} SELECT app_private.has_permission('production.plan.manage')`),'f')}
 eq(await sql(`${as(7)} SELECT string_agg(id::text,',' ORDER BY id) FROM public."Plans"`),'1,2')
 eq(await sql(`${as(7)} SELECT app_private.has_permission('production.plan.manage')`),'t')
 eq(await sql(`SELECT count(*) FROM public."Employees" e JOIN test_before b ON e.id=(b.original->>'id')::bigint WHERE e.pin_hash IS DISTINCT FROM b.original->>'pin_hash'`),'0')
 await sql(await readFile('supabase/migrations/202610010003_orders.sql','utf8'))
 if(process.env.TEST_TASKS_UPGRADE==='1') for(const f of (await readdir('supabase/migrations')).filter(f=>f.startsWith('20261002')).sort()) await sql(await readFile(`supabase/migrations/${f}`,'utf8'))
 await sql(await readFile('supabase/migrations/202610030001_orders_board.sql','utf8'))
 await sql(await readFile('supabase/migrations/202610030002_orders_uat_generator.sql','utf8'))
 await sql(await readFile('supabase/migrations/202610040001_worktime.sql','utf8'))
 await sql(await readFile('supabase/migrations/202610100001_order_ingest.sql','utf8'))
 const seed=await readFile('supabase/seeds/orders-uat.sql','utf8')
 await denied(sql(seed),/UAT target/)
 await sql("SET app.orders_seed_project_ref='meuzkduxttjcuiynsnaa';"+seed)
 await sql("SET app.orders_seed_project_ref='meuzkduxttjcuiynsnaa';"+seed)
 eq(await sql('SELECT count(*) FROM public."Order_products" WHERE is_test'),'15')
 console.log(`Orders schema and role preservation PASS (${checks} checks)`)
 for(const n of [1,2,3,4,5,7,8]){
  const catalog=await read(n,'orders_catalog');eq(catalog.length,15);eq('work_rate_minor' in catalog[0],n===1)
 }
 await denied(read(6,'orders_catalog'),/ORDERS_DENIED/)
 for(const role of ['anon','authenticated'])for(const table of ['Order_products','Orders','Order_items','Order_item_assignments','Order_cutting_assignments','Order_events','Work_shifts'])await denied(sql(`SET ROLE ${role};SELECT * FROM public."${table}"`),/permission denied/)
 await denied(sql(`${as(4)} INSERT INTO public."Orders"(source) VALUES('x')`),/permission denied/)
 for(const n of [2,3,4,7,8])await denied(read(n,'orders_board',n===8?'1':'2'),/ORDERS_DENIED/)
 await denied(command(2,'create_test',{location_id:2,items:[{product_id:1,quantity:4}]}),/ORDERS_DENIED/)
 await denied(command(4,'claim',{order_id:1,items:[],employee_id:1}),/INVALID_ARGUMENTS/)
 await denied(sql(`${as(2)} SET request.jwt.claims='{"iss":"https://other.invalid/auth/v1"}';SELECT public.orders_command('create_test','{"location_id":1,"items":[]}','${randomUUID()}')`),/UAT_ONLY/)
 const op=randomUUID(),args={location_id:1,items:[{product_id:1,quantity:10},{product_id:9,quantity:4}]}
 const made=await command(2,'create_test',args,op);eq(await command(2,'create_test',args,op),made)
 await denied(command(2,'create_test',{...args,items:[{product_id:1,quantity:2}]},op),/OPERATION_CONFLICT/)
 const oid=made.order_id
 const sendOp=randomUUID();await command(2,'send',{order_id:oid},sendOp);eq(await command(2,'send',{order_id:oid},sendOp),{})
 const shifts={};for(const n of [3,4,5,7]){shifts[n]=(await command(n,'open_shift',{location_id:1})).shift_id;eq((await command(n,'open_shift',{location_id:1})).shift_id,shifts[n])}
 const board=await read(4,'orders_board','1'),items=board[0].items
 const claimOp=randomUUID(),claimArgs={order_id:oid,items:[{item_id:items[0].id,quantity:6}]}
 const first=await command(4,'claim',claimArgs,claimOp);eq(await command(4,'claim',claimArgs,claimOp),first)
 await denied(command(4,'claim',{...claimArgs,items:[{item_id:items[0].id,quantity:7}]},claimOp),/OPERATION_CONFLICT/)
 await command(1,'rate',{product_id:1,rate_minor:300,active:true})
 const [won,lost]=await Promise.allSettled([command(5,'claim',{order_id:oid,items:[{item_id:items[0].id,quantity:4}]}),command(4,'claim',{order_id:oid,items:[{item_id:items[0].id,quantity:4}]})])
 eq([won,lost].filter(x=>x.status==='fulfilled').length,1);eq([won,lost].filter(x=>x.status==='rejected'&&/CLAIM_CONFLICT/.test(x.reason.message)).length,1)
 eq(await sql(`SELECT sum(quantity) FROM public."Order_item_assignments" WHERE order_item_id=${items[0].id}`),'10')
 const before=await sql('SELECT count(*) FROM public."Order_item_assignments"')
 await denied(command(5,'claim',{order_id:oid,items:[{item_id:items[1].id,quantity:1},{item_id:items[0].id,quantity:1}]}),/CLAIM_CONFLICT/)
 eq(await sql('SELECT count(*) FROM public."Order_item_assignments"'),before)
 const allOp=randomUUID();const all=await command(5,'claim_all',{order_id:oid},allOp);eq(await command(5,'claim_all',{order_id:oid},allOp),all)
 await denied(command(4,'end_shift',{shift_id:shifts[4]}),/UNFINISHED_WORK/)
 const workers=JSON.parse(await sql('SELECT json_agg(x) FROM (SELECT id,employee_id FROM public."Order_item_assignments" ORDER BY id)x'))
 for(const w of workers){const id=randomUUID();await command(w.employee_id,'ready',{assignment_id:w.id},id);eq(await command(w.employee_id,'ready',{assignment_id:w.id},id),{})}
 eq(await sql(`SELECT rate_at_claim_minor FROM public."Order_item_assignments" WHERE id=${first.assignment_ids[0]}`),'200')
 eq(await sql(`SELECT amount_earned_minor FROM public."Order_item_assignments" WHERE id=${first.assignment_ids[0]}`),'1200')
 await denied(read(4,'orders_shift_summary',shifts[4]),/ORDERS_DENIED/)
 for(const n of [4,5])await command(n,'end_shift',{shift_id:shifts[n]})
 const summary=await read(4,'orders_shift_summary',shifts[4]);eq('rate_at_claim_minor' in summary,false);eq(summary.products.some(x=>x.name==='Philadelphia Salmon'),true)
 for(const n of [2,3,5,6,7])await denied(read(n,'orders_shift_summary',shifts[4]),/ORDERS_DENIED/)
 await sql(`UPDATE public."Order_products" SET name='Renamed' WHERE id=1;UPDATE public."Employees" SET name='Renamed worker' WHERE id=4;SET request.jwt.claim.sub='${uid(1)}';SET app.worktime_reason='Historical regression fixture';UPDATE public."Work_shifts" SET started_at=started_at-interval '1 day' WHERE id=${shifts[3]};`)
 for(const w of workers){
  const qty=Number(await sql(`SELECT quantity FROM public."Order_item_assignments" WHERE id=${w.id}`))
  const op=randomUUID(),input={assignment_id:w.id,quantity:qty};const cut=await command(3,'start_cutting',input,op);eq(await command(3,'start_cutting',input,op),cut)
  const managerBoard=await read(2,'orders_board','1');eq(managerBoard[0].status,'CUTTING')
  eq(JSON.stringify(managerBoard).includes('rate_at_claim_minor'),false);eq(JSON.stringify(managerBoard).includes('amount_earned'),false)
  for(const [action,input] of [['claim',{order_id:oid,items:[{item_id:items[0].id,quantity:1}]}],['ready',{assignment_id:w.id}],['start_cutting',{assignment_id:w.id,quantity:1}],['complete_cutting',{cutting_id:cut.cutting_id}],['issue',{cutting_id:cut.cutting_id}]])await denied(command(2,action,input),/ORDERS_DENIED/)
  const args={cutting_id:cut.cutting_id};await denied(command(3,'issue',args),/CUTTING_NOT_COMPLETED/)
  for(const action of ['complete_cutting','issue']){const id=randomUUID();await command(3,action,args,id);eq(await command(3,action,args,id),{})}
 }
 eq((await read(3,'orders_board','1'))[0].status,'COMPLETED')
 eq((await read(2,'orders_board','1'))[0].status,'COMPLETED')
 eq((await read(2,'orders_board','1'))[0].items.every(i=>i.issued===i.quantity),true)
 const history=await read(3,'orders_shift_history',shifts[3]);eq(history.length,workers.length);eq(history.some(x=>x.maker==='Synthetic 4'&&x.product==='Philadelphia Salmon'),true)
 await command(3,'end_shift',{shift_id:shifts[3]});eq((await read(3,'orders_shift_history',shifts[3])).length,workers.length)
 eq(await sql(`SELECT count(*) FROM public."Order_events" WHERE event_type='ORDER_COMPLETED'`),'1')
 // Independent exact money snapshot and partial cutting example.
 const second=(await command(2,'create_test',{location_id:1,items:[{product_id:1,quantity:10}]})).order_id
 await command(2,'send',{order_id:second});await command(1,'rate',{product_id:1,rate_minor:200,active:true})
 const shift2=(await command(4,'open_shift',{location_id:1})).shift_id
 const claim2=(await command(4,'claim_all',{order_id:second})).assignment_ids[0]
 await command(1,'rate',{product_id:1,rate_minor:300,active:true})
 await command(4,'ready',{assignment_id:claim2});await command(4,'end_shift',{shift_id:shift2})
 eq((await read(4,'orders_shift_summary',shift2)).total_amount_minor,2000)
 await command(3,'open_shift',{location_id:1})
 const c1=await command(3,'start_cutting',{assignment_id:claim2,quantity:6})
 const c2=await command(7,'start_cutting',{assignment_id:claim2,quantity:4})
 await denied(command(3,'start_cutting',{assignment_id:claim2,quantity:1}),/CLAIM_CONFLICT/)
 for(const [n,c] of [[3,c1],[7,c2]]){await command(n,'complete_cutting',{cutting_id:c.cutting_id});await command(n,'issue',{cutting_id:c.cutting_id})}
 eq((await read(3,'orders_board','1')).find(o=>o.id===second).status,'COMPLETED')
 // Deny finances and mutation by role, even if bypassing UI.
 for(const n of [2,3,4,6,7])await denied(command(n,'rate',{product_id:1,rate_minor:100,active:true}),/ORDERS_DENIED/)
 eq(await sql(`SELECT count(*) FROM public."Employees" e JOIN test_before b ON e.id=(b.original->>'id')::bigint WHERE e.pin_hash IS DISTINCT FROM b.original->>'pin_hash'`),'0')
 // Generator: invalid inputs roll back; test types are snapshots, never catalog edits.
 const beforeInvalid=await sql('SELECT count(*) FROM public."Orders"')
 for(const items of [
  [{product_id:15,quantity:2,item_type:'set',children:[]}],
  [{product_id:15,quantity:2,item_type:'set'}],
  [{product_id:15,quantity:2,item_type:'set',children:[{product_id:999999,quantity:1}]}],
  [{product_id:15,quantity:2,children:[{product_id:1,quantity:0}]}],
  [{product_id:1,quantity:0}],
  [{product_id:1,quantity:1,item_type:'unknown'}],
 ])await denied(command(2,'create_test',{location_id:1,items}),/INVALID_|PRODUCT_UNMAPPED/)
 eq(await sql('SELECT count(*) FROM public."Orders"'),beforeInvalid)
 const typed=(await command(2,'create_test',{location_id:1,items:[{product_id:15,quantity:2,item_type:'set',children:[{product_id:1,quantity:2,item_type:'product'},{product_id:9,quantity:1,item_type:'addon'}]},{product_id:10,quantity:1,item_type:'drink'}]})).order_id
 const typedBoard=(await read(4,'orders_board','1')).find(o=>o.id===typed)
 eq(typedBoard.items.map(i=>i.item_type),['set','product','addon','drink'])
 eq(typedBoard.items.map(i=>i.quantity),[2,4,2,1])
 eq(await sql(`SELECT item_type FROM public."Order_products" WHERE id=10`),'product')
 await denied(sql(`${as(2)} SELECT app_private.orders_import('external','bad',1,'[{"product_id":1,"quantity":1,"item_type":"drink"}]',false,NULL,NULL)`),/permission denied/)
 await denied(sql(`SELECT app_private.orders_import('external','bad',1,'[{"product_id":1,"quantity":1,"item_type":"drink"}]',false,NULL,NULL)`),/INVALID_ITEM_TYPE/)
 // New Orders-only upgrade: set ratios, hidden drinks, atomic work and persistent notices.
 await command(4,'open_shift',{location_id:1});await command(5,'open_shift',{location_id:1})
 await sql(`UPDATE public."Order_products" SET item_type='addon' WHERE id=9;UPDATE public."Order_products" SET item_type='drink' WHERE id=10;`)
 const setInput={location_id:1,items:[{product_id:15,quantity:2,children:[{product_id:1,quantity:2},{product_id:9,quantity:1},{product_id:10,quantity:1}]}],ready_at:new Date(Date.now()+29*60000).toISOString(),estimated_prep_minutes:18}
 const setOrder=(await command(2,'create_test',setInput)).order_id
 await command(2,'send',{order_id:setOrder})
 const setBoard=(await read(4,'orders_board','1')).find(o=>o.id===setOrder),parent=setBoard.items.find(i=>i.item_type==='set')
 eq(setBoard.estimated_prep_minutes,18);eq(Boolean(setBoard.ready_at),true)
 eq(setBoard.items.filter(i=>i.parent_item_id===parent.id).map(i=>i.quantity),[4,2,2])
 const oneOp=randomUUID(),oneArgs={order_id:setOrder,set_id:parent.id,quantity:1}
 const one=await command(4,'claim_set',oneArgs,oneOp);eq(await command(4,'claim_set',oneArgs,oneOp),one)
 eq(one.assignment_ids.length,2)
 eq((await read(4,'orders_board','1')).find(o=>o.id===setOrder).lifecycle,'partial')
 const races=await Promise.allSettled([command(5,'claim_set',oneArgs),command(4,'claim_all',{order_id:setOrder})])
 eq(races.filter(r=>r.status==='fulfilled').length,1);eq(races.filter(r=>r.status==='rejected'&&/CLAIM_CONFLICT/.test(r.reason.message)).length,1)
 eq(await sql(`SELECT count(*) FROM public."Order_item_assignments" a JOIN public."Order_items" i ON i.id=a.order_item_id WHERE i.order_id=${setOrder} AND i.item_type IN ('drink','set')`),'0')
 const notices=await read(3,'orders_notifications','1');eq(notices.some(n=>n.order_id===setOrder&&n.event_type==='DEADLINE_30'),true)
 await Promise.all([read(3,'orders_notifications','1'),read(7,'orders_notifications','1')])
 eq(await sql(`SELECT count(*) FROM public."Order_events" WHERE order_id=${setOrder} AND event_type='DEADLINE_30'`),'1')
 await denied(read(4,'orders_notifications','1'),/ORDERS_DENIED/);await denied(read(2,'orders_notifications','1'),/ORDERS_DENIED/)
 const notice=notices.find(n=>n.order_id===setOrder);await read(3,'orders_notifications',`1,${notice.id}`)
 eq((await read(3,'orders_notifications','1')).some(n=>n.order_id===setOrder),false)
 for(const [interval,kind] of [['9 minutes','DEADLINE_10'],['-1 minute','DEADLINE_OVERDUE']]){
  await sql(`UPDATE public."Orders" SET ready_at=now()+interval '${interval}' WHERE id=${setOrder}`)
  eq((await read(3,'orders_notifications','1')).some(n=>n.order_id===setOrder&&n.event_type===kind),true)
  await read(3,'orders_notifications','1');eq(await sql(`SELECT count(*) FROM public."Order_events" WHERE order_id=${setOrder} AND event_type='${kind}'`),'1')
 }
 const setWork=JSON.parse(await sql(`SELECT json_agg(a) FROM public."Order_item_assignments" a JOIN public."Order_items" i ON i.id=a.order_item_id WHERE i.order_id=${setOrder}`))
 for(const w of setWork){await command(w.employee_id,'ready',{assignment_id:w.id});const c=await command(3,'start_cutting',{assignment_id:w.id,quantity:w.quantity});await command(3,'complete_cutting',{cutting_id:c.cutting_id});await command(3,'issue',{cutting_id:c.cutting_id})}
 const finished=(await read(3,'orders_board','1')).find(o=>o.id===setOrder)
 eq(finished.status,'COMPLETED');eq(finished.lifecycle,'done');eq(finished.items.find(i=>i.item_type==='drink').issued,0)
 eq(finished.items.find(i=>i.item_type==='set').lifecycle,'done')
 eq((await read(3,'orders_notifications','1')).some(n=>n.order_id===setOrder),false)
 await (await import('./order-ingest-database-cases.mjs')).verifyIngest({sql,command,read,eq,denied,lit})
 for(const state of ["active=false","active=false,archived_at=now()"]){await sql(`UPDATE public."Employees" SET ${state} WHERE id=4`);await denied(read(4,'orders_board','1'),/Brak aktywnego/)}
 console.log(`PASS ${checks} PostgreSQL checks; real concurrent claim: 1 PASS + 1 CONFLICT; changed credential hashes during role migration: 0`)
}finally{await sql(`DROP DATABASE ${db}`,'postgres')}
