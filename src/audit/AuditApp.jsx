import { useEffect, useRef, useState } from 'react'
import ModuleHeader from '../ui/ModuleHeader'
import { read, cleanup } from './client'
import { auditName, auditTime, editable, metrics } from './model'
import useOperation from './useOperation'
import Dialog from './Dialog'
import AuditForm from './AuditForm'
import './audit.css'
export default function AuditApp({ employee, onModules, onSignOut }) {
 const [view,setView]=useState('home'),[templates,setTemplates]=useState([]),[history,setHistory]=useState([]),[locations,setLocations]=useState([])
 const [filter,setFilter]=useState('active'),[audit,setAudit]=useState(null),[editor,setEditor]=useState(null),[modal,setModal]=useState(null),[loading,setLoading]=useState(false),[cleanupError,setCleanupError]=useState('')
 const guard=useRef(null),editorDirty=useRef(false),op=useOperation()
 const isDirty=()=>editorDirty.current||guard.current?.()
 useEffect(()=>{const leave=e=>{if(editorDirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[])
 const load=async(next,status=filter)=>{
  setLoading(true)
  try{
   if(next==='choose'||next==='templates')setTemplates(await read('templates'))
   if(next==='history')setHistory(await read('history',null,status))
   setView(next)
  }finally{setLoading(false)}
 }
 const navigate=(next,status=filter)=>void op.run(()=>load(next,status))
 const requestLeave=action=>{if(guard.current?.()==='busy'){setModal({type:'busy'});return}if(isDirty())setModal({type:'leave',action});else action()}
 const open=a=>void op.run(async()=>{
  const [detail,locs]=await Promise.all([read('detail',a.id),read('locations')])
  setLocations(locs);setAudit(detail);setView('form')
 })
 const clean=()=>cleanup().then(()=>setCleanupError('')).catch(()=>setCleanupError('Nie udało się usunąć plików z magazynu. Ponów sprzątanie.'))
 useEffect(()=>{void clean()},[])
 const start=template=>setModal({type:'start',template})
 const editorChange=next=>{editorDirty.current=true;setEditor(next)}
 const edit=template=>{setEditor(template?{...template,questions:[...template.questions]}:{id:crypto.randomUUID(),name:'',questions:['']});editorDirty.current=false;setView('editor')}
 const saveTemplate=()=>{
  if(!editor.name.trim()||!editor.questions.length||editor.questions.some(q=>!q.trim()))return
  void op.run(async call=>{
   await call('template_save',{id:editor.id,version:editor.version??null,name:editor.name.trim(),questions:editor.questions.map(q=>q.trim())})
   editorDirty.current=false;await load('templates')
  })
 }
 return <div className="app audit-app">
  <ModuleHeader title="📋 AUDYT" employee={employee} disabled={op.busy} onModules={()=>requestLeave(onModules)} onSignOut={()=>requestLeave(onSignOut)}/>
  <main>
   {view!=='home'&&<button disabled={op.busy} onClick={()=>requestLeave(()=>{op.clear();navigate('home')})}>← Menu AUDYT</button>}
   {op.error&&<section className="audit-error" role="alert"><p>{op.error}</p><button disabled={op.busy} onClick={op.retry}>Ponów operację</button>{view==='editor'&&<button onClick={()=>requestLeave(()=>{editorDirty.current=false;op.clear();navigate('templates')})}>Otwórz aktualną listę wzorów</button>}</section>}
   {cleanupError&&<p role="alert">{cleanupError} <button onClick={()=>void clean()}>Ponów sprzątanie</button></p>}
   {loading&&<p role="status">Ładowanie…</p>}
   {view==='home'&&<><h2>Audyt lokalu</h2>{[['choose','Nowy audyt','Wybierz wzór i rozpocznij kontrolę'],['history','Historia audytów','Kontynuuj lub sprawdź wyniki'],['templates','Wzory formularzy','Twórz i edytuj listy pytań']].map(([v,title,desc])=><button className="audit-tile" key={v} disabled={op.busy} onClick={()=>navigate(v)}><strong>{title}</strong><small>{desc}</small></button>)}</>}
   {['choose','templates'].includes(view)&&<><h2>{view==='choose'?'Nowy audyt':'Wzory formularzy'}</h2>{templates.length===0&&<p>Nie ma jeszcze wzorów formularzy. Utwórz pierwszy wzór.</p>}{templates.map(t=><section className="audit-card" key={t.id}><h3>{t.name}</h3><p>{t.questions.length} pytań · TAK / NIE / NIE DOTYCZY</p>{view==='choose'?<button disabled={op.busy} onClick={()=>start(t)}>Wybierz wzór</button>:<div className="audit-actions"><button onClick={()=>setModal({type:'preview',template:t})}>Podgląd</button><button onClick={()=>edit(t)}>Edytuj</button><button onClick={()=>setModal({type:'template_delete',template:t})}>Usuń wzór</button></div>}</section>)}<button disabled={op.busy} onClick={()=>edit()}>+ Nowy wzór</button></>}
   {view==='history'&&<><h2>Historia audytów</h2><div className="audit-actions">{[['active','W trakcie'],['completed','Zakończone']].map(([v,label])=><button key={v} aria-pressed={filter===v} disabled={op.busy} onClick={()=>{setFilter(v);navigate('history',v)}}>{label}</button>)}</div>{history.length===0&&<p>Brak audytów w tym widoku.</p>}{history.map(a=><section className="audit-card" key={a.id}><h3>{auditName(a)}</h3><p>Lokal: {a.location_name||'Nie wybrano'}</p><p>Manager: {a.manager}</p><p>{auditTime(a.started_at)} · {a.status==='completed'?'Zakończony':'W trakcie'}</p><p>{editable(a,employee)?'Twój audyt':'Tylko podgląd'}</p><strong>{a.status==='completed'?`Wynik (Score): ${metrics(a).score}%`:`Wypełnienie: ${metrics(a).progress}%`}</strong><button disabled={op.busy} onClick={()=>open(a)}>{editable(a,employee)?'Kontynuuj audyt':'Podgląd audytu'}</button></section>)}<button disabled={op.busy} onClick={()=>navigate('choose')}>+ Nowy audyt</button></>}
   {view==='form'&&<AuditForm key={audit.id} initial={audit} employee={employee} locations={locations} registerGuard={fn=>{guard.current=fn}} onExit={()=>{setFilter('active');navigate('history','active')}}/>}
   {view==='editor'&&<><h2>Edytor wzoru</h2><p>Zmiany dotyczą tylko nowych audytów.</p><fieldset disabled={op.busy||!!op.error}><label>Nazwa wzoru<input maxLength={200} required value={editor.name} onChange={e=>editorChange({...editor,name:e.target.value})}/></label>{editor.questions.map((q,i)=><section className="audit-card" key={i}><label>Pytanie {i+1}<textarea required maxLength={2000} value={q} onChange={e=>editorChange({...editor,questions:editor.questions.map((x,j)=>i===j?e.target.value:x)})}/></label><div className="audit-actions">{[-1,1].map(direction=><button key={direction} disabled={i+direction<0||i+direction>=editor.questions.length} aria-label={`Pytanie ${i+1} ${direction<0?'w górę':'w dół'}`} onClick={()=>{const qs=[...editor.questions];[qs[i],qs[i+direction]]=[qs[i+direction],qs[i]];editorChange({...editor,questions:qs})}}>{direction<0?'↑':'↓'}</button>)}<button onClick={()=>editorChange({...editor,questions:editor.questions.filter((_,j)=>j!==i)})}>Usuń pytanie</button></div></section>)}<button disabled={editor.questions.length>=500} onClick={()=>editorChange({...editor,questions:[...editor.questions,'']})}>+ Dodaj pytanie</button><p>Nazwa i co najmniej jedno niepuste pytanie są wymagane.</p><button className="primary" disabled={!editor.name.trim()||!editor.questions.length||editor.questions.some(q=>!q.trim())} onClick={saveTemplate}>Zapisz wzór</button></fieldset><button disabled={op.busy} onClick={()=>requestLeave(()=>{editorDirty.current=false;op.clear();navigate('templates')})}>Anuluj edycję</button></>}
   {modal&&<Dialog title={{start:'Rozpocząć audyt?',preview:modal.template?.name,template_delete:'Usunąć wzór?',leave:'Niezapisane zmiany',busy:'Trwa zapisywanie'}[modal.type]} busy={op.busy} onClose={()=>setModal(null)}>
    {op.error&&<p role="alert">{op.error}</p>}
    {modal.type==='busy'?<p>Poczekaj na zakończenie zapisu lub przesyłania zdjęć.</p>:modal.type==='preview'?<ol>{modal.template.questions.map((q,i)=><li key={i}>{q}</li>)}</ol>:<>
     <p>{modal.type==='start'?modal.template.name:modal.type==='template_delete'?'Istniejące audyty zostaną zachowane.':'Masz niezapisane zmiany lub nieprzesłane zdjęcia. Pozostań i zapisz je albo świadomie opuść ekran.'}</p>
     <button disabled={op.busy} onClick={()=>{
      if(op.error&&modal.type!=='leave'){void op.retry();return}
      if(modal.type==='leave'){editorDirty.current=false;const action=modal.action;setModal(null);action();return}
      void op.run(async call=>{
       if(modal.type==='start'){
        const result=await call('start',{template_id:modal.template.id})
        setLocations(await read('locations'));setAudit(result);setView('form')
       }else{await call('template_delete',{id:modal.template.id,version:modal.template.version});await load('templates')}
       setModal(null)
      })
     }}>{modal.type==='start'?'Tak, rozpocznij':modal.type==='leave'?'Opuść ekran':'Tak, usuń wzór'}</button>
    </>}
   </Dialog>}
  </main>
 </div>
}
