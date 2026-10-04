import TaskResult from '../admin/TaskResult'
import {useEffect,useState,useRef} from 'react'
import {read,errorText} from '../client'
import {useWorktime} from '../../worktime/context'
import {duration,priorities,urgencies,categoryName} from '../labels.uk'
import {dateLabel,instantLabel} from '../dateTime'
export default function WorkScreen({state,context,run,busy,onDetails,revision,refresh}) {
 const work=useWorktime(),[details,setDetails]=useState(null),[error,setError]=useState(''),[location,setLocation]=useState(''),[working,setWorking]=useState(false),[now,setNow]=useState(Date.now),lock=useRef(false)
 const task=state?.current || state?.next,id=task?.id,version=task?.version
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
 useEffect(()=>{let alive=true;if(id)read('tasks_details',{p_task:id}).then(d=>{if(alive){setDetails(d);setError('')}}).catch(e=>{if(alive)setError(errorText(e))});return()=>{alive=false}},[id,version,revision])
 const blocked=busy||working||work?.busy||Boolean(work?.pending)
 async function startWork(){
  if(lock.current)return;lock.current=true;setWorking(true);setError('')
  try {const active=await work.refresh();if(!active)await work.start(location||state.locations?.[0]?.id,'tasks');await refresh()}catch{setError('Не вдалося розпочати роботу. Перевірте локал і повторіть спробу.')}finally{lock.current=false;setWorking(false)}
 }
 async function finishWork(){
  if(lock.current)return;lock.current=true;setWorking(true);setError('')
  try {await work.end();await refresh()}catch{setError('Не вдалося завершити роботу. Завершіть активні операції та повторіть спробу.')}finally{lock.current=false;setWorking(false)}
 }
 if(!state)return <p role="status">Завантаження роботи…</p>
 const locations=state.locations||[],data=details?.task.id===id?details:null,zone=context.settings.company_timezone
 const elapsed=state.session_started_at?Math.max(0,Math.floor((now-Date.parse(state.session_started_at))/1000)):null
 return <section className="task-execution" aria-label="Виконання роботи"><p className="execution-date">{dateLabel(context.today)}</p><p role="alert">{error}</p>
 {!work?.current?<div className="execution-welcome"><h2>Готові розпочати роботу?</h2><p>{state.task_count} завдань у плані · {duration(state.planned_minutes)} з {duration(state.capacity_minutes)}</p>
 {locations.length>1&&<label>Локал роботи<select value={location||locations[0].id} onChange={e=>setLocation(e.target.value)}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
 {!locations.length&&<p>Не призначено доступний локал роботи. Зверніться до адміністратора.</p>}
 <button className="primary execution-cta" disabled={blocked||!work?.enabled||!locations.length} onClick={startWork}>Розпочати роботу</button></div>
 :task?<article className="execution-task" key={task.id}>
 {!state.current&&<button className="primary execution-cta" disabled={blocked} onClick={()=>run('start_task',{task_id:task.id,version:task.version})}>Розпочати завдання</button>}
 <header><p className="execution-state">{state.current?'В роботі':'Наступне завдання'}</p><h2>{task.title}</h2>{state.current&&elapsed!==null&&<p role="timer" aria-live="off">Час роботи: {String(Math.floor(elapsed/3600)).padStart(2,'0')}:{String(Math.floor(elapsed/60)%60).padStart(2,'0')}:{String(elapsed%60).padStart(2,'0')}</p>}</header>
 <dl className="execution-meta"><div><dt>Категорія</dt><dd>{categoryName(task.category_id,(context.category_history||context.categories))}</dd></div><div><dt>Пріоритет</dt><dd>{priorities[task.priority]}</dd></div><div><dt>Терміновість</dt><dd>{urgencies[task.urgency]}</dd></div><div><dt>Орієнтовний час</dt><dd>{duration(task.estimated_minutes)}</dd></div>{task.deadline_at&&<div><dt>Дедлайн</dt><dd>{instantLabel(task.deadline_at,zone)}</dd></div>}</dl>
 <section><h3>Опис / інструкція</h3><p className="task-description">{task.description||'Опис не додано'}</p></section>
 {data?.checklist.length>0&&<section className="execution-checklist"><h3>Чек-лист</h3>{data.checklist.map(c=><label key={c.id}><input type="checkbox" checked={c.completed} disabled={blocked} onChange={e=>run('checklist_toggle',{task_id:task.id,version:task.version,item_id:c.id,completed:e.target.checked})}/>{c.text}</label>)}</section>}
 <details><summary>Коментарі / інструкції</summary>{data?.events.filter(e=>e.event_type==='COMMENT_ADDED').map(e=><p key={e.id}>{e.metadata.text}</p>)}<form onSubmit={async e=>{e.preventDefault();const f=e.currentTarget;if(await run('comment',{task_id:task.id,version:task.version,text:new FormData(f).get('text')}))f.reset()}}><label>Додати коментар<textarea name="text" required maxLength={10000}/></label><button disabled={blocked}>Зберегти коментар</button></form></details>
 {task.source_type==='process'&&<TaskResult key={task.id} task={task} run={run} busy={blocked} revision={revision}/>}<div className="execution-secondary">{state.current&&<button disabled={blocked} onClick={()=>run('end_of_day',{task_id:task.id,version:task.version})}>На кінець дня</button>}<button disabled={blocked} onClick={()=>onDetails(task)}>Перенести / деталі</button></div>
 {state.current&&<footer><button className="primary execution-cta" disabled={blocked} onClick={()=>run('complete',{task_id:task.id,version:task.version,advance:false})}>Закінчити завдання</button></footer>}
 </article>:<div className="execution-empty"><h2>На сьогодні доступних завдань немає</h2><p>Виконано сьогодні: {state.completed_today??0}</p><p>Черга враховує графік, час і залежності. Нові доступні завдання з’являться автоматично.</p><button className="primary execution-cta" disabled={blocked} onClick={finishWork}>Завершити роботу</button></div>}
 </section>
}
