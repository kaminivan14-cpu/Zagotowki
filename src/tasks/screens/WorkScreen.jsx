import { useEffect, useState } from 'react'
import { read, errorText } from '../client'
import TaskCard from '../components/TaskCard'
import { duration } from '../labels.uk'
export default function WorkScreen({ state, context, run, busy, onDetails }) {
 const [details,setDetails]=useState(null),[error,setError]=useState('')
 const currentId=state?.current?.id,currentVersion=state?.current?.version
 useEffect(()=>{let alive=true;if(currentId)read('tasks_details',{p_task:currentId}).then(d=>{if(alive){setDetails(d);setError('')}}).catch(e=>{if(alive)setError(errorText(e))});return()=>{alive=false}},[currentId,currentVersion])
 if(!state)return <p role="status">Завантаження роботи…</p>
 const t=state.current
 return <section className="task-work"><h2>Робота</h2>{t ? <TaskCard task={t} context={context}><p className="task-description">{t.description}</p><p role="alert">{error}</p>{details?.task.id===t.id && details.checklist.map(c=><label key={c.id}><input type="checkbox" checked={c.completed} disabled={busy} onChange={e=>run('checklist_toggle',{task_id:t.id,version:t.version,item_id:c.id,completed:e.target.checked})}/>{c.text}</label>)}<div className="task-actions"><button className="primary" disabled={busy} onClick={()=>run('complete',{task_id:t.id,version:t.version})}>Зроблено</button><button disabled={busy} onClick={()=>run('end_of_day',{task_id:t.id,version:t.version})}>На кінець дня</button><button onClick={()=>onDetails(t)}>Перенести</button><button onClick={()=>onDetails(t)}>Додати коментар / перелік</button></div></TaskCard> : <><p>{state.task_count} завдань · {duration(state.planned_minutes)} з {duration(state.capacity_minutes)}</p>{state.started && <p>Немає наступного доступного завдання. Перевірте графік, оцінки часу та залежності.</p>}<button className="primary" disabled={busy} onClick={()=>run('next',{})}>{state.started?'Наступне завдання':'Розпочати роботу'}</button></>}
 {state.critical.filter(t=>t.acknowledged || !t.ready).map(t=><aside key={t.id}>Критичне завдання: <button onClick={()=>onDetails(t)}>{t.title}</button> · {t.acknowledged?'Відкладено з причиною; нагадування збережено':'Потребує перевірки графіка, часу або залежностей'}</aside>)}
 </section>
}
