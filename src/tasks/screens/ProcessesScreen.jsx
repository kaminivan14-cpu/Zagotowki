import {useEffect,useState} from 'react'
import {read,errorText} from '../client'
import {tr} from '../../i18n/runtime'
import {withCurrentStructure} from '../admin/currentStructure'
import Processes from '../admin/Processes'
export default function ProcessesScreen(props){
 const {context,people,locations,revision}=props
 const allowed=context.capabilities.includes('processes.read'),admin=context.capabilities.includes('tasks.admin')
 const [directory,setDirectory]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let live=true
  if(allowed&&admin)Promise.all([read('tasks_admin_directory'),read('organization_structure')]).then(([d,org])=>{if(live){setDirectory(withCurrentStructure(d,org,context.today));setError('')}}).catch(e=>{if(live){setDirectory(null);setError(errorText(e))}})
  return()=>{live=false}
 },[allowed,admin,revision,context.today])
 if(!allowed)return null
 if(admin&&!directory)return <p role={error?'alert':'status'}>{error||tr('Завантаження…')}</p>
 return <Processes {...props} directory={admin?directory:{employees:people,departments:context.departments||[],locations}}/>
}
