import { useState } from 'react'
import { labels as L } from './labels'
import { deadline, visibleItems, operational, setAvailable, selectedItems, lifecycle } from './board'
const time = value => new Date(value).toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})
export default function OrdersBoard({ orders, employee, capabilities, shift, disabled, selection, setSelection, run, now, onHistory }) {
 const has = cap => capabilities.includes(cap)
 const button = (label,action,args,blocked=false) => <button disabled={disabled || blocked} onClick={() => run(action,args)}>{label}</button>
 return <div className="orders-horizontal" role="region" aria-label={L.board} tabIndex={0}>
 {orders.map(order => {
  const items = visibleItems(order), urgency = lifecycle(order)==='done' ? null : deadline(order.ready_at,now), selected = selectedItems(order,selection)
  return <article key={order.id} className={`order-column deadline-${urgency?.level || 'normal'}`}>
   <div className="order-heading"><h2>{order.display_number}</h2>{order.ready_at && <span className={`deadline-badge ${urgency?.level || ''}`}>{urgency?.level==='overdue' ? L.overdue(urgency.minutes) : L.readyAt(time(order.ready_at))}</span>}</div>
   <span className="order-status">{L.stages[order.status] || order.status}</span><span className="order-lifecycle">{L.lifecycle[lifecycle(order)]}</span>
   <p>{L.visible(items.filter(operational).length)}</p>
   {order.estimated_prep_minutes != null && <p>{L.prep(order.estimated_prep_minutes)}</p>}
   {urgency && ['warning','urgent'].includes(urgency.level) && <p className={`deadline-badge ${urgency.level}`}>{L[urgency.level]}</p>}
   {order.status==='NEW' && has('orders.dispatch') && button(L.dispatch,'send',{order_id:order.id})}
   {has('orders.work') && order.status!=='NEW' && lifecycle(order)!=='done' && <div className="order-claim-buttons">
    {button(L.wholeOrder,'claim_all',{order_id:order.id},!shift || !items.some(i=>operational(i)&&i.available>0))}
    {button(L.selected(selected.length),'claim',{order_id:order.id,items:selected},!shift || !selected.length)}
    {!shift && <small>{L.shiftNeeded}</small>}
   </div>}
   <div className="compact-items">{items.filter(i=>!i.parent_item_id).map(item => item.item_type==='set' ? <SetRow key={item.id} {...{item,items,order,has,employee,shift,disabled,selection,setSelection,run}}/> : <ItemRow key={item.id} {...{item,order,has,employee,shift,disabled,selection,setSelection,run}}/>)}</div>
   {onHistory && <button onClick={()=>onHistory(order)}>{L.history}</button>}
  </article>
 })}
 </div>
}
function SetRow(props) {
 const {item,items,order,has,shift,disabled,run,selection,setSelection} = props
 const [expanded,setExpanded]=useState(true)
 const children=items.filter(i=>i.parent_item_id===item.id && operational(i)), remaining=setAvailable(item,items)
 const checked=children.some(c=>c.available>0)&&children.filter(c=>c.available>0).every(c=>Number(selection[c.id])===c.available)
 return <section className="set-row"><div className="compact-title">
  {has('orders.work') && <input type="checkbox" aria-label={L.select(item.name)} checked={checked} disabled={disabled || !shift || order.status==='NEW' || !children.some(c=>c.available>0)} onChange={e=>setSelection(old=>({...old,...Object.fromEntries(children.map(c=>[c.id,e.target.checked?c.available:0]))}))}/>}
  <strong>{item.name}</strong><span>×{item.quantity}</span></div>
  <p>{L.left}: {remaining} · {L.lifecycle[item.lifecycle || 'new']}</p>
  <button aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?L.collapse:L.expand}</button>
  {has('orders.work') && order.status!=='NEW' && remaining>0 && <div className="compact-actions">
   <button disabled={disabled || !shift} onClick={()=>run('claim_set',{order_id:order.id,set_id:item.id,quantity:remaining})}>{L.wholeSet} ({remaining})</button>
   {remaining>1 && <button disabled={disabled || !shift} onClick={()=>run('claim_set',{order_id:order.id,set_id:item.id,quantity:1})}>{L.setPart(1,item.quantity)}</button>}
  </div>}
  {expanded && <div className="set-components">{children.map(child=><ItemRow key={child.id} {...props} item={child}/>)}</div>}
 </section>
}
function ItemRow({item,order,has,employee,shift,disabled,selection,setSelection,run}) {
 const [custom,setCustom]=useState(false),[quantity,setQuantity]=useState(''),[release,setRelease]=useState(null)
 const work=has('orders.work') && order.status!=='NEW' && item.available>0
 const claim=q=>run('claim',{order_id:order.id,items:[{item_id:item.id,quantity:q}]})
 const button=(label,action,args)=><button disabled={disabled || !shift} onClick={()=>run(action,args)}>{label}</button>
 return <section className="compact-item"><div className="compact-title">
  {has('orders.work') && <input type="checkbox" aria-label={L.select(item.name)} checked={Number(selection[item.id])>0} disabled={disabled || !shift || !work} onChange={e=>setSelection(old=>({...old,[item.id]:e.target.checked?item.available:0}))}/>}
  <strong>{item.name}</strong><span>{item.quantity} {L.units}</span></div>
  <p className="compact-counters">{L.left}: <strong>{item.available}</strong> · {L.issued}: {item.issued}/{item.quantity}</p>
  {work && <div className="compact-actions"><button className="start-item" disabled={disabled || !shift} onClick={()=>claim(item.available)}>{L.start}</button>
   {item.available>1 && <><span>{L.part}</span>{[1,2,5].filter(n=>n<item.available).map(n=><button key={n} disabled={disabled || !shift} onClick={()=>claim(n)}>{n}</button>)}<button disabled={disabled || !shift} onClick={()=>claim(item.available)}>{L.allQuantity}</button>{item.available>5 && <button disabled={disabled || !shift} onClick={()=>setCustom(!custom)}>{L.other}</button>}</>}
  </div>}
  {custom && work && <form onSubmit={async e=>{e.preventDefault();if(Number.isInteger(Number(quantity)) && Number(quantity)>0 && Number(quantity)<=item.available && await claim(Number(quantity)))setCustom(false)}}><label>{L.quantity(item.name)}<input type="number" min="1" max={item.available} step="1" required value={quantity} disabled={disabled} onChange={e=>setQuantity(e.target.value)}/></label><button disabled={disabled || !shift}>{L.take}</button></form>}
  {item.assignments.filter(w=>!w.released_at && w.cuttings.filter(c=>c.issued_at).reduce((n,c)=>n+c.quantity,0)<w.quantity).map(w=><div className="compact-work" key={w.id}>
   <strong>{w.employee_name} ×{w.quantity}</strong><p>{w.ready_for_cutting_at?L.readyCut:L.active}</p>
   {String(w.employee_id)===String(employee.id) && !w.ready_for_cutting_at && has('orders.work') && <>
    {button(L.ready,'ready',{assignment_id:w.id})}
    {release===w.id ? <><button disabled={disabled || !shift} onClick={async()=>{if(await run('release',{assignment_id:w.id}))setRelease(null)}}>{L.confirmRelease}</button><button onClick={()=>setRelease(null)}>{L.keep}</button></> : <button disabled={disabled || !shift} onClick={()=>setRelease(w.id)}>{L.release}</button>}
   </>}
   {has('orders.cut') && w.ready_for_cutting_at && w.cutting_available>0 && button(L.cut(w.cutting_available),'start_cutting',{assignment_id:w.id,quantity:w.cutting_available})}
   {w.cuttings.filter(c=>!c.issued_at).map(c=><div key={c.id}><p>{L.cutting}: {c.employee_name} ×{c.quantity}</p>{String(c.employee_id)===String(employee.id) && <>{!c.completed_at && has('orders.cut') && button(L.cutDone,'complete_cutting',{cutting_id:c.id})}{c.completed_at && has('orders.issue') && button(L.issue,'issue',{cutting_id:c.id})}</>}</div>)}
  </div>)}
 </section>
}
