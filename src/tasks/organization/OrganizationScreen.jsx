import {useEffect,useState,useRef} from 'react'
import {read,errorText} from '../client'
import {prepareOperation,operationKey} from '../operations'
import {roleName,productionRoles} from '../admin/labels'
import {dateLabel,instantLabel} from '../dateTime'
import Dialog from '../components/Dialog'
import DateTimeInput from '../components/DateTimeInput'
import {orgLabels as L} from './labels'
import {organizationGroups,initials} from './model'
import './organization.css'
export function PersonAvatar({person}){
 const [failed,setFailed]=useState(false)
 return <span className="org-avatar" aria-hidden="true">{person.avatar_url&&!failed?<img src={person.avatar_url} alt="" onError={()=>setFailed(true)}/>:initials(person.name)}</span>
}
export default function OrganizationScreen({context}){
 const [tab,setTab]=useState('current'),[selected,setSelected]=useState(''),[data,setData]=useState(null),[revision,setRevision]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState(null),[retry,setRetry]=useState(()=>{try{const saved=JSON.parse(sessionStorage.getItem(operationKey(`org:${context.employee_id}`)));return saved?{action:saved.action,args:saved.args}:null}catch{return null}})
 const lock=useRef(false)
 useEffect(()=>{let live=true;read('organization_structure',{p_version:tab==='current'?null:Number(selected)||null}).then(d=>{if(live){setData(d);setError('')}}).catch(e=>{if(live)setError(errorText(e))});return()=>{live=false}},[selected,tab,revision])
 const act=async(action,args)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('')
  try{
   const op=prepareOperation(sessionStorage,`org:${context.employee_id}`,action,args)
   await read('organization_command',{p_action:op.action,p_args:op.args,p_operation:op.id})
   sessionStorage.removeItem(operationKey(`org:${context.employee_id}`));setRetry(null);setDialog(null);setRevision(x=>x+1)
  }catch(e){
   if(/^(P0001|42501|23\d{3}|22\w{3})$/.test(e.code||'')){sessionStorage.removeItem(operationKey(`org:${context.employee_id}`));setRetry(null)}else setRetry({action,args})
   setError(Object.entries(L.errors).find(([k])=>String(e.message).includes(k))?.[1]||errorText(e))
  }finally{lock.current=false;setBusy(false)}
 }
 const switchTab=t=>{setTab(t);setSelected('');setDialog(null)}
 if(!data)return <section className="org-screen"><p role={error?'alert':'status'}>{error||L.loading}</p><button onClick={()=>setRevision(x=>x+1)}>{L.retry}</button></section>
 const {people,assignments,owners,groups}=organizationGroups(data),version=data.versions.find(v=>v.id===data.version_id)
 const editable=tab==='future'&&selected&&version?.status==='draft'&&data.can_manage
 const versions=data.versions.filter(v=>tab==='future'?['draft','scheduled'].includes(v.effective_status):['archived','cancelled'].includes(v.effective_status))
 const renderPerson=(person,members,path=[])=>{
  if(path.includes(person.id))return null
  const a=assignments.get(person.id),children=members.filter(e=>assignments.get(e.id)?.manager_employee_id===person.id)
  const content=<><PersonAvatar person={person}/><span className="org-person-text"><strong>{person.name}</strong><small>{roleName(person.role)}{person.production_role?` · ${productionRoles[person.production_role]||person.production_role}`:''}</small><small>{data.departments.find(d=>d.id===a?.department_id)?.name||L.unassigned} · {people.get(a?.manager_employee_id)?.name||L.noManager}</small></span><small className={person.active&&!person.archived?'org-active':'org-inactive'}>{person.active&&!person.archived?L.active:L.inactive}</small></>
  return <li key={person.id} className="org-person">{children.length?<details open><summary>{content}<span>{children.length}</span></summary>{editable&&<button onClick={()=>setDialog({kind:'assignment',...a,employee_id:person.id})}>{L.edit}: {person.name}</button>}<ul>{children.map(e=>renderPerson(e,members,[...path,person.id]))}</ul></details>:<><div className="org-person-row">{content}</div>{editable&&<button onClick={()=>setDialog({kind:'assignment',...a,employee_id:person.id})}>{L.edit}: {person.name}</button>}</>}</li>
 }
 const formSubmit=e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));for(const k of ['employee_id','department_id','manager_employee_id'])if(k in fields)fields[k]=fields[k]?Number(fields[k]):null
  act(dialog.kind,{...(dialog.kind==='create'?{}:{id:version.id,revision:version.revision}),...fields})}
 return <section className="org-screen">
  <nav aria-label="Структура організації">{['current','future','history'].map(t=><button key={t} aria-pressed={tab===t} disabled={busy||!!retry} onClick={()=>switchTab(t)}>{L[t]}</button>)}</nav>
  {error&&<p role="alert">{error}</p>}{retry&&<button disabled={busy} onClick={()=>act(retry.action,retry.args)}>{L.retry}</button>}
  <div className="org-toolbar">{tab!=='current'&&<label>{L.name}<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">{L.none}</option>{versions.map(v=><option key={v.id} value={v.id}>{v.name} · {L.status[v.effective_status]}</option>)}</select></label>}{tab==='future'&&data.can_manage&&<button className="primary" disabled={busy||!!retry} onClick={()=>setDialog({kind:'create'})}>{L.create}</button>}</div>
  {tab!=='current'&&!selected?<p>{versions.length?L.none:L.empty}</p>:<>
   {version&&<header className="org-version"><h3>{version.name}</h3><span>{L.status[version.effective_status]}</span>{version.effective_from&&<span>{L.from}: {dateLabel(version.effective_from)}</span>}{version.effective_to&&<span>{L.to}: {dateLabel(version.effective_to)}</span>}<small>{L.created}: {people.get(version.created_by_employee_id)?.name||'—'} · {instantLabel(version.created_at,context.settings.company_timezone)}</small>{version.scheduled_at&&<small>{L.scheduled}: {people.get(version.scheduled_by_employee_id)?.name||'—'} · {instantLabel(version.scheduled_at,context.settings.company_timezone)}</small>}{version.activated_at&&<small>{L.activated}: {instantLabel(version.activated_at,context.settings.company_timezone)}</small>}</header>}
   {editable&&<div className="org-toolbar"><p>{L.draftNote}</p><button disabled={busy} onClick={()=>setDialog({kind:'assignment'})}>{L.add}</button><button className="primary" disabled={busy} onClick={()=>setDialog({kind:'schedule'})}>{L.schedule}</button></div>}
   {tab==='future'&&selected&&data.can_manage&&['draft','scheduled'].includes(version?.effective_status)&&<button disabled={busy} onClick={()=>setDialog({kind:'cancel'})}>{L.cancel}</button>}
   <section className="org-owners"><h3>{L.owners}</h3>{owners.length?<ul>{owners.map(e=>renderPerson(e,[]))}</ul>:<p>{L.noOwners}</p>}</section>
   {groups.filter(g=>g.id!==null||g.members.length).map(g=><details className="org-department" key={g.id??'none'} open><summary><span><strong>{g.name||L.unassigned}</strong><small>{g.director?`${L.director}: ${g.director.name}`:L.noDirector}</small></span><span>{g.members.length} {L.people}</span></summary>{editable&&g.id&&<button onClick={()=>setDialog({kind:'director',department_id:g.id,employee_id:g.director?.id})}>{L.directorEdit}: {g.name}</button>}<ul>{g.roots.map(e=>renderPerson(e,g.members))}</ul></details>)}
   {version&&<details><summary>{L.audit}</summary><ol>{data.events.map(e=><li key={e.id}>{instantLabel(e.created_at,context.settings.company_timezone)} · {people.get(e.actor_employee_id)?.name||L.system} · {L.actions[e.action]||e.action}{e.reason?` · ${e.reason}`:''}</li>)}</ol></details>}
  </>}
  {dialog&&<Dialog hideClose title={L[dialog.kind]||L.edit} busy={busy} onClose={()=>setDialog(null)}><form onSubmit={formSubmit}>
   {error&&<p role="alert">{error}</p>}{retry&&<button type="button" disabled={busy} onClick={()=>act(retry.action,retry.args)}>{L.retry}</button>}
   {dialog.kind==='create'&&<><label>{L.name}<input name="name" maxLength={200} required/></label><label>{L.notes}<textarea name="notes"/></label></>}
   {dialog.kind==='assignment'&&<><label>{L.employee}<select aria-label={L.employee} name="employee_id" required defaultValue={dialog.employee_id||''}><option value="">{L.none}</option>{data.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>{L.department}<select aria-label={L.department} name="department_id" defaultValue={dialog.department_id||''}><option value="">{L.unassigned}</option>{data.departments.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>{L.manager}<select aria-label={L.manager} name="manager_employee_id" defaultValue={dialog.manager_employee_id||''}><option value="">{L.noManager}</option>{data.employees.filter(e=>e.active&&!e.archived&&e.id!==dialog.employee_id).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></>}
   {dialog.kind==='director'&&<><input type="hidden" name="department_id" value={dialog.department_id}/><label>{L.director}<select aria-label={L.director} name="employee_id" defaultValue={dialog.employee_id||''}><option value="">{L.none}</option>{data.employees.filter(e=>e.active&&!e.archived&&assignments.get(e.id)?.department_id===dialog.department_id).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></>}
   {dialog.kind==='schedule'&&<label>{L.date}<DateTimeInput name="effective_from" type="date" required/></label>}
   {dialog.kind==='cancel'&&<p>{L.cancelConfirm}</p>}
   <label>{L.reason}<input name="reason" maxLength={2000}/></label><button disabled={busy||!!retry}>{L.save}</button><button type="button" disabled={busy} onClick={()=>setDialog(null)}>{L.close}</button>
  </form></Dialog>}
 </section>
}
