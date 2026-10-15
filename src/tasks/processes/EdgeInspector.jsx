import {useState} from 'react'
import {tr} from '../../i18n/runtime'
import {useLocale} from '../../i18n/useLocale'
import {processSteps,editDependency} from './model'
export default function EdgeInspector({doc,edge,onChange,disabled}){useLocale();const [from,setFrom]=useState(edge.from),[to,setTo]=useState(edge.to),[error,setError]=useState(''),tasks=processSteps(doc);function apply(mode){try{onChange(editDependency(doc,edge,from,to,mode));setError('')}catch{setError(edge.implicit?tr('Не можна змінити неявну залежність. Змініть правило етапу.'):tr('Залежності не можуть утворювати коло.'))}}
return <fieldset disabled={disabled}><h3>{tr('Залежність')}</h3><p role="alert">{error}</p>{[[tr('Попереднє завдання'),from,setFrom],[tr('Наступне завдання'),to,setTo]].map(([label,value,set])=><label key={label}>{label}<select value={value} onChange={e=>set(e.target.value)}>{tasks.map(t=><option key={t.key} value={t.key}>{t.number} {t.title}</option>)}</select></label>)}{[['replace',tr('Застосувати')],['add',tr('Додати зв’язок')],['delete',tr('Видалити зв’язок')]].map(([mode,label])=><button key={mode} type="button" onClick={()=>apply(mode)}>{label}</button>)}</fieldset>}
