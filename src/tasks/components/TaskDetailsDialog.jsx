import TaskActions from './TaskActions'
import DateTimeInput from './DateTimeInput'
import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import { read, errorText } from '../client'
import { events, duration, priorities } from '../labels.uk'
import { instantLabel, localToInstant } from '../dateTime'
export default function TaskDetailsDialog({ task, context, run, busy, onClose, revision, people }) {
 const [data,setData] = useState(null), [error,setError] = useState('')
 useEffect(() => { let alive=true; read('tasks_details',{p_task:task.id}).then(d=>{if(alive)setData(d)}).catch(e=>{if(alive)setError(errorText(e))});return()=>{alive=false} },[task.id,revision])
 const t=data?.task
 return <Dialog title={t?.title || task.title} onClose={onClose} busy={busy}><p role="alert">{error}</p>{t && <>
 <TaskActions task={t} context={context} run={run} busy={busy} onCompleted={onClose}/>
 <p className="task-description">{t.description || 'Опис не додано'}</p><p>Орієнтовно: {duration(t.estimated_minutes)} · Фактично: {duration(t.actual_minutes)}</p>
 {data.checklist.map(c=><label key={c.id}><input type="checkbox" checked={c.completed} disabled={busy} onChange={e=>run('checklist_toggle',{task_id:t.id,version:t.version,item_id:c.id,completed:e.target.checked})}/>{c.text}</label>)}
 <form onSubmit={async e=>{e.preventDefault();const f=e.currentTarget;if(await run('comment',{task_id:t.id,version:t.version,text:new FormData(f).get('text')}))f.reset()}}><label>Додати коментар<textarea name="text" required maxLength={10000}/></label><button disabled={busy}>Додати коментар</button></form>
 {!['completed','cancelled','in_progress','pending_approval'].includes(t.status) && <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);try { const start=localToInstant(f.get('start'),context.settings.company_timezone);void run('plan',{task_id:t.id,version:t.version,planned_date:f.get('date'),planned_start_at:start,reason:f.get('reason')}) } catch(e){setError(errorText(e))}}}>
 <h3>{t.planned_date?'Перенести':'Запланувати'}</h3><label>Дата<DateTimeInput aria-label="Дата" name="date" type="date" min={context.today} defaultValue={t.planned_date || context.today} required/></label><label>Фіксований початок<DateTimeInput aria-label="Фіксований початок" name="start" type="datetime-local"/></label><label>Причина<input name="reason" required defaultValue="Планування роботи"/></label><small>Часовий пояс: {context.settings.company_timezone}</small><button disabled={busy}>Зберегти дату</button></form>}
 {t.status==='in_progress' && <button disabled={busy} onClick={()=>run('pause',{task_id:t.id,version:t.version})}>Призупинити для перенесення</button>}
 {!['completed','cancelled','in_progress','paused','pending_approval'].includes(t.status) && (t.created_by_employee_id===context.employee_id || context.capabilities.includes('tasks.plan.scope')) && <details><summary>Редагування завдання</summary>
 <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run('update',{task_id:t.id,version:t.version,title:f.get('title'),description:f.get('description'),priority:f.get('priority'),estimated_minutes:f.get('minutes')?Number(f.get('minutes')):null})}}><label>Назва<input name="title" required defaultValue={t.title}/></label><label>Опис<textarea name="description" defaultValue={t.description}/></label><label>Пріоритет<select name="priority" defaultValue={t.priority}>{Object.entries(priorities).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Орієнтовний час, хв<input name="minutes" type="number" min="1" defaultValue={t.estimated_minutes || ''}/></label><button disabled={busy}>Зберегти зміни</button></form>
 {context.capabilities.includes('tasks.assign') && <form onSubmit={e=>{e.preventDefault();run('assign',{task_id:t.id,version:t.version,assigned_to_employee_id:Number(new FormData(e.currentTarget).get('employee'))})}}><label>Новий виконавець<select name="employee">{people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><button disabled={busy}>Призначити</button></form>}
 <form onSubmit={e=>{e.preventDefault();const f=e.currentTarget;run('checklist_add',{task_id:t.id,version:t.version,text:new FormData(f).get('text')}).then(ok=>{if(ok)f.reset()})}}><label>Новий пункт переліку<input name="text" required/></label><button disabled={busy}>Додати пункт</button></form>
 <form onSubmit={e=>{e.preventDefault();run('dependency',{task_id:t.id,version:t.version,depends_on_task_id:Number(new FormData(e.currentTarget).get('dependency'))})}}><label>Спочатку виконати завдання №<input name="dependency" type="number" min="1" required/></label><button disabled={busy}>Додати залежність</button></form>
 <form onSubmit={e=>{e.preventDefault();run('cancel',{task_id:t.id,version:t.version}).then(ok=>{if(ok)onClose()})}}><label><input type="checkbox" required/>Підтверджую скасування завдання зі збереженням історії</label><button disabled={busy}>Скасувати завдання</button></form>
 </details>}
 <h3>Історія</h3><ol className="task-timeline">{data.events.map(e=><li key={e.id}><time>{instantLabel(e.created_at,context.settings.company_timezone)}</time> — {events[e.event_type] || 'Зміна завдання'}{e.metadata.text && <p>{e.metadata.text}</p>}{e.metadata.reason && <p>{e.metadata.reason}</p>}</li>)}</ol>{data.events.length>=100 && <button disabled={busy} onClick={async()=>{try {const more=await read('tasks_events',{p_task:t.id,p_before:Math.min(...data.events.map(e=>e.id))});setData(old=>({...old,events:[...more.events,...old.events]}))}catch(e){setError(errorText(e))}}}>Раніші події</button>}
 </>}</Dialog>
}
