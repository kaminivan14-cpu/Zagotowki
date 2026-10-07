import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
export async function verifyRouting({sql,read,eq,denied,lit}){
 await sql(await readFile('supabase/migrations/202610100002_order_location_routing.sql','utf8'))
 await sql(`UPDATE public."Locations" SET name=CASE id WHEN 1 THEN 'SB_Wroclaw' ELSE 'SB_Poznan 2.0' END WHERE id IN(1,2);ALTER TABLE public."Locations" ALTER COLUMN id RESTART WITH 100`)
 const seed=await readFile('supabase/seeds/production/order-location-routing.sql','utf8')
 const originals=await sql(`SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public."Locations" l WHERE id IN(1,2)`)
 await sql(seed);const locations=await sql(`SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public."Locations" l`);await sql(seed)
 eq(await sql(`SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public."Locations" l`),locations)
 eq(await sql(`SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public."Locations" l WHERE id IN(1,2)`),originals)
 const maps=JSON.parse(await sql(`SELECT jsonb_object_agg(external_location_id,location_id) FROM app_private.order_location_mappings WHERE source='external-v1'`))
 const payload=(sbid,location)=>({sbid,location,items:[{sku:'ANY-SKU',title:'Routing test',quantity:2}]})
 const ingest=p=>sql(`SET ROLE service_role;SELECT public.order_ingest_routed(${lit(p)},'${randomUUID()}')`).then(JSON.parse)
 const order=id=>sql(`SELECT location_id FROM public."Orders" WHERE integration_sbid='${id}'`)
 for(const [code,id] of Object.entries(maps)){
  const sbid='ROUTE-'+code;eq((await ingest(payload(sbid,code))).http_status,200);eq(await order(sbid),String(id))
  const board=await read(1,'orders_board',String(id));eq(board.some(o=>o.integration_sbid===sbid),true)
  eq((await ingest(payload(sbid,code))).body.duplicate,true)
  eq((await ingest(payload(sbid,code==='pulaski'?'czerwca':'pulaski'))).http_status,409)
  eq(await order(sbid),String(id))
 }
 for(const value of [' PULASKI ','Pulaski','Pułaski','\tPuŁASKI\n'])eq((await ingest(payload('ROUTE-pulaski',value))).body.duplicate,true)
 const before=await sql('SELECT count(*) FROM public."Orders"')
 for(const value of [null,undefined,'','  ','wroclaw','unknown',1,{},['pulaski']])eq((await ingest(payload('INVALID-LOC',value))).http_status,400)
 eq(await sql('SELECT count(*) FROM public."Orders"'),before)
 const p=payload('ROUTE-CONCURRENT','pulaski');const race=await Promise.all([ingest(p),ingest({...p,location:'czerwca'})]);eq(race.map(r=>r.http_status).sort(),[200,409])
 const same=await Promise.all([ingest(payload('ROUTE-SAME','damrota')),ingest(payload('ROUTE-SAME','damrota'))]);eq(same.map(r=>r.http_status),[200,200]);eq(same.filter(r=>r.body.duplicate).length,1)
 // Long raw SBID with valid trimmed length follows the original ingest validator and must still lock routing.
 const long=' '.repeat(205)+'LONG';const lr=await Promise.all([ingest(payload(long,'pulaski')),ingest(payload(long,'czerwca'))]);eq(lr.map(r=>r.http_status).sort(),[200,409])
 await sql(`UPDATE public."Locations" SET active=false WHERE id=${maps.damrota}`)
 eq((await ingest(payload('INACTIVE-LOC','damrota'))).http_status,503)
 await sql(`UPDATE public."Locations" SET active=true WHERE id=${maps.damrota}`)
 const legacy={sbid:'EXT-SMOKE',items:[{sku:'UNKNOWN',title:'External Salmon',quantity:3,comment:'bez cebuli'},{sku:'UNKNOWN',title:'Second line'}],comment:'general comment'}
 eq((await ingest({...legacy,location:'pulaski'})).body.duplicate,true);eq((await ingest({...legacy,location:'czerwca'})).http_status,409)
 eq(await sql(`SELECT external_location IS NULL FROM app_private.order_ingest_receipts WHERE sbid='EXT-SMOKE'`),'t')
 eq(await sql(`SELECT count(*) FROM app_private.order_callbacks c WHERE sbid='EXT-SMOKE' AND NOT(payload ? 'location')`),'1')
 for(const role of ['anon','authenticated'])await denied(sql(`SET ROLE ${role};SELECT public.order_ingest_routed(${lit(p)},'${randomUUID()}')`),/permission denied/)
 console.log('Routing: 4 mappings, repeatable seed, legacy receipts, normalization, bad/missing location, cross-location race, immutable location, Kitchen boards PASS')
}
