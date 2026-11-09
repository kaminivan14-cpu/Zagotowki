import TaskResult from "../admin/TaskResult";
import TaskActions from "./TaskActions";
import DateTimeInput from "./DateTimeInput";
import { useEffect, useState } from "react";
import Dialog from "./Dialog";
import { read, errorText } from "../client";
import { events, duration, priorities, eventReason } from "../labels.uk";
import { instantLabel, localToInstant } from "../dateTime";

export default function TaskDetailsDialog({
  task,
  context,
  run,
  busy,
  onClose,
  revision,
  people,
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    read("tasks_details", { p_task: task.id })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [task.id, revision]);

  const t = data?.task;

  return (
    <Dialog title={t?.title || task.title} onClose={onClose} busy={busy}>
      <p role="alert" className="task-error-message">
        {error}
      </p>
      {t && (
        <div
          className="task-details-container"
          style={{ paddingBottom: "48px" }}
        >
          <TaskActions
            task={t}
            context={context}
            run={run}
            busy={busy}
            onCompleted={onClose}
          />

          <p className="task-description">
            {t.description || "Опис не додано"}
          </p>

          <div className="task-details-meta-bar">
            <span>
              Орієнтовно: <strong>{duration(t.estimated_minutes)}</strong>
            </span>
            <span>·</span>
            <span>
              Фактично: <strong>{duration(t.actual_minutes)}</strong>
            </span>
          </div>

          {data.checklist?.length > 0 && (
            <div className="task-details-section">
              <h3>Підзавдання</h3>
              <div className="task-checklist-items">
                {data.checklist.map((c) => (
                  <label key={c.id} className="task-checkbox-row">
                    <input
                      type="checkbox"
                      checked={c.completed}
                      disabled={busy}
                      onChange={(e) =>
                        run("checklist_toggle", {
                          task_id: t.id,
                          version: t.version,
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
            </div>
          )}

          <form
            className="task-comment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              if (
                await run("comment", {
                  task_id: t.id,
                  version: t.version,
                  text: new FormData(f).get("text"),
                })
              )
                f.reset();
            }}
          >
            <label className="task-field-block">
              <span>Додати коментар</span>
              <textarea
                name="text"
                required
                maxLength={10000}
                placeholder="Введіть коментар..."
              />
            </label>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "8px",
              }}
            >
              <button
                type="submit"
                disabled={busy}
                className="secondary-action-btn"
              >
                Додати коментар
              </button>
            </div>
          </form>

          {![
            "completed",
            "cancelled",
            "in_progress",
            "pending_approval",
          ].includes(t.status) && (
            <form
              className="task-editor"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const start = localToInstant(
                    f.get("start"),
                    context.settings.company_timezone,
                  );
                  void run("plan", {
                    task_id: t.id,
                    version: t.version,
                    planned_date: f.get("date"),
                    planned_start_at: start,
                    reason: f.get("reason"),
                  });
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              <h3>{t.planned_date ? "Перенести" : "Запланувати"}</h3>
              <div className="editor-grid">
                <label className="task-field-block">
                  <span>Дата</span>
                  <DateTimeInput
                    aria-label="Дата"
                    name="date"
                    type="date"
                    min={context.today}
                    defaultValue={t.planned_date || context.today}
                    required
                  />
                </label>
                <label className="task-field-block">
                  <span>Фіксований початок</span>
                  <DateTimeInput
                    aria-label="Фіксований початок"
                    name="start"
                    type="datetime-local"
                  />
                </label>
              </div>
              <label className="task-field-block">
                <span>Причина</span>
                <input
                  name="reason"
                  required
                  defaultValue="Планування роботи"
                />
              </label>
              <small className="timezone-hint">
                Часовий пояс:{" "}
                <strong>{context.settings.company_timezone}</strong>
              </small>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "12px",
                }}
              >
                <button type="submit" disabled={busy} className="primary">
                  Зберегти дату
                </button>
              </div>
            </form>
          )}

          {t.status === "in_progress" && (
            <button
              type="button"
              disabled={busy}
              className="secondary-action-btn task-pause-btn"
              onClick={() =>
                run("pause", { task_id: t.id, version: t.version })
              }
            >
              Призупинити для перенесення
            </button>
          )}

          {![
            "completed",
            "cancelled",
            "in_progress",
            "paused",
            "pending_approval",
          ].includes(t.status) &&
            (t.created_by_employee_id === context.employee_id ||
              context.capabilities.includes("tasks.plan.scope")) && (
              <details className="editor-expandable-section">
                <summary className="editor-summary-toggle">
                  Редагування завдання та параметрів
                </summary>
                <div
                  className="expandable-content structured-edit-block"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    marginTop: "12px",
                  }}
                >
                  {/* Секція 1: Основні дані */}
                  <div
                    className="edit-subsection-card"
                    style={{
                      border: "1px solid #dfe1e6",
                      borderRadius: "8px",
                      padding: "16px",
                      background: "#fafbfc",
                    }}
                  >
                    <h4 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
                      Основні дані
                    </h4>
                    <form
                      className="task-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        run("update", {
                          task_id: t.id,
                          version: t.version,
                          title: f.get("title"),
                          description: f.get("description"),
                          priority: f.get("priority"),
                          estimated_minutes: f.get("minutes")
                            ? Number(f.get("minutes"))
                            : null,
                        });
                      }}
                    >
                      <label className="task-field-block">
                        <span>Назва</span>
                        <input name="title" required defaultValue={t.title} />
                      </label>
                      <label className="task-field-block">
                        <span>Опис</span>
                        <textarea
                          name="description"
                          defaultValue={t.description}
                        />
                      </label>
                      <div className="editor-grid">
                        <label className="task-field-block">
                          <span>Пріоритет</span>
                          <select name="priority" defaultValue={t.priority}>
                            {Object.entries(priorities).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="task-field-block">
                          <span>Орієнтовний час, хв</span>
                          <input
                            name="minutes"
                            type="number"
                            min="1"
                            defaultValue={t.estimated_minutes || ""}
                          />
                        </label>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: "12px",
                        }}
                      >
                        <button
                          type="submit"
                          disabled={busy}
                          className="primary"
                        >
                          Зберегти зміни
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Секція 2: Виконавець */}
                  {context.capabilities.includes("tasks.assign") && (
                    <div
                      className="edit-subsection-card"
                      style={{
                        border: "1px solid #dfe1e6",
                        borderRadius: "8px",
                        padding: "16px",
                        background: "#fafbfc",
                      }}
                    >
                      <h4 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
                        Виконавець
                      </h4>
                      <form
                        className="task-editor"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run("assign", {
                            task_id: t.id,
                            version: t.version,
                            assigned_to_employee_id: Number(
                              new FormData(e.currentTarget).get("employee"),
                            ),
                          });
                        }}
                      >
                        <label className="task-field-block">
                          <span>Змінити виконавця</span>
                          <select name="employee">
                            {people.map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: "12px",
                          }}
                        >
                          <button
                            type="submit"
                            disabled={busy}
                            className="secondary-action-btn"
                          >
                            Призначити
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Секція 3: Чек-лист */}
                  <div
                    className="edit-subsection-card"
                    style={{
                      border: "1px solid #dfe1e6",
                      borderRadius: "8px",
                      padding: "16px",
                      background: "#fafbfc",
                    }}
                  >
                    <h4 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
                      Чек-лист
                    </h4>
                    <form
                      className="task-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        run("checklist_add", {
                          task_id: t.id,
                          version: t.version,
                          text: new FormData(f).get("text"),
                        }).then((ok) => {
                          if (ok) f.reset();
                        });
                      }}
                    >
                      <label className="task-field-block">
                        <span>Новий пункт переліку</span>
                        <input
                          name="text"
                          required
                          placeholder="Введіть текст підзавдання..."
                        />
                      </label>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: "12px",
                        }}
                      >
                        <button
                          type="submit"
                          disabled={busy}
                          className="secondary-action-btn"
                        >
                          Додати пункт
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Секція 4: Залежності */}
                  <div
                    className="edit-subsection-card"
                    style={{
                      border: "1px solid #dfe1e6",
                      borderRadius: "8px",
                      padding: "16px",
                      background: "#fafbfc",
                    }}
                  >
                    <h4 style={{ margin: "0 0 12px 0", color: "#172b4d" }}>
                      Залежності
                    </h4>
                    <form
                      className="task-editor"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run("dependency", {
                          task_id: t.id,
                          version: t.version,
                          depends_on_task_id: Number(
                            new FormData(e.currentTarget).get("dependency"),
                          ),
                        });
                      }}
                    >
                      <label className="task-field-block">
                        <span>Спочатку виконати завдання №</span>
                        <input
                          name="dependency"
                          type="number"
                          min="1"
                          required
                          placeholder="ID завдання"
                        />
                      </label>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: "12px",
                        }}
                      >
                        <button
                          type="submit"
                          disabled={busy}
                          className="secondary-action-btn"
                        >
                          Додати залежність
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Секція 5: Небезпечна зона */}
                  <div
                    className="edit-subsection-card danger-zone"
                    style={{
                      border: "1px solid #ffbdad",
                      borderRadius: "8px",
                      padding: "16px",
                      background: "#ffebe6",
                    }}
                  >
                    <h4 style={{ margin: "0 0 12px 0", color: "#de350b" }}>
                      Небезпечна зона
                    </h4>
                    <form
                      className="task-confirm-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run("cancel", {
                          task_id: t.id,
                          version: t.version,
                        }).then((ok) => {
                          if (ok) onClose();
                        });
                      }}
                    >
                      <label className="task-checkbox-row">
                        <input type="checkbox" required />
                        <span>
                          Підтверджую скасування завдання зі збереженням історії
                        </span>
                      </label>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: "12px",
                        }}
                      >
                        <button
                          type="submit"
                          disabled={busy}
                          className="danger-action-btn"
                        >
                          Скасувати завдання
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </details>
            )}

          {t.source_type === "process" && (
            <div className="task-details-section">
              <TaskResult task={t} run={run} busy={busy} revision={revision} />
            </div>
          )}

          <h3>Історія</h3>
          <ol className="task-timeline">
            {data.events.map((e) => (
              <li key={e.id}>
                <time>
                  {instantLabel(
                    e.created_at,
                    context.settings.company_timezone,
                  )}
                </time>{" "}
                — {events[e.event_type] || "Зміна завдання"}
                {e.metadata.text && <p>{e.metadata.text}</p>}
                {e.metadata.reason && <p>{eventReason(e.metadata.reason)}</p>}
              </li>
            ))}
          </ol>

          {data.events.length >= 100 && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "12px",
              }}
            >
              <button
                type="button"
                disabled={busy}
                className="secondary-action-btn load-more-events"
                onClick={async () => {
                  try {
                    const more = await read("tasks_events", {
                      p_task: t.id,
                      p_before: Math.min(...data.events.map((e) => e.id)),
                    });
                    setData((old) => ({
                      ...old,
                      events: [...more.events, ...old.events],
                    }));
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Раніші події
              </button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
