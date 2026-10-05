export function organizationGroups(data){
 const people=new Map(data.employees.map(e=>[e.id,e]))
 const assignments=new Map(data.assignments.map(a=>[a.employee_id,a]))
 const owners=data.employees.filter(e=>e.role==='owner')
 const groups=[...data.departments,{id:null,name:null}].map(d=>{
  const members=data.employees.filter(e=>e.role!=='owner'&&(assignments.get(e.id)?.department_id??null)===d.id)
  const ids=new Set(members.map(e=>e.id))
  const roots=members.filter(e=>!ids.has(assignments.get(e.id)?.manager_employee_id)),seen=new Set()
  const visit=e=>{if(seen.has(e.id))return;seen.add(e.id);members.filter(c=>assignments.get(c.id)?.manager_employee_id===e.id).forEach(visit)}
  roots.forEach(visit);for(const e of members)if(!seen.has(e.id)){roots.push(e);visit(e)}
  return {...d,members,roots,director:people.get(data.directors.find(x=>x.department_id===d.id)?.employee_id)}
 })
 return {people,assignments,owners,groups}
}
export const initials=name=>name.trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]||'').join('').toUpperCase()
