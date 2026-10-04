import {useEffect,useState} from 'react'
import {read,errorText} from '../client'
import Files,{FileLink} from './Files'
import {resultTypes} from './labels'
export default function TaskResult({task,run,busy,revision}){
 const [data,setData]=useState(null),[files,setFiles]=useState([]),[error,setError]=useState('')
 useEffect(()=>{let live=true;read('tasks_process_task',{p_task:task.id}).then(d=>{if(live){setData(d);if(d.result?.value.file_id)setFiles(old=>old.length?old:[d.result.value.file_id])}}).catch(e=>{if(live)setError(errorText(e))});return()=>{live=false}},[task.id,task.version,revision])
 if(!data)return <p>{error||'Завантаження результату…'}</p>
 const spec=data.step||{},required=spec.result_type!=='done'||spec.required_file||spec.requires_confirmation
 return <section className="task-result"><h3>Інструкції та результат</h3><Files ids={data.attachments}/>{spec.expected_result&&<p>{spec.expected_result}</p>}{required&&<><p>Очікується: {resultTypes[spec.result_type]}</p>{data.result&&<p>{data.result.approved_at?'Результат підтверджено':spec.requires_confirmation||spec.result_type==='approval'?'Результат збережено. Очікуємо підтвердження.':'Результат збережено'}</p>}
 {!['completed','cancelled'].includes(task.status)&&<form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),value={};if(f.has('text'))value.text=f.get('text');if(f.has('number'))value.number=Number(f.get('number'));if(f.has('url'))value.url=f.get('url');if(files[0])value.file_id=files[0];await run('result_save',{task_id:task.id,version:task.version,value})}}>
 {spec.result_type==='comment'&&<label>Коментар до результату<textarea name="text" required defaultValue={data.result?.value.text||''}/></label>}{spec.result_type==='number'&&<label>Числовий результат<input name="number" type="number" step="any" required defaultValue={data.result?.value.number??''}/></label>}{spec.result_type==='link'&&<label>Посилання на результат<input name="url" type="url" pattern="https://.*" required defaultValue={data.result?.value.url||''}/></label>}{(spec.required_file||['photo','file'].includes(spec.result_type))&&<Files ids={files} onChange={ids=>setFiles(ids.slice(-1))} taskId={task.id} run={run} busy={busy}/>}<button disabled={busy}>Зберегти результат</button></form>}</>}</section>
}
export function ResultInbox({run,busy,revision}){
 const [rows,setRows]=useState([]),[error,setError]=useState('')
 useEffect(()=>{let live=true;read('tasks_result_inbox').then(r=>{if(live)setRows(r)}).catch(()=>{if(live)setError('Не вдалося завантажити підтвердження')});return()=>{live=false}},[revision])
 return <>{error&&<p role="alert">{error}</p>}{rows.length>0&&<details className="result-inbox"><summary>Підтвердження результатів ({rows.length})</summary>{rows.map(t=><article key={t.id}><h3>{t.title}</h3>{t.value.text&&<p>{t.value.text}</p>}{t.value.number!=null&&<p>{t.value.number}</p>}{t.value.url&&<a href={t.value.url} target="_blank" rel="noreferrer">Відкрити посилання</a>}{t.value.file_id&&<FileLink id={t.value.file_id}/>}<button disabled={busy} onClick={()=>run('result_approve',{task_id:t.id,version:t.version})}>Підтвердити результат</button></article>)}</details>}</>
}
