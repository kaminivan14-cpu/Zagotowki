import {useEffect,useRef,useState} from 'react'
import {displayInput,parseInput,inputError,inputPlaceholder} from '../inputDateTime'
// Visible editor is deterministic; only the validated ISO value has a form name.
export default function DateTimeInput({type,defaultValue='',name,min,max,disabled,onChange,...props}){
 const [text,setText]=useState(()=>displayInput(defaultValue,type)),ref=useRef(null)
 const iso=parseInput(text,type),error=inputError(text,type,min,max)
 useEffect(()=>{ref.current?.setCustomValidity(error)},[error])
 useEffect(()=>{const form=ref.current?.form;const reset=()=>setText(displayInput(defaultValue,type));form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset)},[defaultValue,type])
 return <span className="task-datetime-field"><input {...props} ref={ref} disabled={disabled} type="text" autoComplete="off" placeholder={inputPlaceholder(type)} value={text} onChange={e=>{const value=e.target.value;ref.current.setCustomValidity(inputError(value,type,min,max));setText(value);onChange?.(e)}}/><input type="hidden" name={name} value={iso??''} disabled={disabled}/></span>
}
