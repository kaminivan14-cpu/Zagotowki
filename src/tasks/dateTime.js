export const addDays = (day, count) => new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10)
export function planningRange(today, mode = 'week') {
 const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7
 const monday = addDays(today, 1 - weekday)
 const from = mode === 'month' ? monday : addDays(monday, weekday >= 5 ? 7 : 0)
 return { from, to: addDays(from, mode === 'month' ? 27 : 6) }
}
export const dateLabel = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day.split('-').reverse().join('.') : '—'
export const dayLabel = day => dateLabel(day)
function instantParts(value,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]))}
export function timeLabel(value,zone){if(!value)return '—';const p=instantParts(value,zone);return `${p.hour}:${p.minute}`}
export function instantLabel(value,zone){if(!value)return '—';const p=instantParts(value,zone);return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`}
export function inputDateTimeLabel(value,type){if(!value)return type==='date'?'ДД.ММ.РРРР':type==='time'?'ГГ:хх':'ДД.ММ.РРРР ГГ:хх';if(type==='date')return dateLabel(value);if(type==='time')return value.slice(0,5);const [date,time]=value.split('T');return `${dateLabel(date)} ${time?.slice(0,5)||''}`}
// Resolve wall-clock input against the company zone, never the browser zone.
// Ambiguous/nonexistent DST times require a different explicit time instead of guessing.
export function localToInstant(value, zone) {
 if (!value) return null
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('INVALID_LOCAL_TIME')
 const base = Date.parse(`${value}:00Z`), candidates = new Set()
 const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
 const wall = ms => fmt.format(new Date(ms)).replace(' ', 'T')
 for (const delta of [-86400000, 0, 86400000]) {
  const sample = base + delta, offset = Date.parse(`${wall(sample)}:00Z`) - sample
  const candidate = base - offset
  if (wall(candidate) === value) candidates.add(candidate)
 }
 if (candidates.size !== 1) throw new Error('INVALID_LOCAL_TIME')
 return new Date([...candidates][0]).toISOString()
}
