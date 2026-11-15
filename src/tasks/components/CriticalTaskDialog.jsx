import { useState } from "react";
import TasksDialog from "./ui/TasksDialog";
import { duration } from "../labels.uk";
import TasksButton from "./ui/TasksButton";
export default function CriticalTaskDialog({ task, run, busy }) {
  const [reason, setReason] = useState(false);
  return (
    <TasksDialog
      title="Критичне завдання"
      onClose={() => setReason(true)}
      busy={busy}
    >
      <div className="critical-task-content">
        <h3>{task.title}</h3>
        <p className="critical-task-duration">
          {duration(task.estimated_minutes)}
        </p>
        <div className="critical-task-actions">
          <TasksButton
            type="submit"
            variant="primary"
            className="primary"
            disabled={busy}
            onClick={() =>
              run("critical_start", { task_id: task.id, version: task.version })
            }
          >
            Почати
          </TasksButton>
          <TasksButton
            type="button"
            disabled={busy}
            onClick={() => setReason(true)}
          >
            Не можу зараз
          </TasksButton>
        </div>
        {reason && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("critical_decline", {
                task_id: task.id,
                version: task.version,
                reason: new FormData(e.currentTarget).get("reason"),
              });
            }}
          >
            <label>
              Вкажіть причину
              <input name="reason" required maxLength={2000} autoFocus />
            </label>
            <TasksButton
              type="submit"
              variant="primary"
              className="primary"
              disabled={busy}
            >
              Зберегти причину
            </TasksButton>
          </form>
        )}
      </div>
    </TasksDialog>
  );
}
