import {useContext,useEffect,useRef,useState} from 'react'
import {read,errorText,operationKey} from '../client'
import {planningRange,dayLabel,addDays} from '../dateTime'
import {duration,priorities,planningLabels as L} from '../labels.uk'
import {nextWeekAvailable,weekRange,loadText,loadLevel,categoryTotals,shortDay,dateLabel} from '../planningView'
import {TaskFeedback} from '../feedback'
import TaskCard from '../components/TaskCard'
import PlanningTaskRow from '../components/PlanningTaskRow'
import '../planning.css'
export default function PlanningScreen({context,run,busy,onDetails,revision,onCreate,people:creationPeople=[]}) {
 const [mode,setMode]=useState(null),[period,setPeriod]=useState(null),[employee,setEmployee]=useState(context.employee_id),[people,setPeople]=useState([]),[snapshot,setSnapshot]=useState(null),[approvals,setApprovals]=useState([]),[recommendations,setRecommendations]=useState([]),[error,setError]=useState(''),[loadingMore,setLoadingMore]=useState(false)
 const generation=useRef(0),feedback=useContext(TaskFeedback)
 const nextAvailable=nextWeekAvailable(context.today),selectedPeriod=period==='next'&&!nextAvailable?'current':period || (nextAvailable?'next':'current')
 const range=mode==='month'?planningRange(context.today,'month'):weekRange(context.today,selectedPeriod)
 const requestKey=JSON.stringify([mode,employee,range.from,range.to,revision])
 const data=snapshot?.key===requestKey?snapshot.value:null
 const canCreate=creationPeople.some(p=>String(p.id)===String(employee)) && (String(employee)!==String(context.employee_id) || context.capabilities.includes('tasks.create.self'))
 useEffect(()=>{let alive=true;Promise.all([read('tasks_assignable_people',{p_permission:'tasks.read.scope'}),read('tasks_approvals')]).then(([p,a])=>{if(alive){setPeople(p);setApprovals(a)}}).catch(e=>{if(alive)setError(errorText(e))});return()=>{alive=false}},[revision])
 useEffect(()=>{
  const requests=generation,n=++requests.current
  const [selectedMode,selectedEmployee,from,to]=JSON.parse(requestKey)
  if(selectedMode)Promise.all([read('tasks_planning',{p_employee:Number(selectedEmployee),p_from:from,p_to:to}),read('tasks_recommendations',{p_employee:Number(selectedEmployee)})]).then(([d,r])=>{if(n===requests.current){setSnapshot({key:requestKey,value:d});setRecommendations(r);setError('');setLoadingMore(false)}}).catch(e=>{if(n===requests.current)setError(errorText(e))})
  return()=>{if(n===requests.current)requests.current++}
 },[requestKey])
 async function more(){
  const n=generation.current;setLoadingMore(true)
  try{const page=await read('tasks_planning',{p_employee:Number(employee),p_from:range.from,p_to:range.to,p_cursor:data.next_cursor});if(n===generation.current)setSnapshot(old=>({key:requestKey,value:{...page,tasks:[...old.value.tasks,...page.tasks],unplanned:[...old.value.unplanned,...page.unplanned]}}))}
  catch(e){if(n===generation.current)setError(errorText(e))}finally{if(n===generation.current)setLoadingMore(false)}
 }
 const create=date=>onCreate(date,Number(employee))
 const unconfirmed=feedback.error || sessionStorage.getItem(operationKey(context.employee_id))
 const planned=data?.tasks.filter(t=>t.status!=='cancelled') || []
 return <section className="tasks-planning"><h2>{mode==='week'?L.title:'Планування'}</h2>{mode==='week'&&<p className="planning-subtitle">{L.subtitle}</p>}
 <div className="task-actions planning-entry"><button aria-pressed={mode==='week'} onClick={()=>setMode('week')}>Запланувати тиждень</button><button aria-pressed={mode==='month'} onClick={()=>setMode('month')}>Запланувати місяць</button>{mode&&<label className="planning-employee">Співробітник<select value={employee} onChange={e=>setEmployee(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.id===context.employee_id?'Я':p.name}</option>)}</select></label>}</div><p role="alert">{error}</p>
 {mode && <>
 {mode==='week' && <>
  <p className="planning-info">{nextAvailable?L.infoNext(new Intl.DateTimeFormat('uk-UA',{weekday:'long',timeZone:'UTC'}).format(new Date(context.today+'T12:00:00Z'))):L.infoCurrent}</p>
  <div className="planning-period" role="group" aria-label={L.period}>
   <button aria-pressed={selectedPeriod==='current'} onClick={()=>setPeriod('current')}>{L.current}</button>
   <button aria-pressed={selectedPeriod==='next'} disabled={!nextAvailable} aria-describedby={!nextAvailable?'planning-period-help':undefined} title={!nextAvailable?L.unavailable:undefined} onClick={()=>setPeriod('next')}>{L.next}</button>
  </div>{!nextAvailable&&<p id="planning-period-help" className="planning-help">{L.unavailable}</p>}
 </>}
 {!data?<p role="status">Завантаження плану…</p>:<>
 {mode==='week'?<div className="planning-layout"><div className="planning-days" aria-label="Дні тижня">
  {data.days.map(day=>{const tasks=data.tasks.filter(t=>t.planned_date===day.date && t.status!=='cancelled'),level=loadLevel(day);return <section className={`planning-day load-${level}`} key={day.date} aria-label={dayLabel(day.date)}>
   <div className="planning-day-heading"><h3>{shortDay(day.date)}</h3><time dateTime={day.date}>{dateLabel(day.date)}</time><span>{L.tasks(day.task_count??tasks.length)}</span>
    <small>{loadText(day.planned_minutes,day.unknown_count)} / {duration(day.capacity_minutes)}</small>
    <progress max={Math.max(1,day.capacity_minutes)} value={Math.min(day.planned_minutes,Math.max(1,day.capacity_minutes))} aria-label={`${L.load} ${dateLabel(day.date)}`}/>
    {level!=='normal'&&<small className="planning-load-state">{L[level]}</small>}{!day.capacity_minutes&&<small>{L.noCapacity}</small>}{day.date>=context.today&&<button className="planning-balance" disabled={busy} onClick={()=>run('balance',{employee_id:Number(employee),date:day.date})}>Перевірити навантаження</button>}
   </div>
   <div className="planning-day-tasks">{tasks.map(task=><PlanningTaskRow key={task.id} task={task} context={context} onDetails={onDetails}/>)}{!tasks.length&&<p className="planning-empty">{data.next_cursor?'Завантажте решту задач для повного перегляду.':L.emptyDay}</p>}</div>
   <button className="planning-day-add" disabled={busy||!canCreate||day.date<context.today} title={!canCreate?L.noCreate:undefined} onClick={()=>create(day.date)}>{L.add}</button>
  </section>})}
 </div><aside className="planning-sidebar">
  <section><h3>{L.parameters}</h3><dl><div><dt>{L.period}</dt><dd>{L[selectedPeriod]}</dd></div><div><dt>{L.dates}</dt><dd>{dateLabel(range.from)} — {dateLabel(range.to)}</dd></div><div><dt>{L.planned}</dt><dd>{L.tasks(data.days.reduce((n,d)=>n+(d.task_count??data.tasks.filter(t=>t.planned_date===d.date&&t.status!=='cancelled').length),0))}</dd></div><div><dt>{L.load}</dt><dd>{loadText(data.days.reduce((n,d)=>n+d.planned_minutes,0),data.days.reduce((n,d)=>n+(d.unknown_count||0),0))}</dd></div></dl><small>{L.estimateHelp}</small></section>
  <section><h3>{L.quick}</h3><button className="primary" disabled={busy||!canCreate} title={!canCreate?L.noCreate:undefined} onClick={()=>create(range.from<context.today?context.today:range.from)}>{L.add}</button><button disabled title={L.copyUnavailable} aria-describedby="planning-copy-help">{L.copy}</button><small id="planning-copy-help">{L.copyUnavailable}</small></section>
  <section><h3>{L.summary}</h3>{data.next_cursor&&<p className="planning-help">{L.partial}</p>}<div className="planning-priority-totals">{Object.entries(priorities).map(([key,label])=><div key={key}><strong className={`planning-priority priority-${key}`}>{planned.filter(t=>t.priority===key).length}</strong><span>{label}</span></div>)}</div>
   <ul className="planning-category-totals">{categoryTotals(planned,context.categories).map(c=><li key={c.id}><span>{c.name}</span><strong>{c.count}</strong></li>)}</ul>
   <p className="planning-save" role="status">{busy?L.saving:unconfirmed?L.unconfirmed:L.saved}</p>
  </section>
 </aside></div>:(<>{[0,1,2,3].map(w=>{const days=data.days.slice(w*7,w*7+7);return <section className="task-week" key={w}><h3>{dayLabel(addDays(range.from,w*7))} — {dayLabel(addDays(range.from,w*7+6))} · {duration(days.reduce((n,d)=>n+d.planned_minutes,0))}</h3><p>{days.reduce((n,d)=>n+(d.task_count??data.tasks.filter(t=>t.planned_date===d.date).length),0)} завдань</p>{data.tasks.filter(t=>days.some(d=>d.date===t.planned_date)).map(t=><TaskCard key={t.id} task={t} context={context} onDetails={onDetails}><p>{dayLabel(t.planned_date)}</p></TaskCard>)}</section>})}</>)}
 {data.next_cursor&&<button disabled={busy||loadingMore} onClick={more}>Завантажити ще завдання</button>}
 <section className="planning-unplanned"><h3>Незаплановані завдання</h3>{data.unplanned.length?data.unplanned.map(task=><PlanningTaskRow key={task.id} task={task} context={context} onDetails={onDetails} unplanned/>):<p>Незапланованих завдань немає.</p>}</section>
 {recommendations.length>0&&<section><h3>Рекомендації</h3>{recommendations.map(r=><article key={r.id}><p>{r.reason}: {r.title} · {dayLabel(r.recommended_date)}</p><button disabled={busy} onClick={()=>run('recommendation_resolve',{id:r.id,decision:'approved'})}>Підтвердити</button><button disabled={busy} onClick={()=>run('recommendation_resolve',{id:r.id,decision:'rejected'})}>Відхилити</button></article>)}</section>}
 </>}</>}
 <section><h3>Очікує погодження</h3>{approvals.length?approvals.map(r=><article key={r.id}><h4>{r.title}</h4><p>{r.request_type==='reschedule'?'Перенесення':'Створення завдання'} · {r.reason}</p>{r.requested_value.planned_date && <p>Нова дата: {dayLabel(r.requested_value.planned_date)}</p>}{context.capabilities.includes('tasks.approve') && <><button disabled={busy} onClick={()=>run(r.request_type==='reschedule'?'resolve_reschedule':'resolve_approval',{request_id:r.id,decision:'approved'})}>Підтвердити</button><button disabled={busy} onClick={()=>run(r.request_type==='reschedule'?'resolve_reschedule':'resolve_approval',{request_id:r.id,decision:'rejected'})}>Відхилити</button></>}</article>):<p>Немає запитів на погодження.</p>}</section></section>
}
