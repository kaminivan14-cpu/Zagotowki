import { useState } from "react";
import { tr } from "../../i18n/runtime";
import TasksButton from "./ui/TasksButton";
import TasksIcon from "./ui/TasksIcon";
import TasksProgressBar from "./ui/TasksProgressBar";
import PersonAvatar from "../employees/PersonAvatar";
import { StatusBadge, PriorityBadge } from "./TaskBadges";
import QuickCreateInput from "./QuickCreateInput";
import { instantLabel } from "../dateTime";
// Direct subtasks of an open task (РБ-004, РБ-010): completed children hidden by default with a
// toggle; progress always counts them. Quick create needs only a title.
export default function SubtasksSection({ task, items: children = [], hidden = 0, progress, canCreate, run, busy, onOpen, zone }) {
  const [showCompleted, setShowCompleted] = useState(false),
    [adding, setAdding] = useState(false);
  const completed = children.filter((c) => ["completed", "cancelled"].includes(c.status));
  const shown = showCompleted ? children : children.filter((c) => !["completed", "cancelled"].includes(c.status));
  const finished = ["completed", "cancelled"].includes(task.status) || task.deleted_at;
  return (
    <div className="task-subtasks">
      <div className="task-subtasks-head">
        <TasksProgressBar progress={progress} label={tr("Прогрес підзавдань")} />
        {completed.length > 0 && (
          <TasksButton size="sm" variant="link" onClick={() => setShowCompleted(!showCompleted)} aria-pressed={showCompleted}>
            {showCompleted ? tr("Сховати завершені ({n})", { n: completed.length }) : tr("Показати завершені ({n})", { n: completed.length })}
          </TasksButton>
        )}
      </div>
      {!shown.length && !adding && (
        <p className="tk-muted">{children.length ? tr("Усі підзавдання завершено.") : tr("Підзавдань поки немає.")}</p>
      )}
      <ul className="task-subtask-list">
        {shown.map((c) => (
          <li key={c.id} className={`task-subtask ${["completed", "cancelled"].includes(c.status) ? "is-done" : ""}`.trim()}>
            <TasksIcon name="subtask" size={16} className="tk-muted" />
            <button type="button" className="task-subtask-title" onClick={() => onOpen(c)}>
              <span className="task-tree-id">#{c.id}</span>
              <span className="tk-truncate">{c.title}</span>
            </button>
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            {c.assignee && (
              <span className="tk-person">
                <PersonAvatar person={c.assignee} size={24} />
                <span>{c.assignee.name}</span>
              </span>
            )}
            <span className="task-subtask-progress">
              <TasksProgressBar progress={c.progress} compact />
            </span>
            <small className="tk-muted task-subtask-deadline">{c.deadline_at ? instantLabel(c.deadline_at, zone) : ""}</small>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="tk-muted">{tr("Ще {n} підзавдань недоступні для перегляду.", { n: hidden })}</p>}
      {canCreate && !finished && (
        adding ? (
          <QuickCreateInput parentId={task.id} run={run} busy={busy} onCreated={() => setAdding(false)} onCancel={() => setAdding(false)} />
        ) : (
          <TasksButton size="sm" variant="link" icon="plus" disabled={busy} onClick={() => setAdding(true)}>
            {tr("Додати підзавдання")}
          </TasksButton>
        )
      )}
    </div>
  );
}
