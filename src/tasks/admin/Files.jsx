import {useEffect,useState,useRef} from 'react'
import {supabase} from '../../supabase'
import {read} from '../client'
export function FileLink({id}){
 const [file,setFile]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let live=true;read('tasks_file',{p_id:id}).then(f=>{if(live)setFile(f)}).catch(()=>{if(live)setError('Файл недоступний')});return()=>{live=false}},[id])
 return <span>{error||<button type="button" onClick={async()=>{const {data,error}=await supabase.storage.from('tasks-private').createSignedUrl(file.object_key,60);if(error)setError('Не вдалося відкрити файл');else window.open(data.signedUrl,'_blank','noopener,noreferrer')}} disabled={!file}>{file?.name||'Завантаження файла…'}</button>}</span>
}
export default function Files({ids=[],onChange,versionId,taskId,run,busy}){
 const input=useRef(null)
 const [uploading,setUploading]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(null)
 async function register(payload){const saved=await run('file_register',payload);if(saved){onChange([...ids,saved.id]);setPending(null)}}
 return <section className="process-files"><p role="alert">{error}</p>{ids.map(id=><div key={id}><FileLink id={id}/>{onChange&&<button type="button" disabled={busy} onClick={()=>onChange(ids.filter(x=>x!==id))}>Прибрати</button>}</div>)}{onChange&&<div><button type="button" disabled={busy||uploading||!!pending||(!versionId&&!taskId)} onClick={()=>input.current?.click()}>Додати файл (до 20 МБ)</button><input ref={input} hidden aria-label="Файл для завантаження" type="file" disabled={busy||uploading||!!pending||(!versionId&&!taskId)} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.docx" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>20971520){setError('Файл перевищує 20 МБ');return}setUploading(true);setError('');try{const {data:{user}}=await supabase.auth.getUser();const id=crypto.randomUUID(),key=`${user.id}/${id}`;const {error}=await supabase.storage.from('tasks-private').upload(key,file,{upsert:false});if(error)throw error;const payload={id,object_key:key,name:file.name,mime:file.type||'application/octet-stream',size_bytes:file.size,...(taskId?{task_id:taskId}:{version_id:versionId})};setPending(payload);await register(payload)}catch{setError('Не вдалося зберегти файл. Повторіть спробу.')}finally{setUploading(false);e.target.value=''}}}/></div>}{pending&&<button type="button" disabled={busy||uploading} onClick={()=>register(pending)}>Повторити збереження файла</button>}{!versionId&&!taskId&&onChange&&<small>Спочатку збережіть чернетку процесу.</small>}</section>
}
