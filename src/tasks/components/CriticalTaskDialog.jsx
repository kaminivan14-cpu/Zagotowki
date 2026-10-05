import { useState } from 'react'
import Dialog from './Dialog'
import { duration } from '../labels.uk'
export default function CriticalTaskDialog({task,run,busy}) {
 const [reason,setReason]=useState(false)
 return <Dialog title="Критичне завдання" onClose={()=>setReason(true)} busy={busy}><h3>{task.title}</h3><p>{duration(task.estimated_minutes)}</p><button className="primary" disabled={busy} onClick={()=>run('critical_start',{task_id:task.id,version:task.version})}>Почати</button><button disabled={busy} onClick={()=>setReason(true)}>Не можу зараз</button>{reason && <form onSubmit={e=>{e.preventDefault();run('critical_decline',{task_id:task.id,version:task.version,reason:new FormData(e.currentTarget).get('reason')})}}><label>Вкажіть причину<input name="reason" required maxLength={2000} autoFocus/></label><button disabled={busy}>Зберегти причину</button></form>}</Dialog>
}
