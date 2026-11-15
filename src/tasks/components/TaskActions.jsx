import { useState } from "react";
import TasksButton from "./ui/TasksButton";
// `blockedChildren` (number of unfinished direct subtasks) explains why completion will be refused (У-003).
export default function TaskActions({
  task,
  context,
  run,
  busy,
  onCompleted,
  blockedChildren = 0,
}) {
  const [confirm, setConfirm] = useState(false);
  if (
    task.assigned_to_employee_id !== context.employee_id ||
    !["planned", "unplanned", "paused", "in_progress"].includes(task.status)
  )
    return null;
  return (
    <div className="task-manual-actions">
      {blockedChildren > 0 && (
        <p className="task-actions-hint" role="note">
          Завершити завдання можна лише після виконання всіх безпосередніх
          підзавдань (незавершених: {blockedChildren}).
        </p>
      )}
      <div className="task-actions">
        {task.status === "in_progress" ? (
          <TasksButton
            type="submit"
            variant="primary"
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
          </TasksButton>
        ) : (
          <>
            <TasksButton
              type="submit"
              variant="primary"
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
            </TasksButton>
            <TasksButton
              type="submit"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Позначити виконаним
            </TasksButton>
          </>
        )}
      </div>
      {confirm && (
        <form
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
          <p>
            Завершити задачу без запуску таймера? Додатковий час не буде
            записано. Чек-лист і залежності мають бути виконані.
          </p>
          <label>
            <input type="checkbox" required disabled={busy} />
            Підтверджую, що завдання виконано
          </label>
          <div className="task-actions">
            <TasksButton
              variant="primary"
              disabled={busy}
              className="primary"
              type="submit"
            >
              Підтвердити виконання
            </TasksButton>
            <TasksButton
              disabled={busy}
              type="button"
              onClick={() => setConfirm(false)}
            >
              Скасувати
            </TasksButton>
          </div>
        </form>
      )}
    </div>
  );
}
