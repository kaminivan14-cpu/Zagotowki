export const managementRoles = ['administrator', 'manager', 'su-chef']

// Dzień produkcji według czasu lokalu, również gdy przeglądarka jest w innej strefie.
export function productionDate(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type) => parts.find((value) => value.type === type).value
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

export function employeeCanViewPlan(employee, plan) {
  return employee?.location_id != null &&
    String(employee.location_id) === String(plan.location_id) &&
    plan.status === 'active' && plan.plan_date >= productionDate() &&
    plan.plan_date <= productionDate(7)
}

export function canWorkOnPlan(employee, plan) {
  if (!plan || plan.status !== 'active' || plan.plan_date !== productionDate()) return false
  if (employee?.role === 'employee') {
    return employeeCanViewPlan(employee, plan) && plan.plan_date === productionDate()
  }
  return managementRoles.includes(employee?.role)
}
