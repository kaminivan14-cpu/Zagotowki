import test from 'node:test'
import assert from 'node:assert/strict'
import { provisionEmployee, linkAdministrator } from '../scripts/lib/provision-legacy.mjs'
import { trustedEnvironment, UAT_URL, PROD_URL, validLoginPin, validPin, validPinEmail } from '../supabase/functions/_shared/pin-protocol.js'
const uid='11111111-1111-4111-8111-111111111111',reservation='22222222-2222-4222-8222-222222222222'
function fixture({crash=false,conflict=false}={}) {
 let created=false,linked=false,calls=[],failed=false
 const client={
  rpc:async(name,args)=>{
   calls.push([name,args])
   if(name==='upgrade_pin_prepare') return {data:[{employee_id:2,provisioning_id:reservation,email:`${uid}@pin.prod.invalid`,auth_user_id:created?uid:null}]}
   if(name==='upgrade_pin_finish') {
    if(conflict || (crash && !failed)) {failed=true;return {error:{message:'sensitive'}}}
    linked=true;return {data:null}
   }
   return {data:null}
  },auth:{admin:{createUser:async args=>{calls.push(['createUser',args]);created=true;return {data:{user:{id:uid}}}}}},
 }
 return {client,calls,linked:()=>linked}
}
test('PIN-free provisioning retries after Auth creation, preserves the same identity and emits only safe statuses',async()=>{
 const f=fixture({crash:true})
 assert.deepEqual(await provisionEmployee(f.client,2),{employee_id:2,status:'REVIEW_OR_RETRY'})
 assert.deepEqual(await provisionEmployee(f.client,2),{employee_id:2,status:'LINKED'})
 assert.deepEqual(await provisionEmployee(f.client,2),{employee_id:2,status:'LINKED'})
 assert.equal(f.linked(),true)
 assert.equal(f.calls.filter(([n])=>n==='createUser').length,1)
 const created=f.calls.find(([n])=>n==='createUser')[1]
 assert.equal(created.email_confirm,true);assert.equal('password' in created,false)
 for(const [,args] of f.calls) for(const key of ['pin','pin_hash','p_pin','active','role','location_id']) assert.equal(key in args,false)
})
test('provisioning conflict never resets credentials, deletes accounts or retries finalization blindly',async()=>{
 const f=fixture({conflict:true});assert.equal((await provisionEmployee(f.client,2)).status,'REVIEW_OR_RETRY')
 assert.equal(f.linked(),false);assert.deepEqual(f.calls.map(([n])=>n),['upgrade_pin_prepare','createUser','upgrade_pin_finish'])
})
test('administrator linking has no PIN/password argument and reports no Auth UID',async()=>{
 const f=fixture();assert.deepEqual(await linkAdministrator(f.client,1,uid),{employee_id:1,status:'ADMIN_LINKED'})
 assert.deepEqual(f.calls,[['upgrade_link_administrator',{p_employee:1,p_auth_user:uid}]])
})
test('environment binding fails closed across projects and origins; legacy login and new assignment differ',()=>{
 assert.ok(trustedEnvironment('uat',UAT_URL,'https://preview.example.test'))
 assert.ok(trustedEnvironment('production',PROD_URL,'https://production.example.test'))
 for(const x of [['production',UAT_URL,'https://production.example.test'],['uat',PROD_URL,'https://preview.example.test'],['unknown',PROD_URL,'https://production.example.test'],['production',PROD_URL,'http://production.example.test'],['production',PROD_URL,'https://production.example.test/?token=x']]) assert.equal(trustedEnvironment(...x),null)
 for(const pin of ['0001','000001','00000001']) assert.equal(validLoginPin(pin),true)
 for(const pin of ['001','000000001','1e04',1234,' 0001','0001\n']) assert.equal(validLoginPin(pin),false)
 assert.equal(validPin('0001'),true);assert.equal(validPin('000001'),false)
 assert.equal(validPinEmail(`${uid}@pin.prod.invalid`,'production'),true)
 assert.equal(validPinEmail(`${uid}@pin.uat.invalid`,'production'),false)
})
