import {randomUUID} from 'node:crypto'
export async function verifyIngest({sql,command,read,eq,denied,lit}) {
 const payload={sbid:'EXT-SMOKE',items:[{sku:'UNKNOWN',title:'External Salmon',quantity:3,comment:'bez cebuli'},{sku:'UNKNOWN',title:'Second line'}],comment:'general comment'}
 const ingest=(p,loc=1)=>sql(`SET ROLE service_role;SELECT public.order_ingest(${lit(p)},${loc},'${randomUUID()}')`).then(JSON.parse)
 for(const role of ['anon','authenticated'])await denied(sql(`SET ROLE ${role};SELECT public.order_ingest(${lit(payload)},1,'${randomUUID()}')`),/permission denied/)
 const before=await sql('SELECT count(*) FROM public."Orders"')
 const two=await Promise.all([ingest(payload),ingest(payload)])
 eq(two.map(x=>x.http_status),[200,200]);eq(two.filter(x=>x.body.duplicate).length,1);eq(two[0].body.received_at,two[1].body.received_at)
 eq(Number(await sql('SELECT count(*) FROM public."Orders"')),Number(before)+1)
 const oid=Number(await sql(`SELECT id FROM public."Orders" WHERE integration_sbid='EXT-SMOKE'`))
 eq((await ingest({...payload,comment:'changed'})).http_status,409)
 eq((await ingest({...payload,items:[{...payload.items[0],title:'changed'}]})).http_status,409)
 for(const p of [{},{sbid:'X'},{...payload,sbid:'BAD',items:[]},{...payload,sbid:'BAD',items:[{sku:'x',title:'x',quantity:0}]},{...payload,sbid:'BAD',items:[{sku:'x',title:'x',quantity:1.5}]},{...payload,sbid:'BAD',items:[{sku:'x',title:'x',quantity:'2'}]},{...payload,sbid:'BAD',items:[{sku:'x'}]},{...payload,sbid:'BAD',items:[null]},{...payload,sbid:'BAD',items:[{sku:'x',title:'x',parent_item_id:4}]}])eq((await ingest(p)).http_status,400)
 eq((await ingest({...payload,sbid:'NO-LOCATION'},999)).http_status,503)
 await sql('UPDATE public."Locations" SET active=false WHERE id=2');eq((await ingest({...payload,sbid:'OFF-LOCATION'},2)).http_status,503);await sql('UPDATE public."Locations" SET active=true WHERE id=2')
 let board=(await read(1,'orders_board','1')).find(o=>o.id===oid)
 eq(board.status,'TO_DO');eq(board.comment,payload.comment);eq(board.sent_to_kitchen_at,board.received_at)
 eq(board.items.map(i=>[i.name,i.quantity,i.comment,i.is_external]),[['External Salmon',3,'bez cebuli',true],['Second line',1,'',true]])
 eq(await sql(`SELECT count(*) FROM public."Order_items" WHERE order_id=${oid} AND order_product_id IS NULL`),'2')
 for(const n of [1,5])await command(n,'open_shift',{location_id:1})
 const item=board.items[0].id
 const partial=await command(1,'claim',{order_id:oid,items:[{item_id:item,quantity:1}]})
 const args={order_id:oid,items:[{item_id:item,quantity:2}]}
 const race=await Promise.allSettled([command(1,'claim',args),command(5,'claim',args)])
 eq(race.filter(x=>x.status==='fulfilled').length,1)
 await command(1,'claim_all',{order_id:oid})
 eq(await sql(`SELECT count(*) FROM public."Order_item_assignments" a JOIN public."Order_items" i ON i.id=a.order_item_id WHERE i.order_id=${oid} AND (a.rate_at_claim_minor<>0 OR a.currency<>'PLN')`),'0')
 const assignments=JSON.parse(await sql(`SELECT json_agg(a) FROM public."Order_item_assignments" a JOIN public."Order_items" i ON i.id=a.order_item_id WHERE i.order_id=${oid}`))
 // Read IDs unambiguously (joined id columns are intentionally excluded).
 const works=JSON.parse(await sql(`SELECT json_agg(x) FROM (SELECT a.id,a.employee_id,a.quantity FROM public."Order_item_assignments" a JOIN public."Order_items" i ON i.id=a.order_item_id WHERE i.order_id=${oid} ORDER BY a.id)x`))
 eq(assignments.length,3);eq(partial.assignment_ids.length,1)
 const cuts=[]
 for(const a of works){await command(a.employee_id,'ready',{assignment_id:a.id});cuts.push((await command(1,'start_cutting',{assignment_id:a.id,quantity:a.quantity})).cutting_id)}
 for(const c of cuts.slice(0,-1))await command(1,'complete_cutting',{cutting_id:c})
 eq(await sql(`SELECT count(*) FROM app_private.order_callbacks WHERE order_id=${oid}`),'0')
 await command(1,'complete_cutting',{cutting_id:cuts.at(-1)})
 await command(1,'complete_cutting',{cutting_id:cuts.at(-1)})
 eq(await sql(`SELECT count(*) FROM app_private.order_callbacks WHERE order_id=${oid} AND status='prepared' AND attempts=0 AND sent_at IS NULL AND next_attempt_at IS NULL`),'1')
 eq(await sql(`SELECT payload->>'sbid' FROM app_private.order_callbacks WHERE order_id=${oid}`),'EXT-SMOKE')
 for(const c of cuts)await command(1,'issue',{cutting_id:c})
 board=(await read(1,'orders_board','1')).find(o=>o.id===oid);eq(board.status,'COMPLETED');eq(board.items.map(i=>i.issued),[3,1])
 eq((await ingest(payload)).body.duplicate,true)
 eq(await sql(`SELECT count(*) FROM app_private.order_callbacks WHERE order_id=${oid}`),'1')
 eq(await sql(`SELECT count(*) FROM public."Order_products" WHERE name='External Salmon'`),'0')
 for(const role of ['anon','authenticated'])for(const table of ['order_callbacks','order_ingest_receipts','order_integration_log'])await denied(sql(`SET ROLE ${role};SELECT * FROM app_private.${table}`),/permission denied/)
 console.log('External ingest: validation/unknown SKU/concurrency/partial/whole/zero rate/comments/dispatch/prepared once/issue/ACL PASS')
}
