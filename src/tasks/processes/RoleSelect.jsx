import {tr} from '../../i18n/runtime'
import useDismissDropdown from './useDismissDropdown'
import {useState} from 'react'
import {roleName} from '../admin/labels'
export default function RoleSelect({roles,value,onChange,label=tr('Відповідальна роль'),multiple=false,disabled=false}){
 const dropdown=useDismissDropdown()
 const [search,setSearch]=useState('');const chosen=multiple?(value||[]):[value].filter(Boolean)
 return <details ref={dropdown} className="process-multiselect"><summary aria-label={label}>{chosen.length?chosen.map(roleName).join(', '):tr('Оберіть роль')} ▾</summary><div className="process-options"><input aria-label={tr('Пошук: {name}',{name:label})} placeholder={tr('Пошук ролі…')} value={search} onChange={e=>setSearch(e.target.value)}/>{roles.filter(r=>roleName(r).toLocaleLowerCase('uk').includes(search.toLocaleLowerCase('uk'))).map(r=><label key={r}><input type={multiple?'checkbox':'radio'} name={multiple?undefined:label} disabled={disabled} checked={chosen.includes(r)} onChange={e=>onChange(multiple?(e.target.checked?[...chosen,r]:chosen.filter(x=>x!==r)):r)}/>{roleName(r)}</label>)}</div></details>
}
