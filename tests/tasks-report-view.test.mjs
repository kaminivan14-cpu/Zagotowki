import test from 'node:test'
import assert from 'node:assert/strict'
import {reportRange,reportWeeks,moveReport,actualTime,reportSummary,exportReport} from '../src/tasks/reportView.js'
test('reports use calendar months and seven-day weeks',()=>{assert.deepEqual(reportRange('2026-10-03','week'),{from:'2026-09-28',to:'2026-10-04'});assert.deepEqual(reportRange('2024-02-10','month'),{from:'2024-02-01',to:'2024-02-29'});assert.equal(moveReport('2026-01-31','month',1),'2026-02-01');const weeks=reportWeeks('2026-10-01','2026-10-31');assert.equal(weeks.length,5);assert.equal(weeks.at(-1).to,'2026-10-31')})
test('actual minutes and unknown history are independent of estimates',()=>{const s=reportSummary([{kind:'planned',actual_minutes:75,estimated_minutes:999},{kind:'unplanned',actual_minutes:60},{kind:'unknown',actual_minutes:15}]);assert.equal(actualTime(75),'1 год 15 хв');assert.equal(s.total,150);assert.equal(s.percent('planned'),50);assert.equal(s.percent('unknown'),10);assert.equal(reportSummary([]).percent('planned'),0)})
test('CSV escapes text and formula prefixes',()=>{assert.match(exportReport([{title:'=CMD("x")',actual_minutes:1}]),/"'=CMD\(""x""\)"/)})
