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
test('date filters require real Polish calendar dates and keep ISO only for RPC',async()=>{
 const {polishDate,parsePolishDate}=await import('../src/worktime/client.js')
 assert.equal(polishDate('2026-10-03'),'03.10.2026')
 assert.equal(parsePolishDate('03.10.2026'),'2026-10-03')
 for(const value of ['10/03/2026','31.02.2026','29.02.2025','00.10.2026'])assert.equal(parsePolishDate(value),null)
 assert.equal(parsePolishDate('29.02.2024'),'2024-02-29')
})
