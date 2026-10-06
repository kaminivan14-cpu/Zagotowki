import {useEffect,useState,useRef} from 'react'
import {supabase} from '../../supabase'
import {avatarBucket} from '../employees/avatar'
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
 const [url,setUrl]=useState(null),[failed,setFailed]=useState(null)
 useEffect(()=>{let live=true;if(person.avatar_path){supabase.storage.from(avatarBucket).createSignedUrl(person.avatar_path,300).then(({data})=>{if(live)setUrl({path:person.avatar_path,value:data?.signedUrl})}).catch(()=>{})}return()=>{live=false}},[person.avatar_path])
 const source=person.avatar_path?(url?.path===person.avatar_path?url.value:null):person.avatar_url
 return <span className="org-avatar" aria-hidden="true">{source&&failed!==source?<img src={source} alt="" onError={()=>setFailed(source)}/>:initials(person.name)}</span>
}
export default function OrganizationScreen({context}){
 const [tab,setTab]=useState('current'),[selected,setSelected]=useState(''),[data,setData]=useState(null),[revision,setRevision]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[success,setSuccess]=useState(''),[dialog,setDialog]=useState(null),[retry,setRetry]=useState(()=>{try{const saved=JSON.parse(sessionStorage.getItem(operationKey(`org:${context.employee_id}`)));return saved?{action:saved.action,args:saved.args}:null}catch{return null}})
 const lock=useRef(false)
 useEffect(()=>{let live=true;read('organization_structure',{p_version:tab==='current'?null:Number(selected)||null}).then(d=>{if(live){setData(d);setError('')}}).catch(e=>{if(live)setError(errorText(e))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[selected,tab,revision])
 useEffect(()=>{if(data){const {issues}=organizationGroups(data);if(issues.length)console.warn('Organization relation issues',issues)}},[data])
 const act=async(action,args)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('')
  try{
   const op=prepareOperation(sessionStorage,`org:${context.employee_id}`,action,args)
   await read(action==='move_department'?'organization_move_department':'organization_command',{...(action==='move_department'?{}:{p_action:op.action}),p_args:op.args,p_operation:op.id})
   sessionStorage.removeItem(operationKey(`org:${context.employee_id}`));setRetry(null);setDialog(null);setLoading(true);setRevision(x=>x+1);setSuccess(L.saved)
  }catch(e){
   if(/^(P0001|42501|23\d{3}|22\w{3})$/.test(e.code||'')){sessionStorage.removeItem(operationKey(`org:${context.employee_id}`));setRetry(null)}else setRetry({action,args})
   setError(Object.entries(L.errors).find(([k])=>String(e.message).includes(k))?.[1]||errorText(e))
  }finally{lock.current=false;setBusy(false)}
 }
 const switchTab=t=>{setSuccess('');setTab(t);setSelected('');setDialog(null);setLoading(true)}
 if(!data)return <section className="org-screen"><p role={error?'alert':'status'}>{error||L.loading}</p><button onClick={()=>setRevision(x=>x+1)}>{L.retry}</button></section>
 const {people,assignments,owners,groups,issues}=organizationGroups(data),version=data.versions.find(v=>v.id===data.version_id)
 const editable=tab==='future'&&selected&&version?.status==='draft'&&data.can_manage
 const versions=data.versions.filter(v=>tab==='future'?['draft','scheduled'].includes(v.effective_status):['archived','cancelled'].includes(v.effective_status))
 const canMove=tab==='current'&&data.can_manage&&!loading
 const personActions=person=><div className="org-person-actions">{canMove&&<button disabled={busy||!!retry} aria-label={`${L.move_department}: ${person.name}`} onClick={()=>setDialog({kind:'move_department',...assignments.get(person.id),employee_id:person.id})}>{L.move_department}</button>}{editable&&<button disabled={busy||!!retry} onClick={()=>setDialog({kind:'assignment',...assignments.get(person.id),employee_id:person.id})}>{L.edit}: {person.name}</button>}</div>
 const renderPerson=(person,members,path=[])=>{
  if(path.includes(person.id))return null
  const a=assignments.get(person.id),children=members.filter(e=>assignments.get(e.id)?.manager_employee_id===person.id)
  const content=<><PersonAvatar person={person}/><span className="org-person-text"><strong>{person.name}</strong><small>{roleName(person.role)}{person.production_role?` · ${productionRoles[person.production_role]||person.production_role}`:''}</small><small>{data.departments.find(d=>d.id===a?.department_id)?.name||L.unassigned} · {people.get(a?.manager_employee_id)?.name||L.noManager}</small></span><small className={person.active&&!person.archived?'org-active':'org-inactive'}>{person.active&&!person.archived?L.active:L.inactive}</small></>
  return <li key={person.id} className="org-person">{children.length?<details open><summary>{content}<span>{children.length}</span></summary>{personActions(person)}<ul>{children.map(e=>renderPerson(e,members,[...path,person.id]))}</ul></details>:<><div className="org-person-row">{content}</div>{personActions(person)}</>}</li>
 }
 const formSubmit=e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));for(const k of ['employee_id','department_id','manager_employee_id'])if(k in fields)fields[k]=fields[k]?Number(fields[k]):null
  act(dialog.kind,{...(dialog.kind==='create'?{}:dialog.kind==='move_department'?{expected_version_id:data.version_id}:{id:version.id,revision:version.revision}),...fields})}
 return <section className="org-screen">
  <div className="org-heading"><h2>{L.title}</h2><p>{L.subtitle}</p></div>
  <nav aria-label="Структура організації">{['current','future','history'].map(t=><button key={t} aria-pressed={tab===t} disabled={busy||!!retry} onClick={()=>switchTab(t)}>{L[t]}</button>)}</nav>
  {loading&&<p role="status">{L.loading}</p>}{success&&<p role="status">{success}</p>}{error&&<p role="alert">{error} <button disabled={busy} onClick={()=>setRevision(x=>x+1)}>{L.refresh}</button></p>}{retry&&<button disabled={busy} onClick={()=>act(retry.action,retry.args)}>{L.retry}</button>}
  <div className="org-toolbar">{tab!=='current'&&<label>{L.name}<select value={selected} disabled={busy} onChange={e=>{setLoading(true);setSelected(e.target.value)}}><option value="">{L.none}</option>{versions.map(v=><option key={v.id} value={v.id}>{v.name} · {L.status[v.effective_status]}</option>)}</select></label>}{tab==='future'&&data.can_manage&&<button className="primary" disabled={busy||!!retry} onClick={()=>setDialog({kind:'create'})}>{L.create}</button>}</div>
  {loading?<p>{L.loading}</p>:tab!=='current'&&!selected?<p>{versions.length?L.none:L.empty}</p>:<>
   {version&&<header className="org-version"><h3>{version.name}</h3><span>{L.status[version.effective_status]}</span>{version.effective_from&&<span>{L.from}: {dateLabel(version.effective_from)}</span>}{version.effective_to&&<span>{L.to}: {dateLabel(version.effective_to)}</span>}<small>{L.created}: {people.get(version.created_by_employee_id)?.name||'—'} · {instantLabel(version.created_at,context.settings.company_timezone)}</small>{version.scheduled_at&&<small>{L.scheduled}: {people.get(version.scheduled_by_employee_id)?.name||'—'} · {instantLabel(version.scheduled_at,context.settings.company_timezone)}</small>}{version.activated_at&&<small>{L.activated}: {instantLabel(version.activated_at,context.settings.company_timezone)}</small>}</header>}
   {editable&&<div className="org-toolbar"><p>{L.draftNote}</p><button disabled={busy} onClick={()=>setDialog({kind:'assignment'})}>{L.add}</button><button className="primary" disabled={busy} onClick={()=>setDialog({kind:'schedule'})}>{L.schedule}</button></div>}
   {tab==='future'&&selected&&data.can_manage&&['draft','scheduled'].includes(version?.effective_status)&&<button disabled={busy} onClick={()=>setDialog({kind:'cancel'})}>{L.cancel}</button>}
   {issues.length>0&&<p role="alert">{L.issues}</p>}
   <div className="org-chart-scroll" tabIndex={0} role="region" aria-label={L.title}><div className="org-chart">
   <section className="org-owners"><h3>{L.owners}</h3>{owners.length?<ul>{owners.map(e=>renderPerson(e,[]))}</ul>:<p>{L.noOwners}</p>}</section>
   <div className="org-departments">{groups.filter(g=>g.id!==null&&g.members.length).map(g=><details className="org-department" key={g.id} open><summary><span><strong>{g.name}</strong><small>{g.director?`${L.director}: ${g.director.name}`:L.noDirector}</small></span><span>{g.members.length} {L.people}</span></summary>{editable&&<button onClick={()=>setDialog({kind:'director',department_id:g.id,employee_id:g.director?.id})}>{L.directorEdit}: {g.name}</button>}<ul>{g.roots.map(e=>renderPerson(e,g.members))}</ul></details>)}</div>
   </div></div>
   <section className="org-empty-departments"><h3>{L.emptyDepartments}</h3><div>{groups.filter(g=>g.id!==null&&!g.members.length).map(g=><article key={g.id}><strong>{g.name}</strong><small>{L.noDirector}</small>{editable&&<button onClick={()=>setDialog({kind:'director',department_id:g.id})}>{L.directorEdit}: {g.name}</button>}</article>)}</div>{!groups.some(g=>g.id!==null&&!g.members.length)&&<p>Немає порожніх відділів</p>}</section>
   <section className="org-unassigned"><h3>{L.unassigned}</h3><ul>{groups.find(g=>g.id===null)?.roots.map(e=>renderPerson(e,groups.find(g=>g.id===null).members))}</ul>{!groups.find(g=>g.id===null)?.members.length&&<p>Усі працівники мають відділ</p>}</section>
   {version&&<details><summary>{L.audit}</summary><ol>{data.events.map(e=><li key={e.id}>{instantLabel(e.created_at,context.settings.company_timezone)} · {people.get(e.actor_employee_id)?.name||L.system} · {L.actions[e.action]||e.action}{e.reason?` · ${e.reason}`:''}</li>)}</ol></details>}
  </>}
  {dialog&&<Dialog hideClose title={L[dialog.kind]||L.edit} busy={busy} onClose={()=>setDialog(null)}><form onSubmit={formSubmit}>
   {error&&<p role="alert">{error}</p>}{retry&&<button type="button" disabled={busy} onClick={()=>act(retry.action,retry.args)}>{L.retry}</button>}
   {dialog.kind==='create'&&<><label>{L.name}<input name="name" maxLength={200} required/></label><label>{L.notes}<textarea name="notes"/></label></>}
   {dialog.kind==='move_department'&&<><p>{people.get(dialog.employee_id)?.name}</p><p>{L.moveNote}</p><input type="hidden" name="employee_id" value={dialog.employee_id}/><label>{L.department}<select aria-label={L.department} name="department_id" defaultValue={dialog.department_id||''}><option value="">{L.unassigned}</option>{data.departments.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></>}
   {dialog.kind==='assignment'&&<><label>{L.employee}<select aria-label={L.employee} name="employee_id" required defaultValue={dialog.employee_id||''}><option value="">{L.none}</option>{data.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>{L.department}<select aria-label={L.department} name="department_id" defaultValue={dialog.department_id||''}><option value="">{L.unassigned}</option>{data.departments.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>{L.manager}<select aria-label={L.manager} name="manager_employee_id" defaultValue={dialog.manager_employee_id||''}><option value="">{L.noManager}</option>{data.employees.filter(e=>e.active&&!e.archived&&e.id!==dialog.employee_id).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></>}
   {dialog.kind==='director'&&<><input type="hidden" name="department_id" value={dialog.department_id}/><label>{L.director}<select aria-label={L.director} name="employee_id" defaultValue={dialog.employee_id||''}><option value="">{L.none}</option>{data.employees.filter(e=>e.active&&!e.archived&&assignments.get(e.id)?.department_id===dialog.department_id).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></>}
   {dialog.kind==='schedule'&&<label>{L.date}<DateTimeInput name="effective_from" type="date" required/></label>}
   {dialog.kind==='cancel'&&<p>{L.cancelConfirm}</p>}
   <label>{L.reason}<input name="reason" maxLength={2000}/></label><button disabled={busy||!!retry}>{L.save}</button><button type="button" disabled={busy} onClick={()=>setDialog(null)}>{L.close}</button>
  </form></Dialog>}
 </section>
}
