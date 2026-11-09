import { useState } from "react";
import Dialog from "./Dialog";
import { duration } from "../labels.uk";

export default function CriticalTaskDialog({ task, run, busy }) {
  const [reason, setReason] = useState(false);

  return (
    <Dialog
      title="Критичне завдання"
      onClose={() => setReason(true)}
      busy={busy}
    >
      <div className="critical-task-content">
        <h3 className="critical-task-title">{task.title}</h3>
        <p className="critical-task-duration">
          {duration(task.estimated_minutes)}
        </p>

        {!reason && (
          <div className="critical-task-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run("critical_start", {
                  task_id: task.id,
                  version: task.version,
                })
              }
            >
              Почати
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReason(true)}
            >
              Не можу зараз
            </button>
          </div>
        )}

        {reason && (
          <form
            className="critical-reason-form"
            onSubmit={(e) => {
              e.preventDefault();
              run("critical_decline", {
                task_id: task.id,
                version: task.version,
                reason: new FormData(e.currentTarget).get("reason"),
              });
            }}
          >
            <label className="task-field-block">
              <span>Вкажіть причину</span>
              <input name="reason" required maxLength={2000} autoFocus />
            </label>
            <button className="primary" disabled={busy} type="submit">
              Зберегти причину
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
