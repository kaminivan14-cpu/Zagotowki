import { duration, categoryName } from "../labels.uk";
import { instantLabel } from "../dateTime";
import { StatusBadge, PriorityBadge } from "./TaskBadges";
import TasksIcon from "./ui/TasksIcon";
// Compact task row for planning/month views: title link, then one metadata line built from the shared Tasks
// badges (status, priority) and plain facts (category, estimate, start, deadline). `children` adds view extras.
export default function TaskCard({ task, context, children, onDetails }) {
  const zone = context.settings.company_timezone;
  return (
    <article className="task-card tk-task-card">
      <div className="tk-task-card-main">
        <h3>
          {onDetails ? (
            <button className="task-title" onClick={() => onDetails(task)}>
              {task.title}
            </button>
          ) : (
            task.title
          )}
        </h3>
        <div className="tk-task-card-meta">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <span>{categoryName(task.category_id, context.category_history || context.categories)}</span>
          <span>{duration(task.estimated_minutes)}</span>
          {task.planned_start_at && (
            <span>
              <TasksIcon name="clock" size={13} />
              {instantLabel(task.planned_start_at, zone)}
            </span>
          )}
          {task.deadline_at && (
            <span>
              Дедлайн: {instantLabel(task.deadline_at, zone)}
            </span>
          )}
        </div>
      </div>
      {children && <div className="tk-task-card-extra">{children}</div>}
    </article>
  );
}
/* TODO: Previous plain-text layout (kept for reference):
   <article className="task-card"><h3>title</h3><p>category · priority · duration</p>
   <p>status · planned start</p><p>Дедлайн: …</p>{children}</article> */
