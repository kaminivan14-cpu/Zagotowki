import {useWorktime} from './context'
import {useLocale} from '../i18n/useLocale'
import {shiftFunctions,shiftFunctionLabels} from './shiftFunction'
export default function ShiftFunctionSelect(){
 const w=useWorktime(),locale=useLocale(),text=shiftFunctionLabels[locale]
 if(!w?.functionEnabled)return null
 return <label className="shift-function-select">{text.label}<select aria-label={text.label} disabled={w.busy||Boolean(w.pending)} value={w.current?(w.current.current_shift_function||''):w.selectedFunction} onChange={e=>w.changeFunction(e.target.value).catch(()=>{})}>
 <option value="" disabled>{text.choose}</option>
 {shiftFunctions.map(f=><option key={f} value={f}>{text[f]}</option>)}
 </select></label>
}
