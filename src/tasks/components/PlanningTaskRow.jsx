import {categoryName,duration,priorities,statuses,planningLabels as L} from '../labels.uk'
import {timeLabel} from '../dateTime'
import {rootCategory} from '../planningView'
export default function PlanningTaskRow({task,context,onDetails,unplanned=false}) {
 const root=rootCategory(task.category_id,(context.category_history||context.categories))
 const roots=context.categories.filter(c=>c.parent_id==null)
 const tone=root?roots.findIndex(c=>c.id===root.id)%3:'other'
 return <article className={`planning-task priority-${task.priority}`}>
  <span className="planning-marker" aria-hidden="true"/>
  <div className="planning-task-copy"><button className="planning-title" onClick={()=>onDetails(task)}>{task.title}</button>
   <div className="planning-task-meta">
    {task.planned_start_at && <time dateTime={task.planned_start_at}>{timeLabel(task.planned_start_at,context.settings.company_timezone)}</time>}
    <span>{task.estimated_minutes==null?L.unknown:`~${duration(task.estimated_minutes)}`}</span>
    <span className={`planning-category category-${tone}`}>{categoryName(task.category_id,(context.category_history||context.categories))}</span>
    {!['planned','unplanned'].includes(task.status) && <span className="planning-status">{statuses[task.status]}</span>}
   </div>
  </div>
  <span className={`planning-priority priority-${task.priority}`}>{priorities[task.priority]}</span>
  {unplanned && <button onClick={()=>onDetails(task)}>Запланувати</button>}
 </article>
}
