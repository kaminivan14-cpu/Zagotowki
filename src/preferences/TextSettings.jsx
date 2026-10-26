import {useState} from 'react'
import {tr} from '../i18n/runtime'
import Dialog from '../tasks/components/Dialog'
import {readTextSize,saveTextSize} from './textSize'
export default function TextSettings({employee,onClose}){
 const id=employee.auth_user_id||employee.id
 const [size,setSize]=useState(()=>readTextSize(id)),[error,setError]=useState(false)
 return <Dialog title={tr('Налаштування')} onClose={onClose}><fieldset className="text-size-settings"><legend>{tr('Розмір тексту')}</legend>{[['small','Малий'],['normal','Звичайний'],['large','Великий'],['xlarge','Дуже великий']].map(([key,label])=><label key={key}><input type="radio" name="text-size" value={key} checked={size===key} onChange={()=>{setSize(key);setError(!saveTextSize(id,key))}}/>{tr(label)}</label>)}</fieldset>{error&&<p role="alert">{tr('Налаштування діє зараз, але браузер не дозволив його зберегти.')}</p>}</Dialog>
}
