export const operationKey = employee => `tasks-pending:${employee}`
export function prepareOperation(storage, employee, action, args) {
 const key = operationKey(employee), signature = JSON.stringify({ action, args })
 const stored = storage.getItem(key)
 if (stored) {
  const old = JSON.parse(stored)
  if (old.signature !== signature) throw new Error('PENDING_OPERATION')
  return old
 }
 const op = { id: crypto.randomUUID(), action, args, signature }
 storage.setItem(key, JSON.stringify(op)); return op
}
