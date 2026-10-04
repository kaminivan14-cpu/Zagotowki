export const roles = ['owner', 'director', 'expert', 'specialist', 'employee', 'crafter', 'sushi-master', 'shift-manager', 'su-chef', 'manager', 'administrator']
export function validEmployee(e, userId) {
  return Boolean(e && e.auth_user_id === userId && e.active === true && !e.archived_at && roles.includes(e.role) && (['owner','administrator','director','expert','specialist'].includes(e.role) || e.location_id != null))
}
export function employeeContext(e) {
  return JSON.stringify([e.auth_user_id, e.id, e.role, e.location_id, e.active])
}
export function canManageEmployee(actor, target) {
  if (!actor?.active || String(actor.id) === String(target?.id)) return false
  return ['owner','administrator'].includes(actor.role) || (actor.role === 'manager' && actor.location_id != null &&
    String(actor.location_id) === String(target?.location_id) && ['employee', 'crafter', 'sushi-master', 'shift-manager', 'su-chef'].includes(target?.role))
}

export const roleLabels = { owner: 'Власник', administrator: 'Адміністратор', director: 'Директор', manager: 'Менеджер', expert: 'Фахівець', specialist: 'Спеціаліст' }
