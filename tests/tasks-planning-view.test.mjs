import test from 'node:test'
import assert from 'node:assert/strict'
import {nextWeekAvailable,weekRange,loadText,loadLevel,rootCategory,categoryTotals} from '../src/tasks/planningView.js'
test('week selector keeps current week and opens next-week planning Friday through Sunday',()=>{
 for(const [date,available] of [['2026-09-28',false],['2026-09-29',false],['2026-09-30',false],['2026-10-01',false],['2026-10-02',true],['2026-10-03',true],['2026-10-04',true]]){
  assert.equal(nextWeekAvailable(date),available)
  assert.deepEqual(weekRange(date,'current'),{from:'2026-09-28',to:'2026-10-04'})
  assert.deepEqual(weekRange(date,'next'),{from:'2026-10-05',to:'2026-10-11'})
 }
})
test('unknown estimates remain unknown and capacity thresholds include zero availability',()=>{
 assert.equal(loadText(240,1),'~4 год + 1 без оцінки')
 assert.equal(loadText(0,2),'2 без оцінки')
 assert.equal(loadLevel({planned_minutes:60,capacity_minutes:0}),'overloaded')
 assert.equal(loadLevel({planned_minutes:310,capacity_minutes:360}),'near')
 assert.equal(loadLevel({planned_minutes:200,capacity_minutes:360}),'normal')
})
test('category summaries follow server hierarchy and names, including uncategorized tasks',()=>{
 const categories=[{id:1,name:'Операційні'},{id:2,name:'Власна категорія'},{id:3,name:'Аудити',parent_id:1}]
 assert.equal(rootCategory(3,categories).id,1)
 assert.deepEqual(categoryTotals([{category_id:3},{category_id:2},{category_id:null},{category_id:3,status:'cancelled'}],categories).map(c=>[c.name,c.count]),[['Операційні',1],['Власна категорія',1],['Інші',1]])
})
