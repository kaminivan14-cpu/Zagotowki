// Only operation intent/UUID is stored, never credentials or response financial data.
export const operationKey = employeeId => `orders-pending:${employeeId}`
export function pendingOperation(storage, employeeId, action, args) {
  const key = operationKey(employeeId), signature = JSON.stringify({ action, args })
  let old
  try { old = JSON.parse(storage.getItem(key)) } catch { /* Treat malformed local data as absent. */ }
  if (old?.signature === signature && typeof old.id === 'string') return old
  if (old?.id) throw new Error('PENDING_OPERATION')
  const next = { id: crypto.randomUUID(), action, args, signature }
  storage.setItem(key, JSON.stringify(next)); return next
}
export function orderError(error) {
  const message = String(error?.message || '')
  if (message.includes('CLAIM_CONFLICT')) return 'Ta ilość została już przejęta przez innego pracownika.'
  if (message.includes('UNFINISHED_WORK')) return 'Najpierw zakończ lub oddaj rozpoczętą pracę.'
  if (message.includes('NO_ACTIVE_SHIFT')) return 'Rozpocznij zmianę w tym lokalu.'
  if (message.includes('PENDING_OPERATION')) return 'Najpierw rozstrzygnij poprzednią operację przyciskiem Ponów.'
  if (message.includes('OPERATION_CONFLICT')) return 'Ta operacja została już użyta z innymi danymi. Odśwież widok.'
  if (message.includes('ORDERS_DENIED') || error?.code === '42501') return 'Brak aktualnych uprawnień. Sprawdź konto i lokal.'
  return 'Nie udało się potwierdzić operacji. Sprawdź połączenie i ponów tę samą operację.'
}
export const formatTime = value => value ? new Date(value).toLocaleString('pl-PL') : '—'
// Decimal text conversion keeps grosz values exact (including bigint responses).
export function rateText(minor) {
  const value = String(minor)
  if (!/^\d+$/.test(value)) return ''
  const amount = BigInt(value)
  return `${amount / 100n},${String(amount % 100n).padStart(2, '0')}`
}
export const money = minor => rateText(minor) ? `${rateText(minor)} zł` : '—'
export function parseRate(value) {
  const match = /^(\d{1,7})(?:[,.](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const minor = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  return minor <= 100000000 ? minor : null
}
export const orderStatus = value => ({ NEW: 'Nowe', TO_DO: 'Do zrobienia', IN_PROGRESS: 'W trakcie', READY_FOR_CUTTING: 'Do krojenia', CUTTING: 'Krojenie', COMPLETED: 'Wydane' })[value] || value
export const stage = assignment => assignment.ready_for_cutting_at ? 'DO KROJENIA' : 'W TRAKCIE'
