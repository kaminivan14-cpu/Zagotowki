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
export const planningLabels = {
 title:'Планування тижня',subtitle:'Розподіліть задачі на поточний або наступний тиждень.',
 current:'Поточний тиждень',next:'Наступний тиждень',period:'Період',dates:'Дати',planned:'Заплановано',load:'Завантаження',
 infoCurrent:'З понеділка до четверга доступна корекція поточного тижня.',
 infoNext:day=>`Сьогодні ${day}, тому доступне планування наступного тижня.`,
 unavailable:'Планування наступного тижня доступне з п’ятниці до неділі.',
 add:'+ Додати задачу',parameters:'Параметри плану',quick:'Швидкі дії',summary:'Підсумок',
 copy:'Скопіювати план минулого тижня',copyUnavailable:'Копіювання плану поки недоступне.',
 saved:'Усі зміни збережено',saving:'Збереження…',unconfirmed:'Є непідтверджені зміни. Повторіть дію.',
 partial:'Підсумок за пріоритетами й категоріями охоплює лише завантажені задачі.',
 unknown:'Без оцінки',emptyDay:'Немає запланованих задач.',tasks:n=>`${n} ${{one:'задача',few:'задачі',many:'задач',other:'задачі'}[new Intl.PluralRules('uk-UA').select(n)]}`,
 near:'Близько до ліміту',overloaded:'Перевантаження',noCapacity:'Немає доступного часу',
 estimateHelp:'Навантаження — оцінка роботи, що залишилася; задачі без оцінки показані окремо.',
 noCreate:'Немає дозволу створювати задачі для цього співробітника.',
}
