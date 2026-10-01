import test from 'node:test'
import assert from 'node:assert/strict'
import { planningRange,localToInstant,addDays } from '../src/tasks/dateTime.js'
import { validEmployee } from '../src/auth/session.js'
test('task roles log in without inventing a production location',()=>{for(const role of ['owner','director','expert','specialist'])assert.equal(validEmployee({role,active:true,id:1,auth_user_id:'u'},'u'),true);assert.equal(validEmployee({role:'crafter',active:true,id:1,auth_user_id:'u'},'u'),false)})
test('Mon–Thu current week; Fri–Sun next week; month exactly four weeks',()=>{
 for(const day of ['2026-09-28','2026-09-29','2026-09-30','2026-10-01'])assert.deepEqual(planningRange(day),{from:'2026-09-28',to:'2026-10-04'})
 for(const day of ['2026-10-02','2026-10-03','2026-10-04'])assert.deepEqual(planningRange(day),{from:'2026-10-05',to:'2026-10-11'})
 assert.deepEqual(planningRange('2026-10-02','month'),{from:'2026-09-28',to:'2026-10-25'})
 assert.equal(addDays('2026-12-31',1),'2027-01-01')
})
test('company timezone resolves independently of browser and rejects ambiguous/missing DST wall time',()=>{
 assert.equal(localToInstant('2026-10-02T10:00','Europe/Warsaw'),'2026-10-02T08:00:00.000Z')
 assert.equal(localToInstant('2026-12-02T10:00','Europe/Warsaw'),'2026-12-02T09:00:00.000Z')
 assert.throws(()=>localToInstant('2026-03-29T02:30','Europe/Warsaw'),/INVALID_LOCAL_TIME/)
 assert.throws(()=>localToInstant('2026-10-25T02:30','Europe/Warsaw'),/INVALID_LOCAL_TIME/)
 assert.equal(localToInstant('','Europe/Warsaw'),null)
})
