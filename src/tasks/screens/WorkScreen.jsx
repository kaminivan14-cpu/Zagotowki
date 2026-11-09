import { tr } from "../../i18n/runtime";
import TaskResult from "../admin/TaskResult";
import { useEffect, useState, useRef } from "react";
import { read, errorText } from "../client";
import { useWorktime } from "../../worktime/context";
import { duration, priorities, urgencies, categoryName } from "../labels.uk";
import { dateLabel, instantLabel } from "../dateTime";

export default function WorkScreen({
  state,
  context,
  run,
  busy,
  onDetails,
  revision,
  refresh,
}) {
  const work = useWorktime(),
    [details, setDetails] = useState(null),
    [error, setError] = useState(""),
    [location, setLocation] = useState(""),
    [working, setWorking] = useState(false),
    [now, setNow] = useState(Date.now),
    lock = useRef(false);

  const task = state?.current || state?.next,
    id = task?.id,
    version = task?.version;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    if (id)
      read("tasks_details", { p_task: id })
        .then((d) => {
          if (alive) {
            setDetails(d);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        });
    return () => {
      alive = false;
    };
  }, [id, version, revision]);

  const blocked = busy || working || work?.busy || Boolean(work?.pending);

  async function startWork() {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    try {
      const active = await work.refresh();
      if (!active)
        await work.start(location || state.locations?.[0]?.id, "tasks");
      await refresh();
    } catch {
      setError(
        tr("Не вдалося розпочати роботу. Перевірте локал і повторіть спробу."),
      );
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }

  async function finishWork() {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    try {
      await work.end();
      await refresh();
    } catch {
      setError(
        tr(
          "Не вдалося завершити роботу. Завершіть активні операції та повторіть спробу.",
        ),
      );
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }

  if (!state) return <p role="status">{tr("Завантаження роботи…")}</p>;

  const locations = state.locations || [],
    data = details?.task.id === id ? details : null,
    zone = context.settings.company_timezone;

  const elapsed = state.session_started_at
    ? Math.max(
        0,
        Math.floor((now - Date.parse(state.session_started_at)) / 1000),
      )
    : null;

  return (
    <section className="task-execution" aria-label={tr("Виконання роботи")}>
      <p className="execution-date">{dateLabel(context.today)}</p>
      {error && (
        <p role="alert" className="task-error-message">
          {error}
        </p>
      )}

      {!work?.current ? (
        <div className="execution-welcome">
          <h2>{tr("Готові розпочати роботу?")}</h2>
          <p className="execution-welcome-subtitle">
            {tr("{count} завдань у плані · {planned} з {capacity}", {
              count: state.task_count,
              planned: duration(state.planned_minutes),
              capacity: duration(state.capacity_minutes),
            })}
          </p>
          {locations.length > 1 && (
            <label className="task-field-block">
              <span>{tr("Локал роботи")}</span>
              <select
                value={location || locations[0].id}
                onChange={(e) => setLocation(e.target.value)}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!locations.length && (
            <p className="warning-text">
              {tr(
                "Не призначено доступний локал роботи. Зверніться до адміністратора.",
              )}
            </p>
          )}
          <button
            className="primary execution-cta"
            disabled={blocked || !work?.enabled || !locations.length}
            onClick={startWork}
          >
            {tr("Розпочати роботу")}
          </button>
        </div>
      ) : task ? (
        <article className="execution-task" key={task.id}>
          {!state.current && (
            <button
              className="primary execution-cta"
              disabled={blocked}
              onClick={() =>
                run("start_task", { task_id: task.id, version: task.version })
              }
            >
              {tr("Розпочати завдання")}
            </button>
          )}
          <header className="execution-header">
            <span
              className={`task-list-badge ${state.current ? "state-in_progress" : ""}`}
            >
              {state.current ? tr("В роботі") : tr("Наступне завдання")}
            </span>
            <h2>{task.title}</h2>
            {state.current && elapsed !== null && (
              <p role="timer" aria-live="off" className="execution-timer">
                {tr("Час роботи")}:{" "}
                <strong>
                  {String(Math.floor(elapsed / 3600)).padStart(2, "0")}:
                  {String(Math.floor(elapsed / 60) % 60).padStart(2, "0")}:
                  {String(elapsed % 60).padStart(2, "0")}
                </strong>
              </p>
            )}
          </header>

          <dl className="execution-meta">
            <div>
              <dt>{tr("Категорія")}</dt>
              <dd>
                {categoryName(
                  task.category_id,
                  context.category_history || context.categories,
                )}
              </dd>
            </div>
            <div>
              <dt>{tr("Пріоритет")}</dt>
              <dd>{priorities[task.priority]}</dd>
            </div>
            <div>
              <dt>{tr("Терміновість")}</dt>
              <dd>{urgencies[task.urgency]}</dd>
            </div>
            <div>
              <dt>{tr("Орієнтовний час")}</dt>
              <dd>{duration(task.estimated_minutes)}</dd>
            </div>
            {task.deadline_at && (
              <div>
                <dt>{tr("Дедлайн")}</dt>
                <dd>{instantLabel(task.deadline_at, zone)}</dd>
              </div>
            )}
          </dl>

          <section className="execution-section">
            <h3>{tr("Опис / інструкція")}</h3>
            <p className="task-description">
              {task.description || tr("Опис не додано")}
            </p>
          </section>

          {data?.checklist?.length > 0 && (
            <section className="execution-checklist">
              <h3>{tr("Підзавдання")}</h3>
              <div className="task-checklist-items">
                {data.checklist.map((c) => (
                  <label key={c.id} className="task-checkbox-row">
                    <input
                      type="checkbox"
                      checked={c.completed}
                      disabled={blocked}
                      onChange={(e) =>
                        run("checklist_toggle", {
                          task_id: task.id,
                          version: task.version,
                          item_id: c.id,
                          completed: e.target.checked,
                        })
                      }
                    />
                    <span className={c.completed ? "completed-text" : ""}>
                      {c.text}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <details className="editor-expandable-section">
            <summary>{tr("Коментарі / інструкції")}</summary>
            <div className="expandable-content">
              {data?.events
                ?.filter((e) => e.event_type === "COMMENT_ADDED")
                .map((e) => (
                  <p key={e.id} className="timeline-comment">
                    {e.metadata.text}
                  </p>
                ))}
              <form
                className="task-comment-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  if (
                    await run("comment", {
                      task_id: task.id,
                      version: task.version,
                      text: new FormData(f).get("text"),
                    })
                  )
                    f.reset();
                }}
              >
                <label className="task-field-block">
                  <span>{tr("Додати коментар")}</span>
                  <textarea
                    name="text"
                    required
                    maxLength={10000}
                    placeholder={tr("Введіть коментар...")}
                  />
                </label>
                <button disabled={blocked} className="secondary-action-btn">
                  {tr("Зберегти коментар")}
                </button>
              </form>
            </div>
          </details>

          {task.source_type === "process" && (
            <div className="execution-section">
              <TaskResult
                key={task.id}
                task={task}
                run={run}
                busy={blocked}
                revision={revision}
              />
            </div>
          )}

          <div className="execution-secondary">
            {state.current && (
              <button
                disabled={blocked}
                className="secondary-action-btn"
                onClick={() =>
                  run("end_of_day", { task_id: task.id, version: task.version })
                }
              >
                {tr("На кінець дня")}
              </button>
            )}
            <button
              disabled={blocked}
              className="secondary-action-btn"
              onClick={() => onDetails(task)}
            >
              {tr("Перенести / деталі")}
            </button>
          </div>

          {state.current && (
            <footer>
              <button
                className="primary execution-cta"
                disabled={blocked}
                onClick={() =>
                  run("complete", {
                    task_id: task.id,
                    version: task.version,
                    advance: false,
                  })
                }
              >
                {tr("Закінчити завдання")}
              </button>
            </footer>
          )}
        </article>
      ) : (
        <div className="execution-empty">
          <h2>{tr("На сьогодні доступних завдань немає")}</h2>
          <p>
            {tr("Виконано сьогодні: {count}", {
              count: state.completed_today ?? 0,
            })}
          </p>
          <p className="execution-welcome-subtitle">
            {tr(
              "Черга враховує графік, час і залежності. Нові доступні завдання з’являться автоматично.",
            )}
          </p>
          <button
            className="primary execution-cta"
            disabled={blocked}
            onClick={finishWork}
          >
            {tr("Завершити роботу")}
          </button>
        </div>
      )}
    </section>
  );
}
