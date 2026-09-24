export const roles = ['employee', 'su-chef', 'manager', 'administrator']
export function validEmployee(e, userId) {
  return Boolean(e && e.auth_user_id === userId && e.active === true && roles.includes(e.role) && (e.role === 'administrator' || e.location_id != null))
}
export function employeeContext(e) {
  return JSON.stringify([e.auth_user_id, e.id, e.role, e.location_id, e.active])
}
export function canManageEmployee(actor, target) {
  if (!actor?.active || String(actor.id) === String(target?.id)) return false
  return actor.role === 'administrator' || (actor.role === 'manager' && actor.location_id != null &&
    String(actor.location_id) === String(target?.location_id) && ['employee', 'su-chef'].includes(target?.role))
}
