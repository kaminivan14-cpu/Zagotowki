export const operational = item => !['set','drink'].includes(item.item_type)
export function visibleItems(order) {
  const leaves = order.items.filter(i => operational(i))
  return order.items.filter(i => i.item_type !== 'drink' && (i.item_type !== 'set' || leaves.some(c => c.parent_item_id === i.id)))
}
export function deadline(readyAt, now = Date.now()) {
  if (!readyAt || !Number.isFinite(Date.parse(readyAt))) return null
  const delta = Date.parse(readyAt) - now
  return { level: delta < 0 ? 'overdue' : delta <= 600000 ? 'urgent' : delta <= 1800000 ? 'warning' : 'normal', minutes: delta < 0 ? Math.floor(-delta / 60000) : Math.ceil(delta / 60000) }
}
export function lifecycle(order) {
  if (order.lifecycle) return order.lifecycle
  const items = order.items.filter(operational)
  if (order.status === 'NEW') return 'new'
  if (items.length && items.every(i => i.issued === i.quantity)) return 'done'
  if (items.every(i => i.available === i.quantity)) return 'new'
  return items.some(i => i.available > 0) ? 'partial' : 'in_progress'
}
export function setAvailable(parent, items) {
  const children = items.filter(i => i.parent_item_id === parent.id && operational(i))
  if (!children.length) return 0
  return Math.min(...children.map(i => Math.floor(i.available / (i.quantity / parent.quantity))))
}
export function selectedItems(order, selection) {
  return order.items.filter(operational).flatMap(i => {
    const quantity = Number(selection[i.id])
    return Number.isInteger(quantity) && quantity > 0 && quantity <= i.available ? [{item_id:i.id,quantity}] : []
  })
}
// Projection of existing assignment/cutting timestamps, not new mutable states.
export function operationalChips(order) {
  const keys = new Set([order.status, `lifecycle:${lifecycle(order)}`])
  if (order.status === 'NEW' || lifecycle(order) === 'done') return [...keys]
  for (const item of order.items.filter(operational)) {
    if (item.available > 0) keys.add('TO_DO')
    for (const work of item.assignments) {
      if (work.released_at) continue
      if (!work.ready_for_cutting_at) keys.add('IN_PROGRESS')
      else if (work.cutting_available > 0) keys.add('READY_FOR_CUTTING')
      for (const cut of work.cuttings) {
        if (cut.issued_at) continue
        keys.add(cut.completed_at ? 'ready_to_issue' : 'CUTTING')
      }
    }
  }
  return [...keys]
}

export const orderDeadline = (order, now) => lifecycle(order)==='done' ? null : deadline(order.ready_at, now)

// One projection for both boards. Missing deadlines follow dated orders.
export const urgencyLevel = (order, now) => orderDeadline(order, now)?.level || 'normal'
export function sortedOrders(orders, now, filter = 'all') {
  const ranks = {overdue:0, urgent:1, warning:2, normal:3}
  const stamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity
  return orders.filter(o => filter === 'all' || urgencyLevel(o, now) === filter).sort((a,b) =>
    ranks[urgencyLevel(a,now)] - ranks[urgencyLevel(b,now)] ||
    stamp(a.ready_at) - stamp(b.ready_at) ||
    stamp(a.received_at || a.sent_to_kitchen_at) - stamp(b.received_at || b.sent_to_kitchen_at) || String(a.id).localeCompare(String(b.id), undefined, {numeric:true}))
}
export function preparationTime(order, now) {
  const start = Date.parse(order.sent_to_kitchen_at)
  if (!Number.isFinite(start)) return null
  const minutes = Math.max(0, Math.floor((now-start)/60000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')} min`
  return `${Math.floor(minutes/1440)} d ${Math.floor(minutes%1440/60)} h`
}
