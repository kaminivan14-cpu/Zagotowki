import {tr} from '../../i18n/runtime'
import useDismissDropdown from './useDismissDropdown'
import {useState} from 'react'
const roleName=value=>value
export default function RoleSelect({roles,value,onChange,label=tr('Відповідальна посада'),multiple=false,disabled=false}){
 const dropdown=useDismissDropdown()
 const [search,setSearch]=useState('');const chosen=multiple?(value||[]):[value].filter(Boolean)
 return <details ref={dropdown} className="process-multiselect"><summary aria-label={label}>{chosen.length?chosen.map(roleName).join(', '):tr('Оберіть посаду')} ▾</summary><div className="process-options"><input aria-label={tr('Пошук: {name}',{name:label})} placeholder={tr('Пошук посади…')} value={search} onChange={e=>setSearch(e.target.value)}/>{!roles.length&&<p>{tr('Спочатку заповніть посади працівників.')}</p>}{roles.filter(r=>roleName(r).toLocaleLowerCase('uk').includes(search.toLocaleLowerCase('uk'))).map(r=><label key={r}><input type={multiple?'checkbox':'radio'} name={multiple?undefined:label} disabled={disabled} checked={chosen.includes(r)} onChange={e=>onChange(multiple?(e.target.checked?[...chosen,r]:chosen.filter(x=>x!==r)):r)}/>{roleName(r)}</label>)}</div></details>
}
