import {
  categoryName,
  duration,
  priorities,
  planningLabels as L,
} from "../labels.uk";
import { timeLabel } from "../dateTime";
import { rootCategory } from "../planningView";
import TasksButton from "./ui/TasksButton";
import TasksBadge from "./ui/TasksBadge";
import { StatusBadge } from "./TaskBadges";
// Priority pill tones follow the Tasks design system (same palette as list and workspace badges).
const priorityTone = { critical: "red", high: "amber", medium: "blue", low: "gray" };
export default function PlanningTaskRow({
  task,
  context,
  onDetails,
  unplanned = false,
}) {
  const root = rootCategory(
    task.category_id,
    context.category_history || context.categories,
  );
  const roots = context.categories.filter((c) => c.parent_id == null);
  const tone = root ? roots.findIndex((c) => c.id === root.id) % 3 : "other";
  return (
    <article className={`planning-task priority-${task.priority}`}>
      <span className="planning-marker" aria-hidden="true" />
      <div className="planning-task-copy">
        <button className="planning-title" onClick={() => onDetails(task)}>
          {task.title}
        </button>
        <div className="planning-task-meta">
          {task.planned_start_at && (
            <time dateTime={task.planned_start_at}>
              {timeLabel(
                task.planned_start_at,
                context.settings.company_timezone,
              )}
            </time>
          )}
          <span>
            {task.estimated_minutes == null
              ? L.unknown
              : `~${duration(task.estimated_minutes)}`}
          </span>
          <span className={`planning-category category-${tone}`}>
            {categoryName(
              task.category_id,
              context.category_history || context.categories,
            )}
          </span>
          {!["planned", "unplanned"].includes(task.status) && (
            <StatusBadge status={task.status} />
          )}
        </div>
      </div>
      <TasksBadge
        tone={priorityTone[task.priority] || "neutral"}
        className={`planning-priority-badge priority-${task.priority}`}
      >
        {priorities[task.priority]}
      </TasksBadge>
      {unplanned && (
        <TasksButton type="submit" onClick={() => onDetails(task)}>
          Запланувати
        </TasksButton>
      )}
    </article>
  );
}
