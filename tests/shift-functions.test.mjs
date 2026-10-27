import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {auditDatabase,uid} from './helpers/audit-db.mjs'
import {shiftCapabilities,canChooseShiftFunction} from '../src/worktime/shiftFunction.js'
import {cuttingOrders} from '../src/orders/cutting.js'
import {orderStatusStyles,orderStatusStyle} from '../src/orders/statusStyles.js'
for(const role of ['su-chef','sushi-master','crafter'])test(`${role}: start, change, same shift/time, audit, backend restrictions`,async t=>{
 const db=await auditDatabase();t.after(()=>db.close())
 await db.exec(`UPDATE public."Employees" SET role='${role}' WHERE id=1;INSERT INTO app_private.role_permissions(role,permission) SELECT '${role}',unnest(ARRAY['worktime.self','production.access','orders.access','orders.work','orders.cut','orders.issue']) ON CONFLICT DO NOTHING;
 INSERT INTO public."Order_products"(name,category,work_rate_minor) VALUES('Synthetic','roll',1);
 INSERT INTO public."Orders"(source,external_order_id,display_number,location_id,location_name_snapshot,sent_to_kitchen_at,sent_by_employee_id,is_test) VALUES('synthetic','1','synthetic',1,'Synthetic A',now(),1,true);
 INSERT INTO public."Order_items"(order_id,order_product_id,product_name_snapshot,category_snapshot,quantity) VALUES(1,1,'Synthetic','roll',1);
 SET request.jwt.claim.sub='${uid(1)}';SET ROLE authenticated;`)
 const work=async(a,args,op=randomUUID())=>(await db.query('select public.worktime_command($1,$2,$3) v',[a,args,op])).rows[0].v
 const order=async(a,args)=>(await db.query('select public.orders_command($1,$2,$3) v',[a,args,randomUUID()])).rows[0].v
 const started=await work('start',{location_id:1,module:'production',function:'prep'})
 const current=async()=>(await db.query('select public.worktime_current() v')).rows[0].v
 const original=await current();assert.equal(original.current_shift_function,'prep')
 await assert.rejects(order('claim_all',{order_id:1}),/SHIFT_FUNCTION_DENIED/)
 const op=randomUUID(),args={shift_id:started.shift_id,function:'sushi'};await work('function',args,op);await work('function',args,op)
 assert.equal((await current()).id,original.id);assert.equal((await current()).started_at,original.started_at)
 await order('claim_all',{order_id:1});await order('ready',{assignment_id:1})
 await work('function',{shift_id:started.shift_id,function:'cutter'})
 await assert.rejects(order('claim_all',{order_id:1}),/SHIFT_FUNCTION_DENIED/)
 await order('start_cutting',{assignment_id:1,quantity:1});await order('complete_cutting',{cutting_id:1});await order('issue',{cutting_id:1})
 await assert.rejects(work('function',{shift_id:started.shift_id,function:'administrator'}),/SHIFT_FUNCTION_DENIED/)
 await db.exec('RESET ROLE')
 const events=(await db.query(`select * from public."Work_shift_events" where event_type='WORK_SHIFT_FUNCTION_CHANGED' order by id`)).rows
 assert.equal(events.length,2);assert.equal(events[0].old_values.current_shift_function,'prep');assert.equal(events[1].new_values.current_shift_function,'cutter');assert.equal(events[0].actor_employee_id,1)
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${uid(2)}'`)
 await assert.rejects(work('function',{shift_id:started.shift_id,function:'prep'}),/SHIFT_FUNCTION_DENIED/)
})
test('function only restricts capabilities; other roles and read access unchanged',()=>{
 const caps=['orders.access','orders.work','orders.cut','orders.issue'];assert.deepEqual(shiftCapabilities(caps,{role:'crafter'},{current_shift_function:'prep'}),['orders.access'])
 assert.deepEqual(shiftCapabilities(['orders.access'],{role:'crafter'},{current_shift_function:'sushi'}),['orders.access'])
 assert.deepEqual(shiftCapabilities(caps,{role:'manager'},{current_shift_function:'prep'}),caps)
 assert.equal(canChooseShiftFunction({role:'shift-manager'}),false)
})
test('cutting uses explicit types and live assignments, including work before ready and after cutting',()=>{
 const assignment={quantity:1,cuttings:[],released_at:null}
 const order={id:1,status:'IN_PROGRESS',items:[{id:1,item_type:'product',name:'anything',quantity:1,available:0,issued:0,assignments:[assignment]},{id:2,item_type:'drink',name:'Sushi',assignments:[assignment]}]}
 assert.equal(cuttingOrders([order])[0].items.length,1)
 assignment.cuttings=[{quantity:1,completed_at:'now'}];assert.equal(cuttingOrders([order]).length,1)
 assignment.cuttings[0].issued_at='now';assert.equal(cuttingOrders([order]).length,0)
})
test('every backend status has a distinct stable style and unknown fallback',()=>{
 const codes=['NEW','TO_DO','IN_PROGRESS','READY_FOR_CUTTING','CUTTING','COMPLETED'];assert.equal(new Set(codes.map(c=>orderStatusStyles[c].background)).size,codes.length)
 assert.ok(orderStatusStyle('unknown').color)
})
