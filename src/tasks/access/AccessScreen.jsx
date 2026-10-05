import {useEffect,useState} from 'react'
import {read} from '../client'
import {systemRoles,roleName,capabilityName,productionRoles} from '../admin/labels'
import Dialog from '../components/Dialog'
import {PersonAvatar} from '../organization/OrganizationScreen'
import {moduleStates,capabilityGroup,roleSummary} from './model'
import './access.css'
const explanation='Системна роль визначає дозволи в застосунку. Виробнича роль визначає функцію працівника і сама по собі не надає системних дозволів.'
const status=e=>e.archived?'Архівний':!e.active?'Неактивний':!e.linked?'Без облікового запису':'Активний'
function Modules({capabilities,compact=false}){return <ul className="access-modules">{moduleStates(capabilities).filter(m=>!compact||m.allowed!==false).map(m=><li key={m.id} data-allowed={m.allowed}><span aria-label={m.allowed===null?'Невідомо':m.allowed?'Доступно':'Недоступно'}>{m.allowed===null?'?':m.allowed?'✓':'✕'}</span> {m.label}</li>)}</ul>}
function Permissions({capabilities}){
 if(!Array.isArray(capabilities))return <p role="alert">Не вдалося завантажити дозволи</p>
 if(!capabilities.length)return <p>Немає ефективних дозволів</p>
 const groups=capabilities.reduce((groups,code)=>{(groups[capabilityGroup(code)]??=[]).push(code);return groups},{})
 return <div className="access-permissions">{Object.entries(groups).map(([group,codes])=><section key={group}><h4>{group}</h4><ul>{codes.map(code=><li key={code}>{code==='organization.manage'?'Керування структурою організації':capabilityName(code)}<small>{code}</small></li>)}</ul></section>)}</div>
}
export default function AccessScreen({directory,revision}){
 const [tab,setTab]=useState('roles'),[data,setData]=useState(null),[failed,setFailed]=useState(false),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[detail,setDetail]=useState(null),[search,setSearch]=useState('')
 useEffect(()=>{let live=true;read('tasks_access_directory').then(d=>{if(!d||!Array.isArray(d.roles)||!Array.isArray(d.employees))throw Error('Invalid access response');if(live){setData(d);setFailed(false)}}).catch(()=>{if(live)setFailed(true)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision,retry])
 const employees=data?.employees||directory.employees,departments=data?.departments||directory.departments,locations=data?.locations||directory.locations
 const lookup=(list,id)=>list.find(x=>x.id===id)?.name||'Не призначено',person=id=>lookup(employees,id)
 const roles=data?.roles||[...new Set([...Object.keys(systemRoles),...directory.employees.filter(e=>e.capabilities?.length).map(e=>e.role)])].map(role=>({role,user_count:employees.filter(e=>e.role===role).length,capabilities:null}))
 const selectedRole=detail?.role?roles.find(r=>r.role===detail.role):null,selectedEmployee=detail?.id?employees.find(e=>e.id===detail.id):null
 // Never reuse raw directory capabilities as effective permissions on fetch failure.
 const caps=failed?null:selectedRole?.capabilities??(selectedEmployee&&data?selectedEmployee.capabilities:null)
 const scopes=e=>(data?.scope_grants||[]).filter(g=>g.grantee_employee_id===e.id)
 const scopeLabel=g=>g.scope_type==='department'?`Відділ: ${lookup(departments,g.department_id)}`:g.scope_type==='location'?`Локація: ${lookup(locations,g.location_id)}`:g.scope_type==='hierarchy'?`Працівник і підлеглі: ${person(g.employee_id)}`:`Працівник: ${person(g.employee_id)}`
 const summary=e=>failed||!data?'Область не перевірена':e.capabilities?.includes('tasks.admin')?'Адміністрування роботи':e.hierarchy_ids?.length?`Підлеглі: ${e.hierarchy_ids.length}`:scopes(e).length?`Явні області: ${scopes(e).length}`:'Власні дані; дії за дозволами'
 return <section className="access-screen"><p className="access-explanation">{explanation}</p><nav aria-label="Перегляд доступів"><button aria-pressed={tab==='roles'} onClick={()=>setTab('roles')}>Ролі</button><button aria-pressed={tab==='employees'} onClick={()=>setTab('employees')}>Працівники</button></nav>
 {loading&&<p role="status">Завантаження дозволів…</p>}{failed&&<div role="alert">Не вдалося завантажити дозволи <button onClick={()=>setRetry(x=>x+1)}>Повторити</button></div>}
 {tab==='roles'?<div className="access-role-grid">{roles.map(r=>{const permissions=failed?null:r.capabilities;return <article className="access-role" key={r.role}><h3>{roleName(r.role)}</h3><span className="access-badge">Користувачів: {r.user_count}</span><p>{roleSummary(permissions)}</p><Modules compact capabilities={permissions}/><button onClick={()=>setDetail({role:r.role})} aria-label={`Переглянути дозволи: ${roleName(r.role)}`}>Переглянути дозволи</button></article>})}</div>:<><label>Пошук працівника<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="admin-table-wrap"><table><thead><tr>{['Працівник','Системна роль','Відділ','Область доступу','Локації','Статус','Дія'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{employees.filter(e=>e.name.toLocaleLowerCase('uk').includes(search.toLocaleLowerCase('uk'))).map(e=><tr key={e.id}><td><span className="access-person"><PersonAvatar person={e}/>{e.name}</span></td><td>{roleName(e.role)}</td><td>{lookup(departments,e.department_id)}</td><td>{summary(e)}</td><td>{lookup(locations,e.location_id)}</td><td>{status(e)}</td><td><button aria-label={`Переглянути: ${e.name}`} onClick={()=>setDetail({id:e.id})}>Переглянути</button></td></tr>)}</tbody></table></div></>}
 {detail&&<Dialog title={selectedRole?roleName(selectedRole.role):selectedEmployee?.name||'Доступи'} onClose={()=>setDetail(null)}>
 {failed&&<div role="alert">Не вдалося завантажити дозволи <button onClick={()=>setRetry(x=>x+1)}>Повторити</button></div>}
 {selectedEmployee&&<><p>Системна роль: {roleName(selectedEmployee.role)}</p><p>Виробнича роль: {productionRoles[selectedEmployee.production_role]||'Не призначено'}</p><p>Відділ: {lookup(departments,selectedEmployee.department_id)} · {status(selectedEmployee)}</p></>}
 <h3>Модулі</h3><Modules capabilities={caps}/><h3>Дозволи</h3><Permissions capabilities={caps}/>
 {selectedRole&&<><h3>Користувачі з цією роллю</h3><ul className="access-users">{employees.filter(e=>e.role===selectedRole.role).map(e=><li key={e.id}><PersonAvatar person={e}/><span><strong>{e.name}</strong><small>{lookup(departments,e.department_id)} · {lookup(locations,e.location_id)} · {status(e)}</small></span><button onClick={()=>setDetail({id:e.id})}>Переглянути</button></li>)}</ul>{!selectedRole.user_count&&<p>Користувачів із цією роллю ще немає</p>}</>}
 {selectedEmployee&&<><h3>Область доступу</h3>{failed||!data?<p>Область не перевірена</p>:<><p>Керівник: {person(selectedEmployee.manager_id)}</p><p>Локація працівника: {lookup(locations,selectedEmployee.location_id)}</p><p>Можливість дії додатково перевіряється backend для конкретного об’єкта.</p><h4>Підлеглі за структурою</h4>{selectedEmployee.hierarchy_ids?.length?<ul>{selectedEmployee.hierarchy_ids.map(id=><li key={id}>{person(id)}</li>)}</ul>:<p>Підлеглих немає</p>}<h4>Явні області та винятки</h4>{scopes(selectedEmployee).length?<ul>{scopes(selectedEmployee).map(g=><li key={g.id}>{capabilityName(g.permission)} · {scopeLabel(g)}{!caps?.includes(g.permission)&&' · дозвіл неактивний для цього працівника'}</li>)}</ul>:<p>Явних винятків немає</p>}</>}</>}
 </Dialog>}
 </section>
}
