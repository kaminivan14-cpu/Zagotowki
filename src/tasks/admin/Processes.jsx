import ProcessList from '../processes/ProcessList'
import ProcessView from '../processes/ProcessView'
import ProcessWizard from '../processes/ProcessWizard'
import ProcessLaunch from '../processes/ProcessLaunch'
import {P} from '../processes/labels'
import {isFinished} from '../processes/model'
import '../processes/processes.css'
import {useEffect,useState} from 'react'
import {read,errorText} from '../client'
import {blankProcess,systemRoles,productionRoles} from './labels'
export default function Processes({context,directory,run,busy,revision,people,onDetails}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[tab,setTab]=useState('templates'),[editor,setEditor]=useState(null),[launch,setLaunch]=useState(null),[instance,setInstance]=useState(null)
 useEffect(()=>{let live=true;read('tasks_processes').then(d=>{if(live)setData(d)}).catch(e=>{if(live)setError(errorText(e))});return()=>{live=false}},[revision])
 return <section className="process-workspace"><div className="admin-toolbar"><div><h3>Процеси</h3><p>Керуйте шаблонами процесів та відстежуйте їх виконання</p></div>{context.capabilities.includes('processes.manage')&&<button className="primary" onClick={()=>setEditor({definition:blankProcess()})}>Створити процес</button>}</div><div className="process-tabs">{[['templates',P.templates],['active',P.active],['done',P.history]].map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{v}{data&&k!=='templates'?` (${data.instances.filter(i=>isFinished(i)===(k==='done')).length})`:null}</button>)}</div><p role="alert">{error}</p>{!data?<p>Завантаження…</p>:<>
 <ProcessList {...{data,tab,directory,context,busy,run,setEditor,setLaunch,setInstance}}/>
 {editor&&<ProcessWizard key={editor.id||'new'} initial={editor} {...{context,directory,run,busy,people}} onClose={()=>setEditor(null)} roles={data.roles||Object.keys({...systemRoles,...productionRoles})}/>}
 {launch&&<ProcessLaunch initial={launch} {...{people,context,directory,busy,run}} onClose={()=>setLaunch(null)} onLaunched={()=>{setLaunch(null);setTab('active')}}/>}
 {instance&&<ProcessView {...{instance,data,directory}} onClose={()=>setInstance(null)} onDetails={onDetails} onEdit={setEditor} canManage={context.capabilities.includes('processes.manage')} run={run} busy={busy}/>}
 </>}</section>
}
