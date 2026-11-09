import RecurrenceFields from "../../shared/RecurrenceFields";
import { noRecurrence } from "../../shared/recurrence";
import { tr } from "../../i18n/runtime";
import { useLocale } from "../../i18n/useLocale";
import { addDays, dateLabel } from "../dateTime";
import { parseInput } from "../inputDateTime";
import { useState } from "react";
import Dialog from "../components/Dialog";
import DateTimeInput from "../components/DateTimeInput";
import {
  requiredPositions,
  positionKey,
  assignmentName,
  responsiblePosition,
  requiredRoles,
} from "./model";

export default function ProcessLaunch({
  initial,
  people,
  context,
  directory,
  busy,
  run,
  onClose,
  onLaunched,
}) {
  useLocale();
  const latest = initial.versions
    .filter((v) => v.status === "published")
    .sort((a, b) => b.number - a.number)[0];

  const [form, setForm] = useState({
      ...initial,
      version_id: latest?.id,
      name: "",
      deadline: context.today,
      note: "",
      role_assignments: {},
      position_assignments: {},
      start_offset_days: 0,
      recurrence: latest?.definition.recurrence || noRecurrence(),
    }),
    doc = latest?.definition,
    positionBased = doc?.schema_version === 3,
    roleBased = [2, 3].includes(doc?.schema_version);

  if (!latest)
    return (
      <Dialog title={tr("Запустити процес")} onClose={onClose}>
        <p className="workspace-muted">{tr("Немає опублікованої версії.")}</p>
      </Dialog>
    );

  const required = positionBased ? requiredPositions(doc) : requiredRoles(doc),
    assignmentField = positionBased
      ? "position_assignments"
      : "role_assignments";

  const candidates = (r) =>
    assignable.filter((p) =>
      positionBased
        ? positionKey(p.position) === positionKey(r)
        : p.role === r || p.production_role === r,
    );

  const assignable = people
      .map((p) => ({ ...directory.employees.find((e) => e.id === p.id), ...p }))
      .filter((p) => p.active !== false && !p.archived),
    set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Dialog
      hideClose
      title={tr("Запустити процес")}
      onClose={onClose}
      busy={busy}
    >
      <div className="process-launch-modal-container">
        <form
          className="process-launch"
          onSubmit={async (e) => {
            e.preventDefault();
            const { versions, ...args } = form;
            void versions;
            if (positionBased) delete args.role_assignments;
            else delete args.position_assignments;
            const data = new FormData(e.currentTarget);
            args.starts_on = roleBased
              ? addDays(form.deadline, -form.start_offset_days)
              : data.get("starts_on");
            args.deadline = roleBased ? form.deadline : data.get("deadline");
            if (!roleBased) {
              delete args.role_assignments;
              delete args.name;
              delete args.deadline;
              delete args.note;
              delete args.start_offset_days;
              delete args.recurrence;
            }
            if (await run("process_launch", args)) onLaunched();
          }}
        >
          <div className="process-launch-scroll">
            {roleBased && (
              <label className="task-field-block">
                <span>
                  {tr("Назва запуску")} <span className="required-star">*</span>
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={tr("Наприклад: Філадельфія Mango")}
                />
              </label>
            )}

            {roleBased ? (
              <>
                <label className="task-field-block">
                  <span>
                    {tr("Дедлайн")} <span className="required-star">*</span>
                  </span>
                  <DateTimeInput
                    type="date"
                    name="deadline"
                    defaultValue={form.deadline}
                    required
                    onChange={(e) => {
                      const d = parseInput(e.target.value, "date");
                      if (d) set("deadline", d);
                    }}
                  />
                </label>

                <label className="task-field-block">
                  <span>
                    {tr("Запустити за днів до дедлайну")}{" "}
                    <span className="required-star">*</span>
                  </span>
                  <input
                    type="number"
                    required
                    min="0"
                    max="3660"
                    value={form.start_offset_days}
                    onChange={(e) =>
                      set("start_offset_days", Number(e.target.value))
                    }
                  />
                </label>

                <p className="planning-help">
                  {tr("Запланований старт")}:{" "}
                  <strong>
                    {dateLabel(addDays(form.deadline, -form.start_offset_days))}
                  </strong>
                </p>

                <div className="recurrence-wrapper">
                  <RecurrenceFields
                    label={tr("Повторювати процес")}
                    value={form.recurrence}
                    onChange={(r) => set("recurrence", r)}
                  />
                </div>
              </>
            ) : (
              <label className="task-field-block">
                <span>
                  {tr("Дата початку")} <span className="required-star">*</span>
                </span>
                <DateTimeInput
                  type="date"
                  name="starts_on"
                  defaultValue={form.starts_on}
                  required
                />
              </label>
            )}

            {!positionBased && roleBased && (
              <p className="process-notice">
                {tr(
                  "Це опублікована попередня версія. Збережено її початкові правила призначення.",
                )}
              </p>
            )}

            {roleBased ? (
              required.map((r) => (
                <label key={r} className="task-field-block">
                  <span>
                    {r === responsiblePosition(doc)
                      ? tr("Відповідальний за процес")
                      : tr("Учасник")}{" "}
                    · <strong>{assignmentName(r, doc)}</strong>
                  </span>
                  <select
                    required
                    value={form[assignmentField][r] || ""}
                    onChange={(e) =>
                      set(assignmentField, {
                        ...form[assignmentField],
                        [r]: Number(e.target.value),
                      })
                    }
                  >
                    <option value="">
                      {candidates(r).length
                        ? tr("Оберіть працівника")
                        : tr("Немає доступних працівників цієї посади")}
                    </option>
                    {candidates(r).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))
            ) : (
              <>
                <p className="process-notice">
                  {tr(
                    "Це опублікована попередня версія. Збережено її початкові правила призначення.",
                  )}
                </p>
                <label className="task-field-block">
                  <span>{tr("Виконавець за замовчуванням")}</span>
                  <select
                    value={form.default_employee_id}
                    onChange={(e) =>
                      set("default_employee_id", Number(e.target.value))
                    }
                  >
                    {assignable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <details className="editor-expandable-section">
                  <summary>{tr("Відповідальні за окремі завдання")}</summary>
                  <div className="expandable-content">
                    {doc.stages
                      .flatMap((s) => s.tasks)
                      .map((t) => (
                        <label key={t.key} className="task-field-block">
                          <span>{t.title}</span>
                          <select
                            value={form.assignments[t.key] || ""}
                            onChange={(e) => {
                              const next = { ...form.assignments };
                              if (e.target.value)
                                next[t.key] = Number(e.target.value);
                              else delete next[t.key];
                              set("assignments", next);
                            }}
                          >
                            <option value="">
                              {tr("Із шаблону / за замовчуванням")}
                            </option>
                            {assignable.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                  </div>
                </details>
              </>
            )}

            <label className="task-field-block">
              <span>{tr("Відділ")}</span>
              <select
                value={form.department_id || ""}
                onChange={(e) =>
                  set("department_id", Number(e.target.value) || null)
                }
              >
                <option value="">{tr("Не призначено")}</option>
                {directory.departments
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="task-field-block">
              <span>{tr("Локація")}</span>
              <select
                value={form.location_id || ""}
                onChange={(e) =>
                  set("location_id", Number(e.target.value) || null)
                }
              >
                <option value="">{tr("Не призначено")}</option>
                {directory.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            {roleBased && (
              <label className="task-field-block">
                <span>{tr("Примітка")}</span>
                <textarea
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                  placeholder={tr("Додайте коментар до запуску процесу...")}
                />
              </label>
            )}

            <label className="task-checkbox-row task-interrupt-confirm">
              <input required type="checkbox" />
              <span>{tr("Підтверджую створення реальних завдань")}</span>
            </label>
          </div>

          <div className="process-launch-footer">
            <button disabled={busy} className="primary" type="submit">
              {tr("Запустити процес")}
            </button>
            <button disabled={busy} type="button" onClick={onClose}>
              {tr("Скасувати")}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
