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
  if (message.includes('UNFINISHED_WORK')) return 'Najpierw zakończ lub zwolnij rozpoczętą pracę.'
  if (message.includes('NO_ACTIVE_SHIFT')) return 'Rozpocznij zmianę w tym lokalu.'
  if (message.includes('PENDING_OPERATION')) return 'Najpierw rozstrzygnij poprzednią operację przyciskiem Ponów.'
  if (message.includes('OPERATION_CONFLICT')) return 'Ta operacja została już użyta z innymi danymi. Odśwież widok.'
  if (message.includes('ORDERS_DENIED') || error?.code === '42501') return 'Brak aktualnych uprawnień. Sprawdź konto i lokal.'
  return 'Nie udało się potwierdzić operacji. Sprawdź połączenie i ponów tę samą operację.'
}
export const formatTime = value => value ? new Date(value).toLocaleString('pl-PL') : '—'
export const money = minor => `${(Number(minor) / 100).toFixed(2)} zł`
export const stage = assignment => assignment.ready_for_cutting_at ? 'DO KROJENIA' : 'W TRAKCIE'
