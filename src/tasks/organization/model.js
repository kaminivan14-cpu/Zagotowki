export function organizationGroups(data){
 const people=new Map(data.employees.map(e=>[e.id,e]))
 const assignments=new Map(data.assignments.map(a=>[a.employee_id,{...a}]))
 const issues=[],departments=new Set(data.departments.map(d=>d.id)),visited=new Set(),visiting=new Set()
 for(const [id,a] of assignments){
  if(a.department_id!=null&&!departments.has(a.department_id)){issues.push({type:'missing_department',employee_id:id});a.department_id=null}
  if(a.manager_employee_id!=null&&!people.has(a.manager_employee_id)){issues.push({type:'missing_manager',employee_id:id});a.manager_employee_id=null}
 }
 const check=id=>{if(visited.has(id))return;visiting.add(id);const a=assignments.get(id),manager=a?.manager_employee_id
  if(manager!=null){if(visiting.has(manager)){issues.push({type:'cycle',employee_id:id});a.manager_employee_id=null}else check(manager)}
  visiting.delete(id);visited.add(id)
 }
 for(const id of people.keys())check(id)
 const owners=data.employees.filter(e=>e.role==='owner')
 const groups=[...data.departments,{id:null,name:null}].map(d=>{
  const members=data.employees.filter(e=>e.role!=='owner'&&(assignments.get(e.id)?.department_id??null)===d.id)
  const ids=new Set(members.map(e=>e.id))
  const roots=members.filter(e=>!ids.has(assignments.get(e.id)?.manager_employee_id)),seen=new Set()
  const visit=e=>{if(seen.has(e.id))return;seen.add(e.id);members.filter(c=>assignments.get(c.id)?.manager_employee_id===e.id).forEach(visit)}
  roots.forEach(visit);for(const e of members)if(!seen.has(e.id)){roots.push(e);visit(e)}
  return {...d,members,roots,director:people.get(data.directors.find(x=>x.department_id===d.id)?.employee_id)}
 })
 return {people,assignments,owners,groups,issues}
}
export const initials=name=>name.trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]||'').join('').toUpperCase()
