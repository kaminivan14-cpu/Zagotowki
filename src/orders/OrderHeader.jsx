import OrderStatusBadge from './OrderStatusBadge'
import { Menu } from '../ui/ModuleHeader'
import { useLocale } from '../i18n/useLocale'
import { deleteLabels } from './delete'
import { labels as L } from './labels'
import { operationalChips, preparationTime } from './board'
const time = value => new Date(value).toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})
export default function OrderHeader({order, urgency, now, onDelete, disabled}) {
 const locale=useLocale()
 const elapsed = preparationTime(order, now)
 return <>
  <div className="order-heading"><h2>{order.display_number}</h2>{onDelete && <Menu label="…" disabled={disabled} items={[{label:deleteLabels[locale].single,action:()=>onDelete(order),danger:true}]}/>}{order.ready_at && <span className={`deadline-badge ${urgency?.level || ''}`}>{L.readyAt(time(order.ready_at))}</span>}</div>
  {order.integration_sbid && <p>{order.integration_sbid}</p>}
  {order.comment && <p className="order-external-comment">{order.comment}</p>}
  <div className="operational-chips" aria-label={L.operationalStatus}>{operationalChips(order).map(status=><OrderStatusBadge key={status} status={status}/>)}</div>
  {urgency && urgency.level!=='normal' && <p className={`deadline-badge ${urgency.level}`}>{urgency.level==='overdue'?L.overdue(urgency.minutes):L[urgency.level]}</p>}
  {elapsed !== null && <p className="order-prep">{L.actualPrep(elapsed)}</p>}
  {order.estimated_prep_minutes != null && <p className="order-prep estimated">{L.prep(order.estimated_prep_minutes)}</p>}
 </>
}
