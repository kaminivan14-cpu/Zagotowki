import { useCallback,useEffect,useRef,useState } from 'react'
import { read,mutate,errorText,operationKey } from './client'
import {useWorktime} from '../worktime/context'
import { TaskFeedback } from './feedback'
import WorkScreen from './screens/WorkScreen'
import PlanningScreen from './screens/PlanningScreen'
import ReportsScreen from './screens/ReportsScreen'
import ScheduleScreen from './screens/ScheduleScreen'
import TaskSettingsScreen from './screens/TaskSettingsScreen'
import TaskCreateDialog from './components/TaskCreateDialog'
import TaskDetailsDialog from './components/TaskDetailsDialog'
import CriticalTaskDialog from './components/CriticalTaskDialog'
import './tasks.css'
export default function TasksApp({employee,onSignOut,onModules}) {
 const [context,setContext]=useState(null),[people,setPeople]=useState([]),[state,setState]=useState(null),[screen,setScreen]=useState('work'),[creating,setCreating]=useState(false),[detail,setDetail]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const worktime=useWorktime()
 const pending=useRef(false),alive=useRef(true),generation=useRef(0)
 useEffect(()=>{const mounted=alive,requests=generation;mounted.current=true;return()=>{mounted.current=false;requests.current++}},[])
 const refresh=useCallback(async()=>{
  const id=++generation.current
  try { const [c,p,w]=await Promise.all([read('tasks_context'),read('tasks_assignable_people'),read('tasks_execution_state')]);if(alive.current && generation.current===id){setContext(c);setPeople(p);setState(w)} }
  catch(e){if(alive.current && generation.current===id){setError(errorText(e));if(e.code==='42501'){setContext(null);setState(null)}}}
 },[])
 useEffect(()=>{const initial=setTimeout(refresh,0);const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',refresh)}},[refresh])
 const run=async(action,args)=>{
  if(pending.current)return null
  pending.current=true;setBusy(true);setError('')
  try {const result=await mutate(employee.id,action,args);if(alive.current){await refresh();setRevision(n=>n+1)}return result ?? true}
  catch(e){if(alive.current)setError(errorText(e));return null}
  finally {pending.current=false;if(alive.current)setBusy(false)}
 }
 const retry=()=>{try {const op=JSON.parse(sessionStorage.getItem(operationKey(employee.id)));if(op)void run(op.action,op.args);else void refresh()}catch{setError('Не вдалося прочитати попередню дію. Зверніться до адміністратора.')}}
 if(!context)return <div className="app tasks-app"><p role="status">Завантаження модуля…</p><p role="alert">{error}</p><button onClick={refresh}>Повторити</button><button onClick={onSignOut}>Вийти</button></div>
 const props={context,run,busy,onDetails:setDetail,revision,people}
 const critical=worktime?.current && state?.critical.find(t=>!t.acknowledged && t.ready)
 return <TaskFeedback.Provider value={{error,retry,busy}}><div className="app tasks-app" lang="uk"><header className="tasks-header"><div><h1>Робота</h1><p>{employee.name}</p></div><div className="task-actions"><button onClick={onModules}>Модулі</button><button onClick={onSignOut}>Вийти</button></div></header>
 <nav aria-label="Розділи роботи">{[['work','Робота'],['planning','Планування'],['reports','Звіти'],['schedule','Графік']].map(([id,label])=><button key={id} aria-pressed={screen===id} onClick={()=>setScreen(id)}>{label}</button>)}{context.capabilities.includes('tasks.admin') && <button aria-pressed={screen==='settings'} onClick={()=>setScreen('settings')}>Налаштування</button>}<button className={screen==='work'?undefined:'primary'} onClick={()=>setCreating(true)}>Створити завдання</button></nav>
 <p role="alert">{error}</p>{error && <button disabled={busy} onClick={retry}>Повторити дію</button>}
 <main className={['planning','schedule','reports'].includes(screen)?'planning-main':undefined}>{screen==='work'?<WorkScreen {...props} state={state} refresh={refresh}/>:screen==='planning'?<PlanningScreen {...props} onCreate={(date,id)=>setCreating({planned_date:date,employee_id:id})}/>:screen==='reports'?<ReportsScreen {...props}/>:screen==='schedule'?<ScheduleScreen {...props}/>:<TaskSettingsScreen {...props} people={people}/>}</main>
 {creating && <TaskCreateDialog initialPlannedDate={creating.planned_date} initialEmployeeId={creating.employee_id} context={context} people={people} run={run} busy={busy} onClose={()=>setCreating(false)}/>}
 {detail && <TaskDetailsDialog {...props} task={detail} onClose={()=>setDetail(null)}/>}
 {critical && <CriticalTaskDialog key={critical.id} task={critical} run={run} busy={busy}/>}
 </div></TaskFeedback.Provider>
}
