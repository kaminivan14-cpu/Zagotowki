import {addDays,planningRange} from './dateTime.js'
import {duration} from './labels.uk.js'
export const nextWeekAvailable = today => (new Date(`${today}T12:00:00Z`).getUTCDay() || 7) >= 5
export function weekRange(today,period) {
 const monday=planningRange(today,'month').from,from=addDays(monday,period==='next'?7:0)
 return {from,to:addDays(from,6)}
}
export function loadText(minutes,unknown=0) {
 const known=minutes>0 || !unknown ? `~${duration(minutes)}` : ''
 return [known,unknown?`${unknown} без оцінки`:''].filter(Boolean).join(' + ')
}
export function loadLevel(day) {
 if(day.planned_minutes>day.capacity_minutes)return 'overloaded'
 if(day.capacity_minutes>0 && day.planned_minutes>=day.capacity_minutes*.85)return 'near'
 return 'normal'
}
export function rootCategory(id,categories) {
 const byId=new Map(categories.map(c=>[String(c.id),c])),seen=new Set()
 let c=byId.get(String(id))
 while(c?.parent_id!=null && !seen.has(c.id)){seen.add(c.id);const parent=byId.get(String(c.parent_id));if(!parent)break;c=parent}
 return c || null
}
export function categoryTotals(tasks,categories) {
 const totals=new Map(categories.filter(c=>c.parent_id==null).map(c=>[String(c.id),{id:c.id,name:c.name,count:0}]))
 for(const task of tasks.filter(t=>t.status!=='cancelled')){
  const root=rootCategory(task.category_id,categories),key=root?String(root.id):'other'
  if(!totals.has(key))totals.set(key,{id:key,name:root?.name || 'Інші',count:0})
  totals.get(key).count++
 }
 return [...totals.values()]
}
export const shortDay = day => new Intl.DateTimeFormat('uk-UA',{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))
export const dateLabel = day => new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))
