import {tr} from '../../i18n/runtime.js'
import {roleName} from '../admin/labels.js'
export const processSteps=doc=>(doc?.stages||[]).flatMap((s,i)=>s.tasks.map((t,j)=>({...t,stageKey:s.key,stageName:s.name,number:`${i+1}.${j+1}`})))
export function dependencyEdges(doc){
 const edges=[];let prior=[]
 for(const s of doc.stages){let prev=null;for(const t of s.tasks){
  const ids=new Set([...(t.depends_on||[]),...(doc.sequential_stages?prior:[]),...(t.relative_to?[t.relative_to]:[]),...(t.parallel===false&&prev?[prev]:[])])
  for(const from of ids)edges.push({from,to:t.key,implicit:!(t.depends_on||[]).includes(from)})
  prev=t.key
 }prior=s.tasks.map(t=>t.key)}return edges
}
export function canConnect(doc,from,to){
 const keys=processSteps(doc).map(t=>t.key);if(from===to||!keys.includes(from)||!keys.includes(to))return false
 const edges=dependencyEdges(doc);if(edges.some(e=>e.from===from&&e.to===to))return false
 const seen=new Set(),pending=[to];while(pending.length){const key=pending.pop();if(key===from)return false;if(seen.has(key))continue;seen.add(key);edges.filter(e=>e.from===key).forEach(e=>pending.push(e.to))}return true
}
export function processProgress(tasks){return tasks.length?Math.round(100*tasks.filter(t=>t.status==='completed').length/tasks.length):0}
export const isFinished=i=>i.tasks.length>0&&i.tasks.every(t=>['completed','cancelled'].includes(t.status))
export const taskState=t=>t.status==='completed'?'done':t.status==='cancelled'?'cancelled':t.blocked?'blocked':['in_progress','paused'].includes(t.status)?'working':'new'
export const referenceName=(ref,directory)=>ref.type==='role'?roleName(ref.id):(ref.type==='department'?directory.departments:directory.employees).find(x=>x.id===ref.id)?.name||`#${ref.id}`
export const durationText=t=>t.duration_days!=null?tr('{n} дн.',{n:t.duration_days}):t.estimated_minutes?tr('{n} хв',{n:t.estimated_minutes}):'—'

// Dependency IDs are stored in the existing version document; display numbers never identify edges.
export function graphLayout(doc){
 const tasks=processSteps(doc),edges=dependencyEdges(doc),indegree=new Map(tasks.map(t=>[t.key,0])),levels=new Map(tasks.map(t=>[t.key,0]))
 for(const e of edges){if(!indegree.has(e.from)||!indegree.has(e.to))throw Error('INVALID_DEPENDENCY');indegree.set(e.to,indegree.get(e.to)+1)}
 const queue=tasks.filter(t=>indegree.get(t.key)===0).map(t=>t.key),sorted=[]
 while(queue.length){const id=queue.shift();sorted.push(id);for(const e of edges.filter(e=>e.from===id)){levels.set(e.to,Math.max(levels.get(e.to),levels.get(id)+1));indegree.set(e.to,indegree.get(e.to)-1);if(!indegree.get(e.to))queue.push(e.to)}}
 if(sorted.length!==tasks.length)throw Error('DEPENDENCY_CYCLE')
 const rows=[];for(const t of tasks)(rows[levels.get(t.key)]||= []).push(t)
 // Stable layered DAG: barycentres group children below their predecessors without
 // changing task order/UUIDs in the canonical definition.
 const order=new Map(tasks.map((t,i)=>[t.key,i]))
 for(let pass=0;pass<2;pass++)for(let level=1;level<rows.length;level++){
  const ranks=new Map(rows[level-1].map((t,i)=>[t.key,i]))
  const centre=t=>{const parents=edges.filter(e=>e.to===t.key&&ranks.has(e.from)).map(e=>ranks.get(e.from));return parents.length?parents.reduce((a,b)=>a+b,0)/parents.length:order.get(t.key)}
  rows[level].sort((a,b)=>centre(a)-centre(b)||order.get(a.key)-order.get(b.key))
 }
 const cardWidth=250,cardHeight=88,gap=80,railGap=14
 // Group by actual stage, never by a shared dependency level. Stage ordering is
 // presentation only; it adds no dependency. Interleaved stage DAGs use lanes.
 const stageOf=new Map(tasks.map(t=>[t.key,t.stageKey])),stageKeys=doc.stages.map(s=>s.key)
 const stageLinks=[...new Set(edges.filter(e=>stageOf.get(e.from)!==stageOf.get(e.to)).map(e=>JSON.stringify([stageOf.get(e.from),stageOf.get(e.to)])))].map(x=>JSON.parse(x))
 const remaining=new Set(stageKeys),stageOrder=[]
 while(remaining.size){const key=stageKeys.find(k=>remaining.has(k)&&!stageLinks.some(([a,b])=>b===k&&remaining.has(a)));if(key===undefined)break;stageOrder.push(key);remaining.delete(key)}
 const lanes=remaining.size>0,bands=[],nodes=[]
 const stageRows=key=>rows.map(row=>row.filter(t=>t.stageKey===key))
 const stageWidth=key=>Math.max(760,...stageRows(key).map(r=>r.length*(cardWidth+gap)+gap))
 let cursor=90,left=0
 const contentWidth=lanes?stageKeys.reduce((sum,k)=>sum+stageWidth(k)+60,0):Math.max(760,...stageKeys.map(stageWidth))
 for(const key of lanes?stageKeys:stageOrder){
  const localRows=stageRows(key),top=lanes?90:cursor,width=lanes?stageWidth(key):contentWidth
  const band={key:`stage-${key}`,stageKeys:[key],left:lanes?left:0,top,width,height:0}
  let y=top+88
  localRows.forEach((row,level)=>{if(!row.length&&!lanes)return
   row.forEach((t,i)=>nodes.push({...t,level,x:band.left+(width-(row.length*(cardWidth+gap)-gap))/2+i*(cardWidth+gap),y}))
   y+=cardHeight+100
  })
  band.height=Math.max(108,y-top-20);bands.push(band);cursor=Math.max(cursor,top+band.height+60);left+=width+60
 }
 const height=cursor+90

 const byKey=new Map(nodes.map(n=>[n.key,n]));let rail=0
 const route=(a,b)=>{
  const from={x:a.x+cardWidth/2,y:a.y+cardHeight},to={x:b.x+cardWidth/2,y:b.y}
  if(a.stageKey===b.stageKey&&b.y===a.y+cardHeight+100)return [from,{x:from.x,y:from.y+50},{x:to.x,y:from.y+50},to]
  const x=contentWidth+(++rail)*railGap
  return [from,{x:from.x,y:from.y+35},{x,y:from.y+35},{x,y:to.y-25},{x:to.x,y:to.y-25},to]
 }
 const routed=edges.map(e=>({...e,points:route(byKey.get(e.from),byKey.get(e.to))}))
 const terminalX=contentWidth/2
 const startEdges=nodes.filter(n=>!edges.some(e=>e.to===n.key)).map(n=>{
  const x=contentWidth+(++rail)*railGap
  return {to:n.key,points:[{x:terminalX,y:42},{x:terminalX,y:60},{x,y:60},{x,y:n.y-25},{x:n.x+125,y:n.y-25},{x:n.x+125,y:n.y}]}
 })
 const endEdges=nodes.filter(n=>!edges.some(e=>e.from===n.key)).map(n=>{
  const x=contentWidth+(++rail)*railGap
  return {from:n.key,points:[{x:n.x+125,y:n.y+cardHeight},{x:n.x+125,y:n.y+cardHeight+35},{x,y:n.y+cardHeight+35},{x,y:height-60},{x:terminalX,y:height-60},{x:terminalX,y:height-35}]}
 })
 return {edges:routed,rows,bands,width:contentWidth+(rail+2)*railGap,height,nodes,startEdges,endEdges,terminalX}

}
export function requiredRoles(doc){return [...new Set([doc.responsible_role,...(doc.involved_roles||[]),...processSteps(doc).flatMap(t=>[t.responsible_role,...Object.values(t.raci||{}).flat().filter(r=>r.type==='role').map(r=>r.id)])].filter(Boolean))]}
export function wizardDraft(def){
 const doc=structuredClone(def);if(doc.schema_version===2)return doc
 const keys=new Map(processSteps(doc).map(t=>[t.key,/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(t.key)?t.key:crypto.randomUUID()]))
 delete doc.owner_employee_id
 return {...doc,schema_version:2,goal:doc.goal||'',expected_result:doc.expected_result||'',responsible_role:'',involved_roles:[],launch_type:'manual',stages:doc.stages.map(s=>({...s,key:/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s.key||'')?s.key:crypto.randomUUID(),tasks:s.tasks.map(t=>{const copy={...t,key:keys.get(t.key),depends_on:(t.depends_on||[]).map(k=>keys.get(k)),relative_to:t.relative_to?keys.get(t.relative_to):null,responsible_role:'',raci:{accountable:[],consulted:[],informed:[]}};delete copy.assigned_to_employee_id;delete copy.approver_id;return copy})}))}
}
export function patchTask(doc,key,patch){return {...doc,stages:doc.stages.map(s=>({...s,tasks:s.tasks.map(t=>t.key===key?{...t,...patch}:t)}))}}
export function removeTask(doc,key){return {...doc,stages:doc.stages.map(s=>({...s,tasks:s.tasks.filter(t=>t.key!==key).map(t=>({...t,depends_on:(t.depends_on||[]).filter(id=>id!==key),relative_to:t.relative_to===key?null:t.relative_to}))}))}}

export function addStageTask(doc,stageKey,task){return {...doc,stages:doc.stages.map(s=>s.key===stageKey?{...s,tasks:[...s.tasks,{...task,estimated_minutes:30,depends_on:s.tasks.length?[s.tasks.at(-1).key]:[]}]}:s)}}
export function validateDeadlines(doc){for(const s of doc.stages){for(const x of [s,...s.tasks])if(x.deadline_offset_days!=null&&(!Number.isInteger(x.deadline_offset_days)||x.deadline_offset_days<0))throw Error('INVALID_DEADLINE');for(const t of s.tasks)if(s.deadline_offset_days!=null&&t.deadline_offset_days!=null&&t.deadline_offset_days>s.deadline_offset_days)throw Error('TASK_STAGE_DEADLINE')}return true}
export function editDependency(doc,edge,from,to,mode='replace'){
 if(edge?.implicit)throw Error('IMPLICIT_DEPENDENCY')
 let next=structuredClone(doc)
 if(edge&&mode!=='add')next=patchTask(next,edge.to,{depends_on:processSteps(next).find(t=>t.key===edge.to).depends_on.filter(k=>k!==edge.from)})
 if(mode!=='delete'){
  if(!canConnect(next,from,to))throw Error('DEPENDENCY_CYCLE')
  next=patchTask(next,to,{depends_on:[...(processSteps(next).find(t=>t.key===to).depends_on||[]),from]})
 }
 graphLayout(next);return next
}

export const connectorPath=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')
