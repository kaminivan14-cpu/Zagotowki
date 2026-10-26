import TextSettings from '../preferences/TextSettings'
import {tr,getLocale} from '../i18n/runtime'
import { useCallback,useEffect,useRef,useState } from 'react'
import { read,mutate,errorText,operationKey } from './client'
import {useWorktime} from '../worktime/context'
import { TaskFeedback } from './feedback'
import TaskListScreen from './screens/TaskListScreen'
import WorkScreen from './screens/WorkScreen'
import PlanningScreen from './screens/PlanningScreen'
import ReportsScreen from './screens/ReportsScreen'
import ScheduleScreen from './screens/ScheduleScreen'
import AdminScreen from './admin/AdminScreen'
import ProcessesScreen from './screens/ProcessesScreen'
import {ResultInbox} from './admin/TaskResult'
import './admin/admin.css'
import TaskCreateDialog from './components/TaskCreateDialog'
import TaskDetailsDialog from './components/TaskDetailsDialog'
import CriticalTaskDialog from './components/CriticalTaskDialog'
import './tasks.css'
export default function TasksApp({employee,onSignOut,onModules}) {
 const [context,setContext]=useState(null),[people,setPeople]=useState([]),[state,setState]=useState(null),[screen,setScreen]=useState('work'),[creating,setCreating]=useState(false),[detail,setDetail]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [textSettings,setTextSettings]=useState(false)
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
 const retry=()=>{try {const op=JSON.parse(sessionStorage.getItem(operationKey(employee.id)));if(op)void run(op.action,op.args);else void refresh()}catch{setError(tr('Не вдалося прочитати попередню дію. Зверніться до адміністратора.'))}}
 if(!context)return <div className="app tasks-app"><p role="status">{tr('Завантаження модуля…')}</p><p role="alert">{error}</p><button onClick={refresh}>{tr('Повторити')}</button><button onClick={onSignOut}>{tr('Вийти')}</button></div>
 const props={context,run,busy,onDetails:setDetail,revision,people}
 const critical=worktime?.current && state?.critical.find(t=>!t.acknowledged && t.ready)
 return <TaskFeedback.Provider value={{error,retry,busy}}><div className="app tasks-app" lang={getLocale()} onInvalidCapture={e=>{if(!e.target.validity.customError)e.target.setCustomValidity(tr('Перевірте значення цього поля. Заповніть обов’язкові дані у вказаному форматі.'))}} onInputCapture={e=>{if(e.target.setCustomValidity)e.target.setCustomValidity('')}}><header className="tasks-header"><div><h1>{tr('Робота')}</h1><p>{employee.name} <button type="button" aria-label={tr('Налаштування')} title={tr('Налаштування')} onClick={()=>setTextSettings(true)}>⚙</button></p></div><div className="task-actions"><button onClick={onModules}>{tr('Модулі')}</button><button onClick={onSignOut}>{tr('Вийти')}</button></div></header>
 <nav aria-label={tr('Розділи роботи')}>{[['work',tr('Робота')],['planning',tr('Планування')],['reports',tr('Звіти')],['schedule',tr('Графік')]].map(([id,label])=><button key={id} aria-pressed={screen===id} onClick={()=>setScreen(id)}>{label}</button>)}{context.capabilities.includes('processes.read') && <button aria-pressed={screen==='processes'} onClick={()=>setScreen('processes')}>{tr('Процеси')}</button>}{context.capabilities.includes('tasks.admin') && <button aria-pressed={screen==='settings'} onClick={()=>setScreen('settings')}>{tr('Адмін панель')}</button>}<button aria-pressed={screen==='tasks'} onClick={()=>setScreen('tasks')}>{tr('Завдання')}</button><button className={screen==='work'?undefined:'primary'} onClick={()=>setCreating(true)}>{tr('Створити завдання')}</button></nav>
 <ResultInbox run={run} busy={busy} revision={revision}/><p role="alert">{error}</p>{error && <button disabled={busy} onClick={retry}>{tr('Повторити дію')}</button>}
 <main className={screen==='tasks'?'task-list-main':screen==='processes'?'processes-main':['planning','schedule','reports'].includes(screen)?'planning-main':undefined}>{screen==='tasks'?<TaskListScreen {...props} onCreate={()=>setCreating(true)}/>:screen==='work'?<WorkScreen {...props} state={state} refresh={refresh}/>:screen==='planning'?<PlanningScreen {...props} onCreate={(date,id)=>setCreating({planned_date:date,employee_id:id})}/>:screen==='reports'?<ReportsScreen {...props}/>:screen==='schedule'?<ScheduleScreen {...props}/>:screen==='processes'?<ProcessesScreen {...props} locations={state?.locations||[]}/>:<AdminScreen {...props}/>}</main>
 {textSettings && <TextSettings employee={employee} onClose={()=>setTextSettings(false)}/>}
 {creating && <TaskCreateDialog initialPlannedDate={creating.planned_date} initialEmployeeId={creating.employee_id} context={context} people={people} run={run} busy={busy} onClose={()=>setCreating(false)}/>}
 {detail && <TaskDetailsDialog {...props} task={detail} onClose={()=>setDetail(null)}/>}
 {critical && <CriticalTaskDialog key={critical.id} task={critical} run={run} busy={busy}/>}
 </div></TaskFeedback.Provider>
}
