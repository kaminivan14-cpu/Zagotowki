import { operational } from './board.js'
// Work mode changes presentation, never grants capabilities or changes role.
export const canUseProductionMode = capabilities => ['orders.work', 'orders.cut', 'orders.issue'].some(c => capabilities.includes(c))
export function productionTasks(orders, employeeId, capabilities) {
  const has = capability => capabilities.includes(capability)
  const mine = [], available = []
  for (const order of orders) {
    if (['NEW', 'COMPLETED'].includes(order.status)) continue
    for (const item of order.items.filter(operational)) {
      const base = { orderId: order.id, orderNumber: order.display_number, name: item.name, itemId: item.id, parentId: item.parent_item_id || null }
      if (has('orders.work') && item.available > 0) available.push({ ...base, key: `item:${item.id}`, quantity: item.available, status: 'Do zrobienia', action: 'claim', args: { order_id: order.id, items: [{ item_id: item.id, quantity: item.available }] } })
      for (const assignment of item.assignments) {
        if (assignment.released_at) continue
        if (has('orders.work') && String(assignment.employee_id) === String(employeeId) && !assignment.ready_for_cutting_at) mine.push({ ...base, key: `work:${assignment.id}`, quantity: assignment.quantity, status: 'W trakcie', action: 'ready', args: { assignment_id: assignment.id }, release: { assignment_id: assignment.id } })
        if (has('orders.cut') && assignment.ready_for_cutting_at && assignment.cutting_available > 0) available.push({ ...base, key: `cut:${assignment.id}`, quantity: assignment.cutting_available, status: 'Do krojenia', action: 'start_cutting', args: { assignment_id: assignment.id, quantity: assignment.cutting_available } })
        for (const cutting of assignment.cuttings) {
          if (String(cutting.employee_id) !== String(employeeId) || cutting.issued_at) continue
          if (!cutting.completed_at && has('orders.cut')) mine.push({ ...base, key: `cutting:${cutting.id}`, quantity: cutting.quantity, status: 'Krojenie', action: 'complete_cutting', args: { cutting_id: cutting.id } })
          if (cutting.completed_at && has('orders.issue')) mine.push({ ...base, key: `issue:${cutting.id}`, quantity: cutting.quantity, status: 'Do wydania', action: 'issue', args: { cutting_id: cutting.id } })
        }
      }
    }
  }
  return { mine, available }
}
export function quantityArgs(task, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > task.quantity) return null
  if (task.action === 'claim') return { ...task.args, items: task.args.items.map(i => ({ ...i, quantity })) }
  if (task.action === 'start_cutting') return { ...task.args, quantity }
  return null
}
