export const priorities = { low: 'Низький', medium: 'Середній', high: 'Високий', critical: 'Критичний' }
export const urgencies = { normal: 'Звичайна', critical_today: 'Критично сьогодні', critical_now: 'Негайно — перервати роботу' }
export const statuses = { draft: 'Чернетка', pending_approval: 'Очікує погодження', unplanned: 'Не заплановано', planned: 'Заплановано', in_progress: 'У роботі', paused: 'Призупинено', completed: 'Виконано', cancelled: 'Скасовано', blocked: 'Заблоковано' }
export const scheduleTypes = { work: 'Робоча зміна', day_off: 'Вихідний', vacation: 'Відпустка', meeting: 'Зустріч', absence: 'Відсутність' }
export const events = { TASK_CREATED: 'Створено', TASK_UPDATED: 'Змінено', TASK_ASSIGNED: 'Призначено', TASK_PLANNED: 'Заплановано', TASK_STARTED: 'Розпочато', TASK_PAUSED: 'Призупинено', TASK_RESUMED: 'Відновлено', TASK_COMPLETED: 'Виконано', TASK_POSTPONED: 'Перенесено', TASK_RESCHEDULE_REQUESTED: 'Запит перенесення', TASK_RESCHEDULE_APPROVED: 'Перенесення погоджено', TASK_RESCHEDULE_REJECTED: 'Перенесення відхилено', TASK_AUTO_RESCHEDULED: 'Автоматично перенесено', TASK_CANCELLED: 'Скасовано', COMMENT_ADDED: 'Коментар', TASK_CRITICAL_DECLINED: 'Неможливо почати зараз', TASK_APPROVAL_REQUESTED: 'Запит погодження', TASK_APPROVAL_APPROVED: 'Погоджено', TASK_APPROVAL_REJECTED: 'Відхилено' }
export const duration = value => value == null ? 'Час не оцінено' : Number(value) >= 60 ? `${(Number(value)/60).toLocaleString('uk-UA',{maximumFractionDigits:1})} год` : `${Math.round(Number(value))} хв`
export function categoryName(id, categories) {
 const byId = new Map(categories.map(c => [String(c.id), c])), names = [], seen = new Set()
 let c = byId.get(String(id))
 while (c && !seen.has(c.id)) { seen.add(c.id); names.unshift(c.name); c = byId.get(String(c.parent_id)) }
 return names.join(' · ') || 'Без категорії'
}
