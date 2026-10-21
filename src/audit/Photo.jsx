import { useEffect, useState } from 'react'
import { photoUrl } from './client'
import Dialog from './Dialog'
export default function Photo({ photo, onDelete, onRetry, onCheck, busy }) {
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{
  if(photo.state!=='ready')return
  let alive=true
  const load=()=>photoUrl(photo.id).then(u=>{if(alive){setUrl(u);setError('')}}).catch(()=>{if(alive)setError('Nie udało się pobrać zdjęcia.')})
  void load();const timer=setInterval(load,240000)
  return()=>{alive=false;clearInterval(timer)}
 },[photo.id,photo.state,revision])
 return <div className="audit-photo">
  {photo.state==='pending'?<p>Zapis zdjęcia niepotwierdzony — sprawdź zapis, ponów przesyłanie lub usuń.</p>:url&&<button onClick={()=>setPreview(true)} aria-label="Powiększ zdjęcie"><img className="audit-thumbnail" src={url} alt="Zdjęcie do pytania" onError={()=>setError('Nie udało się wyświetlić zdjęcia.')}/></button>}
  {error&&<><p>{error}</p><button onClick={()=>setRevision(x=>x+1)}>Ponów podgląd</button></>}
  {onCheck&&photo.state==='pending'&&<button disabled={busy} onClick={onCheck}>Sprawdź zapis zdjęcia</button>}
  {onRetry&&photo.state==='pending'&&<label className="audit-file">Ponów przesyłanie<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={e=>{const f=e.target.files[0];e.target.value='';if(f)onRetry(f)}}/></label>}
  {onDelete&&<button disabled={busy} onClick={onDelete}>Usuń zdjęcie</button>}
  {preview&&<Dialog title="Podgląd zdjęcia" onClose={()=>setPreview(false)}><img className="audit-full-photo" src={url} alt="Powiększone zdjęcie do pytania"/></Dialog>}
 </div>
}
