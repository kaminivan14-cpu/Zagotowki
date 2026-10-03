import test from 'node:test'
import assert from 'node:assert/strict'
import { deadline, visibleItems, operational, lifecycle, setAvailable, selectedItems } from '../src/orders/board.js'
import { normalizeOrder } from '../src/orders/import/normalize.js'
const now=Date.parse('2026-10-03T12:00:00Z'),at=minutes=>new Date(now+minutes*60000).toISOString()
test('deadlines: absent, >30, exact30, exact10 and overdue without invented estimates',()=>{
 assert.equal(deadline(null,now),null);assert.equal(deadline('bad',now),null)
 for(const [n,level] of [[31,'normal'],[30,'warning'],[10,'urgent'],[0,'urgent'],[-12,'overdue']])assert.equal(deadline(at(n),now).level,level)
 assert.equal(deadline(at(-12),now).minutes,12)
})
const items=[{id:1,item_type:'set',quantity:2},{id:2,parent_item_id:1,item_type:'product',quantity:4,available:2,issued:0},{id:3,parent_item_id:1,item_type:'addon',quantity:2,available:1,issued:0},{id:4,parent_item_id:1,item_type:'drink',quantity:2,available:2,issued:0},{id:5,item_type:'drink',quantity:1,available:1,issued:0}]
test('drinks are hidden without mutating data; addons and set children stay operational',()=>{
 const before=structuredClone(items)
 assert.deepEqual(visibleItems({items}).map(i=>i.id),[1,2,3]);assert.deepEqual(items,before)
 assert.equal(operational(items[0]),false);assert.equal(setAvailable(items[0],items),1)
 assert.deepEqual(selectedItems({items},{1:2,2:1,3:2,4:2}),[{item_id:2,quantity:1}])
 assert.equal(lifecycle({items}),'partial')
 assert.equal(lifecycle({items:items.map(i=>operational(i)?{...i,issued:i.quantity}:i)}),'done')
})
test('normalized source explicitly carries timing and per-set composition, never guesses a recipe',()=>{
 const products=new Map([['demo:set',1],['demo:roll',2]]),locations=new Map([['demo:A',1]])
 const input={source:'demo',externalId:'001',locationKey:'A',ready_at:at(30),estimated_prep_minutes:18,items:[{productKey:'set',quantity:2,children:[{productKey:'roll',quantity:2}]}]}
 const normalized=normalizeOrder(input,products,locations)
 assert.deepEqual(normalized.items,[{product_id:1,quantity:2,children:[{product_id:2,quantity:2}]}]);assert.equal(normalized.ready_at,at(30));assert.equal(normalized.estimated_prep_minutes,18)
 assert.throws(()=>normalizeOrder({...input,ready_at:'2026-10-03T12:00'},products,locations),/INVALID_READY_AT/)
 assert.throws(()=>normalizeOrder({...input,estimated_prep_minutes:0},products,locations),/INVALID_PREP_TIME/)
 assert.throws(()=>normalizeOrder({...input,items:[{productKey:'set',quantity:2,children:[]}]},products,locations),/INVALID_SET/)
})

test('shared urgency sorting, filters and client threshold transitions',async()=>{
 const {sortedOrders}=await import('../src/orders/board.js')
 const make=(id,ready,received=-100)=>({id,ready_at:ready===null?null:at(ready),received_at:at(received),lifecycle:'in_progress',items:[]})
 const orders=[make(6,null,-50),make(4,60),make(3,20),make(5,null,-100),make(2,8),make(1,-3)]
 assert.deepEqual(sortedOrders(orders,now).map(o=>o.id),[1,2,3,4,5,6])
 assert.deepEqual(sortedOrders(orders,now,'warning').map(o=>o.id),[3])
 assert.deepEqual(sortedOrders(orders,now+21*60000,'overdue').map(o=>o.id),[1,2,3])
 assert.deepEqual(orders.map(o=>o.id),[6,4,3,5,2,1])
})
test('actual preparation starts only from dispatch timestamp with minute/hour/day formatting',async()=>{
 const {preparationTime}=await import('../src/orders/board.js')
 assert.equal(preparationTime({created_at:at(-100),received_at:at(-90)},now),null)
 for(const [minutes,value] of [[18,'18 min'],[68,'1 h 08 min'],[1560,'1 d 2 h']])
  assert.equal(preparationTime({sent_to_kitchen_at:at(-minutes),created_at:at(-9999)},now),value)
 assert.equal(preparationTime({sent_to_kitchen_at:'invalid'},now),null)
})
