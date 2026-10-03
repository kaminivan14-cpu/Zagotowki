import { supabase } from '../supabase'
import { operationKey, prepareOperation } from './operations'
export { operationKey } from './operations'
export async function read(name, args = {}) {
 const { data, error } = await supabase.rpc(name, args)
 if (error) throw error
 return data
}
export async function mutate(employee, action, args, storage = sessionStorage) {
 const op = prepareOperation(storage, employee, action, args)
 try {
  const data = await read('tasks_command', { p_action: op.action, p_args: op.args, p_operation: op.id })
  storage.removeItem(operationKey(employee)); return data
 } catch (error) {
  // PostgreSQL exceptions conclusively rolled back. Network errors retain the intent.
  if (/^(P0001|42501|23\d{3}|22\w{3})$/.test(error.code || '')) storage.removeItem(operationKey(employee))
  throw error
 }
}
export const errors = {
 ACTIVE_TASK_EXISTS: 'Спочатку завершіть або призупиніть поточне завдання.',
 DEPENDENCY_INCOMPLETE: 'Спочатку виконайте залежні попередні завдання.',
 COMPLETION_CONFIRMATION_REQUIRED: 'Підтвердьте, що завдання виконано.',
 TIMEZONE_IN_USE: 'Зміна часового поясу потребує окремого перенесення наявних планів.',
 TASKS_DENIED: 'Немає дозволу на цю дію або дані.', TASK_VERSION_CONFLICT: 'Завдання вже змінено. Оновіть дані та повторіть дію.',
 NO_APPROVER: 'Не призначено керівника для погодження. Зверніться до адміністратора.', NO_AVAILABILITY: 'На цей день немає робочої зміни або вільного часу.',
 SCHEDULE_CONFLICT: 'Обраний час перетинається із зайнятим інтервалом.', INVALID_PLAN_DATE: 'Оберіть дату в межах дозволеного горизонту планування.',
 DEADLINE_CONFLICT: 'Завдання не встигне до жорсткого дедлайну.', DEPENDENCY_PLAN_CONFLICT: 'Дата суперечить плану залежних завдань.',
 TASK_NOT_READY: 'Завдання ще не доступне: перевірте графік, оцінку часу та залежності.', CHECKLIST_INCOMPLETE: 'Спочатку виконайте всі пункти переліку.',
 PENDING_OPERATION: 'Попередня дія ще не підтверджена. Натисніть «Повторити дію».', OPERATION_CONFLICT: 'Конфлікт повторної операції. Оновіть сторінку.',
 REASON_REQUIRED: 'Вкажіть коротку причину.', TASK_STATE_CONFLICT: 'Ця дія недоступна в поточному стані завдання.', INVALID_LOCAL_TIME: 'Цей місцевий час неоднозначний або не існує через зміну годинника. Оберіть інший час.',
 APPROVAL_CONFLICT: 'Запит уже розглянуто або план змінився.', RECOMMENDATION_CONFLICT: 'Рекомендація застаріла. Оновіть розрахунок.',
 DEPENDENCY_CYCLE: 'Залежності не можуть утворювати коло.', SCHEDULE_VERSION_CONFLICT: 'Графік уже змінено. Оновіть дані.',
}
export const errorText = error => Object.entries(errors).find(([code]) => String(error?.message).includes(code))?.[1] || 'Не вдалося підтвердити дію. Перевірте з’єднання та повторіть спробу.'
