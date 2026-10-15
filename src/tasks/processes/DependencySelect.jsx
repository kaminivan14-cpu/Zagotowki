import {tr} from '../../i18n/runtime'
import useDismissDropdown from './useDismissDropdown'
import {useState} from 'react'
import {canConnect,processSteps,dependencyEdges} from './model'
export default function DependencySelect({doc,task,onChange,disabled=false}){
 const dropdown=useDismissDropdown()
 const [query,setQuery]=useState(''),steps=processSteps(doc),selected=task.depends_on||[],implicit=dependencyEdges(doc).filter(e=>e.to===task.key&&e.implicit)
 return <details ref={dropdown} className="process-multiselect"><summary aria-label={tr('Залежності: {name}',{name:task.title})}>{selected.length?selected.map(key=><span className="process-chip" key={key}>{steps.find(t=>t.key===key)?.number}</span>):tr('Немає')} ▾</summary><div className="process-options"><input aria-label={tr('Пошук завдань')} placeholder={tr('Пошук завдань…')} value={query} onChange={e=>setQuery(e.target.value)}/>{doc.stages.map(s=><div key={s.key}><strong>{s.name}</strong>{steps.filter(t=>t.stageKey===s.key&&t.key!==task.key&&`${t.number} ${t.title}`.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk'))).map(t=><label key={t.key}><input type="checkbox" checked={selected.includes(t.key)} disabled={disabled||(!selected.includes(t.key)&&!canConnect(doc,t.key,task.key))} onChange={e=>onChange(e.target.checked?[...selected,t.key]:selected.filter(k=>k!==t.key))}/>{t.number} {t.title}</label>)}</div>)}{implicit.length>0&&<small>{tr('Залежності попередньої версії (етап / дата)')}: {implicit.map(e=>steps.find(t=>t.key===e.from)?.number).join(', ')}</small>}</div></details>
}
