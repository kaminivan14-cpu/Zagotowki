import { priorities, statuses, duration, categoryName } from '../labels.uk'
import { instantLabel } from '../dateTime'
export default function TaskCard({ task, context, children, onDetails }) {
 return <article className="task-card"><h3>{onDetails ? <button className="task-title" onClick={() => onDetails(task)}>{task.title}</button> : task.title}</h3>
 <p>{categoryName(task.category_id, (context.category_history||context.categories))} · {priorities[task.priority]} · {duration(task.estimated_minutes)}</p><p>{statuses[task.status]}{task.planned_start_at && ` · ${instantLabel(task.planned_start_at, context.settings.company_timezone)}`}</p>
 {task.deadline_at && <p>Дедлайн: {instantLabel(task.deadline_at, context.settings.company_timezone)}</p>}{children}</article>
}
