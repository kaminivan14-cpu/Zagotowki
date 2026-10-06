import {useState,useRef,useEffect} from 'react'
import {supabase} from '../../supabase'
import {avatarBucket,validateAvatar} from './avatar'
import {PersonAvatar} from '../organization/OrganizationScreen'
export default function EmployeePhoto({employee,actorId,onSaved,onBusy}){
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const key=`employee-photo:${actorId}:${employee.id}`
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[pending,setPending]=useState(()=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}}),lock=useRef(false)
 const execute=async operation=>{
  if(lock.current)return;lock.current=true;setBusy(true);onBusy?.(true);setError('');setDone(false);setPending(operation)
  try{
   const persist=()=>localStorage.setItem(key,JSON.stringify({id:operation.id,path:operation.path,old:operation.old,uploaded:operation.uploaded}));persist()
   if(operation.file&&!operation.uploaded){const {error:e}=await supabase.storage.from(avatarBucket).upload(operation.path,operation.file,{upsert:false,contentType:operation.file.type});if(e&&String(e.statusCode)!=='409')throw e;operation.uploaded=true;persist()}
   const {error:e}=await supabase.rpc('employee_avatar_set',{p_employee:employee.id,p_path:operation.path,p_expected:operation.old,p_operation:operation.id});if(e)throw e
   onSaved(operation.path)
   if(operation.old){const {error:e}=await supabase.storage.from(avatarBucket).remove([operation.old]);if(e)throw Error('Фото збережено. Повторіть очищення попереднього файлу.')}
   localStorage.removeItem(key);setPending(null);setDone(true)
  }catch(e){
   if(String(e.message).includes('AVATAR_CONFLICT')){
    try{
     if(operation.path){const {error:cleanup}=await supabase.storage.from(avatarBucket).remove([operation.path]);if(cleanup)throw cleanup}
     const {data,error:reload}=await supabase.rpc('tasks_admin_directory');if(reload)throw reload
     onSaved(data.employees.find(e=>e.id===employee.id)?.avatar_path||null)
     localStorage.removeItem(key);setPending(null);setError('Фото вже змінив інший адміністратор. Перевірте поточне фото та повторіть вибір.')
    }catch{setError('Конфлікт фото. Повторіть очищення та оновлення.')}
   }else setError(e.message||'Не вдалося зберегти фото. Повторіть операцію.')
  }
  finally{lock.current=false;setBusy(false);onBusy?.(false)}
 }
 const choose=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const ext=await validateAvatar(file),id=pending?.id||crypto.randomUUID();if(!mounted.current)return;if(pending&&!pending.path?.endsWith(`.${ext}`))throw Error('Для повторення оберіть файл того самого формату.');await execute(pending?{...pending,file}:{id,file,path:`${employee.id}/${id}.${ext}`,old:employee.avatar_path||null})}catch(e){setError(e.message)}}
 return <fieldset disabled={busy}><legend>Фото працівника</legend><PersonAvatar person={employee}/><p>JPG / PNG / WebP · до 5 МБ</p>{busy&&<p role="status">Збереження фото…</p>}{done&&<p role="status">Фото збережено</p>}{error&&<p role="alert">{error}</p>}{pending?<><button type="button" onClick={()=>execute(pending)}>Повторити фото</button>{pending.path&&!pending.uploaded&&!pending.file&&<label>Оберіть файл повторно<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose}/></label>}</>:<><label>Додати / змінити фото<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose}/></label>{employee.avatar_path&&<button type="button" onClick={()=>execute({id:crypto.randomUUID(),path:null,old:employee.avatar_path})}>Видалити фото</button>}</>}</fieldset>
}
