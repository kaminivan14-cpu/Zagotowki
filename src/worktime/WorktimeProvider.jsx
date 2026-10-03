import {useCallback,useEffect,useRef,useState} from 'react'
import {supabase} from '../supabase'
import {worktimeError,duration} from './client'
import './worktime.css'
import {WorktimeContext as Context,useWorktime} from './context'
export default function WorktimeProvider({employee,capabilities,module,onSignOut,children}){
 const lastModule=useRef('orders')
 useEffect(()=>{if(['orders','production'].includes(module))lastModule.current=module},[module])
 const enabled=capabilities?.includes('worktime.self')
 const [current,setCurrent]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState(false)
 const storageKey=`worktime-operation:${employee.id}`
 const [pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey))}catch{return null}})
 const pendingRef=useRef(pending),lock=useRef(false),alive=useRef(true),readVersion=useRef(0)
 const refresh=useCallback(async()=>{
  if(!enabled)return
  const n=++readVersion.current
  const r=await supabase.rpc('worktime_current');if(r.error)throw r.error
  if(alive.current&&n===readVersion.current)setCurrent(r.data);return r.data
 },[enabled])
 useEffect(()=>{alive.current=true;if(!enabled)return
  const read=()=>refresh().catch(()=>{if(alive.current)setError('Nie udało się odczytać czasu pracy.')})
  void read();const timer=setInterval(read,5000);return()=>{alive.current=false;clearInterval(timer)}
 },[enabled,refresh])
 async function command(action,args){
  if(lock.current)throw new Error('Operacja trwa.')
  lock.current=true;setBusy(true);setError('')
  let op=pendingRef.current
  try{
   if(op && (op.action!==action||JSON.stringify(op.args)!==JSON.stringify(args)))throw new Error('PENDING_OPERATION')
   if(!op){op={action,args,id:crypto.randomUUID()};sessionStorage.setItem(storageKey,JSON.stringify(op));pendingRef.current=op;setPending(op)}
   const r=await supabase.rpc('worktime_command',{p_action:action,p_args:args,p_operation:op.id})
   if(r.error){
    if(['P0001','42501','23514','23505','22P02','22007','22008'].includes(r.error.code)){sessionStorage.removeItem(storageKey);pendingRef.current=null;setPending(null)}
    throw r.error
   }
   sessionStorage.removeItem(storageKey);pendingRef.current=null;setPending(null);try{await refresh()}catch{setError('Zapisano operację, ale odświeżenie danych nie powiodło się.')}return r.data
  }catch(e){setError(worktimeError(e));throw e}finally{lock.current=false;setBusy(false)}
 }
 async function start(location,source=module){
  return command('start',{location_id:Number(location),module:source})
 }
 async function end(){const latest=await refresh();if(latest)await command('end',{shift_id:latest.id,module:lastModule.current})}
 async function logout(){
  if(!enabled){await onSignOut();return}
  try{const active=await refresh();if(active)setDialog(true);else await onSignOut()}catch(e){setError(worktimeError(e));setDialog(true)}
 }
 return <Context.Provider value={{enabled,current,busy,pending,error,command,start,end,logout,refresh}}>
 {children}
 {error && <p className="worktime-error" role="alert">{error}</p>}
 {pending && <aside className="worktime-bar">Czas pracy: operacja wymaga potwierdzenia. <button disabled={busy} onClick={()=>command(pending.action,pending.args).catch(()=>{})}>Ponów operację czasu pracy</button></aside>}
 {dialog && <div className="worktime-overlay"><section role="dialog" aria-modal="true" aria-label="Czy zakończyć również czas pracy?" className="worktime-dialog">
 <h2>Czy zakończyć również czas pracy?</h2>
 {pending&&<button disabled={busy} onClick={()=>command(pending.action,pending.args).catch(()=>{})}>Ponów poprzednią operację</button>}
 <button disabled={busy||Boolean(pending)} onClick={async()=>{try{await end();setDialog(false);await onSignOut()}catch{}}}>Zakończ pracę i wyloguj</button>
 <button disabled={busy} onClick={async()=>{setDialog(false);await onSignOut()}}>Tylko wyloguj</button>
 <button disabled={busy} onClick={()=>setDialog(false)}>Anuluj</button>
 </section></div>}
 </Context.Provider>
}
export function WorktimeBar({location,locations=[],onLocation,onPanel,canAccess,showSession=true}){
 const w=useWorktime()
 const [now,tick]=useState(()=>Date.now())
 useEffect(()=>{const t=setInterval(()=>tick(Date.now()),60000);return()=>clearInterval(t)},[])
 if(!w?.enabled)return null
 return <nav className="worktime-bar" aria-label="Czas pracy">
 {canAccess && <button onClick={onPanel}>Czas pracy</button>}
 {showSession && <>{w.current?<><span>● W pracy · {duration((now-Date.parse(w.current.started_at))/60000)}</span><button disabled={w.busy||Boolean(w.pending)} onClick={()=>w.end().catch(()=>{})}>Zakończ pracę</button></>:<>
 {onLocation && <label>Lokal pracy<select aria-label="Lokal pracy" value={location||''} onChange={e=>onLocation(e.target.value)}><option value="">Wybierz lokal</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
 <button disabled={!location||w.busy||Boolean(w.pending)} onClick={()=>w.start(location).catch(()=>{})}>Rozpocznij pracę</button>
 </>}</>}
 </nav>
}
