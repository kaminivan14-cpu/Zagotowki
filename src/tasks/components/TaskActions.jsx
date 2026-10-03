import {useState} from 'react'
export default function TaskActions({task,context,run,busy,onCompleted}){
 const [confirm,setConfirm]=useState(false)
 if(task.assigned_to_employee_id!==context.employee_id||!['planned','unplanned','paused','in_progress'].includes(task.status))return null
 return <div className="task-manual-actions"><div className="task-actions">{task.status==='in_progress'?<button className="primary" disabled={busy} onClick={async()=>{if(await run('complete',{task_id:task.id,version:task.version}))onCompleted?.()}}>Зроблено</button>:<><button className="primary" disabled={busy} onClick={async()=>{if(await run('start_task',{task_id:task.id,version:task.version}))onCompleted?.()}}>Розпочати завдання</button><button disabled={busy} onClick={()=>setConfirm(true)}>Позначити виконаним</button></>}</div>
 {confirm&&<form onSubmit={async e=>{e.preventDefault();if(await run('mark_completed',{task_id:task.id,version:task.version,confirmed:true})){setConfirm(false);onCompleted?.()}}}><p>Завершити задачу без запуску таймера? Додатковий час не буде записано. Чек-лист і залежності мають бути виконані.</p><label><input type="checkbox" required disabled={busy}/>Підтверджую, що завдання виконано</label><div className="task-actions"><button disabled={busy} className="primary" type="submit">Підтвердити виконання</button><button disabled={busy} type="button" onClick={()=>setConfirm(false)}>Скасувати</button></div></form>}
 </div>
}
