export function itemDetails(value) {
  const readyTime = value.ready_time || null
  if (readyTime && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(readyTime)) {
    throw new Error('Wpisz poprawną godzinę Gotowe na (HH:MM).')
  }
  return { note: value.note?.trim() || null, ready_time: readyTime }
}

export function hasProductionHistory(item) {
  return Boolean(item.started_at || item.completed_at || item.gotowe || item.employee_id != null)
}

export function canDeletePlan(employee, plan) {
  return Boolean(plan && ['administrator', 'manager', 'su-chef'].includes(employee?.role) &&
    (employee.role === 'administrator' || (employee.location_id != null &&
      String(employee.location_id) === String(plan.location_id))))
}
