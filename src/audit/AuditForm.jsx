import { preparePhoto } from './preparePhoto'
import { useEffect, useRef, useState } from 'react'
import { cleanup, completePhoto, read, upload } from './client'
import { answerLabels, auditName, auditTime, editable, metrics, missing } from './model'
import useOperation from './useOperation'
import Dialog from './Dialog'
import Photo from './Photo'

export default function AuditForm({ initial, employee, locations, onExit, registerGuard }) {
 const [audit,setAudit]=useState(initial),[dirty,setDirty]=useState(false),[modal,setModal]=useState(null),[photoError,setPhotoError]=useState(''),[photoStage,setPhotoStage]=useState(''),[backgroundSaving,setBackgroundSaving]=useState(false)
 const current=useRef(initial),changed=useRef(false),revision=useRef(0),op=useOperation()
 const canEdit=editable(audit,employee), blocked=op.busy||!!op.error
 const set=(value)=>{current.current=value;setAudit(value)}
 const update=(patch)=>{revision.current++;set({...current.current,...patch});changed.current=true;setDirty(true)}
 const unsaved=()=>changed.current||op.locked()||current.current.photos.some(p=>p.state==='pending')||!!op.error
 const captureSave=()=>{
  const a=current.current, needed=changed.current, savedRevision=revision.current
  return async call=>{
  if(!needed)return
  const result=await call('save',{id:a.id,version:a.version,location_id:a.location_id,answers:a.answers})
  // A response acknowledges its snapshot, never text typed while it was in flight.
  const newer=revision.current!==savedRevision
  set(newer?{...result,answers:current.current.answers,location_id:current.current.location_id,location_name:current.current.location_name}:result)
  changed.current=newer;setDirty(newer)
 }}
 const flush=()=>{
  const save=captureSave()
  return op.run(async call=>{
   setBackgroundSaving(true)
   try { await save(call) } finally { setBackgroundSaving(false) }
  })
 }
 useEffect(()=>{
  registerGuard(()=>op.locked()?'busy':unsaved())
  const leave=e=>{if(unsaved()){e.preventDefault();e.returnValue=''}}
  window.addEventListener('beforeunload',leave)
  return()=>{registerGuard(null);window.removeEventListener('beforeunload',leave)}
 })
 useEffect(()=>{
  if(!dirty||blocked)return
  const timer=setTimeout(()=>void flush(),650)
  return()=>clearTimeout(timer)
 })
 const mutate=(action,extra={})=>{const save=captureSave();return op.run(async call=>{
  await save(call)
  const a=current.current
  const result=await call(action,{id:a.id,version:a.version,...extra})
  set(result);setModal(null)
  if(action==='delete'){await cleanup();onExit()}
 })}
 const exit=()=>{const save=captureSave();return op.run(async call=>{await save(call);if(current.current.photos.some(p=>p.state==='pending')){setModal('pending');return}onExit()})}
 const addPhotos=(files,question)=>{
  setPhotoError('')
  const a=current.current
  if(files.length+a.photos.filter(p=>p.question===question).length>10){setPhotoError('Maksymalnie 10 zdjęć przy jednym pytaniu.');return}
  const save=captureSave(), entries=files.map(file=>({file,id:crypto.randomUUID()}))
  void op.run(async call=>{
   try {
    await save(call)
    for(const entry of entries){
     setPhotoStage('Przygotowywanie zdjęcia…')
     entry.prepared ||= await preparePhoto(entry.file)
     const {blob,...metadata}=entry.prepared
     const next=await call('photo_reserve',{id:a.id,version:current.current.version,question,photo_id:entry.id,...metadata})
     set(next)
     const photo=next.photos.find(p=>p.id===entry.id)
     setPhotoStage('Przesyłanie zdjęcia…')
     set(await upload(photo,blob,next.version))
    }
   } finally { setPhotoStage('') }
  })
 }
 const retryPhoto=(photo,file)=>{const save=captureSave();let prepared;return op.run(async call=>{
  try {
   setPhotoStage('Przygotowywanie zdjęcia…')
   prepared ||= await preparePhoto(file)
   if(prepared.sha256!==photo.sha256)throw Error('Wybierz ten sam plik lub usuń zdjęcie i dodaj nowe.')
   await save(call);setPhotoStage('Przesyłanie zdjęcia…')
   set(await upload(photo,prepared.blob,current.current.version))
  } finally { setPhotoStage('') }
 })}
 const checkPhoto=photo=>{const save=captureSave();return op.run(async call=>{
  await save(call);set(await completePhoto(photo,current.current.version))
 })}
 const removePhoto=photo=>{const save=captureSave();return op.run(async call=>{
  await save(call)
  set(await call('photo_delete',{id:audit.id,version:current.current.version,photo_id:photo.id}))
  await cleanup()
 })}
 const stats=metrics(audit),requirements=missing(audit)
 return <>
  <button disabled={blocked} onClick={()=>void exit()}>← Historia audytów</button>
  <h2>{audit.status==='completed'?'Wynik audytu':canEdit?'Audyt w trakcie':'Podgląd audytu'}</h2>
  <p>{auditName(audit)}</p><p>{canEdit?'Twój audyt':'Tylko podgląd'} · {audit.status==='completed'?'Zakończony':'W trakcie'}</p>
  <section className="audit-card">
   <strong>{audit.status==='completed'?`Wynik (Score): ${stats.score}%`:`Wypełnienie: ${stats.progress}%`}</strong>
   {audit.status==='completed'?<p>TAK: {stats.yes} · NIE: {stats.no} · NIE DOTYCZY: {stats.na}</p>:<progress max="100" value={stats.progress} aria-label="Procent wypełnienia"/>}
   {canEdit&&<p role="status">{op.error?'Błąd zapisu':dirty||op.busy?'Zapisywanie…':'Zapisano'}</p>}
  </section>
  {op.error&&<section role="alert" className="audit-error"><p>{op.error}</p><button disabled={op.busy} onClick={op.retry}>Ponów operację</button><button disabled={op.busy} onClick={()=>setModal('reload')}>Otwórz aktualną wersję</button></section>}
  {photoStage&&<p role="status">{photoStage}</p>}
  {photoError&&<p role="alert">{photoError}</p>}
  <section className="audit-card">
   {canEdit?<label>Lokal<select value={audit.location_id||''} disabled={blocked} onChange={e=>{const loc=locations.find(l=>String(l.id)===e.target.value);update({location_id:loc?.id||null,location_name:loc?.name||null})}}><option value="">Wybierz lokal</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>:<p>Lokal: {audit.location_name||'Nie wybrano'}</p>}
   <p>Manager: {audit.manager}</p><p>Rozpoczęcie: {auditTime(audit.started_at)}</p>{audit.completed_at&&<p>Zakończenie: {auditTime(audit.completed_at)}</p>}
  </section>
  {audit.questions.map((q,i)=><section className="audit-card" key={i} aria-label={`Pytanie ${i+1}`}>
   <small>Pytanie {i+1} / {audit.questions.length} · {audit.answers[i].answer?'Odpowiedziano':'Wymagane'}</small><h3>{q}</h3>
   {canEdit?<div className="audit-answers">{Object.entries(answerLabels).map(([v,label])=><button key={v} disabled={blocked} aria-pressed={audit.answers[i].answer===v} onClick={()=>update({answers:audit.answers.map((x,j)=>j===i?{...x,answer:x.answer===v?null:v}:x)})}>{audit.answers[i].answer===v?'✓ ':''}{label}</button>)}</div>:<p>Odpowiedź: <strong>{answerLabels[audit.answers[i].answer]||'Brak'}</strong></p>}
   {canEdit?<label>Komentarz (opcjonalnie)<textarea disabled={!!op.error||(op.busy&&!backgroundSaving)} maxLength={200} value={audit.answers[i].comment} onChange={e=>update({answers:audit.answers.map((x,j)=>j===i?{...x,comment:e.target.value}:x)})}/><small>{audit.answers[i].comment.length}/200</small></label>:audit.answers[i].comment&&<p>Komentarz: {audit.answers[i].comment}</p>}
   <p>Zdjęcia: {audit.photos.filter(p=>p.question===i).length}/10</p>
   {canEdit&&<><p className="audit-hint">JPG, PNG, WebP, HEIC/HEIF, do 10 MB. Przed wysłaniem zmniejszamy zdjęcia do 1920 px i zapisujemy jako JPG. Oryginały nie są przechowywane.</p><div className="audit-actions">
    <label className="audit-file">Galeria<input disabled={blocked} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={e=>{const files=Array.from(e.target.files);e.target.value='';if(files.length)addPhotos(files,i)}}/></label>
    <label className="audit-file">Aparat<input disabled={blocked} type="file" accept="image/*" capture="environment" onChange={e=>{const files=Array.from(e.target.files);e.target.value='';if(files.length)addPhotos(files,i)}}/></label>
   </div></>}
   <div className="audit-photos">{audit.photos.filter(p=>p.question===i).map(p=><Photo key={p.id} photo={p} busy={op.busy} onCheck={canEdit?()=>{op.clear();void checkPhoto(p)}:undefined} onDelete={canEdit?()=>{op.clear();void removePhoto(p)}:undefined} onRetry={canEdit?f=>{op.clear();void retryPhoto(p,f)}:undefined}/>)}</div>
  </section>)}
  {canEdit&&<><ul>{requirements.map(m=><li key={m}>{m}</li>)}</ul><div className="audit-actions">
   <button disabled={blocked} onClick={()=>void exit()}>Zapisz i wyjdź</button>
   <button className="primary" disabled={blocked||dirty||requirements.length>0} onClick={()=>setModal('complete')}>Zakończ audyt</button>
   <button disabled={blocked} onClick={()=>setModal('delete')}>Usuń audyt w trakcie</button>
  </div></>}
  {modal&&<Dialog title={modal==='complete'?'Zakończyć audyt?':modal==='delete'?'Usunąć audyt?':modal==='reload'?'Otworzyć aktualną wersję?':'Nieprzesłane zdjęcia'} busy={op.busy} onClose={()=>setModal(null)}>
   <p>{modal==='complete'?'Dalsza edycja będzie niemożliwa.':modal==='delete'?'Usuniesz audyt wraz z jego odpowiedziami i zdjęciami.':modal==='reload'?'Niezapisane zmiany z tego ekranu zostaną odrzucone.':'Odpowiedzi zapisano. Wróć do zdjęć, ponów przesyłanie lub usuń nieprzesłane zdjęcia.'}</p>
   {op.error&&<p role="alert">{op.error}</p>}
   {['complete','delete'].includes(modal)&&<button disabled={op.busy} onClick={()=>void (op.error?op.retry():mutate(modal))}>{modal==='complete'?'Tak, zakończ':'Tak, usuń'}</button>}
   {modal==='reload'&&<button disabled={op.busy} onClick={()=>{op.clear();void op.run(async()=>{const latest=await read('detail',audit.id);set(latest);changed.current=false;setDirty(false);setModal(null)})}}>Odrzuć lokalne zmiany i otwórz</button>}
  </Dialog>}
 </>
}
