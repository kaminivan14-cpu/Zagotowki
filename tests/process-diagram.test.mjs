import test from 'node:test'
import assert from 'node:assert/strict'
import {graphLayout,editDependency,dependencyEdges} from '../src/tasks/processes/model.js'
const doc=()=>({stages:[{key:'s',tasks:Array.from({length:80},(_,i)=>({key:`t${i}`,title:`Long title ${i}`,depends_on:i===0?[]:i<20?['t0']:i<40?[`t${i-20}`]:[`t${i-20}`,'t0']}))}]})
function crosses(a,b,n){return a.x===b.x?a.x>n.x&&a.x<n.x+250&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+88:a.y>n.y&&a.y<n.y+88&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+250}
test('80-task layered graph routes every connector outside card interiors, always downward',()=>{
 const source=doc(),before=JSON.stringify(source),g=graphLayout(source)
 for(let i=0;i<g.nodes.length;i++)for(let j=i+1;j<g.nodes.length;j++){const a=g.nodes[i],b=g.nodes[j];assert.ok(a.x+250<=b.x||b.x+250<=a.x||a.y+88<=b.y||b.y+88<=a.y)}
 for(const e of [...g.edges,...g.startEdges,...g.endEdges])for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i];assert.ok(b.y>=a.y);for(const n of g.nodes)assert.equal(crosses(a,b,n),false,`${e.from}->${e.to} crosses ${n.key}`)}
 assert.equal(JSON.stringify(source),before);assert.deepEqual(graphLayout(source),g)
})
test('rewiring uses canonical UUID dependencies; invalid edits preserve source; implicit rules protected',()=>{
 const source={stages:[{key:'s',tasks:[{key:'a',depends_on:[]},{key:'b',depends_on:['a']},{key:'c',depends_on:['b']}]}]},before=JSON.stringify(source)
 assert.throws(()=>editDependency(source,{from:'b',to:'c'},'b','a'),/DEPENDENCY_CYCLE/)
 assert.throws(()=>editDependency(source,{from:'a',to:'b'},'a','a'),/DEPENDENCY_CYCLE/)
 assert.throws(()=>editDependency(source,{from:'a',to:'b',implicit:true},'a','c'),/IMPLICIT_DEPENDENCY/)
 const next=editDependency(source,{from:'a',to:'b'},'a','c');assert.deepEqual(next.stages[0].tasks[1].depends_on,[]);assert.deepEqual(next.stages[0].tasks[2].depends_on,['b','a']);assert.equal(JSON.stringify(source),before)
 assert.deepEqual(graphLayout(next).edges.map(({from,to})=>({from,to})),dependencyEdges(next).map(({from,to})=>({from,to})))
})

test('stages have distinct areas containing only their own cards, without changing dependencies',()=>{
 for(const interleaved of [false,true]){
 const source={stages:[{key:'s1',tasks:[{key:'a',depends_on:[]},{key:'b',depends_on:interleaved?['c']:['a']}]},{key:'s2',tasks:[{key:'c',depends_on:['a']}]},{key:'s5',tasks:[{key:'d',depends_on:[]}]}]},before=JSON.stringify(source),g=graphLayout(source)
 assert.equal(g.bands.length,3)
 for(const band of g.bands){assert.equal(band.stageKeys.length,1);for(const n of g.nodes){const inside=n.x>=band.left&&n.x+250<=band.left+band.width&&n.y>=band.top&&n.y+88<=band.top+band.height;assert.equal(inside,n.stageKey===band.stageKeys[0])}}
 for(const e of [...g.edges,...g.startEdges,...g.endEdges])for(let i=1;i<e.points.length;i++){assert.ok(e.points[i].y>=e.points[i-1].y);for(const n of g.nodes)assert.equal(crosses(e.points[i-1],e.points[i],n),false)}
 assert.equal(JSON.stringify(source),before)
 }
})
