import DateTimeInput from './DateTimeInput'
import {useState} from 'react'
import Dialog from './Dialog'
import {scheduleTypes} from '../labels.uk'
import {localToInstant,addDays} from '../dateTime'
import {errorText} from '../client'
export default function ScheduleEventDialog({date,employee,zone,run,busy,onClose}) {
 const [type,setType]=useState('work'),[error,setError]=useState('')
 const allDay=['day_off','vacation'].includes(type)
 return <Dialog hideClose title="Додати подію" onClose={onClose} busy={busy}><form className="task-editor" onSubmit={async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget)
  try {const start=localToInstant(`${f.get('date')}T${allDay?'00:00':f.get('start')}`,zone),end=localToInstant(`${allDay?addDays(f.get('endDate'),1):f.get('endDate')}T${allDay?'00:00':f.get('end')}`,zone)
   if(Date.parse(end)<=Date.parse(start)){setError('Кінець має бути пізніше початку.');return}
   if(await run('schedule_save',{employee_id:Number(employee),type,starts_at:start,ends_at:end}))onClose()
  }catch(e){setError(errorText(e))}
 }}><p role="alert">{error}</p><fieldset disabled={busy}><label>Тип<select value={type} onChange={e=>setType(e.target.value)}>{Object.entries(scheduleTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><div className="editor-grid"><label>Дата<DateTimeInput aria-label="Дата" type="date" name="date" defaultValue={date} required/></label><label>До дати включно<DateTimeInput aria-label="До дати включно" type="date" name="endDate" defaultValue={date} required/></label>{!allDay&&<><label>Початок<DateTimeInput aria-label="Початок" type="time" name="start" required/></label><label>Кінець<DateTimeInput aria-label="Кінець" type="time" name="end" required/></label></>}</div><small>Часовий пояс: {zone}</small><div className="editor-actions"><button className="primary" type="submit">Зберегти</button><button type="button" onClick={onClose}>Скасувати</button></div></fieldset></form></Dialog>
}
