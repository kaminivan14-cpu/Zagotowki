import {useEffect,useId,useRef,useState} from 'react'
import {inputDateTimeLabel} from '../dateTime'
// Keep native validation, pickers and ISO FormData values. The adjacent canonical
// presentation is independent of the browser's native date/time control locale.
export default function DateTimeInput({type,defaultValue='',onChange,...props}){
 const [display,setDisplay]=useState(defaultValue),ref=useRef(null),id=useId()
 useEffect(()=>{const form=ref.current?.form;const reset=()=>setDisplay(defaultValue);form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset)},[defaultValue])
 return <span className="task-datetime-field"><input {...props} ref={ref} type={type} lang="uk-UA" defaultValue={defaultValue} aria-describedby={id} onChange={e=>{setDisplay(e.target.value);onChange?.(e)}}/><small id={id} className="task-datetime-preview">{inputDateTimeLabel(display,type)}</small></span>
}
