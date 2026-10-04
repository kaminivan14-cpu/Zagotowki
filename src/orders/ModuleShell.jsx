import { moduleAllowed, runtimeEnvironment } from './environment'
import { lazy, Suspense, useEffect, useState } from 'react'
import App from '../App'
import { supabase } from '../supabase'
import OrdersApp from './OrdersApp'
const TasksApp = lazy(() => import('../tasks/TasksApp'))
import './orders.css'
import WorktimeProvider from '../worktime/WorktimeProvider'
import {useWorktime} from '../worktime/context'
import WorktimePanel from '../worktime/WorktimePanel'
const modules = [
 { id: 'orders', permission: 'orders.access', label: '🍣 ZAMÓWIENIA', description: 'Realizacja bieżących zamówień' },
 { id: 'production', permission: 'production.access', label: '🥣 ZAGOTÓWKI', description: 'Produkcja / przygotowanie' },
 { id: 'tasks', permission: 'tasks.access', label: 'Робота', description: 'Завдання, планування та графік' },
]
export default function ModuleShell({ pracownik, onSignOut }) {
 const [caps,setCaps]=useState(null),[module,setModule]=useState(null),[error,setError]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{let alive=true;supabase.rpc('auth_capabilities').then(({data,error})=>{if(!alive)return;if(error || !Array.isArray(data)){setCaps(null);setError(true);return}setError(false);setCaps(data);const available=modules.filter(m=>moduleAllowed(runtimeEnvironment,pracownik.role,m.id,data));if(available.length===1)setModule(available[0].id)}).catch(()=>{if(alive){setCaps(null);setError(true)}});return()=>{alive=false}},[pracownik,revision])
 if(error)return <div className="app"><p role="alert">Nie udało się sprawdzić uprawnień modułów.</p><button onClick={()=>setRevision(x=>x+1)}>Ponów</button><button onClick={onSignOut}>Wyloguj</button></div>
 if(!caps)return <p role="status">Sprawdzanie modułów…</p>
 return <WorktimeProvider employee={pracownik} capabilities={caps} module={module} onSignOut={onSignOut}><ModuleContent {...{pracownik,caps,module,setModule,onSignOut}}/></WorktimeProvider>
}
function ModuleContent({pracownik,caps,module,setModule}){
 const w=useWorktime(),[panel,setPanel]=useState(false)
 const available=modules.filter(m=>moduleAllowed(runtimeEnvironment,pracownik.role,m.id,caps)),back=()=>setModule(null)
 const canAccess=caps.includes('worktime.access')
 let screen
 if(module==='production' && caps.includes('production.access'))screen=<App pracownik={pracownik} onModules={available.length>1?back:undefined} onWorktime={canAccess?()=>setPanel(true):undefined} onSignOut={w.logout} onStartWork={w.enabled?loc=>w.start(loc,'production'):undefined}/>
 else if(module==='orders' && moduleAllowed(runtimeEnvironment,pracownik.role,'orders',caps))screen=<OrdersApp employee={pracownik} capabilities={caps} onSignOut={w.logout} onModules={back} onWorktime={()=>setPanel(true)}/>
 else if(module==='tasks' && moduleAllowed(runtimeEnvironment,pracownik.role,'tasks',caps))screen=<Suspense fallback={<p role="status">Завантаження роботи…</p>}><TasksApp employee={pracownik} onSignOut={w.logout} onModules={back}/></Suspense>
 else screen=<div className="app module-selector"><h1>Co robisz?</h1>{available.map(m=><button key={m.id} onClick={()=>setModule(m.id)}>{m.label}<small>{m.description}</small></button>)}{!available.length && <p>Brak dostępnych modułów.</p>}<button onClick={w.logout}>Wyloguj</button></div>
 return <><div hidden={panel}>{screen}</div>{panel&&canAccess&&<WorktimePanel capabilities={caps} onBack={()=>setPanel(false)}/>}</>
}
