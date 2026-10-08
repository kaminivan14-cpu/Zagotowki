import test from 'node:test'
import assert from 'node:assert/strict'
import {moduleStates} from '../src/tasks/access/model.js'
test('access distinguishes unknown from denied without role assumptions',()=>{
 assert.ok(moduleStates(null).every(m=>m.allowed===null))
 assert.ok(moduleStates([]).every(m=>m.allowed===false))
 assert.equal(moduleStates(['tasks.access']).find(m=>m.id==='admin').allowed,false)
 assert.equal(moduleStates(['tasks.access','tasks.admin','processes.read']).find(m=>m.id==='processes').allowed,true)
 assert.equal(moduleStates(['processes.read']).find(m=>m.id==='processes').allowed,false)
 assert.equal(moduleStates(['worktime.self']).find(m=>m.id==='worktime').allowed,false)
 assert.equal(moduleStates(['worktime.access']).find(m=>m.id==='worktime').allowed,true)
 assert.equal(moduleStates(['production.access']).find(m=>m.id==='orders').allowed,false)
})
