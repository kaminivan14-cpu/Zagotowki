import test from 'node:test'
import assert from 'node:assert/strict'
import { generatorPayload } from '../src/orders/generator.js'
import { operationalChips } from '../src/orders/board.js'
const catalog=[1,2,3].map(id=>({id,name:`P${id}`,active:true,is_test:true}))
const set={product_id:1,item_type:'set',quantity:2,children:[{product_id:2,item_type:'product',quantity:2},{product_id:3,item_type:'addon',quantity:1}]}
test('generator preserves per-set amounts while set count changes, independent addon/drink types',()=>{
 const a=generatorPayload([set],catalog,1,'','')
 assert.equal(a.items[0].quantity,2);assert.equal(a.items[0].children[0].quantity,2)
 const b=generatorPayload([{...set,quantity:5},{product_id:2,item_type:'drink',quantity:1}],catalog,1,'2026-10-03T18:00','18')
 assert.equal(b.items[0].quantity,5);assert.equal(b.items[0].children[0].quantity,2)
 assert.equal(b.items[1].item_type,'drink');assert.equal(b.estimated_prep_minutes,18);assert.ok(b.ready_at.endsWith('Z'))
})
test('generator rejects missing catalog IDs, empty sets, fractional/zero quantities and multiplied overflow',()=>{
 for(const line of [{...set,product_id:99},{...set,children:[]},{...set,quantity:0},{...set,quantity:1.5},{...set,quantity:10000}, {...set,children:[{product_id:2,item_type:'set',quantity:1}]}])assert.equal(generatorPayload([line],catalog,1,'',''),null)
 assert.equal(generatorPayload([set],catalog.map(p=>({...p,active:false})),1,'',''),null)
 assert.equal(generatorPayload([set],catalog,1,'bad',''),null)
 assert.equal(generatorPayload([set],catalog,1,'','0'),null)
 assert.equal(generatorPayload([set],catalog,'','',''),null)
})
test('operational chips expose concurrent existing work/cutting/issue stages without time replacing them',()=>{
 const order={status:'CUTTING',lifecycle:'partial',items:[{item_type:'product',available:1,assignments:[
 {quantity:1,cuttings:[]},
 {quantity:3,ready_for_cutting_at:'now',cutting_available:1,cuttings:[{quantity:1},{quantity:1,completed_at:'now'}]},
 {released_at:'now',quantity:1,cuttings:[]},
 ]}]}
 const chips=operationalChips(order)
 for(const expected of ['CUTTING','lifecycle:partial','TO_DO','IN_PROGRESS','READY_FOR_CUTTING','ready_to_issue'])assert.ok(chips.includes(expected))
 assert.deepEqual(operationalChips({...order,status:'COMPLETED',lifecycle:'done'}),['COMPLETED','lifecycle:done'])
})
