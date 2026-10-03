import test from 'node:test'
import assert from 'node:assert/strict'
import {date,time,duration,warsawInstant,correctionInstant} from '../src/worktime/client.js'
test('Warsaw dates and duration cross midnight without splitting a session',()=>{
 assert.equal(date('2026-10-03T22:30:00Z'),'04.10.2026')
 assert.equal(time('2026-10-03T22:30:00Z'),'00:30')
 assert.equal(duration(495),'8 h 15 min')
 assert.equal(warsawInstant('2026-10-03T22:00'),'2026-10-03T20:00:00.000Z')
})
test('DST gaps and ambiguous wall times require explicit offsets; unchanged timestamps preserve seconds',()=>{
 assert.throws(()=>warsawInstant('2026-03-29T02:30'),/nie istnieje/)
 assert.throws(()=>warsawInstant('2026-10-25T02:30'),/niejednoznaczna/)
 assert.equal(correctionInstant('2026-10-25T02:30+01:00',null),'2026-10-25T01:30:00.000Z')
 assert.equal(correctionInstant('2026-10-03T22:00','2026-10-03T20:00:31Z'),'2026-10-03T20:00:31Z')
 assert.equal(correctionInstant('',null),null)
})
