import {tr} from '../../i18n/runtime'
import {useEffect,useRef,useState} from 'react'
import {safeInstruction} from './instruction'
export default function InstructionEditor({value,html,onChange,disabled}){
 const ref=useRef(),[link,setLink]=useState(''),[showLink,setShowLink]=useState(false)
 useEffect(()=>{const el=ref.current;if(document.activeElement!==el){if(html)el.innerHTML=safeInstruction(html);else el.textContent=value||''}},[value,html])
 function change(){onChange(ref.current.innerText,safeInstruction(ref.current.innerHTML))}
 function command(name,arg){ref.current.focus();document.execCommand(name,false,arg);change()}
 return <div className="process-instruction"><div role="toolbar" aria-label={tr('Форматування інструкції')}>{[[tr('Абзац'),'formatBlock','p'],[tr('Жирний'),'bold'],[tr('Курсив'),'italic'],[tr('Підкреслений'),'underline'],[tr('Нумерований список'),'insertOrderedList'],[tr('Список'),'insertUnorderedList']].map(([label,name,arg])=><button type="button" disabled={disabled} key={label} onMouseDown={e=>e.preventDefault()} onClick={()=>command(name,arg)}>{label}</button>)}<button type="button" disabled={disabled} onClick={()=>setShowLink(!showLink)}>{tr('Посилання')}</button></div>{showLink&&<div><input aria-label={tr('Адреса посилання')} type="url" value={link} onChange={e=>setLink(e.target.value)}/><button type="button" onClick={()=>{if(/^https?:\/\//i.test(link)){command('insertText',link);setShowLink(false)}}}>{tr('Додати посилання')}</button></div>}<div ref={ref} role="textbox" aria-label={tr('Інструкція')} aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning onInput={change} onPaste={e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'))}}/></div>
}
