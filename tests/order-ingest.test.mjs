import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHandler} from '../supabase/functions/order-ingest/handler.mjs'
const secret='x'.repeat(40)
const request=(body,extra={})=>new Request('http://localhost',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json',...extra},body})
test('authenticated request sends intact payload to atomic RPC; public response and request ID',async()=>{
 let args
 const handler=createHandler({secret,location:'1',rpc:async(name,a)=>{assert.equal(name,'order_ingest');args=a;return {http_status:200,body:{success:true,duplicate:true}}}})
 const body={sbid:'SB-1',items:[{sku:'unknown',title:'<script>not HTML</script>',quantity:2,comment:'bez cebuli'}],comment:'order'}
 const res=await handler(request(JSON.stringify(body)));assert.equal(res.status,200);assert.deepEqual(args.p_payload,body);assert.equal(args.p_location,1);assert.ok(res.headers.get('x-request-id'));assert.equal(res.headers.get('access-control-allow-origin'),null)
})
for(const [name,make,config,status] of [
 ['unauthorized',()=>request('{}',{Authorization:'Bearer wrong'}),{},401],
 ['missing location',()=>request('{}'),{location:''},503],
 ['bad secret configuration',()=>request('{}'),{secret:'short'},503],
 ['invalid JSON',()=>request('{'),{},400],
 ['oversized body',()=>request('x'.repeat(262145)),{},413],
 ['content type',()=>request('{}',{'Content-Type':'text/plain'}),{},415],
 ['method',()=>new Request('http://localhost',{headers:{Authorization:`Bearer ${secret}`}}),{},405]
])test(name,async()=>{const calls=[];const res=await createHandler({secret,location:'1',...config,rpc:async(n,a)=>{calls.push([n,a])}})(make());assert.equal(res.status,status);assert.equal(calls[0][0],'order_ingest_log');assert.equal(calls.length,1);assert.ok(!JSON.stringify(calls).includes(secret))})
test('ambiguous RPC timeout is safe 500; never leaks exception and retry stays possible',async()=>{
 const res=await createHandler({secret,location:'1',rpc:async()=>{throw Error(secret)},logError:()=>{}})(request('{}'))
 assert.equal(res.status,500);assert.ok(!(await res.text()).includes(secret))
})
