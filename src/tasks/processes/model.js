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
export const referenceName=(ref,directory)=>(ref.type==='department'?directory.departments:directory.employees).find(x=>x.id===ref.id)?.name||`#${ref.id}`
export const durationText=t=>t.duration_days!=null?`${t.duration_days} дн.`:t.estimated_minutes?`${t.estimated_minutes} хв`:'—'
