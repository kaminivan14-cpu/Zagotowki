import { tr } from "../../i18n/runtime";
import TasksBadge from "./ui/TasksBadge";
import TasksIcon from "./ui/TasksIcon";
import { priorities, statuses } from "../labels.uk";
// Task-specific pills built on the shared TasksBadge: status (with overdue override), priority, category.
const statusTone = {
  draft: "gray",
  pending_approval: "purple",
  unplanned: "neutral",
  planned: "blue",
  in_progress: "amber",
  paused: "amber",
  completed: "green",
  cancelled: "gray",
  blocked: "red",
};
export function StatusBadge({ status, overdue = false, deleted = false }) {
  if (deleted)
    return (
      <TasksBadge tone="gray" dot>
        {tr("Видалено")}
      </TasksBadge>
    );
  if (overdue && !["completed", "cancelled"].includes(status))
    return (
      <TasksBadge tone="red" dot>
        {tr("Прострочено")}
      </TasksBadge>
    );
  return (
    <TasksBadge tone={statusTone[status] || "neutral"} dot>
      {statuses[status] || status}
    </TasksBadge>
  );
}
const priorityIcon = { critical: "arrowUp", high: "arrowUp", medium: "minus", low: "arrowDown" };
export function PriorityBadge({ priority }) {
  return (
    <span className={`task-priority priority-${priority}`}>
      <TasksIcon name={priorityIcon[priority] || "minus"} size={14} />
      {priorities[priority] || priority}
    </span>
  );
}
const tones = ["neutral", "blue", "purple", "amber", "green", "pink", "teal"];
export function CategoryBadge({ category }) {
  if (!category) return <TasksBadge tone="gray">{tr("Без категорії")}</TasksBadge>;
  return <TasksBadge tone={tones[(Number(category.id) || 0) % tones.length]}>{category.name}</TasksBadge>;
}
