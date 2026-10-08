import {test} from 'node:test'
import assert from 'node:assert/strict'
import {dependencyEdges,canConnect,processProgress,taskState,isFinished} from '../src/tasks/processes/model.js'
const doc={sequential_stages:true,stages:[{tasks:[{key:'a',depends_on:[]},{key:'b',depends_on:[]}]},{tasks:[{key:'c',depends_on:[]}]}]}
test('stage barriers and explicit links share one graph; no cycle/self/duplicate',()=>{
 assert.deepEqual(dependencyEdges(doc).map(e=>[e.from,e.to]),[['a','c'],['b','c']])
 assert.equal(canConnect(doc,'c','a'),false);assert.equal(canConnect(doc,'a','a'),false);assert.equal(canConnect(doc,'a','c'),false);assert.equal(canConnect(doc,'a','b'),true)
 const old={...doc,sequential_stages:false};assert.deepEqual(dependencyEdges(old),[])
})
test('progress counts only completed real Tasks; blocked and cancelled remain distinct',()=>{
 const tasks=[{status:'completed'},{status:'planned',blocked:true},{status:'in_progress'}]
 assert.equal(processProgress(tasks),33);assert.equal(taskState(tasks[1]),'blocked');assert.equal(taskState(tasks[2]),'working');assert.equal(isFinished({tasks}),false)
 assert.equal(isFinished({tasks:[{status:'completed'},{status:'cancelled'}]}),true);assert.equal(processProgress([]),0)
})
