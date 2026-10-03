import {useEffect,useRef,useState} from 'react'
import {supabase} from '../supabase'
import {useWorktime} from './context'
import {initialRange,date,time,duration,localInput,correctionInstant,worktimeError} from './client'
const statuses={active:'W pracy',completed:'Zakończona',needs_attention:'Wymaga uwagi'}
export default function WorktimePanel({capabilities,onBack}){
 const [filters,setFilters]=useState(initialRange),[view,setView]=useState('list'),[context,setContext]=useState(null),[rows,setRows]=useState([]),[summary,setSummary]=useState([]),[calendar,setCalendar]=useState([]),[next,setNext]=useState(null),[cursor,setCursor]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,reload]=useState(0),[edit,setEdit]=useState(null),[events,setEvents]=useState(null),[month,setMonth]=useState(()=>initialRange().p_to.slice(0,7)),[day,setDay]=useState(null),[downloadBusy,setDownloadBusy]=useState(false)
 const generation=useRef(0),w=useWorktime()
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer)},[])
 const calendarFilters={...filters,p_from:month+'-01',p_to:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10)}
 const query=view==='calendar'?calendarFilters:filters
 const queryKey=JSON.stringify(query)
 useEffect(()=>{let alive=true;supabase.rpc('worktime_context').then(r=>{if(!alive)return;if(r.error)setError(worktimeError(r.error));else setContext(r.data)}).catch(e=>{if(alive)setError(worktimeError(e))});return()=>{alive=false}},[])
 useEffect(()=>{
  const n=++generation.current
  const load=async()=>{setBusy(true);setError('');setRows([]);setSummary([]);setCalendar([]);setNext(null)
   try{
    const q=JSON.parse(queryKey)
    const name=view==='summary'?'worktime_summary':view==='calendar'&&!day?'worktime_calendar':'worktime_list'
    const args=name==='worktime_list'?{...q,...(day&&view==='calendar'?{p_from:day,p_to:day}:{}),p_cursor:cursor}:q
    const r=await supabase.rpc(name,args)
    if(n!==generation.current)return
    if(r.error)throw r.error
    if(name==='worktime_list'){setRows(r.data.rows);setNext(r.data.next_cursor)}
    else if(name==='worktime_summary')setSummary(r.data)
    else setCalendar(r.data)
   }catch(e){if(n===generation.current)setError(worktimeError(e))}finally{if(n===generation.current)setBusy(false)}
  }
  void load();return()=>{if(n===generation.current)generation.current=n+1}
 },[queryKey,view,cursor,day,revision,w?.pending])
 const change=(key,value)=>{setFilters(f=>({...f,[key]:value}));setCursor(0);setDay(null);setEvents(null)}
 const switchView=v=>{setView(v);setCursor(0);setDay(null);setEvents(null)}
 async function exportXml(){
  setDownloadBusy(true);setError('')
  try{
   const r=await supabase.rpc('worktime_export_xml',view==='calendar'&&day?{...query,p_from:day,p_to:day}:query);if(r.error)throw r.error
   const url=URL.createObjectURL(new Blob([r.data],{type:'application/xml;charset=utf-8'})),a=document.createElement('a')
   a.href=url;a.download='czas-pracy.xml';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }catch(e){setError(worktimeError(e))}finally{setDownloadBusy(false)}
 }
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()
 return <main className="worktime-panel">
 <header><h1>Czas pracy</h1><button onClick={onBack}>Powrót do modułu</button></header>
 <p>Strefa: Europe/Warsaw. Zakres według dnia rozpoczęcia; zmiana przez północ pozostaje jedną sesją. Podsumowanie obejmuje wyłącznie zakończone sesje. Sesje powyżej 16 godzin wymagają uwagi.</p>
 <nav aria-label="Widok czasu pracy">{[['list','Lista'],['calendar','Kalendarz'],['summary','Podsumowanie']].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>switchView(key)}>{label}</button>)}</nav>
 <div className="worktime-filters">
 {view==='calendar'?<label>Miesiąc<input type="month" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setDay(null);setCursor(0)}}}/></label>:<><label>Od<input type="date" value={filters.p_from} onChange={e=>change('p_from',e.target.value)}/></label><label>Do<input type="date" value={filters.p_to} onChange={e=>change('p_to',e.target.value)}/></label></>}
 <label>Pracownik<select aria-label="Pracownik" value={filters.p_employee||''} onChange={e=>change('p_employee',Number(e.target.value)||null)}><option value="">Wszyscy w zakresie</option>{context?.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
 <label>Lokal<select aria-label="Lokal" value={filters.p_location||''} onChange={e=>change('p_location',Number(e.target.value)||null)}><option value="">Wszystkie w zakresie</option>{context?.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
 <label>Status<select aria-label="Status" value={filters.p_status||''} onChange={e=>change('p_status',e.target.value||null)}><option value="">Wszystkie</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <button disabled={busy} onClick={()=>reload(n=>n+1)}>Odśwież</button>
 {capabilities.includes('worktime.export')&&<button disabled={busy||downloadBusy} onClick={exportXml}>Eksportuj XML</button>}
 </div>
 {busy&&<p role="status">Ładowanie czasu pracy…</p>}{error&&<p role="alert">{error}</p>}
 {view==='calendar'&&!day&&<div className="worktime-calendar" aria-label="Dni miesiąca">{['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(d=><strong key={d}>{d}</strong>)}{Array.from({length:days},(_,i)=>{const d=month+'-'+String(i+1).padStart(2,'0'),entry=calendar.find(c=>c.work_date===d);return <button key={d} style={i===0?{gridColumnStart:(new Date(d+'T12:00:00Z').getUTCDay()+6)%7+1}:undefined} onClick={()=>{setDay(d);setCursor(0)}}><strong>{i+1}</strong><span>{entry?.sessions||0} sesji</span></button>})}</div>}
 {view==='calendar'&&day&&<h2>{date(day+'T12:00:00Z')} <button onClick={()=>{setDay(null);setCursor(0)}}>Cały miesiąc</button></h2>}
 {(view==='list'||day&&view==='calendar')&&<><div className="worktime-table"><table><thead><tr>{['Pracownik','Lokal','Data rozpoczęcia','Godzina rozpoczęcia','Data zakończenia','Godzina zakończenia','Łącznie','Status','Akcje'].map(h=><th key={h}>{h}</th>)}</tr></thead>
 <tbody>{rows.map(r=><tr key={r.id}><td>{r.employee_name}</td><td>{r.location_name}</td><td>{date(r.started_at)}</td><td>{time(r.started_at)}</td><td>{date(r.ended_at)}</td><td>{time(r.ended_at)}</td><td>{duration(r.worked_minutes??(now-Date.parse(r.started_at))/60000)}{!r.ended_at&&' (do teraz)'}</td><td>{statuses[r.status]}</td><td>{capabilities.includes('worktime.correct')&&<button onClick={()=>setEdit(r)}>Koryguj</button>}<button onClick={async()=>{try{const x=await supabase.rpc('worktime_events',{p_shift:r.id});if(x.error)throw x.error;setEvents(x.data)}catch(e){setError(worktimeError(e))}}}>Historia</button></td></tr>)}</tbody></table></div>
 {!busy&&!rows.length&&<p>Brak sesji w wybranym zakresie.</p>}
 <button disabled={!cursor||busy} onClick={()=>setCursor(0)}>Pierwsza strona</button><button disabled={!next||busy} onClick={()=>setCursor(next)}>Następna strona</button></>}
 {view==='summary'&&<div className="worktime-table"><table><thead><tr><th>Pracownik</th><th>Liczba dni pracy</th><th>Łączna liczba godzin</th><th>Aktywne sesje (poza sumą)</th></tr></thead><tbody>{summary.map(r=><tr key={r.employee_id}><td>{r.employee_name}</td><td>{r.work_days}</td><td>{duration(r.worked_minutes)}</td><td>{r.active_sessions}</td></tr>)}</tbody></table></div>}
 {events&&<section><h2>Historia korekt i sesji</h2>{!events.length&&<p>Brak zdarzeń. Audyt obejmuje operacje od wdrożenia funkcji.</p>}{events.map(e=><div key={e.id}><p>{date(e.created_at)} {time(e.created_at)} · {e.event_type} · Pracownik #{e.actor_employee_id}</p><p>{e.reason}</p><p>Przed: {date(e.old_values?.started_at)} {time(e.old_values?.started_at)} → {date(e.old_values?.ended_at)} {time(e.old_values?.ended_at)}</p><p>Po: {date(e.new_values.started_at)} {time(e.new_values.started_at)} → {date(e.new_values.ended_at)} {time(e.new_values.ended_at)}</p></div>)}</section>}
 {edit&&<Correction row={edit} close={()=>setEdit(null)} saved={()=>{setEdit(null);reload(n=>n+1)}}/>}
 </main>
}
function Correction({row,close,saved}){
 const w=useWorktime(),[start,setStart]=useState(localInput(row.started_at)),[end,setEnd]=useState(localInput(row.ended_at)),[reason,setReason]=useState(''),[error,setError]=useState('')
 return <div className="worktime-overlay"><form className="worktime-dialog" role="dialog" aria-modal="true" aria-label="Korekta sesji" onSubmit={async e=>{e.preventDefault();try{setError('');await w.command('correct',{shift_id:row.id,version:row.version,started_at:correctionInstant(start,row.started_at),ended_at:correctionInstant(end,row.ended_at),reason});saved()}catch(e){setError(e.message?.includes('godzin')?e.message:worktimeError(e))}}}>
 <h2>Korekta sesji — {row.employee_name}</h2><p>Czas Europe/Warsaw. Format RRRR-MM-DDTHH:mm lub ISO z offsetem dla zmiany czasu. Pusty koniec oznacza aktywną sesję.</p>
 <label>Początek<input required value={start} disabled={w.busy||Boolean(w.pending)} onChange={e=>setStart(e.target.value)}/></label>
 <label>Koniec<input value={end} disabled={w.busy||Boolean(w.pending)} onChange={e=>setEnd(e.target.value)}/></label>
 <label>Powód korekty<textarea required minLength={3} maxLength={1000} value={reason} disabled={w.busy||Boolean(w.pending)} onChange={e=>setReason(e.target.value)}/></label>
 {error&&<p role="alert">{error}</p>}<button disabled={w.busy||Boolean(w.pending)}>Zapisz korektę</button><button type="button" disabled={w.busy} onClick={close}>Anuluj</button>
 </form></div>
}
