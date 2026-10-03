import test from 'node:test'
import assert from 'node:assert/strict'
import { canUseProductionMode, productionTasks, quantityArgs } from '../src/orders/production.js'
function board() {
  return [{ id: 1, display_number: 'UAT-1', status: 'IN_PROGRESS', items: [{ id: 11, name: 'Salmon', available: 7, quantity: 12, assignments: [
    { id: 21, employee_id: 4, quantity: 2, cuttings: [] },
    { id: 22, employee_id: 5, quantity: 3, ready_for_cutting_at: 'now', cutting_available: 1, cuttings: [
      { id: 31, employee_id: 3, quantity: 1 },
      { id: 32, employee_id: 3, quantity: 1, completed_at: 'now' },
      { id: 33, employee_id: 8, quantity: 1 },
      { id: 34, employee_id: 3, quantity: 1, completed_at: 'now', issued_at: 'now' },
    ] },
    { id: 23, employee_id: 4, quantity: 5, released_at: 'now', cuttings: [] },
  ] }] }]
}
test('mode follows capabilities instead of role; monitoring alone cannot enter', () => {
  assert.equal(canUseProductionMode(['orders.access', 'orders.dispatch']), false)
  for (const cap of ['orders.work','orders.cut','orders.issue']) assert.equal(canUseProductionMode([cap]), true)
})
test('sushi master sees own unfinished work and available quantities, never other workers actions', () => {
  const orders = board(), copy = structuredClone(orders)
  const { mine, available } = productionTasks(orders, '4', ['orders.work'])
  assert.deepEqual(mine.map(t => t.key), ['work:21'])
  assert.deepEqual(mine[0].release, { assignment_id: 21 })
  assert.deepEqual(available.map(t => t.action), ['claim'])
  assert.equal(available[0].quantity, 7)
  assert.deepEqual(orders, copy)
})
test('su chef sees available cutting and own cutting/issue work without maker permissions', () => {
  const { mine, available } = productionTasks(board(), 3, ['orders.cut', 'orders.issue'])
  assert.deepEqual(mine.map(t => t.action), ['complete_cutting', 'issue'])
  assert.ok(mine.every(t => !t.release))
  assert.deepEqual(available.map(t => t.action), ['start_cutting'])
  assert.equal(available[0].quantity, 1)
})
test('new and completed orders, released work, issued portions and zero availability are excluded', () => {
  const orders = board()
  orders[0].items[0].available = 0
  assert.equal(productionTasks(orders, 4, ['orders.work']).available.length, 0)
  for (const status of ['NEW', 'COMPLETED']) {
    orders[0].status = status
    assert.deepEqual(productionTasks(orders, 4, ['orders.work','orders.cut','orders.issue']), { mine: [], available: [] })
  }
})
test('split sends only the selected item with a bounded integer; same rule for cutting', () => {
  const task = productionTasks(board(), 4, ['orders.work']).available[0]
  assert.deepEqual(quantityArgs(task, 5), { order_id: 1, items: [{ item_id: 11, quantity: 5 }] })
  for (const q of [0,-1,8,1.5,NaN,Infinity,'2']) assert.equal(quantityArgs(task, q), null)
  assert.equal(task.args.items[0].quantity, 7)
  const cutting = productionTasks(board(), 3, ['orders.cut']).available[0]
  assert.deepEqual(quantityArgs(cutting, 1), { assignment_id: 22, quantity: 1 })
  assert.equal(quantityArgs(cutting, 2), null)
})
test('revoked capabilities leave no task actions even for the owner', () => {
  assert.deepEqual(productionTasks(board(), 4, []), { mine: [], available: [] })
  assert.deepEqual(productionTasks(board(), 3, ['orders.issue']).mine.map(t => t.action), ['issue'])
})
test('operational mode excludes set headers and drinks but keeps components and addons', () => {
  const orders = board()
  const leaf = orders[0].items[0]
  orders[0].items = [
    {...leaf,id:1,item_type:'set'},
    {...leaf,id:2,item_type:'drink'},
    {...leaf,id:3,item_type:'product',parent_item_id:1},
    {...leaf,id:4,item_type:'addon'},
  ]
  assert.deepEqual(productionTasks(orders,4,['orders.work']).available.map(t=>t.args.items[0].item_id),[3,4])
})
