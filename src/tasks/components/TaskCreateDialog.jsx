import { useRef, useState } from 'react'
import { errorText, read } from '../client'
import Dialog from './Dialog'
import '../workspace.css'
import { priorities, urgencies, categoryName } from '../labels.uk'
import { localToInstant } from '../dateTime'
export default function TaskCreateDialog({ context, people, run, busy, onClose, initialPlannedDate, initialEmployeeId }) {
 const [error,setError] = useState('')
 const [target, setTarget] = useState(String(initialEmployeeId ?? context.employee_id))
 const form=useRef(null),progress=useRef({task:null,index:0,operations:null}),[saved,setSaved]=useState(false),[checklist,setChecklist]=useState([]),[dependencies,setDependencies]=useState([]),[candidates,setCandidates]=useState([]),[query,setQuery]=useState(''),[estimate,setEstimate]=useState(''),[searching,setSearching]=useState(false)
 async function search(){setSearching(true);try {let all=[],cursor=0;for(;;){const page=await read('tasks_list',{p_cursor:cursor});all.push(...page);if(page.length<100)break;cursor=page.at(-1).id}setCandidates(all)}catch(e){setError(errorText(e))}finally{setSearching(false)}}
 const submit = async e => {
  e.preventDefault(); const f = new FormData(e.currentTarget), request = target === 'request'
  const args = { title: f.get('title'), description: f.get('description'), category_id: f.get('category_id') || null, priority: f.get('priority'), urgency: f.get('urgency'), estimated_minutes: f.get('estimated_minutes') ? Number(f.get('estimated_minutes')) : null }
  if (request) args.reason = f.get('reason') || 'Запит керівнику'
  else Object.assign(args, { assigned_to_employee_id: Number(target), planned_date: f.get('planned_date') || null, deadline_at: localToInstant(f.get('deadline'), context.settings.company_timezone), deadline_is_hard: f.get('hard') === 'on' })
  if (!progress.current.task && args.urgency === 'critical_now' && f.get('confirm') !== 'on') return
  const p=progress.current
  if(!p.task){const result=await run(request ? 'request_creation' : 'create',args);if(!result)return
   if(request){onClose();return}
   p.task=result;p.operations=[...checklist.filter(x=>x.trim()).map((text,i)=>({action:'checklist_add',args:{text,sort_order:i}})),...dependencies.map(t=>({action:'dependency',args:{depends_on_task_id:t.id}}))];setSaved(true)
  }
  while(p.index<p.operations.length){const op=p.operations[p.index],result=await run(op.action,{...op.args,task_id:p.task.id,version:p.task.version});if(!result)return;p.task=result;p.index++}
  onClose()
 }
 const [urgency, setUrgency] = useState('normal')
 return <Dialog hideClose title="Створити завдання" onClose={onClose} busy={busy} onRetry={()=>form.current?.requestSubmit()}><form ref={form} className="task-editor" onSubmit={e => { void submit(e).catch(e => setError(errorText(e))) }}><p role="alert">{error}</p>{saved&&<p role="status">Завдання створено. Зберігаємо пункти та залежності; у разі помилки повторіть дію.</p>}<fieldset disabled={busy||saved}>
 <section><h3>Основне</h3><label>Назва<input name="title" required maxLength={300} autoFocus /></label><label>Опис / інструкція<textarea name="description" maxLength={20000}/></label><div className="editor-grid">
 <label>Категорія<select name="category_id"><option value="">Без категорії</option>{context.categories.map(c=><option key={c.id} value={c.id}>{categoryName(c.id,context.categories)}</option>)}</select></label>
 <label>Пріоритет<select name="priority" defaultValue="medium">{Object.entries(priorities).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>Терміновість<select name="urgency" value={urgency} onChange={e=>setUrgency(e.target.value)}>{Object.entries(urgencies).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>{urgency==='critical_now'&&<label><input type="checkbox" name="confirm" required/>Підтверджую негайне переривання поточної роботи</label>}</section>
 <section><h3>Час і терміни</h3><div className="workspace-toolbar" role="group" aria-label="Орієнтовний час">{[[15,'15 хв'],[30,'30 хв'],[60,'1 год'],[120,'2 год']].map(([n,label])=><button type="button" key={n} aria-pressed={estimate===String(n)} onClick={()=>setEstimate(String(n))}>{label}</button>)}<button type="button" onClick={()=>{setEstimate('');form.current.elements.estimated_minutes.focus()}}>Інше</button></div><div className="editor-grid"><label>Орієнтовний час, хв<input name="estimated_minutes" value={estimate} onChange={e=>setEstimate(e.target.value)} type="number" min="1" max="525600"/></label>
 {target!=='request'&&<><label>Дата (необов’язково)<input name="planned_date" type="date" defaultValue={initialPlannedDate||''} min={context.today}/></label><label>Дедлайн<input name="deadline" type="datetime-local"/></label><label><input name="hard" type="checkbox"/>Жорсткий дедлайн</label></>}</div><small>Часовий пояс: {context.settings.company_timezone}</small></section>
 <section><h3>Виконавець</h3><label>Кому<select value={target} onChange={e=>setTarget(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.id===context.employee_id?'Собі':p.name}</option>)}{context.manager_id&&<option value="request">Запит керівнику</option>}</select></label>{target==='request'&&<label>Причина<input name="reason" required/></label>}</section>
 {target!=='request'&&<><details><summary>Чек-лист</summary>{checklist.map((text,i)=><div className="editor-row" key={i}><label>Пункт {i+1}<input value={text} maxLength={2000} required onChange={e=>setChecklist(old=>old.map((x,j)=>j===i?e.target.value:x))}/></label><button type="button" aria-label={`Видалити пункт ${i+1}`} onClick={()=>setChecklist(old=>old.filter((_,j)=>j!==i))}>×</button><button type="button" disabled={i===0} aria-label={`Перемістити пункт ${i+1} вгору`} onClick={()=>setChecklist(old=>{const a=[...old];[a[i-1],a[i]]=[a[i],a[i-1]];return a})}>↑</button></div>)}<button type="button" onClick={()=>setChecklist(old=>[...old,''])}>+ Додати пункт</button></details>
 <details><summary>Залежності</summary><button type="button" disabled={searching} onClick={search}>+ Додати залежність</button><label>Пошук завдань<input value={query} onChange={e=>setQuery(e.target.value)}/></label>{candidates.filter(t=>t.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&!dependencies.some(d=>d.id===t.id)).slice(0,20).map(t=><button className="dependency-result" type="button" key={t.id} onClick={()=>setDependencies(old=>[...old,t])}>#{t.id} · {t.title}</button>)}{dependencies.map(t=><div className="editor-row" key={t.id}><span>{t.title}</span><button type="button" aria-label={`Видалити залежність ${t.title}`} onClick={()=>setDependencies(old=>old.filter(d=>d.id!==t.id))}>×</button></div>)}</details></>}
 <details><summary>Додатково</summary><p>Зміни зберігаються відразу. Чек-лист і залежності додаються послідовно після створення завдання через наявні команди.</p></details>
 </fieldset><div className="editor-actions"><button disabled={busy} className="primary" type="submit">{saved?'Продовжити збереження':'Створити'}</button><button disabled={busy} type="button" onClick={onClose}>Скасувати</button></div></form></Dialog>
}
