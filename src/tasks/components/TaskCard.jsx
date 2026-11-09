import { priorities, statuses, duration, categoryName } from "../labels.uk";
import { instantLabel } from "../dateTime";

export default function TaskCard({ task, context, children, onDetails }) {
  const zone = context.settings.company_timezone;

  return (
    <article className="task-card">
      <h3 className="task-card-header">
        {onDetails ? (
          <button
            type="button"
            className="task-title"
            onClick={() => onDetails(task)}
          >
            {task.title}
          </button>
        ) : (
          task.title
        )}
      </h3>

      <div className="task-card-meta">
        <span className="task-card-category">
          {categoryName(
            task.category_id,
            context.category_history || context.categories,
          )}
        </span>
        <span className="task-card-separator">·</span>
        <span className={`task-list-priority priority-${task.priority}`}>
          {priorities[task.priority]}
        </span>
        <span className="task-card-separator">·</span>
        <span className="task-card-duration">
          {duration(task.estimated_minutes)}
        </span>
      </div>

      <div className="task-card-status-row">
        <span
          className={`task-list-badge state-${task.overdue ? "overdue" : task.status}`}
        >
          {statuses[task.status] || task.status}
        </span>
        {task.planned_start_at && (
          <span className="task-card-time">
            · {instantLabel(task.planned_start_at, zone)}
          </span>
        )}
      </div>

      {task.deadline_at && (
        <p className="task-card-deadline">
          Дедлайн: <strong>{instantLabel(task.deadline_at, zone)}</strong>
        </p>
      )}

      {children && <div className="task-card-children">{children}</div>}
    </article>
  );
}
