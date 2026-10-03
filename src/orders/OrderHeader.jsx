import { labels as L } from './labels'
import { operationalChips, preparationTime } from './board'
const time = value => new Date(value).toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})
export default function OrderHeader({order, urgency, now}) {
 const elapsed = preparationTime(order, now)
 return <>
  <div className="order-heading"><h2>{order.display_number}</h2>{order.ready_at && <span className={`deadline-badge ${urgency?.level || ''}`}>{L.readyAt(time(order.ready_at))}</span>}</div>
  <div className="operational-chips" aria-label={L.operationalStatus}>{[...new Set(operationalChips(order).map(key=>key.startsWith('lifecycle:')?L.lifecycle[key.slice(10)]:L.stages[key]||L[key]).filter(Boolean))].map(label=><span className="order-status" key={label}>{label}</span>)}</div>
  {urgency && urgency.level!=='normal' && <p className={`deadline-badge ${urgency.level}`}>{urgency.level==='overdue'?L.overdue(urgency.minutes):L[urgency.level]}</p>}
  {elapsed !== null && <p className="order-prep">{L.actualPrep(elapsed)}</p>}
  {order.estimated_prep_minutes != null && <p className="order-prep estimated">{L.prep(order.estimated_prep_minutes)}</p>}
 </>
}
