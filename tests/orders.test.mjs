import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingOperation, orderError } from '../src/orders/client.js'
import { normalizeOrder } from '../src/orders/import/normalize.js'
import { validEmployee } from '../src/auth/session.js'
import { canWorkOnPlan, productionDate } from '../src/planAccess.js'
test('role compatibility preserves narrow today/local production access',()=>{
 for(const role of ['employee','crafter','sushi-master','shift-manager','su-chef','manager','administrator']){
  const e={id:4,role,location_id:1,active:true,auth_user_id:'test'}
  assert.equal(validEmployee(e,'test'),true)
  assert.equal(validEmployee({...e,archived_at:'2026-10-01'},'test'),false)
  assert.equal(canWorkOnPlan(e,{location_id:1,status:'active',plan_date:productionDate()}),true)
  assert.equal(canWorkOnPlan(e,{location_id:1,status:'active',plan_date:productionDate(-1)}),false)
 }
})
test('operation survives refresh, same intent retries UUID; changed intent cannot overwrite unresolved operation',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}
 const op=pendingOperation(storage,4,'claim',{order_id:1,items:[]})
 assert.deepEqual(pendingOperation(storage,4,'claim',{order_id:1,items:[]}),op)
 assert.throws(()=>pendingOperation(storage,4,'claim',{order_id:2,items:[]}),/PENDING_OPERATION/)
 assert.notEqual(pendingOperation(storage,5,'claim',{order_id:1,items:[]}).id,op.id)
})
test('import boundary refuses whole payload when any product/location is unmapped',()=>{
 const p=new Map([['synthetic:roll',1]]),l=new Map([['synthetic:A',1]])
 const input={source:'synthetic',externalId:'one',locationKey:'A',items:[{productKey:'roll',quantity:2}]}
 assert.deepEqual(normalizeOrder(input,p,l).items,[{product_id:1,quantity:2}])
 assert.throws(()=>normalizeOrder({...input,items:[...input.items,{productKey:'unknown',quantity:1}]},p,l),/PRODUCT_UNMAPPED/)
 assert.throws(()=>normalizeOrder({...input,locationKey:'B'},p,l),/LOCATION_UNMAPPED/)
 assert.throws(()=>normalizeOrder({...input,items:[{productKey:'roll',quantity:0}]},p,l),/INVALID_QUANTITY/)
 assert.throws(()=>normalizeOrder({},p,l),/INVALID_PAYLOAD/)
})
test('errors never disclose arbitrary SQL details',()=>{
 assert.equal(orderError({message:'secret SQL text'}).includes('secret'),false)
 assert.match(orderError({message:'CLAIM_CONFLICT'}),/przejęta/)
})

test('PLN display and decimal input preserve exact grosz amounts', async () => {
  const { money, parseRate } = await import('../src/orders/client.js')
  assert.equal(money(1250),'12,50 zł')
  assert.equal(money('100000000'),'1000000,00 zł')
  assert.equal(money(1),'0,01 zł')
  assert.equal(parseRate('12,50'),1250)
  assert.equal(parseRate('0.29'),29)
  assert.equal(parseRate('1000000,00'),100000000)
  for (const value of ['1,001','-1','1e3','1000000,01','NaN','']) assert.equal(parseRate(value),null)
})
