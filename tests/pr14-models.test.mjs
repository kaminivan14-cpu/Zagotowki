import test from 'node:test'
import assert from 'node:assert/strict'
import {positionDraft,requiredPositions,positionKey} from '../src/tasks/processes/model.js'
import {readTextSize,saveTextSize,textSizeKey} from '../src/preferences/textSize.js'
import {scaleTypography} from '../scripts/lib/text-scale.mjs'
test('business position draft does not infer positions from permission roles or mutate legacy',()=>{
 const old={schema_version:2,responsible_role:'administrator',involved_roles:['specialist'],stages:[{key:'s',tasks:[{key:'a',responsible_role:'specialist',raci:{accountable:[{type:'role',id:'manager'}]}}]}]}
 const d=positionDraft(old);assert.equal(d.schema_version,3);assert.equal(d.responsible_role,undefined);assert.equal(d.responsible_position,'');assert.equal(old.responsible_role,'administrator');assert.equal(d.stages[0].tasks[0].key,'a');assert.equal(positionKey('  Senior   CHEF '),'senior chef')
 d.responsible_position='Chef';d.involved_positions=['Cook','Chef'];d.stages[0].tasks[0].raci={accountable:[{type:'position',id:'Director'}]};assert.deepEqual(requiredPositions(d),['Chef','Cook','Director']);assert.deepEqual(positionDraft(d),d)
})
test('text preference is per account, rejects invalid saved values, handles denied storage',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};globalThis.document={documentElement:{style:{setProperty(){}}}}
 assert.equal(readTextSize('a',storage),'normal');assert.ok(saveTextSize('a','xlarge',storage));assert.equal(readTextSize('a',storage),'xlarge');assert.equal(readTextSize('b',storage),'normal');values.set(textSizeKey('b'),'bad');assert.equal(readTextSize('b',storage),'normal');assert.equal(saveTextSize('a','large',{setItem(){throw Error()}}),false);delete globalThis.document
})
test('central typography scales absolute font sizes once and leaves geometry and relative sizes alone',()=>{
 const transform=scaleTypography().Declaration
 for(const [prop,value,want] of [['font-size','14px','calc(14px * var(--app-font-scale, 1))'],['font-size','1.2rem','1.2rem'],['width','40px','40px'],['font','18px/1.4 sans-serif','calc(18px * var(--app-font-scale, 1))/1.4 sans-serif']]){const d={prop,value};transform(d);assert.equal(d.value,want);transform(d);assert.equal(d.value,want)}
})
