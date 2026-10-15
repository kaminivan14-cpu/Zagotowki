import test from 'node:test'
import assert from 'node:assert/strict'
import { metrics, missing, editable, auditTime, validatePhoto } from '../src/audit/model.js'
const audit={questions:Array(10).fill('Q'),answers:[...Array(7).fill({answer:'yes'}),{answer:'na'},...Array(2).fill({answer:'no'})],photos:[],location_id:1,status:'active',author_id:'one'}
test('progress and Score are distinct, N/A remains positive and in denominator',()=>{
 assert.deepEqual(metrics(audit),{yes:7,no:2,na:1,progress:100,score:80})
 assert.equal(metrics({...audit,answers:Array(10).fill({answer:'na'})}).score,100)
 assert.equal(metrics({...audit,answers:[...audit.answers.slice(0,8),{answer:null},{answer:null}]}).progress,80)
 assert.equal(metrics({...audit,answers:Array(10).fill({answer:'no'})}).score,0)
})
test('completion requirements and immutable/read-only presentation',()=>{
 assert.deepEqual(missing(audit),[])
 assert.equal(missing({...audit,location_id:null,photos:[{state:'pending'}],answers:[{answer:null}]}).length,3)
 assert.equal(editable(audit,{auth_user_id:'one'}),true)
 assert.equal(editable(audit,{auth_user_id:'two'}),false)
 assert.equal(editable({...audit,status:'completed'},{auth_user_id:'one'}),false)
 assert.match(auditTime('2026-01-10T12:00:00Z'),/13:00/)
 assert.match(auditTime('2026-07-10T12:00:00Z'),/14:00/)
})
test('photo content validation supports mobile formats and rejects invalid/oversize',async()=>{
 const jpg=new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'})
 assert.equal(await validatePhoto(jpg),'image/jpeg')
 assert.equal(await validatePhoto(new Blob(['0000ftypheic00000000'])),'image/heic')
 await assert.rejects(validatePhoto(new Blob(['not an image'],{type:'image/jpeg'})))
 await assert.rejects(validatePhoto(new Blob([new Uint8Array([255,216,255]),new Uint8Array(10485760)])))
})
