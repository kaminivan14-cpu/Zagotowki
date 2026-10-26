import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {auditDatabase,uid} from './helpers/audit-db.mjs'
const granted=['orders.access','orders.work','orders.cut','orders.issue']
const added=['su-chef','shift-manager','sushi-master','crafter']
test('Production Orders module access preserves every other effective permission and local scope',async()=>{
 const db=await auditDatabase()
 try {
  await db.exec('DROP TRIGGER employees_role_alias ON public."Employees";')
  await db.exec(await readFile('tests/fixtures/order-callbacks.sql','utf8'))
  await db.exec(await readFile('supabase/upgrades/production/09_orders_delete.sql','utf8'))
  await db.exec(await readFile('tests/fixtures/production-role-policy.sql','utf8'))
  await db.exec(`DELETE FROM app_private.role_permissions WHERE permission LIKE 'orders.%' AND role NOT IN ('administrator','manager');`)
  const matrix=()=>db.query(`SELECT role,permission,app_private.role_has_permission(role,permission) allowed FROM (SELECT DISTINCT role FROM app_private.role_permissions UNION SELECT unnest(ARRAY['su-chef','shift-manager','sushi-master','crafter'])) r CROSS JOIN (SELECT DISTINCT permission FROM app_private.role_permissions)p ORDER BY role,permission`)
  const before=(await matrix()).rows
  await db.exec(await readFile('supabase/upgrades/production/10_orders_role_access.sql','utf8'))
  await db.exec(await readFile('tests/orders-role-access-smoke.sql','utf8'))
  const after=(await matrix()).rows
  assert.deepEqual(after.filter(x=>!added.includes(x.role)||!granted.includes(x.permission)),before.filter(x=>!added.includes(x.role)||!granted.includes(x.permission)))
  for(const role of ['administrator','manager',...added,'employee','owner','director']){
   await db.exec(`UPDATE public."Employees" SET role='${role}',location_id=1 WHERE id=1; SET request.jwt.claim.sub='${uid(1)}'; SET ROLE authenticated;`)
   const allowed=['administrator','manager',...added].includes(role)
   const caps=(await db.query('SELECT public.auth_capabilities() cap')).rows.map(x=>x.cap)
   assert.equal(caps.includes('orders.access'),allowed,role)
   assert.equal(caps.includes('orders.delete'),['administrator','manager'].includes(role),role)
   if(allowed){
    for(const rpc of ['orders_board(1)','orders_catalog()','orders_shifts()'])await db.query(`SELECT public.${rpc}`)
    if(role!=='administrator')await assert.rejects(db.query('SELECT public.orders_board(2)'),/ORDERS_DENIED/)
   }else await assert.rejects(db.query('SELECT public.orders_board(1)'),/ORDERS_DENIED/)
   if(added.includes(role)){
    await assert.rejects(db.query("SELECT public.order_delete(1,999,gen_random_uuid())"),/ORDERS_DENIED/)
    await assert.rejects(db.query("SELECT public.orders_delete_bulk(1,ARRAY[999]::bigint[],gen_random_uuid())"),/ORDERS_DENIED/)
    for(const cap of granted)assert.ok(caps.includes(cap),`${role}: ${cap}`)
   }
   await db.exec('RESET ROLE;')
  }
  await db.exec(`UPDATE public."Employees" SET role='crafter',active=false WHERE id=1;SET ROLE authenticated;`)
  assert.deepEqual((await db.query('SELECT public.auth_capabilities()')).rows,[])
 } finally {await db.close()}
})
