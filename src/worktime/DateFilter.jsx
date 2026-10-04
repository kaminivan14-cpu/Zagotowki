import {useState} from 'react'
import {polishDate,parsePolishDate} from './client'
export default function DateFilter({label,value,onChange}) {
 const [draft,setDraft]=useState(polishDate(value))
 const valid=parsePolishDate(draft)
 return <label>{label}<input aria-label={label} placeholder="DD.MM.RRRR" inputMode="numeric" value={draft} aria-invalid={!valid} onChange={e=>{setDraft(e.target.value);const iso=parsePolishDate(e.target.value);if(iso)onChange(iso)}}/>{!valid&&<small role="alert">Wpisz datę DD.MM.RRRR</small>}</label>
}
