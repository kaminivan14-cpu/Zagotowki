import './module-header.css'
function Menu({label,children}) {
 return <details className="module-menu" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary').focus()}}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false}}>
  <summary>{label} ▾</summary><div className="module-menu-items" onClick={e=>{if(e.target.closest('button'))e.currentTarget.closest('details').open=false}}>{children}</div>
 </details>
}
export default function ModuleHeader({title,employee,location,children,status,onWorktime,onEmployees,onModules,onSignOut,disabled=false}) {
 return <header className="module-header">
  <div className="module-identity"><h1>{title}</h1><p>{employee.name}{employee.role && ` · ${employee.role}`}</p>{location}{status}</div>
  {children}
  <div className="module-header-actions">
   {(onWorktime||onEmployees)&&<Menu label="Narzędzia">{onWorktime&&<button disabled={disabled} onClick={onWorktime}>Czas pracy</button>}{onEmployees&&<button disabled={disabled} onClick={onEmployees}>Pracownicy</button>}</Menu>}
   {onModules&&<button disabled={disabled} onClick={onModules}>← Moduły</button>}
   <Menu label="Konto"><span>{employee.name}</span><button disabled={disabled} onClick={onSignOut}>Wyloguj</button></Menu>
  </div>
 </header>
}
