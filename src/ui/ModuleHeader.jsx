import {useEffect,useRef} from 'react'
import './module-header.css'
function Menu({label,items,description,disabled}) {
 const root=useRef(null)
 useEffect(()=>{
  // Dismiss outside pointer interactions, not an ambiguous blur before click.
  const outside=event=>{if(root.current && !root.current.contains(event.target))root.current.open=false}
  document.addEventListener('pointerdown',outside,true)
  return()=>document.removeEventListener('pointerdown',outside,true)
 },[])
 function close(){if(root.current)root.current.open=false}
 return <details ref={root} className="module-menu"
  onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();root.current.querySelector('summary').focus()}}}
  onBlur={event=>{
   // Touch/non-focusing buttons may blur summary with relatedTarget=null.
   // Closing here would hide the action before its click is dispatched.
   if(event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))close()
  }}>
  <summary>{label} ▾</summary>
  <div className="module-menu-items">
   {description && <span>{description}</span>}
   {items.map(({label:actionLabel,action})=><button key={actionLabel} type="button" disabled={disabled} onClick={event=>{
    close()
    action(event)
   }}>{actionLabel}</button>)}
  </div>
 </details>
}
export default function ModuleHeader({title,employee,location,children,status,onWorktime,onEmployees,onModules,onSignOut,disabled=false}) {
 return <header className="module-header">
  <div className="module-identity"><h1>{title}</h1><p>{employee.name}{employee.role && ` · ${employee.role}`}</p>{location}{status}</div>
  {children}
  <div className="module-header-actions">
   {(onWorktime||onEmployees)&&<Menu label="Narzędzia" disabled={disabled} items={[...(onWorktime?[{label:'Czas pracy',action:onWorktime}]:[]),...(onEmployees?[{label:'Pracownicy',action:onEmployees}]:[])]}/>}
   {onModules&&<button disabled={disabled} onClick={onModules}>← Moduły</button>}
   <Menu label="Konto" description={employee.name} disabled={disabled} items={[{label:'Wyloguj',action:onSignOut}]}/>
  </div>
 </header>
}
