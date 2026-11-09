import { useState } from "react";

export default function TaskActions({ task, context, run, busy, onCompleted }) {
  const [confirm, setConfirm] = useState(false);

  if (
    task.assigned_to_employee_id !== context.employee_id ||
    !["planned", "unplanned", "paused", "in_progress"].includes(task.status)
  )
    return null;

  return (
    <div className="task-manual-actions">
      <div className="task-actions">
        {task.status === "in_progress" ? (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (
                await run("complete", {
                  task_id: task.id,
                  version: task.version,
                })
              )
                onCompleted?.();
            }}
          >
            Зроблено
          </button>
        ) : (
          <>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await run("start_task", {
                    task_id: task.id,
                    version: task.version,
                  })
                )
                  onCompleted?.();
              }}
            >
              Розпочати завдання
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Позначити виконаним
            </button>
          </>
        )}
      </div>

      {confirm && (
        <form
          className="task-confirm-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run("mark_completed", {
                task_id: task.id,
                version: task.version,
                confirmed: true,
              })
            ) {
              setConfirm(false);
              onCompleted?.();
            }
          }}
        >
          <p className="task-confirm-text">
            Завершити задачу без запуску таймера? Додатковий час не буде
            записано. Чек-лист і залежності мають бути виконані.
          </p>
          <label className="task-checkbox-row">
            <input type="checkbox" required disabled={busy} />
            <span>Підтверджую, що завдання виконано</span>
          </label>
          <div className="task-actions">
            <button type="submit" disabled={busy} className="primary">
              Підтвердити виконання
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Скасувати
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
