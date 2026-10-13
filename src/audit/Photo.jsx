import { useEffect, useState } from 'react'
import { photoUrl } from './client'
import Dialog from './Dialog'
export default function Photo({ photo, onDelete, onRetry, busy }) {
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{
  if(photo.state!=='ready')return
  let alive=true
  const load=()=>photoUrl(photo.path).then(u=>{if(alive){setUrl(u);setError('')}}).catch(()=>{if(alive)setError('Nie udało się pobrać zdjęcia.')})
  void load();const timer=setInterval(load,240000)
  return()=>{alive=false;clearInterval(timer)}
 },[photo.path,photo.state,revision])
 const heic=/heic|heif/.test(photo.mime)
 return <div className="audit-photo">
  {photo.state==='pending'?<p>Zdjęcie nieprzesłane — wybierz plik ponownie lub usuń.</p>:url&&<button onClick={()=>setPreview(true)} aria-label="Powiększ zdjęcie"><img src={url} alt="Zdjęcie do pytania" onError={()=>setError(heic?'Przeglądarka nie wyświetla HEIC/HEIF. Otwórz oryginał.':'Nie udało się wyświetlić zdjęcia.')}/></button>}
  {error&&<><p>{error}</p><button onClick={()=>setRevision(x=>x+1)}>Ponów podgląd</button>{heic&&url&&<a href={url} target="_blank" rel="noreferrer">Otwórz oryginał HEIC/HEIF</a>}</>}
  {onRetry&&photo.state==='pending'&&<label className="audit-file">Ponów przesyłanie<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={e=>{const f=e.target.files[0];e.target.value='';if(f)onRetry(f)}}/></label>}
  {onDelete&&<button disabled={busy} onClick={onDelete}>Usuń zdjęcie</button>}
  {preview&&<Dialog title="Podgląd zdjęcia" onClose={()=>setPreview(false)}><img className="audit-full-photo" src={url} alt="Powiększone zdjęcie do pytania"/>{heic&&<a href={url} target="_blank" rel="noreferrer">Otwórz oryginał HEIC/HEIF</a>}</Dialog>}
 </div>
}
