import {useEffect,useRef,useState} from 'react'
import {safeInstruction} from './instruction'
export default function InstructionEditor({value,html,onChange,disabled}){
 const ref=useRef(),[link,setLink]=useState(''),[showLink,setShowLink]=useState(false)
 useEffect(()=>{const el=ref.current;if(document.activeElement!==el){if(html)el.innerHTML=safeInstruction(html);else el.textContent=value||''}},[value,html])
 function change(){onChange(ref.current.innerText,safeInstruction(ref.current.innerHTML))}
 function command(name,arg){ref.current.focus();document.execCommand(name,false,arg);change()}
 return <div className="process-instruction"><div role="toolbar" aria-label="Форматування інструкції">{[['Абзац','formatBlock','p'],['Жирний','bold'],['Курсив','italic'],['Підкреслений','underline'],['Нумерований список','insertOrderedList'],['Список','insertUnorderedList']].map(([label,name,arg])=><button type="button" disabled={disabled} key={label} onMouseDown={e=>e.preventDefault()} onClick={()=>command(name,arg)}>{label}</button>)}<button type="button" disabled={disabled} onClick={()=>setShowLink(!showLink)}>Посилання</button></div>{showLink&&<div><input aria-label="Адреса посилання" type="url" value={link} onChange={e=>setLink(e.target.value)}/><button type="button" onClick={()=>{if(/^https?:\/\//i.test(link)){command('insertText',link);setShowLink(false)}}}>Додати посилання</button></div>}<div ref={ref} role="textbox" aria-label="Інструкція" aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning onInput={change} onPaste={e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'))}}/></div>
}
