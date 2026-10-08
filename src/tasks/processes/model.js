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
export const durationText=t=>t.duration_days!=null?`${t.duration_days} дн.`:t.estimated_minutes?`${t.estimated_minutes} хв`:'—'

// Dependency IDs are stored in the existing version document; display numbers never identify edges.
export function graphLayout(doc){
 const tasks=processSteps(doc),edges=dependencyEdges(doc),indegree=new Map(tasks.map(t=>[t.key,0])),levels=new Map(tasks.map(t=>[t.key,0]))
 for(const e of edges){if(!indegree.has(e.from)||!indegree.has(e.to))throw Error('INVALID_DEPENDENCY');indegree.set(e.to,indegree.get(e.to)+1)}
 const queue=tasks.filter(t=>indegree.get(t.key)===0).map(t=>t.key),sorted=[]
 while(queue.length){const id=queue.shift();sorted.push(id);for(const e of edges.filter(e=>e.from===id)){levels.set(e.to,Math.max(levels.get(e.to),levels.get(id)+1));indegree.set(e.to,indegree.get(e.to)-1);if(!indegree.get(e.to))queue.push(e.to)}}
 if(sorted.length!==tasks.length)throw Error('DEPENDENCY_CYCLE')
 const rows=[];for(const t of tasks)(rows[levels.get(t.key)]||= []).push(t)
 const width=Math.max(760,...rows.map(r=>r.length*280+48)),bands=[],positions=[];let cursor=70,last=''
 rows.forEach((row,level)=>{const signature=[...new Set(row.map(t=>t.stageKey))].join('|');if(signature!==last){cursor+=60;bands.push({key:`band-${level}`,stageKeys:[...new Set(row.map(t=>t.stageKey))],top:cursor-55,height:0});last=signature}positions.push(cursor);cursor+=130;bands.at(-1).height=cursor-bands.at(-1).top-8})
 const height=cursor+70
 return {edges,rows,bands,width,height,nodes:rows.flatMap((row,level)=>row.map((t,i)=>({...t,level,x:(width-row.length*280)/2+i*280,y:positions[level]})))}
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
