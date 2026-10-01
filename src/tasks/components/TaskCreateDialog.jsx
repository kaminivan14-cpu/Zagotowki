import { useState } from 'react'
import { errorText } from '../client'
import Dialog from './Dialog'
import { priorities, urgencies, categoryName } from '../labels.uk'
import { localToInstant } from '../dateTime'
export default function TaskCreateDialog({ context, people, run, busy, onClose }) {
 const [error,setError] = useState('')
 const [target, setTarget] = useState(String(context.employee_id))
 const submit = async e => {
  e.preventDefault(); const f = new FormData(e.currentTarget), request = target === 'request'
  const args = { title: f.get('title'), description: f.get('description'), category_id: f.get('category_id') || null, priority: f.get('priority'), urgency: f.get('urgency'), estimated_minutes: f.get('estimated_minutes') ? Number(f.get('estimated_minutes')) : null }
  if (request) args.reason = f.get('reason') || 'Запит керівнику'
  else Object.assign(args, { assigned_to_employee_id: Number(target), planned_date: f.get('planned_date') || null, deadline_at: localToInstant(f.get('deadline'), context.settings.company_timezone), deadline_is_hard: f.get('hard') === 'on' })
  if (args.urgency === 'critical_now' && f.get('confirm') !== 'on') return
  const result = await run(request ? 'request_creation' : 'create', args)
  if (result) onClose()
 }
 const [urgency, setUrgency] = useState('normal')
 return <Dialog title="Створити завдання" onClose={onClose} busy={busy}><form onSubmit={e => { void submit(e).catch(e => setError(errorText(e))) }}><p role="alert">{error}</p><fieldset disabled={busy}>
 <label>Назва<input name="title" required maxLength={300} autoFocus /></label><label>Опис / інструкція<textarea name="description" maxLength={20000} /></label>
 <label>Категорія<select name="category_id"><option value="">Без категорії</option>{context.categories.map(c => <option key={c.id} value={c.id}>{categoryName(c.id,context.categories)}</option>)}</select></label>
 <label>Пріоритет<select name="priority" defaultValue="medium">{Object.entries(priorities).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
 <label>Терміновість<select name="urgency" value={urgency} onChange={e => setUrgency(e.target.value)}>{Object.entries(urgencies).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
 {urgency === 'critical_now' && <label><input type="checkbox" name="confirm" required />Підтверджую негайне переривання поточної роботи</label>}
 <label>Орієнтовний час, хв<input name="estimated_minutes" type="number" min="1" max="525600" /></label>
 <label>Кому<select value={target} onChange={e => setTarget(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.id === context.employee_id ? 'Собі' : p.name}</option>)}{context.manager_id && <option value="request">Запит керівнику</option>}</select></label>
 {target === 'request' ? <label>Причина<input name="reason" required /></label> : <><label>Дедлайн ({context.settings.company_timezone})<input name="deadline" type="datetime-local" /></label><label><input name="hard" type="checkbox" />Жорсткий дедлайн</label></>}
 {target !== 'request' && <label>Дата (необов’язково)<input name="planned_date" type="date" min={context.today}/></label>}<button className="primary" type="submit">Створити</button></fieldset></form></Dialog>
}
