import {addDays,planningRange} from './dateTime.js'
export function reportRange(anchor,mode){
 if(mode==='week'){const from=planningRange(anchor,'month').from;return {from,to:addDays(from,6)}}
 const from=anchor.slice(0,7)+'-01',d=new Date(from+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1)
 return {from,to:addDays(d.toISOString().slice(0,10),-1)}
}
export function moveReport(anchor,mode,delta){if(mode==='week')return addDays(anchor,7*delta);const d=new Date(anchor.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,10)}
export function actualTime(minutes){const n=Math.round(Number(minutes)||0);return `${Math.floor(n/60)} год ${String(n%60).padStart(2,'0')} хв`}
export function reportSummary(rows){const total=rows.reduce((n,r)=>n+Number(r.actual_minutes),0),byKind={planned:0,unplanned:0,unknown:0};for(const r of rows)byKind[r.kind in byKind?r.kind:'unknown']+=Number(r.actual_minutes);return {total,byKind,percent:kind=>total?Math.round(byKind[kind]/total*100):0}}
export function reportWeeks(from,to){const weeks=[];for(let d=from;d<=to;){const end=reportRange(d,'week').to<to?reportRange(d,'week').to:to;weeks.push({from:d,to:end});d=addDays(end,1)}return weeks}
export function exportReport(rows){const cell=v=>`"${String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')}"`;return '\ufeff'+[['Дата','Працівник','Завдання','Тип','Хвилини','Категорія'],...rows.map(r=>[r.date,r.employee_name,r.title,r.kind,Number(r.actual_minutes).toFixed(2),r.category_name])].map(r=>r.map(cell).join(',')).join('\r\n')}
